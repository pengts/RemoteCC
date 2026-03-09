//! API route registration — maps POST endpoints to existing command functions.
//!
//! Pattern: each existing `#[tauri::command]` becomes an axum handler that
//! deserializes JSON body params and calls the original function.

use crate::app_state::AppState;
use crate::ws::ws_handler;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::Json;
use serde_json::Value;
use std::sync::Arc;

/// Helper: extract an optional string field from a JSON body.
fn opt_str(body: &Value, key: &str) -> Option<String> {
    body.get(key).and_then(|v| v.as_str()).map(|s| s.to_string())
}

/// Helper: extract a required string field from a JSON body.
fn req_str(body: &Value, key: &str) -> Result<String, (StatusCode, String)> {
    opt_str(body, key).ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            format!("missing required field: {}", key),
        )
    })
}

/// Helper: extract an optional bool field.
fn opt_bool(body: &Value, key: &str) -> Option<bool> {
    body.get(key).and_then(|v| v.as_bool())
}

/// Helper: extract an optional u64 field.
fn opt_u64(body: &Value, key: &str) -> Option<u64> {
    body.get(key).and_then(|v| v.as_u64())
}

/// Helper: extract an optional u32 field.
fn opt_u32(body: &Value, key: &str) -> Option<u32> {
    body.get(key).and_then(|v| v.as_u64()).map(|v| v as u32)
}

/// Helper: extract an optional usize field.
fn opt_usize(body: &Value, key: &str) -> Option<usize> {
    body.get(key).and_then(|v| v.as_u64()).map(|v| v as usize)
}

/// Helper: extract an optional u16 field, or return error.
fn req_u16(body: &Value, key: &str) -> Result<u16, (StatusCode, String)> {
    body.get(key)
        .and_then(|v| v.as_u64())
        .map(|v| v as u16)
        .ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                format!("missing required field: {}", key),
            )
        })
}

/// Convert a `Result<T, String>` to an axum response.
fn to_response<T: serde::Serialize>(result: Result<T, String>) -> impl IntoResponse {
    match result {
        Ok(val) => (StatusCode::OK, Json(serde_json::to_value(val).unwrap())).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
    }
}

/// Convert a direct value to an axum JSON response.
fn to_json<T: serde::Serialize>(val: T) -> impl IntoResponse {
    (StatusCode::OK, Json(serde_json::to_value(val).unwrap())).into_response()
}

/// Build the complete axum Router with all API endpoints.
pub fn build_router(state: Arc<AppState>) -> axum::Router {
    axum::Router::new()
        // ── WebSocket ──
        .route("/ws", get(ws_handler))
        // ── Runs ──
        .route("/api/runs/list", post(runs_list))
        .route("/api/runs/get", post(runs_get))
        .route("/api/runs/start", post(runs_start))
        .route("/api/runs/stop", post(runs_stop))
        .route("/api/runs/rename", post(runs_rename))
        .route("/api/runs/delete", post(runs_delete))
        .route("/api/runs/update-model", post(runs_update_model))
        .route("/api/runs/search-prompts", post(runs_search_prompts))
        .route("/api/runs/add-prompt-favorite", post(runs_add_prompt_favorite))
        .route("/api/runs/remove-prompt-favorite", post(runs_remove_prompt_favorite))
        .route("/api/runs/update-prompt-favorite-tags", post(runs_update_prompt_favorite_tags))
        .route("/api/runs/update-prompt-favorite-note", post(runs_update_prompt_favorite_note))
        .route("/api/runs/list-prompt-favorites", post(runs_list_prompt_favorites))
        .route("/api/runs/list-prompt-tags", post(runs_list_prompt_tags))
        // ── Session ──
        .route("/api/session/start", post(session_start))
        .route("/api/session/message", post(session_message))
        .route("/api/session/stop", post(session_stop))
        .route("/api/session/control", post(session_control))
        .route("/api/session/bus-events", post(session_bus_events))
        .route("/api/session/fork", post(session_fork))
        .route("/api/session/approve-tool", post(session_approve_tool))
        .route("/api/session/respond-permission", post(session_respond_permission))
        .route("/api/session/respond-hook-callback", post(session_respond_hook_callback))
        .route("/api/session/cancel-control-request", post(session_cancel_control_request))
        // ── Events & Artifacts ──
        .route("/api/events/get", post(events_get))
        .route("/api/artifacts/get", post(artifacts_get))
        // ── Chat (pipe mode) ──
        .route("/api/chat/send", post(chat_send))
        // ── Control ──
        .route("/api/control/cli-info", post(control_cli_info))
        // ── Settings ──
        .route("/api/settings/user/get", post(settings_user_get))
        .route("/api/settings/user/update", post(settings_user_update))
        .route("/api/settings/agent/get", post(settings_agent_get))
        .route("/api/settings/agent/update", post(settings_agent_update))
        // ── Filesystem ──
        .route("/api/fs/list-directory", post(fs_list_directory))
        .route("/api/fs/check-is-directory", post(fs_check_is_directory))
        .route("/api/fs/read-file-base64", post(fs_read_file_base64))
        // ── Files ──
        .route("/api/files/read", post(files_read))
        .route("/api/files/write", post(files_write))
        .route("/api/files/read-task-output", post(files_read_task_output))
        .route("/api/files/list-memory", post(files_list_memory))
        // ── Git ──
        .route("/api/git/summary", post(git_summary))
        .route("/api/git/branch", post(git_branch))
        .route("/api/git/diff", post(git_diff))
        .route("/api/git/status", post(git_status))
        // ── Export ──
        .route("/api/export/conversation", post(export_conversation))
        // ── PTY ──
        .route("/api/pty/spawn", post(pty_spawn))
        .route("/api/pty/write", post(pty_write))
        .route("/api/pty/resize", post(pty_resize))
        .route("/api/pty/close", post(pty_close))
        // ── Diagnostics ──
        .route("/api/diagnostics/check-cli", post(diagnostics_check_cli))
        .route("/api/diagnostics/test-remote", post(diagnostics_test_remote))
        .route("/api/diagnostics/dist-tags", post(diagnostics_dist_tags))
        .route("/api/diagnostics/check-project-init", post(diagnostics_check_project_init))
        .route("/api/diagnostics/check-ssh-key", post(diagnostics_check_ssh_key))
        .route("/api/diagnostics/generate-ssh-key", post(diagnostics_generate_ssh_key))
        .route("/api/diagnostics/run", post(diagnostics_run))
        .route("/api/diagnostics/detect-proxy", post(diagnostics_detect_proxy))
        // ── Stats ──
        .route("/api/stats/usage", post(stats_usage))
        .route("/api/stats/global-usage", post(stats_global_usage))
        .route("/api/stats/clear-cache", post(stats_clear_cache))
        .route("/api/stats/heatmap", post(stats_heatmap))
        .route("/api/stats/changelog", post(stats_changelog))
        // ── Teams ──
        .route("/api/teams/list", post(teams_list))
        .route("/api/teams/config", post(teams_config))
        .route("/api/teams/tasks", post(teams_tasks))
        .route("/api/teams/task", post(teams_task))
        .route("/api/teams/inbox", post(teams_inbox))
        .route("/api/teams/all-inboxes", post(teams_all_inboxes))
        .route("/api/teams/delete", post(teams_delete))
        // ── Plugins ──
        .route("/api/plugins/list-marketplaces", post(plugins_list_marketplaces))
        .route("/api/plugins/list-marketplace-plugins", post(plugins_list_marketplace_plugins))
        .route("/api/plugins/list-standalone-skills", post(plugins_list_standalone_skills))
        .route("/api/plugins/get-skill-content", post(plugins_get_skill_content))
        .route("/api/plugins/create-skill", post(plugins_create_skill))
        .route("/api/plugins/update-skill", post(plugins_update_skill))
        .route("/api/plugins/delete-skill", post(plugins_delete_skill))
        .route("/api/plugins/list-installed", post(plugins_list_installed))
        .route("/api/plugins/install", post(plugins_install))
        .route("/api/plugins/uninstall", post(plugins_uninstall))
        .route("/api/plugins/enable", post(plugins_enable))
        .route("/api/plugins/disable", post(plugins_disable))
        .route("/api/plugins/update", post(plugins_update))
        .route("/api/plugins/add-marketplace", post(plugins_add_marketplace))
        .route("/api/plugins/remove-marketplace", post(plugins_remove_marketplace))
        .route("/api/plugins/update-marketplace", post(plugins_update_marketplace))
        .route("/api/plugins/community-health", post(plugins_community_health))
        .route("/api/plugins/community-search", post(plugins_community_search))
        .route("/api/plugins/community-detail", post(plugins_community_detail))
        .route("/api/plugins/community-install", post(plugins_community_install))
        // ── Agents ──
        .route("/api/agents/list", post(agents_list))
        .route("/api/agents/read", post(agents_read))
        .route("/api/agents/create", post(agents_create))
        .route("/api/agents/update", post(agents_update))
        .route("/api/agents/delete", post(agents_delete))
        // ── MCP ──
        .route("/api/mcp/list", post(mcp_list))
        .route("/api/mcp/add", post(mcp_add))
        .route("/api/mcp/remove", post(mcp_remove))
        .route("/api/mcp/toggle", post(mcp_toggle))
        .route("/api/mcp/registry-health", post(mcp_registry_health))
        .route("/api/mcp/registry-search", post(mcp_registry_search))
        // ── CLI Config ──
        .route("/api/cli-config/get", post(cli_config_get))
        .route("/api/cli-config/project", post(cli_config_project))
        .route("/api/cli-config/update", post(cli_config_update))
        // ── Onboarding ──
        .route("/api/onboarding/auth-status", post(onboarding_auth_status))
        .route("/api/onboarding/install-methods", post(onboarding_install_methods))
        .route("/api/onboarding/login", post(onboarding_login))
        .route("/api/onboarding/auth-overview", post(onboarding_auth_overview))
        .route("/api/onboarding/set-api-key", post(onboarding_set_api_key))
        .route("/api/onboarding/remove-api-key", post(onboarding_remove_api_key))
        // ── Clipboard ──
        .route("/api/clipboard/files", post(clipboard_files))
        .route("/api/clipboard/read", post(clipboard_read))
        .route("/api/clipboard/save-temp", post(clipboard_save_temp))
        // ── CLI Sync ──
        .route("/api/cli-sync/discover", post(cli_sync_discover))
        .route("/api/cli-sync/import", post(cli_sync_import))
        .route("/api/cli-sync/sync", post(cli_sync_sync))
        // ── Updates ──
        .route("/api/updates/check", post(updates_check))
        // ── System (new for web) ──
        .route("/api/system/version", get(system_version))
        .route("/api/system/home-dir", get(system_home_dir))
        .with_state(state)
}

// ════════════════════════════════════════════════════════════════════
// Handler implementations
// ════════════════════════════════════════════════════════════════════

// ── Runs ──

async fn runs_list(
    State(_state): State<Arc<AppState>>,
) -> impl IntoResponse {
    to_response(crate::commands::runs::list_runs().await)
}

async fn runs_get(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let id = match req_str(&body, "id") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::runs::get_run(id)).into_response()
}

async fn runs_start(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let prompt = match req_str(&body, "prompt") { Ok(v) => v, Err(e) => return e.into_response() };
    let cwd = match req_str(&body, "cwd") { Ok(v) => v, Err(e) => return e.into_response() };
    let agent = match req_str(&body, "agent") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::runs::start_run(
        prompt, cwd, agent,
        opt_str(&body, "model"),
        opt_str(&body, "remote_host_name"),
        opt_str(&body, "platform_id"),
    )).into_response()
}

async fn runs_stop(
    State(state): State<Arc<AppState>>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let id = match req_str(&body, "id") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::runs::stop_run(
        id,
        &state.actor_sessions,
        &state.process_map,
        &state.pty_map,
    ).await).into_response()
}

async fn runs_rename(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let id = match req_str(&body, "id") { Ok(v) => v, Err(e) => return e.into_response() };
    let name = match req_str(&body, "name") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::runs::rename_run(id, name)).into_response()
}

async fn runs_delete(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let id = match req_str(&body, "id") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::runs::delete_run(id)).into_response()
}

async fn runs_update_model(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let id = match req_str(&body, "id") { Ok(v) => v, Err(e) => return e.into_response() };
    let model = match req_str(&body, "model") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::runs::update_run_model(id, model)).into_response()
}

async fn runs_search_prompts(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let query = match req_str(&body, "query") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::runs::search_prompts(query, opt_usize(&body, "limit")).await).into_response()
}

async fn runs_add_prompt_favorite(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let run_id = match req_str(&body, "run_id") { Ok(v) => v, Err(e) => return e.into_response() };
    let seq = opt_u64(&body, "seq").unwrap_or(0);
    let text = match req_str(&body, "text") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::runs::add_prompt_favorite(run_id, seq, text)).into_response()
}

async fn runs_remove_prompt_favorite(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let run_id = match req_str(&body, "run_id") { Ok(v) => v, Err(e) => return e.into_response() };
    let seq = opt_u64(&body, "seq").unwrap_or(0);
    to_response(crate::commands::runs::remove_prompt_favorite(run_id, seq)).into_response()
}

async fn runs_update_prompt_favorite_tags(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let run_id = match req_str(&body, "run_id") { Ok(v) => v, Err(e) => return e.into_response() };
    let seq = opt_u64(&body, "seq").unwrap_or(0);
    let tags: Vec<String> = body.get("tags")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();
    to_response(crate::commands::runs::update_prompt_favorite_tags(run_id, seq, tags)).into_response()
}

async fn runs_update_prompt_favorite_note(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let run_id = match req_str(&body, "run_id") { Ok(v) => v, Err(e) => return e.into_response() };
    let seq = opt_u64(&body, "seq").unwrap_or(0);
    let note = match req_str(&body, "note") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::runs::update_prompt_favorite_note(run_id, seq, note)).into_response()
}

async fn runs_list_prompt_favorites() -> impl IntoResponse {
    to_response(crate::commands::runs::list_prompt_favorites())
}

async fn runs_list_prompt_tags() -> impl IntoResponse {
    to_response(crate::commands::runs::list_prompt_tags())
}

// ── Session ──

async fn session_start(
    State(state): State<Arc<AppState>>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let run_id = match req_str(&body, "run_id") { Ok(v) => v, Err(e) => return e.into_response() };
    let mode = body.get("mode").and_then(|v| serde_json::from_value(v.clone()).ok());
    let session_id = opt_str(&body, "session_id");
    let initial_message = opt_str(&body, "initial_message");
    let attachments = body.get("attachments").and_then(|v| serde_json::from_value(v.clone()).ok());
    let platform_id = opt_str(&body, "platform_id");
    to_response(crate::commands::session::start_session(
        state,
        run_id, mode, session_id, initial_message, attachments, platform_id,
    ).await).into_response()
}

async fn session_message(
    State(state): State<Arc<AppState>>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let run_id = match req_str(&body, "run_id") { Ok(v) => v, Err(e) => return e.into_response() };
    let message = match req_str(&body, "message") { Ok(v) => v, Err(e) => return e.into_response() };
    let attachments = body.get("attachments").and_then(|v| serde_json::from_value(v.clone()).ok());
    to_response(crate::commands::session::send_session_message(
        state,
        run_id, message, attachments,
    ).await).into_response()
}

async fn session_stop(
    State(state): State<Arc<AppState>>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let run_id = match req_str(&body, "run_id") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::session::stop_session(
        state, run_id,
    ).await).into_response()
}

async fn session_control(
    State(state): State<Arc<AppState>>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let run_id = match req_str(&body, "run_id") { Ok(v) => v, Err(e) => return e.into_response() };
    let subtype = match req_str(&body, "subtype") { Ok(v) => v, Err(e) => return e.into_response() };
    let params = body.get("params").cloned();
    to_response(crate::commands::session::send_session_control(
        &state.actor_sessions, run_id, subtype, params,
    ).await).into_response()
}

async fn session_bus_events(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let id = match req_str(&body, "id") { Ok(v) => v, Err(e) => return e.into_response() };
    let since_seq = opt_u64(&body, "since_seq");
    to_json(crate::commands::session::get_bus_events(id, since_seq)).into_response()
}

async fn session_fork(
    State(state): State<Arc<AppState>>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let run_id = match req_str(&body, "run_id") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::session::fork_session(
        state, run_id,
    ).await).into_response()
}

async fn session_approve_tool(
    State(state): State<Arc<AppState>>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let run_id = match req_str(&body, "run_id") { Ok(v) => v, Err(e) => return e.into_response() };
    let tool_name = match req_str(&body, "tool_name") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::session::approve_session_tool(
        state, run_id, tool_name,
    ).await).into_response()
}

async fn session_respond_permission(
    State(state): State<Arc<AppState>>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let run_id = match req_str(&body, "run_id") { Ok(v) => v, Err(e) => return e.into_response() };
    let request_id = match req_str(&body, "request_id") { Ok(v) => v, Err(e) => return e.into_response() };
    let behavior = match req_str(&body, "behavior") { Ok(v) => v, Err(e) => return e.into_response() };
    let updated_permissions = body.get("updated_permissions").and_then(|v| serde_json::from_value(v.clone()).ok());
    let updated_input = body.get("updated_input").cloned();
    let deny_message = opt_str(&body, "deny_message");
    let interrupt = opt_bool(&body, "interrupt");
    to_response(crate::commands::session::respond_permission(
        &state.actor_sessions, run_id, request_id, behavior,
        updated_permissions, updated_input, deny_message, interrupt,
    ).await).into_response()
}

async fn session_respond_hook_callback(
    State(state): State<Arc<AppState>>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let run_id = match req_str(&body, "run_id") { Ok(v) => v, Err(e) => return e.into_response() };
    let request_id = match req_str(&body, "request_id") { Ok(v) => v, Err(e) => return e.into_response() };
    let decision = match req_str(&body, "decision") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::session::respond_hook_callback(
        &state.actor_sessions, run_id, request_id, decision,
    ).await).into_response()
}

async fn session_cancel_control_request(
    State(state): State<Arc<AppState>>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let run_id = match req_str(&body, "run_id") { Ok(v) => v, Err(e) => return e.into_response() };
    let request_id = match req_str(&body, "request_id") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::session::cancel_control_request(
        &state.actor_sessions, run_id, request_id,
    ).await).into_response()
}

// ── Events & Artifacts ──

async fn events_get(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let id = match req_str(&body, "id") { Ok(v) => v, Err(e) => return e.into_response() };
    let since_seq = opt_u64(&body, "since_seq");
    to_json(crate::commands::events::get_run_events(id, since_seq)).into_response()
}

async fn artifacts_get(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let id = match req_str(&body, "id") { Ok(v) => v, Err(e) => return e.into_response() };
    to_json(crate::commands::artifacts::get_run_artifacts(id)).into_response()
}

// ── Chat ──

async fn chat_send(
    State(state): State<Arc<AppState>>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let run_id = match req_str(&body, "run_id") { Ok(v) => v, Err(e) => return e.into_response() };
    let message = match req_str(&body, "message") { Ok(v) => v, Err(e) => return e.into_response() };
    let attachments = body.get("attachments").and_then(|v| serde_json::from_value(v.clone()).ok());
    let model = opt_str(&body, "model");
    to_response(crate::commands::chat::send_chat_message(
        state, run_id, message, attachments, model,
    ).await).into_response()
}

// ── Control ──

async fn control_cli_info(
    State(state): State<Arc<AppState>>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let force_refresh = opt_bool(&body, "force_refresh");
    to_response(crate::commands::control::get_cli_info(
        &state.cli_info_cache, force_refresh,
    ).await).into_response()
}

// ── Settings ──

async fn settings_user_get() -> impl IntoResponse {
    to_json(crate::commands::settings::get_user_settings())
}

async fn settings_user_update(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let patch = body.get("patch").cloned().unwrap_or(Value::Object(Default::default()));
    to_response(crate::commands::settings::update_user_settings(patch))
}

async fn settings_agent_get(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let agent = match req_str(&body, "agent") { Ok(v) => v, Err(e) => return e.into_response() };
    to_json(crate::commands::settings::get_agent_settings(agent)).into_response()
}

async fn settings_agent_update(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let agent = match req_str(&body, "agent") { Ok(v) => v, Err(e) => return e.into_response() };
    let patch = body.get("patch").cloned().unwrap_or(Value::Object(Default::default()));
    to_response(crate::commands::settings::update_agent_settings(agent, patch)).into_response()
}

// ── Filesystem ──

async fn fs_list_directory(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let path = match req_str(&body, "path") { Ok(v) => v, Err(e) => return e.into_response() };
    let show_hidden = opt_bool(&body, "show_hidden");
    to_response(crate::commands::fs::list_directory(path, show_hidden)).into_response()
}

async fn fs_check_is_directory(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let path = match req_str(&body, "path") { Ok(v) => v, Err(e) => return e.into_response() };
    to_json(crate::commands::fs::check_is_directory(path)).into_response()
}

async fn fs_read_file_base64(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let path = match req_str(&body, "path") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::fs::read_file_base64(path)).into_response()
}

// ── Files ──

async fn files_read(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let path = match req_str(&body, "path") { Ok(v) => v, Err(e) => return e.into_response() };
    let cwd = opt_str(&body, "cwd");
    to_response(crate::commands::files::read_text_file(path, cwd)).into_response()
}

async fn files_write(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let path = match req_str(&body, "path") { Ok(v) => v, Err(e) => return e.into_response() };
    let content = match req_str(&body, "content") { Ok(v) => v, Err(e) => return e.into_response() };
    let cwd = opt_str(&body, "cwd");
    to_response(crate::commands::files::write_text_file(path, content, cwd)).into_response()
}

async fn files_read_task_output(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let path = match req_str(&body, "path") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::files::read_task_output(path)).into_response()
}

async fn files_list_memory(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let cwd = opt_str(&body, "cwd");
    to_response(crate::commands::files::list_memory_files(cwd)).into_response()
}

// ── Git ──

async fn git_summary(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let cwd = match req_str(&body, "cwd") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::git::get_git_summary(cwd).await).into_response()
}

async fn git_branch(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let cwd = match req_str(&body, "cwd") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::git::get_git_branch(cwd).await).into_response()
}

async fn git_diff(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let cwd = match req_str(&body, "cwd") { Ok(v) => v, Err(e) => return e.into_response() };
    let staged = opt_bool(&body, "staged").unwrap_or(false);
    let file = opt_str(&body, "file");
    to_response(crate::commands::git::get_git_diff(cwd, staged, file).await).into_response()
}

async fn git_status(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let cwd = match req_str(&body, "cwd") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::git::get_git_status(cwd).await).into_response()
}

// ── Export ──

async fn export_conversation(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let run_id = match req_str(&body, "run_id") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::export::export_conversation(run_id)).into_response()
}

// ── PTY ──

async fn pty_spawn(
    State(state): State<Arc<AppState>>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let run_id = match req_str(&body, "run_id") { Ok(v) => v, Err(e) => return e.into_response() };
    let rows = match req_u16(&body, "rows") { Ok(v) => v, Err(e) => return e.into_response() };
    let cols = match req_u16(&body, "cols") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::pty::spawn_pty(
        state, run_id, rows, cols,
    ).await).into_response()
}

async fn pty_write(
    State(state): State<Arc<AppState>>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let run_id = match req_str(&body, "run_id") { Ok(v) => v, Err(e) => return e.into_response() };
    let data = match req_str(&body, "data") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::pty::write_pty(
        &state.pty_map, run_id, data,
    )).into_response()
}

async fn pty_resize(
    State(state): State<Arc<AppState>>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let run_id = match req_str(&body, "run_id") { Ok(v) => v, Err(e) => return e.into_response() };
    let rows = match req_u16(&body, "rows") { Ok(v) => v, Err(e) => return e.into_response() };
    let cols = match req_u16(&body, "cols") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::pty::resize_pty(
        &state.pty_map, run_id, rows, cols,
    )).into_response()
}

async fn pty_close(
    State(state): State<Arc<AppState>>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let run_id = match req_str(&body, "run_id") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::pty::close_pty(
        &state.pty_map, run_id,
    )).into_response()
}

// ── Diagnostics ──

async fn diagnostics_check_cli(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let agent = match req_str(&body, "agent") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::diagnostics::check_agent_cli(agent).await).into_response()
}

async fn diagnostics_test_remote(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let host = match req_str(&body, "host") { Ok(v) => v, Err(e) => return e.into_response() };
    let user = match req_str(&body, "user") { Ok(v) => v, Err(e) => return e.into_response() };
    let port = body.get("port").and_then(|v| v.as_u64()).map(|v| v as u16);
    let key_path = opt_str(&body, "key_path");
    let remote_claude_path = opt_str(&body, "remote_claude_path");
    to_response(crate::commands::diagnostics::test_remote_host(
        host, user, port, key_path, remote_claude_path,
    ).await).into_response()
}

async fn diagnostics_dist_tags() -> impl IntoResponse {
    to_response(crate::commands::diagnostics::get_cli_dist_tags().await)
}

async fn diagnostics_check_project_init(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let cwd = match req_str(&body, "cwd") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::diagnostics::check_project_init(cwd)).into_response()
}

async fn diagnostics_check_ssh_key() -> impl IntoResponse {
    to_response(crate::commands::diagnostics::check_ssh_key())
}

async fn diagnostics_generate_ssh_key() -> impl IntoResponse {
    to_response(crate::commands::diagnostics::generate_ssh_key())
}

async fn diagnostics_run(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let cwd = match req_str(&body, "cwd") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::diagnostics::run_diagnostics(cwd).await).into_response()
}

async fn diagnostics_detect_proxy(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let proxy_id = match req_str(&body, "proxy_id") { Ok(v) => v, Err(e) => return e.into_response() };
    let base_url = match req_str(&body, "base_url") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::diagnostics::detect_local_proxy(proxy_id, base_url).await).into_response()
}

// ── Stats ──

async fn stats_usage(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let days = opt_u32(&body, "days");
    to_response(crate::commands::stats::get_usage_overview(days)).into_response()
}

async fn stats_global_usage(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let days = opt_u32(&body, "days");
    to_response(crate::commands::stats::get_global_usage_overview(days)).into_response()
}

async fn stats_clear_cache() -> impl IntoResponse {
    to_response(crate::commands::stats::clear_usage_cache())
}

async fn stats_heatmap(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let scope = match req_str(&body, "scope") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::stats::get_heatmap_daily(scope)).into_response()
}

async fn stats_changelog() -> impl IntoResponse {
    to_response(crate::commands::stats::get_changelog().await)
}

// ── Teams ──

async fn teams_list() -> impl IntoResponse {
    to_response(crate::commands::teams::list_teams())
}

async fn teams_config(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let name = match req_str(&body, "name") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::teams::get_team_config(name)).into_response()
}

async fn teams_tasks(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let team_name = match req_str(&body, "team_name") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::teams::list_team_tasks(team_name)).into_response()
}

async fn teams_task(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let team_name = match req_str(&body, "team_name") { Ok(v) => v, Err(e) => return e.into_response() };
    let task_id = match req_str(&body, "task_id") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::teams::get_team_task(team_name, task_id)).into_response()
}

async fn teams_inbox(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let team_name = match req_str(&body, "team_name") { Ok(v) => v, Err(e) => return e.into_response() };
    let agent_name = match req_str(&body, "agent_name") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::teams::get_team_inbox(team_name, agent_name)).into_response()
}

async fn teams_all_inboxes(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let name = match req_str(&body, "name") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::teams::get_all_team_inboxes(name)).into_response()
}

async fn teams_delete(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let name = match req_str(&body, "name") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::teams::delete_team(name)).into_response()
}

// ── Plugins ──

async fn plugins_list_marketplaces() -> impl IntoResponse {
    to_response(crate::commands::plugins::list_marketplaces())
}

async fn plugins_list_marketplace_plugins() -> impl IntoResponse {
    to_response(crate::commands::plugins::list_marketplace_plugins())
}

async fn plugins_list_standalone_skills(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let cwd = opt_str(&body, "cwd");
    to_response(crate::commands::plugins::list_standalone_skills(cwd)).into_response()
}

async fn plugins_get_skill_content(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let path = match req_str(&body, "path") { Ok(v) => v, Err(e) => return e.into_response() };
    let cwd = opt_str(&body, "cwd");
    to_response(crate::commands::plugins::get_skill_content(path, cwd)).into_response()
}

async fn plugins_create_skill(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let name = match req_str(&body, "name") { Ok(v) => v, Err(e) => return e.into_response() };
    let description = match req_str(&body, "description") { Ok(v) => v, Err(e) => return e.into_response() };
    let content = match req_str(&body, "content") { Ok(v) => v, Err(e) => return e.into_response() };
    let scope = match req_str(&body, "scope") { Ok(v) => v, Err(e) => return e.into_response() };
    let cwd = opt_str(&body, "cwd");
    to_response(crate::commands::plugins::create_skill(name, description, content, scope, cwd)).into_response()
}

async fn plugins_update_skill(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let path = match req_str(&body, "path") { Ok(v) => v, Err(e) => return e.into_response() };
    let content = match req_str(&body, "content") { Ok(v) => v, Err(e) => return e.into_response() };
    let cwd = opt_str(&body, "cwd");
    to_response(crate::commands::plugins::update_skill(path, content, cwd)).into_response()
}

async fn plugins_delete_skill(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let path = match req_str(&body, "path") { Ok(v) => v, Err(e) => return e.into_response() };
    let cwd = opt_str(&body, "cwd");
    to_response(crate::commands::plugins::delete_skill(path, cwd)).into_response()
}

async fn plugins_list_installed() -> impl IntoResponse {
    to_response(crate::commands::plugins::list_installed_plugins().await)
}

async fn plugins_install(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let name = match req_str(&body, "name") { Ok(v) => v, Err(e) => return e.into_response() };
    let scope = match req_str(&body, "scope") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::plugins::install_plugin(name, scope).await).into_response()
}

async fn plugins_uninstall(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let name = match req_str(&body, "name") { Ok(v) => v, Err(e) => return e.into_response() };
    let scope = match req_str(&body, "scope") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::plugins::uninstall_plugin(name, scope).await).into_response()
}

async fn plugins_enable(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let name = match req_str(&body, "name") { Ok(v) => v, Err(e) => return e.into_response() };
    let scope = match req_str(&body, "scope") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::plugins::enable_plugin(name, scope).await).into_response()
}

async fn plugins_disable(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let name = match req_str(&body, "name") { Ok(v) => v, Err(e) => return e.into_response() };
    let scope = match req_str(&body, "scope") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::plugins::disable_plugin(name, scope).await).into_response()
}

async fn plugins_update(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let name = match req_str(&body, "name") { Ok(v) => v, Err(e) => return e.into_response() };
    let scope = match req_str(&body, "scope") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::plugins::update_plugin(name, scope).await).into_response()
}

async fn plugins_add_marketplace(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let source = match req_str(&body, "source") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::plugins::add_marketplace(source).await).into_response()
}

async fn plugins_remove_marketplace(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let name = match req_str(&body, "name") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::plugins::remove_marketplace(name).await).into_response()
}

async fn plugins_update_marketplace(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let name = opt_str(&body, "name");
    to_response(crate::commands::plugins::update_marketplace(name).await).into_response()
}

async fn plugins_community_health() -> impl IntoResponse {
    to_response(crate::commands::plugins::check_community_health().await)
}

async fn plugins_community_search(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let query = match req_str(&body, "query") { Ok(v) => v, Err(e) => return e.into_response() };
    let limit = opt_u32(&body, "limit");
    to_response(crate::commands::plugins::search_community_skills(query, limit).await).into_response()
}

async fn plugins_community_detail(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let source = match req_str(&body, "source") { Ok(v) => v, Err(e) => return e.into_response() };
    let skill_id = match req_str(&body, "skill_id") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::plugins::get_community_skill_detail(source, skill_id).await).into_response()
}

async fn plugins_community_install(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let source = match req_str(&body, "source") { Ok(v) => v, Err(e) => return e.into_response() };
    let skill_id = match req_str(&body, "skill_id") { Ok(v) => v, Err(e) => return e.into_response() };
    let scope = match req_str(&body, "scope") { Ok(v) => v, Err(e) => return e.into_response() };
    let cwd = opt_str(&body, "cwd");
    to_response(crate::commands::plugins::install_community_skill(source, skill_id, scope, cwd).await).into_response()
}

// ── Agents ──

async fn agents_list(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let cwd = opt_str(&body, "cwd");
    to_response(crate::commands::agents::list_agents(cwd).await).into_response()
}

async fn agents_read(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let scope = match req_str(&body, "scope") { Ok(v) => v, Err(e) => return e.into_response() };
    let file_name = match req_str(&body, "file_name") { Ok(v) => v, Err(e) => return e.into_response() };
    let cwd = opt_str(&body, "cwd");
    to_response(crate::commands::agents::read_agent_file(scope, file_name, cwd)).into_response()
}

async fn agents_create(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let scope = match req_str(&body, "scope") { Ok(v) => v, Err(e) => return e.into_response() };
    let file_name = match req_str(&body, "file_name") { Ok(v) => v, Err(e) => return e.into_response() };
    let content = match req_str(&body, "content") { Ok(v) => v, Err(e) => return e.into_response() };
    let cwd = opt_str(&body, "cwd");
    to_response(crate::commands::agents::create_agent_file(scope, file_name, content, cwd)).into_response()
}

async fn agents_update(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let scope = match req_str(&body, "scope") { Ok(v) => v, Err(e) => return e.into_response() };
    let file_name = match req_str(&body, "file_name") { Ok(v) => v, Err(e) => return e.into_response() };
    let content = match req_str(&body, "content") { Ok(v) => v, Err(e) => return e.into_response() };
    let cwd = opt_str(&body, "cwd");
    to_response(crate::commands::agents::update_agent_file(scope, file_name, content, cwd)).into_response()
}

async fn agents_delete(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let scope = match req_str(&body, "scope") { Ok(v) => v, Err(e) => return e.into_response() };
    let file_name = match req_str(&body, "file_name") { Ok(v) => v, Err(e) => return e.into_response() };
    let cwd = opt_str(&body, "cwd");
    to_response(crate::commands::agents::delete_agent_file(scope, file_name, cwd)).into_response()
}

// ── MCP ──

async fn mcp_list(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let cwd = opt_str(&body, "cwd");
    to_response(crate::commands::mcp::list_configured_mcp_servers(cwd)).into_response()
}

async fn mcp_add(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let name = match req_str(&body, "name") { Ok(v) => v, Err(e) => return e.into_response() };
    let transport = match req_str(&body, "transport") { Ok(v) => v, Err(e) => return e.into_response() };
    let scope = match req_str(&body, "scope") { Ok(v) => v, Err(e) => return e.into_response() };
    let cwd = opt_str(&body, "cwd");
    let config_json = opt_str(&body, "config_json");
    let url_val = opt_str(&body, "url");
    let env_vars = body.get("env_vars").and_then(|v| serde_json::from_value(v.clone()).ok());
    let headers = body.get("headers").and_then(|v| serde_json::from_value(v.clone()).ok());
    to_response(crate::commands::mcp::add_mcp_server(
        name, transport, scope, cwd, config_json, url_val, env_vars, headers,
    ).await).into_response()
}

async fn mcp_remove(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let name = match req_str(&body, "name") { Ok(v) => v, Err(e) => return e.into_response() };
    let scope = match req_str(&body, "scope") { Ok(v) => v, Err(e) => return e.into_response() };
    let cwd = opt_str(&body, "cwd");
    to_response(crate::commands::mcp::remove_mcp_server(name, scope, cwd).await).into_response()
}

async fn mcp_toggle(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let name = match req_str(&body, "name") { Ok(v) => v, Err(e) => return e.into_response() };
    let enabled = opt_bool(&body, "enabled").unwrap_or(true);
    let scope = match req_str(&body, "scope") { Ok(v) => v, Err(e) => return e.into_response() };
    let cwd = opt_str(&body, "cwd");
    to_response(crate::commands::mcp::toggle_mcp_server_config(name, enabled, scope, cwd)).into_response()
}

async fn mcp_registry_health() -> impl IntoResponse {
    to_response(crate::commands::mcp::check_mcp_registry_health().await)
}

async fn mcp_registry_search(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let query = match req_str(&body, "query") { Ok(v) => v, Err(e) => return e.into_response() };
    let limit = opt_u32(&body, "limit");
    let cursor = opt_str(&body, "cursor");
    to_response(crate::commands::mcp::search_mcp_registry(query, limit, cursor).await).into_response()
}

// ── CLI Config ──

async fn cli_config_get() -> impl IntoResponse {
    to_response(crate::commands::cli_config::get_cli_config())
}

async fn cli_config_project(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let cwd = match req_str(&body, "cwd") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::cli_config::get_project_cli_config(cwd)).into_response()
}

async fn cli_config_update(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let patch = body.get("patch").cloned().unwrap_or(Value::Object(Default::default()));
    to_response(crate::commands::cli_config::update_cli_config(patch)).into_response()
}

// ── Onboarding ──

async fn onboarding_auth_status() -> impl IntoResponse {
    to_response(crate::commands::onboarding::check_auth_status().await)
}

async fn onboarding_install_methods() -> impl IntoResponse {
    to_response(crate::commands::onboarding::detect_install_methods().await)
}

async fn onboarding_login(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    to_response(crate::commands::onboarding::run_claude_login(state).await)
}

async fn onboarding_auth_overview() -> impl IntoResponse {
    to_response(crate::commands::onboarding::get_auth_overview().await)
}

async fn onboarding_set_api_key(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let key = match req_str(&body, "key") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::onboarding::set_cli_api_key(key).await).into_response()
}

async fn onboarding_remove_api_key() -> impl IntoResponse {
    to_response(crate::commands::onboarding::remove_cli_api_key().await)
}

// ── Clipboard ──

async fn clipboard_files() -> impl IntoResponse {
    to_response(crate::commands::clipboard::get_clipboard_files())
}

async fn clipboard_read(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let path = match req_str(&body, "path") { Ok(v) => v, Err(e) => return e.into_response() };
    let as_text = opt_bool(&body, "as_text").unwrap_or(false);
    to_response(crate::commands::clipboard::read_clipboard_file(path, as_text)).into_response()
}

async fn clipboard_save_temp(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let name = match req_str(&body, "name") { Ok(v) => v, Err(e) => return e.into_response() };
    let content_base64 = match req_str(&body, "content_base64") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::clipboard::save_temp_attachment(name, content_base64)).into_response()
}

// ── CLI Sync ──

async fn cli_sync_discover(
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let cwd = match req_str(&body, "cwd") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::cli_sync::discover_cli_sessions(cwd).await).into_response()
}

async fn cli_sync_import(
    State(state): State<Arc<AppState>>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let session_id = match req_str(&body, "session_id") { Ok(v) => v, Err(e) => return e.into_response() };
    let cwd = match req_str(&body, "cwd") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::cli_sync::import_cli_session(
        session_id, cwd, &state.event_writer,
    ).await).into_response()
}

async fn cli_sync_sync(
    State(state): State<Arc<AppState>>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let run_id = match req_str(&body, "run_id") { Ok(v) => v, Err(e) => return e.into_response() };
    to_response(crate::commands::cli_sync::sync_cli_session(
        run_id, &state.event_writer,
    ).await).into_response()
}

// ── Updates ──

async fn updates_check(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    to_response(crate::commands::updates::check_for_updates(state).await)
}

// ── System (new for web) ──

async fn system_version() -> impl IntoResponse {
    env!("CARGO_PKG_VERSION").to_string()
}

async fn system_home_dir() -> impl IntoResponse {
    crate::storage::home_dir().unwrap_or_default()
}
