//! WebSocket handler — broadcasts server events to all connected clients.
//!
//! Each client subscribes to the broadcast channel and receives all events.
//! Heartbeat ping/pong keeps SSH tunnel connections alive.

use crate::app_state::AppState;
use axum::extract::ws::{Message, WebSocket};
use axum::extract::{State, WebSocketUpgrade};
use axum::response::IntoResponse;
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;
use tokio::time::{interval, Duration};

/// Axum handler: upgrade HTTP to WebSocket.
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();
    let mut rx = state.ws_tx.subscribe();

    // Heartbeat interval — 30s ping to keep SSH tunnels alive.
    let mut heartbeat = interval(Duration::from_secs(30));

    // Spawn a task to forward broadcast messages to this client.
    let send_task = tokio::spawn(async move {
        loop {
            tokio::select! {
                msg = rx.recv() => {
                    match msg {
                        Ok(text) => {
                            if sender.send(Message::Text(text.into())).await.is_err() {
                                break; // client disconnected
                            }
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                            log::warn!("[ws] client lagged, skipped {} messages", n);
                        }
                        Err(_) => break, // channel closed
                    }
                }
                _ = heartbeat.tick() => {
                    if sender.send(Message::Ping(vec![].into())).await.is_err() {
                        break;
                    }
                }
            }
        }
    });

    // Read from client (drain incoming messages, handle pong implicitly).
    while let Some(Ok(_msg)) = receiver.next().await {
        // Client messages are currently ignored (server-push only).
        // Future: could handle client-initiated commands here.
    }

    // Client disconnected — abort the send task.
    send_task.abort();
    log::debug!("[ws] client disconnected");
}
