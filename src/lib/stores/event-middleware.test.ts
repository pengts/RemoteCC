/**
 * EventMiddleware unit tests.
 *
 * Tests routing, microbatching, subscription management, overflow protection,
 * and error isolation using a mock WebSocket and SessionStore.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { BusEvent } from "$lib/types";

// ── Mocks ──

vi.mock("$lib/utils/debug", () => ({
  dbg: vi.fn(),
  dbgWarn: vi.fn(),
}));

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  readyState = 1; // OPEN

  constructor(_url: string) {
    MockWebSocket.instances.push(this);
    // Simulate async open
    setTimeout(() => this.onopen?.(), 0);
  }

  close() {
    this.readyState = 3;
  }

  /** Test helper: simulate receiving a message from the server */
  simulateMessage(event: string, payload: unknown) {
    this.onmessage?.({ data: JSON.stringify({ event, payload }) });
  }
}

// Replace global WebSocket
const OriginalWebSocket = globalThis.WebSocket;
beforeEach(() => {
  MockWebSocket.instances = [];
  (globalThis as any).WebSocket = MockWebSocket as any;
});
afterEach(() => {
  (globalThis as any).WebSocket = OriginalWebSocket;
});

// Import after mocks
import { EventMiddleware } from "./event-middleware";
import { dbgWarn } from "$lib/utils/debug";

// ── Helpers ──

function makeBusEvent(runId: string, type: string, extra: Record<string, unknown> = {}): BusEvent {
  return { type, run_id: runId, ...extra } as unknown as BusEvent;
}

/** Get the latest mock WebSocket instance */
function getWs(): MockWebSocket {
  const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
  if (!ws) throw new Error("No WebSocket instance created");
  return ws;
}

/** Fire a bus-event through the mock WebSocket */
function fireBusEvent(ev: BusEvent): void {
  getWs().simulateMessage("bus-event", ev);
}

/** Minimal mock of SessionStore with the methods EventMiddleware calls */
function mockStore() {
  return {
    applyEvent: vi.fn(),
    applyEventBatch: vi.fn(),
    applyHookEvent: vi.fn(),
    applyHookUsage: vi.fn(),
  };
}

// ── Tests ──

describe("EventMiddleware", () => {
  let mw: EventMiddleware;

  beforeEach(() => {
    vi.useFakeTimers();
    mw = new EventMiddleware();
  });

  afterEach(() => {
    mw.destroy();
    vi.useRealTimers();
  });

  // ── Lifecycle ──

  describe("lifecycle", () => {
    it("creates WebSocket on start()", async () => {
      await mw.start();
      vi.advanceTimersByTime(0);
      expect(MockWebSocket.instances.length).toBe(1);
    });

    it("is idempotent — second start() is a no-op", async () => {
      await mw.start();
      await mw.start();
      expect(MockWebSocket.instances.length).toBe(1);
    });

    it("destroy() closes WebSocket", async () => {
      await mw.start();
      vi.advanceTimersByTime(0);
      const ws = getWs();
      mw.destroy();
      expect(ws.readyState).toBe(3);
    });
  });

  // ── Routing ──

  describe("bus-event routing", () => {
    it("routes events to subscribed store", async () => {
      await mw.start();
      vi.advanceTimersByTime(0);
      const store = mockStore();
      mw.subscribeCurrent("run-1", store as any);

      const ev = makeBusEvent("run-1", "message_complete", { message_id: "m1", text: "hi" });
      fireBusEvent(ev);
      vi.advanceTimersByTime(16);

      expect(store.applyEvent).toHaveBeenCalledWith(ev);
    });

    it("silently discards events for unsubscribed run_id", async () => {
      await mw.start();
      vi.advanceTimersByTime(0);
      const store = mockStore();
      mw.subscribeCurrent("run-1", store as any);

      const ev = makeBusEvent("run-OTHER", "message_complete", { message_id: "m1", text: "hi" });
      fireBusEvent(ev);
      vi.advanceTimersByTime(16);

      expect(store.applyEvent).not.toHaveBeenCalled();
      expect(store.applyEventBatch).not.toHaveBeenCalled();
    });

    it("routes hook-event to subscribed store", async () => {
      await mw.start();
      vi.advanceTimersByTime(0);
      const store = mockStore();
      mw.subscribeCurrent("run-1", store as any);

      getWs().simulateMessage("hook-event", {
        run_id: "run-1",
        hook_type: "PreToolUse",
        tool_name: "Bash",
      });

      expect(store.applyHookEvent).toHaveBeenCalledOnce();
    });

    it("routes hook-usage to subscribed store", async () => {
      await mw.start();
      vi.advanceTimersByTime(0);
      const store = mockStore();
      mw.subscribeCurrent("run-1", store as any);

      getWs().simulateMessage("hook-usage", {
        run_id: "run-1",
        input_tokens: 100,
        output_tokens: 50,
        cost: 0.01,
      });

      expect(store.applyHookUsage).toHaveBeenCalledOnce();
    });
  });

  // ── Microbatching ──

  describe("microbatching", () => {
    it("batches multiple events within 16ms into applyEventBatch", async () => {
      await mw.start();
      vi.advanceTimersByTime(0);
      const store = mockStore();
      mw.subscribeCurrent("run-1", store as any);

      const ev1 = makeBusEvent("run-1", "message_delta", { text: "a" });
      const ev2 = makeBusEvent("run-1", "message_delta", { text: "b" });
      const ev3 = makeBusEvent("run-1", "message_complete", { message_id: "m1", text: "ab" });

      fireBusEvent(ev1);
      fireBusEvent(ev2);
      fireBusEvent(ev3);

      // Before flush
      expect(store.applyEvent).not.toHaveBeenCalled();
      expect(store.applyEventBatch).not.toHaveBeenCalled();

      vi.advanceTimersByTime(16);

      // All 3 events delivered as a single batch
      expect(store.applyEventBatch).toHaveBeenCalledWith([ev1, ev2, ev3]);
      expect(store.applyEvent).not.toHaveBeenCalled();
    });

    it("uses applyEvent for single-event batch", async () => {
      await mw.start();
      vi.advanceTimersByTime(0);
      const store = mockStore();
      mw.subscribeCurrent("run-1", store as any);

      const ev = makeBusEvent("run-1", "run_state", { state: "running" });
      fireBusEvent(ev);
      vi.advanceTimersByTime(16);

      expect(store.applyEvent).toHaveBeenCalledWith(ev);
      expect(store.applyEventBatch).not.toHaveBeenCalled();
    });
  });

  // ── Subscription management ──

  describe("subscriptions", () => {
    it("subscribeCurrent replaces previous subscription", async () => {
      await mw.start();
      vi.advanceTimersByTime(0);
      const store1 = mockStore();
      const store2 = mockStore();

      mw.subscribeCurrent("run-1", store1 as any);
      mw.subscribeCurrent("run-2", store2 as any);

      // Event for old run_id should be discarded
      fireBusEvent(makeBusEvent("run-1", "message_delta", { text: "x" }));
      // Event for new run_id should be delivered
      fireBusEvent(makeBusEvent("run-2", "message_delta", { text: "y" }));
      vi.advanceTimersByTime(16);

      expect(store1.applyEvent).not.toHaveBeenCalled();
      expect(store2.applyEvent).toHaveBeenCalledOnce();
    });

    it("unsubscribe clears buffer and prevents delivery", async () => {
      await mw.start();
      vi.advanceTimersByTime(0);
      const store = mockStore();
      mw.subscribeCurrent("run-1", store as any);

      // Buffer an event
      fireBusEvent(makeBusEvent("run-1", "message_delta", { text: "x" }));

      // Unsubscribe before flush
      mw.unsubscribe("run-1");
      vi.advanceTimersByTime(16);

      expect(store.applyEvent).not.toHaveBeenCalled();
    });

    it("multi-session subscribe works alongside current", async () => {
      await mw.start();
      vi.advanceTimersByTime(0);
      const currentStore = mockStore();
      const otherStore = mockStore();

      mw.subscribeCurrent("run-1", currentStore as any);
      mw.subscribe("run-2", otherStore as any);

      fireBusEvent(makeBusEvent("run-1", "message_delta", { text: "a" }));
      fireBusEvent(makeBusEvent("run-2", "message_delta", { text: "b" }));
      vi.advanceTimersByTime(16);

      expect(currentStore.applyEvent).toHaveBeenCalledOnce();
      expect(otherStore.applyEvent).toHaveBeenCalledOnce();
    });
  });

  // ── Error isolation ──

  describe("flush error isolation", () => {
    it("applyEventBatch error does not prevent other runs from flushing", async () => {
      await mw.start();
      vi.advanceTimersByTime(0);
      const failStore = mockStore();
      const okStore = mockStore();

      failStore.applyEventBatch.mockImplementation(() => {
        throw new Error("reducer crashed");
      });

      mw.subscribeCurrent("run-1", failStore as any);
      mw.subscribe("run-2", okStore as any);

      // Buffer events for both
      fireBusEvent(makeBusEvent("run-1", "message_delta", { text: "a" }));
      fireBusEvent(makeBusEvent("run-1", "message_delta", { text: "b" }));
      fireBusEvent(makeBusEvent("run-2", "message_delta", { text: "c" }));

      vi.advanceTimersByTime(16);

      // Failing store was called (and threw)
      expect(failStore.applyEventBatch).toHaveBeenCalledOnce();
      // OK store still got its event delivered
      expect(okStore.applyEvent).toHaveBeenCalledOnce();
      // Warning was logged
      expect(dbgWarn).toHaveBeenCalledWith(
        "middleware",
        expect.stringContaining("flush error for run run-1"),
        expect.any(Error),
      );
    });
  });

  // ── Buffer overflow ──

  describe("buffer overflow protection", () => {
    it("flushes synchronously when buffer exceeds MAX_BUFFER_SIZE", async () => {
      await mw.start();
      vi.advanceTimersByTime(0);
      const store = mockStore();
      mw.subscribeCurrent("run-1", store as any);

      // Fire 500 events (= MAX_BUFFER_SIZE)
      for (let i = 0; i < 500; i++) {
        fireBusEvent(makeBusEvent("run-1", "message_delta", { text: `chunk-${i}` }));
      }

      // Should have flushed synchronously — no need to advance timers
      expect(store.applyEventBatch).toHaveBeenCalledOnce();
      expect(store.applyEventBatch.mock.calls[0][0]).toHaveLength(500);
      expect(dbgWarn).toHaveBeenCalledWith(
        "middleware",
        expect.stringContaining("buffer overflow"),
      );
    });
  });

  // ── Handler routing (PTY, Pipe) ──

  describe("handler routing", () => {
    it("routes pty-output to PTY handler", async () => {
      await mw.start();
      vi.advanceTimersByTime(0);
      const onOutput = vi.fn();
      mw.setPtyHandler({ onOutput, onExit: vi.fn() });

      getWs().simulateMessage("pty-output", { run_id: "run-1", data: "base64data" });

      expect(onOutput).toHaveBeenCalledWith({ run_id: "run-1", data: "base64data" });
    });

    it("routes chat-delta to pipe handler", async () => {
      await mw.start();
      vi.advanceTimersByTime(0);
      const onDelta = vi.fn();
      mw.setPipeHandler({ onDelta, onDone: vi.fn() });

      getWs().simulateMessage("chat-delta", { text: "hello" });

      expect(onDelta).toHaveBeenCalledWith({ text: "hello" });
    });

    it("no-op when handler is null", async () => {
      await mw.start();
      vi.advanceTimersByTime(0);
      // Don't set any handlers — should not throw
      expect(() =>
        getWs().simulateMessage("pty-output", { run_id: "run-1", data: "x" }),
      ).not.toThrow();
    });
  });
});
