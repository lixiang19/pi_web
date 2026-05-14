import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import WebSocket from "ws";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app, listenHttpServer, registerWebSocketUpgrades } from "../index.js";
import { getRidgeDb } from "../db/index.js";
import { createAuthenticatedAgent } from "../test/auth.js";

describe("Desktop Bundle Sync E2E", () => {
  let httpServer: ReturnType<typeof createServer>;
  let serverPort: number;
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    httpServer = createServer(app);
    registerWebSocketUpgrades(httpServer);
    await listenHttpServer(httpServer, 0);
    const address = httpServer.address();
    serverPort = typeof address === "object" && address ? address.port : 3000;
    agent = await createAuthenticatedAgent(app);
  });

  afterAll(async () => {
    const { _clearMockConnectionsForTesting } = await import("../desktop-bridge.js");
    _clearMockConnectionsForTesting();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    const db = await getRidgeDb();
    db.prepare("DELETE FROM devices WHERE device_id LIKE 'bundle-sync-%'").run();
    db.prepare("DELETE FROM projects WHERE project_id LIKE 'bundle-sync-%'").run();
    db.prepare("DELETE FROM device_bundle_acks WHERE device_id LIKE 'bundle-sync-%'").run();
  });

  it("syncDesktopBundle: GET bundle → materialize → hash → POST ack → server accepts", async () => {
    // 1. Register device
    const regRes = await agent.post("/api/devices/register").send({
      deviceId: "bundle-sync-device",
      name: "Bundle Sync Device",
      deviceType: "desktop",
    });
    expect(regRes.status).toBe(201);
    const token = regRes.body.token;

    // 2. Prepare workspace with a skill and agent for bundle
    const wsSkillsDir = path.join(os.homedir(), "ridge-workspace", ".pi", "skills");
    const wsAgentsDir = path.join(os.homedir(), "ridge-workspace", ".pi", "agents");
    await fs.mkdir(wsSkillsDir, { recursive: true });
    await fs.mkdir(wsAgentsDir, { recursive: true });
    const skillSubdir = path.join(wsSkillsDir, "desktop-skill");
    await fs.mkdir(skillSubdir, { recursive: true });
    await fs.writeFile(
      path.join(skillSubdir, "SKILL.md"),
      "---\nname: desktop-skill\ndescription: Desktop skill from bundle\n---\n# Desktop Skill\n",
      "utf-8",
    );
    await fs.writeFile(
      path.join(wsAgentsDir, "AGENTS.md"),
      "# Desktop Agent\n",
      "utf-8",
    );

    // 3. Real WebSocket connect (device must be online to generate bundle)
    const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/api/devices/bundle-sync-device/ws?token=${token}`);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("WebSocket timeout")), 5000);
      ws.on("open", () => { clearTimeout(timeout); resolve(); });
      ws.on("error", (err) => { clearTimeout(timeout); reject(err); });
    });

    // 4. Run syncDesktopBundle
    const { syncDesktopBundle } = await import("../desktop-bundle-sync.js");
    const baseUrl = `http://127.0.0.1:${serverPort}`;
    const result = await syncDesktopBundle(baseUrl, "bundle-sync-device", token, {
      headers: { "x-test-client-key": "bundle-sync-test" },
    });

    expect(result.bundleId).toBeTruthy();
    expect(result.bundleVersion).toBeGreaterThanOrEqual(1);
    expect(result.materializedDir).toBeTruthy();
    expect(result.materializedHash).toBeTruthy();
    expect(result.acked).toBe(true);

    // 5. Verify materialized directory contains the skill
    const materializedSkill = await fs.readFile(
      path.join(result.materializedDir, "skills", "desktop-skill", "SKILL.md"),
      "utf-8",
    );
    expect(materializedSkill).toContain("Desktop Skill");

    // 6. Verify server DB ack record (materialized_hash stored in device_bundle_served)
    const db = await getRidgeDb();
    const ackRow = db.prepare(
      `SELECT bundle_id FROM device_bundle_acks WHERE device_id = ?`
    ).get("bundle-sync-device") as { bundle_id: string } | undefined;
    expect(ackRow).toBeDefined();
    expect(ackRow!.bundle_id).toBe(result.bundleId);

    const servedRow = db.prepare(
      `SELECT materialized_hash FROM device_bundle_served WHERE device_id = ?`
    ).get("bundle-sync-device") as { materialized_hash: string } | undefined;
    expect(servedRow).toBeDefined();
    expect(servedRow!.materialized_hash).toBe(result.materializedHash);

    // 7. Verify Pi resourceLoader uses materialized dir (not real ~/.pi)
    const { createDesktopResourceLoader } = await import("../desktop-bundle-sync.js");
    const rl = createDesktopResourceLoader(result.materializedDir, os.homedir());
    await rl.reload();
    const skills = rl.getSkills().skills.map((s) => s.name);
    expect(skills).toContain("desktop-skill");
    expect(skills).not.toContain("real-skill");

    // Cleanup
    ws.close();
    await fs.rm(skillSubdir, { recursive: true, force: true });
    await fs.rm(path.join(wsAgentsDir, "AGENTS.md"), { force: true });
    await fs.rm(result.materializedDir, { recursive: true, force: true });
  }, 20000);
});
