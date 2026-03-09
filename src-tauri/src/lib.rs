pub mod agent;
pub mod app_state;
pub mod commands;
pub mod hooks;
pub mod models;
pub mod pricing;
pub mod routes;
pub mod storage;
pub mod ws;

use agent::adapter::new_actor_session_map;
use agent::control::CliInfoCache;
use agent::pty::new_pty_map;
use agent::spawn_locks::SpawnLocks;
use agent::stream::new_process_map;
use app_state::AppState;
use std::sync::Arc;
use storage::events::EventWriter;
use tokio::sync::broadcast;
use tokio_util::sync::CancellationToken;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;

/// Start the axum HTTP/WebSocket server.
pub async fn run() {
    // Initialize logging
    env_logger::Builder::from_env(
        env_logger::Env::default().default_filter_or("opencovibe_desktop_lib=debug,warn"),
    )
    .format_timestamp_millis()
    .init();

    log::info!("OpenCovibe Web server starting");

    // Reconcile orphaned runs on startup
    storage::runs::reconcile_orphaned_runs();

    // Clean up legacy hook-bridge
    hooks::setup::cleanup_hook_bridge();

    // Global cancellation token
    let cancel_token = CancellationToken::new();

    // WebSocket broadcast channel (1024 message buffer)
    let (ws_tx, _ws_rx) = broadcast::channel::<String>(1024);

    // Build unified application state
    let state = Arc::new(AppState {
        process_map: new_process_map(),
        pty_map: new_pty_map(),
        actor_sessions: new_actor_session_map(),
        cli_info_cache: CliInfoCache::new(),
        event_writer: Arc::new(EventWriter::new()),
        spawn_locks: SpawnLocks::new(),
        cancel_token: cancel_token.clone(),
        ws_tx,
    });

    // Start team file watcher
    hooks::team_watcher::start_team_watcher(state.clone(), cancel_token.clone());

    // Start CLI session auto-sync (every 10s)
    hooks::cli_sync_watcher::start_cli_sync_watcher(state.clone(), cancel_token.clone());

    // CORS layer — allow all origins for SSH tunnel scenarios
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Build router: API routes + static file serving
    let api_router = routes::build_router(state);

    // Serve frontend static files — resolve path relative to the binary location
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));
    let build_dir = exe_dir
        .as_ref()
        .map(|d| d.join("../../../build"))  // target/release/ -> src-tauri/ -> project root
        .unwrap_or_else(|| std::path::PathBuf::from("../build"));
    let build_dir = build_dir.canonicalize().unwrap_or_else(|_| build_dir.clone());
    log::info!("Serving static files from {:?}", build_dir);
    let index_path = build_dir.join("index.html");
    let static_service = ServeDir::new(&build_dir).fallback(
        tower_http::services::ServeFile::new(&index_path),
    );

    let app = api_router
        .fallback_service(static_service)
        .layer(cors);

    let port = std::env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let addr = format!("127.0.0.1:{}", port);
    log::info!("Listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("failed to bind to address");

    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            cancel_token.cancelled().await;
            log::info!("Shutting down server");
        })
        .await
        .expect("server error");
}
