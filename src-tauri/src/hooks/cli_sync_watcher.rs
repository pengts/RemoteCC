//! Background task: auto-discover and sync Claude CLI sessions every 10 seconds.

use crate::app_state::AppState;
use crate::storage::cli_sessions;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;

/// Spawn a tokio task that periodically discovers and syncs CLI sessions.
pub fn start_cli_sync_watcher(state: Arc<AppState>, cancel: CancellationToken) {
    tokio::spawn(async move {
        log::info!("[cli_sync_watcher] started (interval=10s)");

        loop {
            tokio::select! {
                _ = cancel.cancelled() => {
                    log::info!("[cli_sync_watcher] shutting down");
                    break;
                }
                _ = tokio::time::sleep(std::time::Duration::from_secs(10)) => {
                    if let Err(e) = run_sync_cycle(&state).await {
                        log::warn!("[cli_sync_watcher] sync cycle error: {}", e);
                    }
                }
            }
        }
    });
}

async fn run_sync_cycle(state: &Arc<AppState>) -> Result<(), String> {
    let writer = state.event_writer.clone();
    let state2 = state.clone();

    tokio::task::spawn_blocking(move || {
        // 1. Discover all CLI sessions (empty cwd = scan all)
        let sessions = match cli_sessions::discover_sessions("") {
            Ok(s) => s,
            Err(e) => {
                log::debug!("[cli_sync_watcher] discover error: {}", e);
                return Ok(());
            }
        };

        let mut changed = false;

        for session in &sessions {
            if session.already_imported {
                // Incremental sync for already-imported sessions
                if let Some(ref run_id) = session.existing_run_id {
                    match cli_sessions::sync_session(run_id, writer.clone()) {
                        Ok(result) => {
                            if result.new_events > 0 || result.meta_updated {
                                log::debug!(
                                    "[cli_sync_watcher] synced run={}, new_events={}, meta_updated={}",
                                    run_id,
                                    result.new_events,
                                    result.meta_updated
                                );
                                changed = true;
                            }
                        }
                        Err(e) => {
                            log::debug!(
                                "[cli_sync_watcher] sync error run={}: {}",
                                run_id,
                                e
                            );
                        }
                    }
                }
            } else {
                // Auto-import new sessions
                match cli_sessions::import_session(
                    &session.session_id,
                    &session.cwd,
                    writer.clone(),
                ) {
                    Ok(result) => {
                        log::info!(
                            "[cli_sync_watcher] auto-imported session={} as run={}, events={}",
                            session.session_id,
                            result.run_id,
                            result.events_imported
                        );
                        changed = true;
                    }
                    Err(e) => {
                        log::debug!(
                            "[cli_sync_watcher] import error session={}: {}",
                            session.session_id,
                            e
                        );
                    }
                }
            }
        }

        if changed {
            // Notify frontend to refresh the sidebar
            state2.emit(
                "cli-sync-update",
                &serde_json::json!({"type": "auto-sync"}),
            );
        }

        Ok(())
    })
    .await
    .map_err(|e| format!("spawn_blocking: {}", e))?
}
