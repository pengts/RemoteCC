/**
 * HTTP/WebSocket transport layer — replaces Tauri IPC (`invoke`) with standard Web APIs.
 */

export async function apiCall<T>(endpoint: string, params?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`/api/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params ?? {}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}
