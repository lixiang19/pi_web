import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import WebSocket from "ws";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app, listenHttpServer, registerWebSocketUpgrades } from "../index.js";
import { getRidgeDb } from "../db/index.js";
import { createAuthenticatedAgent } from "../test/auth.js";

describe("Task 31 - 真实 WebSocket E2E 链路", () => {
  let httpServer: ReturnType<typeof createServer>;
  let serverPort: number;
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    // 1. Create a real HTTP server from the app
    httpServer = createServer(app);
    // 2. Register WebSocket upgrade handler
    registerWebSocketUpgrades(httpServer);
    // 3. Listen on an ephemeral port
    await listenHttpServer(httpServer, 0);
    const address = httpServer.address();
    serverPort = typeof address === "object" && address ? address.port : 3000;

    // 4. Authenticate via HTTP
    agent = await createAuthenticatedAgent(app);
  });

  afterAll(async () => {
    // Force-close any lingering WebSocket connections to prevent process hang
    const { _clearMockConnectionsForTesting } = await import("../desktop-bridge.js");
    _clearMockConnectionsForTesting();

    // Close HTTP server
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    // Clean up test data
    const db = await getRidgeDb();
    db.prepare("DELETE FROM devices WHERE device_id LIKE 'ws-e2e-%'").run();
    db.prepare("DELETE FROM projects WHERE project_id LIKE 'ws-e2e-%'").run();
    db.prepare("DELETE FROM session_index WHERE session_id LIKE 'ws-e2e-%'").run();
  });

  it("真实 ws client 握手连接到 /api/devices/:id/ws?token=...", async () => {
    // 1. Register device via HTTP
    const regRes = await agent.post("/api/devices/register").send({
      deviceId: "ws-e2e-device",
      name: "WS E2E Device",
      deviceType: "desktop",
    });
    expect(regRes.status).toBe(201);
    const token = regRes.body.token;
    expect(token).toBeTruthy();

    // 2. Connect via real WebSocket client
    const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/api/devices/ws-e2e-device/ws?token=${token}`);

    // Wait for connection open
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("WebSocket connection timeout")), 5000);
      ws.on("open", () => {
        clearTimeout(timeout);
        resolve();
      });
      ws.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    expect(ws.readyState).toBe(WebSocket.OPEN);

    // 3. Send a ping and verify server responds (or at least doesn't close)
    const pongPromise = new Promise<boolean>((resolve) => {
      ws.on("pong", () => resolve(true));
      setTimeout(() => resolve(false), 2000);
    });
    ws.ping();
    const receivedPong = await pongPromise;
    expect(receivedPong).toBe(true);

    // 4. Send sse_event message and verify bridge accepts it
    const ssePayload = {
      type: "sse_event",
      event: { type: "test", data: "hello" },
    };
    ws.send(JSON.stringify(ssePayload));

    // Give it a moment
    await new Promise((r) => setTimeout(r, 100));

    // 5. Verify device is online in DB
    const db = await getRidgeDb();
    const deviceRow = db.prepare(
      "SELECT status FROM devices WHERE device_id = ?"
    ).get("ws-e2e-device") as { status: string } | undefined;
    expect(deviceRow).toBeDefined();
    expect(deviceRow!.status).toBe("online");

    // Cleanup
    ws.close();
    await new Promise((r) => setTimeout(r, 100));
  });

  it("ws 连接在 token 无效时被拒绝", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/api/devices/ws-e2e-bad/ws?token=invalid`);

    const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
      ws.on("close", (code, reason) => {
        resolve({ code, reason: reason.toString() });
      });
      ws.on("error", () => {
        // Expected error when connection is rejected
      });
    });

    const result = await closePromise;
    // Should be rejected (not authorized)
    expect(result.code).toBe(1006); // Abnormal closure
  });

  it("完整链路: HTTP register → ws 连接 → device online → 消息转发", async () => {
    // 1. Register
    const regRes = await agent.post("/api/devices/register").send({
      deviceId: "ws-e2e-full",
      name: "Full E2E",
      deviceType: "desktop",
    });
    expect(regRes.status).toBe(201);
    const token = regRes.body.token;

    // 2. WebSocket connect
    const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/api/devices/ws-e2e-full/ws?token=${token}`);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("WebSocket connection timeout")), 5000);
      ws.on("open", () => {
        clearTimeout(timeout);
        resolve();
      });
      ws.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // 3. Verify device is online in DB
    const db = await getRidgeDb();
    const deviceRow = db.prepare(
      "SELECT status FROM devices WHERE device_id = ?"
    ).get("ws-e2e-full") as { status: string } | undefined;
    expect(deviceRow!.status).toBe("online");

    // 4. Setup auto-responder for run_request messages
    const receivedMessages: string[] = [];
    ws.on("message", (data) => {
      const msgStr = data.toString();
      receivedMessages.push(msgStr);
      const msg = JSON.parse(msgStr);
      if (msg.type === "run_request") {
        // Auto-respond with run_result so forwardRunRequestToDesktop resolves
        ws.send(JSON.stringify({
          type: "run_result",
          requestId: msg.requestId,
          result: { ok: true },
        }));
      }
    });

    // 5. Register a project for this device
    const extDir = path.join(os.tmpdir(), `ridge-ws-e2e-${Date.now()}`);
    await import("node:fs/promises").then((fs) => fs.mkdir(extDir, { recursive: true }));

    // Set path validation override
    const { _setValidatePathViaDesktopForTesting, _resetValidatePathViaDesktopTesting } = await import("../project-service.js");
    _setValidatePathViaDesktopForTesting(async () => ({
      exists: true, isDirectory: true, isGit: false,
    }));

    await agent.post("/api/workspace/projects/external").send({
      path: extDir,
      deviceId: "ws-e2e-full",
    });

    // 6. Create session — server should forward to desktop via WebSocket
    const createRes = await agent.post("/api/sessions").send({
      cwd: extDir,
      title: "WS Forward Test",
    });
    expect(createRes.status).toBe(201);
    const sessionId = createRes.body.id;

    // 7. Wait for forwarded request to arrive at ws client
    await new Promise((r) => setTimeout(r, 500));

    expect(receivedMessages.length).toBeGreaterThan(0);
    const forwardedReq = JSON.parse(receivedMessages[0]);
    expect(forwardedReq.type).toBe("run_request");
    expect(forwardedReq.payload.type).toBe("create_session");
    expect(forwardedReq.payload.sessionId).toBe(sessionId);

    // 8. Simulate desktop response
    ws.send(JSON.stringify({
      type: "run_result",
      requestId: forwardedReq.requestId,
      result: { ok: true, desktopCreated: true },
    }));

    // Cleanup
    ws.close();
    _resetValidatePathViaDesktopTesting();
    await import("node:fs/promises").then((fs) => fs.rm(extDir, { recursive: true, force: true }));
  }, 15000);
});