# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

OpenCovibe is a local-first web app providing a visual interface for AI coding CLIs (Claude Code, Codex, etc.). The project was originally built with Tauri v2 and has been migrated to a **pure Web architecture**: Rust axum HTTP/WebSocket backend + Svelte 5 SvelteKit frontend. Communication via standard HTTP POST + WebSocket (replacing Tauri IPC).

Designed for remote server deployment with SSH port forwarding access.

## Architecture

### Two-Process Model
- **Frontend** (`src/`): Svelte 5 + SvelteKit (adapter-static) + Tailwind CSS, built to `build/` as static files
- **Backend** (`src-tauri/`): Rust + Tokio + axum, serves API endpoints + WebSocket + static files on port 8080
- Communication: Frontend calls `POST /api/{endpoint}` via `fetch()`; real-time events via WebSocket at `/ws`

### Backend Structure (`src-tauri/src/`)
```
lib.rs              — axum server startup, static file serving, CORS
main.rs             — binary entry point
routes.rs           — All API route registration (POST JSON endpoints + WS)
app_state.rs        — Unified AppState (replaces Tauri State<T> injection)
ws.rs               — WebSocket broadcast (tokio::sync::broadcast channel)
models.rs           — Shared data models
pricing.rs          — Token pricing tables
agent/
  session_actor.rs  — Core session lifecycle (actor pattern, mpsc channels)
  claude_protocol.rs — Claude stream-JSON protocol parser
  turn_engine.rs    — Turn management with timeouts and heartbeat
  adapt.rs          — Multi-protocol adapter (stream-JSON, PTY, pipe, HTTP API)
  claude_stream.rs  — Claude CLI process spawning and PATH resolution
  pty.rs            — PTY process management
  stream.rs         — Pipe-mode agent streaming
  control.rs        — CLI info discovery (models, commands)
  spawn.rs          — Agent command builder
  spawn_locks.rs    — Per-run spawn mutex
commands/
  session.rs        — start/stop/fork/message session (P0 core)
  runs.rs           — CRUD for run history
  chat.rs           — Pipe-mode chat (send_chat_message)
  settings.rs       — User/agent settings get/update
  fs.rs             — Directory listing, file read
  files.rs          — Text file read/write, memory files
  git.rs            — Git summary/branch/diff/status
  pty.rs            — PTY spawn/write/resize/close
  events.rs         — Run event retrieval
  artifacts.rs      — Run artifact retrieval
  control.rs        — CLI info endpoint
  diagnostics.rs    — CLI check, proxy detection
  onboarding.rs     — Auth status, install methods
  cli_sync.rs       — Discover/import/sync CLI sessions
  cli_config.rs     — Claude CLI config reader
  teams.rs          — Team dashboard data
  plugins.rs        — Plugin/skill marketplace
  mcp.rs            — MCP server management
  agents.rs         — Custom agent definitions
  stats.rs          — Usage statistics
  export.rs         — Conversation export
  updates.rs        — Version check
storage/
  runs.rs           — Run metadata persistence (~/.opencovibe/runs/)
  events.rs         — JSONL event writer/reader
  settings.rs       — JSON settings persistence
  cli_sessions.rs   — Claude CLI session discovery
  favorites.rs      — Prompt favorites
  teams.rs          — Team file watcher
  plugins.rs        — Plugin/skill storage
  (and more...)
hooks/
  team_watcher.rs   — File watcher for team/task updates
```

### Frontend Structure (`src/`)
```
lib/
  api.ts            — ~100 API functions calling POST /api/{endpoint}
  transport.ts      — HTTP transport layer (apiCall wrapper around fetch)
  types.ts          — Shared TypeScript type definitions
  commands.ts       — Slash command definitions
  components/       — 50+ Svelte 5 components
  stores/
    session-store.svelte.ts  — Session state management (Svelte 5 runes)
    event-middleware.ts      — WebSocket client with auto-reconnect + microbatching
    keybindings.svelte.ts    — Keyboard shortcut store
    team-store.svelte.ts     — Team dashboard store
  i18n/             — Lightweight i18n runtime (en, zh-CN); translations in messages/
  utils/            — Formatting, platform detection, debug helpers
routes/
  +layout.svelte    — Main layout with sidebar, project folders, navigation
  chat/             — Chat page (main interaction)
  explorer/         — File explorer
  settings/         — Settings page
  usage/            — Token usage analytics
  teams/            — Team dashboard
  plugins/          — Plugin marketplace
  memory/           — Memory file management
  config/           — Agent configuration
  release-notes/    — Release notes
```

### Data Storage
All data stored locally at `~/.opencovibe/`:
```
~/.opencovibe/
  settings.json       — User settings
  keybindings.json    — Custom shortcuts
  runs/{run-id}/
    meta.json         — Run metadata (prompt, cwd, model, status)
    events.jsonl      — Event log (messages, tool calls, etc.)
    artifacts.json    — Summary artifacts
```

### API Pattern
All endpoints use `POST /api/{group}/{action}` with JSON body. Examples:
```
POST /api/runs/list           — List all runs
POST /api/session/start       — Start a new session
POST /api/session/message     — Send message to session
POST /api/settings/user/get   — Get user settings
GET  /api/system/version      — App version (plain text)
GET  /api/system/home-dir     — Server home directory (plain text)
GET  /ws                      — WebSocket for real-time events
```

WebSocket events are JSON: `{"event":"bus-event","payload":{...}}`. Event types: `bus-event`, `hook-event`, `hook-usage`, `pty-output`, `pty-exit`, `chat-delta`, `chat-done`, `setup-progress`, `team-update`, `task-update`, `context-snapshot`.

## Common Commands

```bash
# Frontend development (with hot-reload, proxies to backend)
npm run dev              # Vite dev server on :1420, proxies /api and /ws to :8080

# Frontend build
npm run build            # Build static files to build/

# Backend build
cd src-tauri && cargo build --release   # Binary at target/release/opencovibe-server

# Start production server
./src-tauri/target/release/opencovibe-server   # Serves on http://127.0.0.1:8080

# Testing
npm run test             # Vitest
npm run test:watch       # Watch mode

# Linting & Formatting
npm run lint             # ESLint
npm run lint:fix         # ESLint auto-fix
npm run format           # Prettier
npm run rust:check       # cargo fmt + clippy

# Full verification
npm run verify           # lint + format + i18n + test + build + rust:check
```

## Key Conventions

- Frontend uses **Svelte 5 runes** (`$state`, `$derived`, `$effect`), not legacy stores
- Styling: **Tailwind CSS** with CSS variable-based theming (light/dark)
- i18n: Every user-facing string uses the i18n system; run `npm run i18n:check`
- Rust: standard `cargo fmt` + `clippy` conventions
- Prettier: double quotes, 100 char width, trailing commas
- ESLint allows `@typescript-eslint/no-explicit-any`

## Web Migration Notes

This project was migrated from Tauri desktop to pure Web:
- Tauri `invoke()` -> `fetch()` via `src/lib/transport.ts`
- Tauri `listen()` -> native WebSocket in `src/lib/stores/event-middleware.ts`
- Tauri file/shell dialogs -> `prompt()` for directory paths, Blob download for file save
- Tauri `AppHandle.emit()` -> `broadcast::Sender<String>` via WebSocket
- No `@tauri-apps/*` dependencies remain in the frontend
- Backend binary is `opencovibe-server` (not a Tauri app bundle)

## CLI / Web Session Mechanism

### Session Actor Lifecycle
Each web-initiated session spawns a `session_actor` (tokio task) that manages a Claude CLI child process. The actor is stored in `AppState.actor_sessions` (server-side HashMap), keyed by `run_id`. The actor's lifecycle is **independent of the browser connection**:
- Closing the browser only drops the WebSocket (event delivery channel), not the actor or CLI process
- The CLI process continues executing on the server as long as the server process is alive
- When the user reopens the browser, the 1s auto-sync mechanism picks up persisted events and displays them

### Turn Timeouts
Each message sent to a session creates a "turn" with timeout protection:
- **User soft timeout**: 300s (5 min) — stops accepting new tool outputs, enters draining state
- **User hard timeout**: 600s (10 min) — enters quarantine, sends interrupt to CLI process
- **Quarantine deadline**: 10s — if CLI still unresponsive after interrupt, force-kills the process
- **Internal soft/hard timeout**: 15s / 60s — for auto-context internal turns

There is **no session-level idle timeout**. Once a turn completes (CLI returns `RunState(idle)`), the actor stays alive indefinitely until explicitly stopped or the server restarts.

### CLI Sync Pipeline
Background watcher (`cli_sync_watcher.rs`) runs every 1 second:
1. Discovers Claude CLI sessions from `~/.claude/projects/` JSONL files
2. Auto-imports new sessions; incrementally syncs already-imported sessions
3. Detects `customTitle` events for session renaming (field: `customTitle`, event type: `custom-title`)
4. Emits `cli-sync-update` WebSocket event with `changed_run_ids` when changes are found
5. Frontend `event-middleware.ts` dispatches `ocv:cli-sync-runs` CustomEvent
6. Chat page listens and calls `store.refreshFromSync()` for incremental event loading (via `_seq` tracking)

### Web vs CLI Interaction Rules
- **One process per session**: Claude CLI locks the session file. Running both Web and CLI on the same session simultaneously causes write conflicts
- **Web "running" state**: Web spawns its own CLI process via `session_actor`. The actor holds the process until the turn completes or is stopped
- **Web "stopped" state**: The actor is idle or the CLI process has exited. CLI-side changes are picked up via the 1s sync
- **Switching between Web and CLI**: Stop the Web session (or wait for turn completion) before using the same session in CLI, and vice versa
- **Resume button**: Required to re-attach a `session_actor` to an existing session (spawns a new CLI process with `--resume`). Not needed for viewing sync'd CLI changes — those appear automatically
- **Background execution**: Web-initiated tasks continue running when the browser is closed (server must remain running). Results are persisted to `events.jsonl` and will be visible upon reconnection via auto-sync

### Event Flow
```
[Web send message]
  → POST /api/session/message
  → session_actor receives command via mpsc channel
  → actor writes to CLI stdin
  → CLI stdout parsed by claude_protocol → BusEvent
  → persist to events.jsonl + broadcast via WebSocket
  → event-middleware.ts receives and routes to SessionStore
  → Svelte reactivity updates UI

[CLI sync (passive observation)]
  → cli_sync_watcher reads CLI's JSONL files (1s interval)
  → new events injected with _seq field
  → cli-sync-update WebSocket event sent
  → chat page calls store.refreshFromSync()
  → incremental events fetched via GET /api/events/list?since_seq=N
  → applyEventBatch() updates UI without full reload
```
