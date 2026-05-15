import { WebSocket } from "ws";
import { heartbeatDevice } from "./devices.js";
export { validateDeviceToken } from "./devices.js";

// ===== Desktop Long-Connection Hub =====
// WebSocket-based persistent connection for desktop devices.
// Replaces REST heartbeat with WebSocket ping/pong + handles request forwarding
// and SSE relay from desktop Pi back to server.

export interface DesktopConnection {
  deviceId: string;
  ws: WebSocket;
  connectedAt: number;
  lastPingAt: number;
}

const connections = new Map<string, DesktopConnection>();
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 60_000;

/** Register a WebSocket connection for a desktop device */
export function registerDesktopConnection(
  deviceId: string,
  ws: WebSocket,
): DesktopConnection {
  // Close existing connection if any
  const existing = connections.get(deviceId);
  if (existing && existing.ws.readyState === WebSocket.OPEN) {
    existing.ws.close(1000, "Replaced by new connection");
  }

  const conn: DesktopConnection = {
    deviceId,
    ws,
    connectedAt: Date.now(),
    lastPingAt: Date.now(),
  };
  connections.set(deviceId, conn);

  // Setup heartbeat ping
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  ws.on("pong", () => {
    conn.lastPingAt = Date.now();
    // Also update DB status via heartbeat
    heartbeatDevice(deviceId).catch((err) => {
      console.error(`[desktop-bridge] heartbeatDevice failed for ${deviceId}:`, err);
    });
  });

  ws.on("close", () => {
    clearInterval(pingInterval);
    connections.delete(deviceId);
    // Mark device as offline in DB when WebSocket disconnects
    import("./devices.js").then(({ updateDeviceStatus }) => {
      updateDeviceStatus(deviceId, "offline").catch((err) => {
        console.error(`[desktop-bridge] Failed to mark ${deviceId} offline on close:`, err);
      });
    });
  });

  ws.on("error", (err) => {
    clearInterval(pingInterval);
    connections.delete(deviceId);
    // Mark device as offline in DB when WebSocket errors
    import("./devices.js").then(({ updateDeviceStatus }) => {
      updateDeviceStatus(deviceId, "offline").catch((updateErr) => {
        console.error(`[desktop-bridge] Failed to mark ${deviceId} offline on error:`, updateErr);
      });
    });
    console.error(`[desktop-bridge] WebSocket error for ${deviceId}:`, err);
  });

  return conn;
}

/** Get active desktop connection */
export function getDesktopConnection(deviceId: string): DesktopConnection | undefined {
  const conn = connections.get(deviceId);
  if (!conn) return undefined;
  if (conn.ws.readyState !== WebSocket.OPEN) {
    connections.delete(deviceId);
    return undefined;
  }
  // Check timeout
  if (Date.now() - conn.lastPingAt > HEARTBEAT_TIMEOUT_MS) {
    conn.ws.close(1001, "Heartbeat timeout");
    connections.delete(deviceId);
    return undefined;
  }
  return conn;
}

/** Check if desktop device is currently connected */
export function isDesktopOnline(deviceId: string): boolean {
  return getDesktopConnection(deviceId) !== undefined;
}

/** Send a run request to desktop via WebSocket */
export async function forwardRunRequestToDesktop(
  deviceId: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const conn = getDesktopConnection(deviceId);
  if (!conn) {
    throw Object.assign(new Error("Device offline"), { statusCode: 409 });
  }

  return new Promise((resolve, reject) => {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const messageHandler = (data: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(String(data));
        if (msg.requestId === requestId) {
          conn.ws.off("message", messageHandler);
          if (msg.error) {
            reject(Object.assign(new Error(msg.error), { statusCode: msg.statusCode || 500 }));
          } else {
            resolve(msg.result);
          }
        }
      } catch (parseErr) {
        // Non-JSON messages from desktop are ignored (may be binary pings)
        console.error(`[desktop-bridge] Non-JSON message from ${deviceId}:`, parseErr);
      }
    };

    conn.ws.on("message", messageHandler);

    // Timeout handler
    setTimeout(() => {
      conn.ws.off("message", messageHandler);
      reject(Object.assign(new Error("Desktop request timeout"), { statusCode: 504 }));
    }, 120_000);

    conn.ws.send(
      JSON.stringify({
        type: "run_request",
        requestId,
        payload,
      }),
    );
  });
}

/** Forward SSE event from desktop to a server response stream */
export function forwardDesktopSseEvent(
  deviceId: string,
  event: Record<string, unknown>,
): void {
  // Broadcast to any server-side SSE listeners for this device
  // This will be consumed by the Web SSE router
  const listeners = sseListeners.get(deviceId);
  if (!listeners) return;
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (err) {
      console.error(`[desktop-bridge] SSE listener error for ${deviceId}:`, err);
      // Remove broken listener to prevent repeated errors
      listeners.delete(listener);
      if (listeners.size === 0) {
        sseListeners.delete(deviceId);
      }
    }
  }
}

const sseListeners = new Map<string, Set<(event: Record<string, unknown>) => void>>();

export function addDesktopSseListener(
  deviceId: string,
  listener: (event: Record<string, unknown>) => void,
): () => void {
  let set = sseListeners.get(deviceId);
  if (!set) {
    set = new Set();
    sseListeners.set(deviceId, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
    if (set?.size === 0) {
      sseListeners.delete(deviceId);
    }
  };
}

/** Sweep stale WebSocket connections */
export function sweepStaleConnections(): string[] {
  const now = Date.now();
  const stale: string[] = [];
  for (const [deviceId, conn] of connections.entries()) {
    if (now - conn.lastPingAt > HEARTBEAT_TIMEOUT_MS) {
      conn.ws.close(1001, "Heartbeat timeout");
      connections.delete(deviceId);
      stale.push(deviceId);
    }
  }
  return stale;
}

/** Get all active connection device IDs */
export function getActiveConnectionIds(): string[] {
  sweepStaleConnections();
  return [...connections.keys()];
}

/**
 * Test-only: inject a mock WebSocket for a deviceId so tests can
 * exercise the real WebSocket forward pipeline without a real ws handshake.
 */
export function _injectMockWebSocketForTesting(
  deviceId: string,
  ws: WebSocket,
): DesktopConnection {
  if (!process.env.VITEST) {
    throw new Error("_injectMockWebSocketForTesting is test-only");
  }
  // Skip registerDesktopConnection heartbeat to avoid intervals in tests
  const conn: DesktopConnection = {
    deviceId,
    ws,
    connectedAt: Date.now(),
    lastPingAt: Date.now(),
  };
  connections.set(deviceId, conn);
  return conn;
}

/**
 * Test-only: clear all injected connections.
 */
export function _clearMockConnectionsForTesting(): void {
  if (!process.env.VITEST) {
    throw new Error("_clearMockConnectionsForTesting is test-only");
  }
  for (const [, conn] of connections.entries()) {
    if (conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.close(1000, "Test cleanup");
    }
  }
  connections.clear();
  sseListeners.clear();
}
