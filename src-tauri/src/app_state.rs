//! Unified application state — replaces scattered `tauri::State<T>` injections.

use crate::agent::adapter::ActorSessionMap;
use crate::agent::control::CliInfoCache;
use crate::agent::pty::PtyMap;
use crate::agent::spawn_locks::SpawnLocks;
use crate::agent::stream::ProcessMap;
use crate::storage::events::EventWriter;
use std::sync::Arc;
use tokio::sync::broadcast;
use tokio_util::sync::CancellationToken;

/// Central application state shared across all axum handlers via `State<Arc<AppState>>`.
pub struct AppState {
    pub process_map: ProcessMap,
    pub pty_map: PtyMap,
    pub actor_sessions: ActorSessionMap,
    pub cli_info_cache: CliInfoCache,
    pub event_writer: Arc<EventWriter>,
    pub spawn_locks: SpawnLocks,
    pub cancel_token: CancellationToken,
    /// Broadcast channel for pushing events to all connected WebSocket clients.
    pub ws_tx: broadcast::Sender<String>,
}

impl AppState {
    /// Convenience: serialize and broadcast an event to all WebSocket clients.
    /// Mirrors the old `app.emit(event_name, payload)` pattern.
    pub fn emit(&self, event: &str, payload: &serde_json::Value) {
        let msg = serde_json::json!({
            "event": event,
            "payload": payload,
        });
        // Ignore send errors — means no active receivers (no WS clients connected).
        let _ = self.ws_tx.send(msg.to_string());
    }

    /// Emit with a serializable payload (convenience wrapper).
    pub fn emit_ser<T: serde::Serialize>(&self, event: &str, payload: &T) {
        match serde_json::to_value(payload) {
            Ok(v) => self.emit(event, &v),
            Err(e) => log::warn!("[ws] failed to serialize event {}: {}", event, e),
        }
    }
}
