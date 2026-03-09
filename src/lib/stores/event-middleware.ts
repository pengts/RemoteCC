/**
 * EventMiddleware: unified WebSocket event listener management.
 *
 * - Connects to the backend WebSocket once
 * - Routes events by run_id to the subscribed SessionStore
 * - Microbatches bus-events (16ms) to reduce reactive updates
 * - PTY/Pipe events go through handler callbacks (DOM-bound)
 * - Auto-reconnects on disconnect (3s + exponential backoff)
 */
import { dbg, dbgWarn } from "$lib/utils/debug";
import type { BusEvent, HookEvent } from "$lib/types";
import type { SessionStore } from "./session-store.svelte";

// ── Handler interfaces (page-level DOM callbacks) ──

export interface PtyHandler {
  onOutput(payload: { run_id: string; data: string }): void;
  onExit(payload: { run_id: string; exit_code: number }): void;
}

export interface PipeHandler {
  onDelta(delta: { text: string }): void;
  onDone(done: { ok: boolean; code: number; error?: string }): void;
}

export interface RunEventHandler {
  onRunEvent(event: { run_id: string; type: string; text: string }): void;
}

// ── Middleware ──

export class EventMiddleware {
  private _ws: WebSocket | null = null;
  private _subscriptions = new Map<string, SessionStore>();
  private _currentRunId: string | null = null;
  private _currentStore: SessionStore | null = null;

  // Handler callbacks (set by page component)
  private _ptyHandler: PtyHandler | null = null;
  private _pipeHandler: PipeHandler | null = null;
  private _runEventHandler: RunEventHandler | null = null;

  // Microbatch buffer for bus events
  private _batchBuffer = new Map<string, BusEvent[]>();
  private _flushScheduled = false;
  private _BATCH_INTERVAL = 16; // ~1 frame
  private _MAX_BUFFER_SIZE = 500; // per-run overflow threshold

  // Idempotent start guard
  private _started = false;

  // Reconnect state
  private _reconnectAttempts = 0;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _destroyed = false;

  // ── Lifecycle ──

  async start(): Promise<void> {
    if (this._started) {
      dbg("middleware", "start skipped (already started)");
      return;
    }
    this._started = true;
    this._destroyed = false;
    dbg("middleware", "starting WebSocket connection");
    this._connect();
  }

  private _connect(): void {
    if (this._destroyed) return;

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${location.host}/ws`;
    dbg("middleware", "connecting to", wsUrl);

    const ws = new WebSocket(wsUrl);
    this._ws = ws;

    ws.onopen = () => {
      dbg("middleware", "WebSocket connected");
      this._reconnectAttempts = 0;
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event) {
          this._dispatch(msg.event, msg.payload);
        }
      } catch (e) {
        dbgWarn("middleware", "failed to parse WS message:", e);
      }
    };

    ws.onclose = () => {
      dbg("middleware", "WebSocket closed");
      if (!this._destroyed) {
        this._scheduleReconnect();
      }
    };

    ws.onerror = (e) => {
      dbgWarn("middleware", "WebSocket error:", e);
    };
  }

  private _scheduleReconnect(): void {
    if (this._destroyed || this._reconnectTimer) return;
    const delay = Math.min(3000 * Math.pow(1.5, this._reconnectAttempts), 30000);
    this._reconnectAttempts++;
    dbg("middleware", `reconnecting in ${delay}ms (attempt ${this._reconnectAttempts})`);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._connect();
    }, delay);
  }

  private _dispatch(eventName: string, payload: unknown): void {
    switch (eventName) {
      case "bus-event":
        this._handleBusEvent(payload as BusEvent);
        break;
      case "pty-output":
        dbg("middleware", "pty-output", { run_id: (payload as { run_id: string }).run_id });
        this._ptyHandler?.onOutput(payload as { run_id: string; data: string });
        break;
      case "pty-exit":
        dbg("middleware", "pty-exit", payload);
        this._ptyHandler?.onExit(payload as { run_id: string; exit_code: number });
        break;
      case "chat-delta":
        dbg("middleware", "chat-delta", { len: (payload as { text: string }).text.length });
        this._pipeHandler?.onDelta(payload as { text: string });
        break;
      case "chat-done":
        dbg("middleware", "chat-done", payload);
        this._pipeHandler?.onDone(payload as { ok: boolean; code: number; error?: string });
        break;
      case "run-event":
        dbg("middleware", "run-event", {
          run_id: (payload as { run_id: string }).run_id,
          type: (payload as { type: string }).type,
        });
        this._runEventHandler?.onRunEvent(
          payload as { run_id: string; type: string; text: string },
        );
        break;
      case "hook-event":
        dbg("middleware", "hook-event", {
          hook_type: (payload as HookEvent).hook_type,
          tool: (payload as HookEvent).tool_name,
        });
        this._handleHookEvent(payload as HookEvent);
        break;
      case "hook-usage":
        dbg("middleware", "hook-usage", payload);
        this._handleHookUsage(
          payload as { run_id: string; input_tokens: number; output_tokens: number; cost: number },
        );
        break;
      case "setup-progress":
        window.dispatchEvent(new CustomEvent("ocv:setup-progress", { detail: payload }));
        break;
      case "setup-progress-replace":
        window.dispatchEvent(new CustomEvent("ocv:setup-progress-replace", { detail: payload }));
        break;
      case "team-update":
        window.dispatchEvent(new CustomEvent("ocv:team-update", { detail: payload }));
        break;
      case "task-update":
        window.dispatchEvent(new CustomEvent("ocv:task-update", { detail: payload }));
        break;
      case "context-snapshot":
        window.dispatchEvent(new CustomEvent("ocv:context-snapshot", { detail: payload }));
        break;
      case "cli-sync-update":
        window.dispatchEvent(new Event("ocv:runs-changed"));
        break;
      default:
        dbg("middleware", "unhandled event:", eventName);
    }
  }

  destroy(): void {
    dbg("middleware", "destroying WebSocket connection");
    this._destroyed = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
    this._subscriptions.clear();
    this._currentRunId = null;
    this._currentStore = null;
    this._batchBuffer.clear();
    this._started = false;
  }

  // ── Subscriptions ──

  /** Subscribe a store for a run_id. Clears previous subscription (single-session mode). */
  subscribeCurrent(runId: string, store: SessionStore): void {
    // Idempotent: skip if already subscribed for the same run + store.
    // Re-subscribing for the same pair would clear the batch buffer,
    // dropping in-flight events (e.g. RunState(idle) after resume).
    if (runId && this._currentRunId === runId && this._currentStore === store) {
      return;
    }

    // Clear old subscription (different run or different store)
    if (this._currentRunId) {
      this._subscriptions.delete(this._currentRunId);
      this._batchBuffer.delete(this._currentRunId);
    }
    if (runId) {
      this._currentRunId = runId;
      this._currentStore = store;
      this._subscriptions.set(runId, store);
    } else {
      // Empty runId = clear all (navigating to new chat)
      this._currentRunId = null;
      this._currentStore = null;
    }
    dbg("middleware", "subscribeCurrent", runId || "(cleared)");
  }

  /** Multi-session subscribe (for future subagent support). */
  subscribe(runId: string, store: SessionStore): void {
    this._subscriptions.set(runId, store);
    dbg("middleware", "subscribe", runId);
  }

  unsubscribe(runId: string): void {
    this._subscriptions.delete(runId);
    this._batchBuffer.delete(runId);
    if (this._currentRunId === runId) {
      this._currentRunId = null;
      this._currentStore = null;
    }
    dbg("middleware", "unsubscribe", runId);
  }

  // ── Handler setters ──

  setPtyHandler(handler: PtyHandler | null): void {
    this._ptyHandler = handler;
  }

  setPipeHandler(handler: PipeHandler | null): void {
    this._pipeHandler = handler;
  }

  setRunEventHandler(handler: RunEventHandler | null): void {
    this._runEventHandler = handler;
  }

  // ── Internal ──

  private _handleBusEvent(ev: BusEvent): void {
    const store = this._subscriptions.get(ev.run_id);
    if (!store) return;

    // Push to batch buffer
    let buf = this._batchBuffer.get(ev.run_id);
    if (!buf) {
      buf = [];
      this._batchBuffer.set(ev.run_id, buf);
    }
    buf.push(ev);

    // Overflow protection: flush synchronously if buffer grows too large
    if (buf.length >= this._MAX_BUFFER_SIZE) {
      dbgWarn(
        "middleware",
        `buffer overflow for ${ev.run_id} (${buf.length} events), flushing synchronously`,
      );
      this._flush();
      return;
    }

    this._scheduleFlush();
  }

  private _handleHookEvent(event: HookEvent): void {
    const store = this._subscriptions.get(event.run_id);
    if (!store) return;
    store.applyHookEvent(event);
  }

  private _handleHookUsage(usage: {
    run_id: string;
    input_tokens: number;
    output_tokens: number;
    cost: number;
  }): void {
    const store = this._subscriptions.get(usage.run_id);
    if (!store) return;
    store.applyHookUsage(usage);
  }

  private _scheduleFlush(): void {
    if (this._flushScheduled) return;
    this._flushScheduled = true;
    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(() => this._flush());
    } else {
      setTimeout(() => this._flush(), this._BATCH_INTERVAL);
    }
  }

  private _flush(): void {
    this._flushScheduled = false;
    for (const [runId, events] of this._batchBuffer) {
      const store = this._subscriptions.get(runId);
      if (!store) continue;
      try {
        if (events.length === 1) {
          store.applyEvent(events[0]);
        } else if (events.length > 1) {
          store.applyEventBatch(events);
        }
      } catch (e) {
        dbgWarn("middleware", `flush error for run ${runId}:`, e);
      }
    }
    this._batchBuffer.clear();
  }
}

// ── Module-level singleton ──

let _instance: EventMiddleware | null = null;

export function getEventMiddleware(): EventMiddleware {
  if (!_instance) {
    _instance = new EventMiddleware();
  }
  return _instance;
}
