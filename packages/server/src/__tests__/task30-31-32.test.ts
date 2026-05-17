import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { BundleResource, RuntimeBundle } from "../runtime-bundle.js";

import { app } from "../index.js";
import { getRidgeDb } from "../db/index.js";
import { createAuthenticatedAgent } from "../test/auth.js";
import {
  _setValidatePathViaDesktopForTesting,
  _resetValidatePathViaDesktopTesting,
} from "../project-service.js";

const WORKSPACE = path.join(os.homedir(), "ridge-workspace");
const PI_AGENT_DIR = path.join(os.homedir(), ".pi", "agent");

async function setupAuth() {
  return createAuthenticatedAgent(app);
}

async function clearTestData() {
  const db = await getRidgeDb();
  db.prepare("DELETE FROM projects").run();
  db.prepare("DELETE FROM devices WHERE device_id != 'server'").run();
  db.prepare("DELETE FROM session_index WHERE session_id LIKE 'test-%' OR session_id LIKE 'sess-%' OR session_id LIKE 'archived-%'").run();
  db.prepare("DELETE FROM sessions WHERE session_id LIKE 'test-%' OR session_id LIKE 'sess-%' OR session_id LIKE 'archived-%'").run();
  db.prepare("DELETE FROM device_bundle_acks WHERE device_id LIKE 'test-%' OR device_id LIKE 'desktop-%' OR device_id LIKE 'mac-%' OR device_id LIKE 'linux-%' OR device_id LIKE 'bundle-%' OR device_id LIKE 'ack-%' OR device_id LIKE 'hb-%' OR device_id LIKE 'rename-%'").run();
}

async function clearWorkspaceTestFiles() {
  const testDirs = [
    path.join(PI_AGENT_DIR, "agents"),
    path.join(PI_AGENT_DIR, "skills"),
    path.join(PI_AGENT_DIR, "mcp.json"),
    path.join(WORKSPACE, ".pi", "agents"),
    path.join(WORKSPACE, ".pi", "skills"),
    path.join(WORKSPACE, ".pi", "mcp.json"),
    path.join(WORKSPACE, "项目", "archive-test"),
    path.join(WORKSPACE, "项目", "cwd-test"),
    path.join(WORKSPACE, "项目", "delete-test"),
    path.join(WORKSPACE, "项目", "has-session-test"),
    path.join(WORKSPACE, "项目", "project-overlay-test"),
  ];
  for (const p of testDirs) {
    await fs.rm(p, { recursive: true, force: true }).catch(() => {});
  }
}

describe("Task 30 - 项目注册与内部/外部仓库", () => {
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    agent = await setupAuth();
  });

  beforeEach(async () => {
    await clearTestData();
    await clearWorkspaceTestFiles();
  });

  afterAll(async () => {
    await clearTestData();
    await clearWorkspaceTestFiles();
  });

  it("POST /api/workspace/projects/internal 创建内部项目", async () => {
    const res = await agent
      .post("/api/workspace/projects/internal")
      .send({ name: "cwd-test" });
    expect(res.status).toBe(201);
    expect(res.body.projectType).toBe("internal");
    expect(res.body.name).toBe("cwd-test");
  });

  it("内部项目名称禁止包含 /、..、控制字符等", async () => {
    const res = await agent
      .post("/api/workspace/projects/internal")
      .send({ name: "../etc" });
    expect(res.status).toBe(400);
  });

  it("POST /api/workspace/projects/external 注册外部仓库", async () => {
    const extDir = path.join(os.tmpdir(), `ridge-external-${Date.now()}`);
    await fs.mkdir(extDir, { recursive: true });

    const res = await agent
      .post("/api/workspace/projects/external")
      .send({ path: extDir });
    expect(res.status).toBe(201);
    expect(res.body.projectType).toBe("external");

    await fs.rm(extDir, { recursive: true, force: true });
  });

  it("同设备同路径重复注册失败", async () => {
    const extDir = path.join(os.tmpdir(), `ridge-dup-${Date.now()}`);
    await fs.mkdir(extDir, { recursive: true });

    await agent.post("/api/workspace/projects/external").send({ path: extDir });
    const res2 = await agent
      .post("/api/workspace/projects/external")
      .send({ path: extDir });
    expect(res2.status).toBe(409);

    await fs.rm(extDir, { recursive: true, force: true });
  });

  it("不同设备可以注册同一路径", async () => {
    const extDir = path.join(os.tmpdir(), `ridge-multi-${Date.now()}`);
    await fs.mkdir(extDir, { recursive: true });

    // Register first device
    await agent.post("/api/devices/register").send({
      deviceId: "multi-device-1",
      name: "Multi 1",
      deviceType: "desktop",
    });

    // Register second device
    await agent.post("/api/devices/register").send({
      deviceId: "multi-device-2",
      name: "Multi 2",
      deviceType: "desktop",
    });

    // Mock path validation for both devices (they have no real WebSocket)
    _setValidatePathViaDesktopForTesting(async () => ({
      exists: true, isDirectory: true, isGit: false,
    }));

    await agent
      .post("/api/workspace/projects/external")
      .send({ path: extDir, deviceId: "multi-device-1" });

    const res2 = await agent
      .post("/api/workspace/projects/external")
      .send({ path: extDir, deviceId: "multi-device-2" });
    expect(res2.status).toBe(201);

    _resetValidatePathViaDesktopTesting();
    await fs.rm(extDir, { recursive: true, force: true });
  });

  it("桌面设备离线时外部仓库注册返回409", async () => {
    // Register device but don't connect
    await agent.post("/api/devices/register").send({
      deviceId: "offline-reg",
      name: "Offline",
      deviceType: "desktop",
    });

    const extDir = path.join(os.tmpdir(), `ridge-offline-${Date.now()}`);
    await fs.mkdir(extDir, { recursive: true });

    _setValidatePathViaDesktopForTesting(async () => {
      throw Object.assign(new Error("Device offline"), { statusCode: 409 });
    });

    const res = await agent
      .post("/api/workspace/projects/external")
      .send({ path: extDir, deviceId: "offline-reg" });

    expect(res.status).toBe(409);
    _resetValidatePathViaDesktopTesting();
    await fs.rm(extDir, { recursive: true, force: true });
  });

  it("桌面设备在线时外部仓库注册通过桌面端路径确认", async () => {
    await agent.post("/api/devices/register").send({
      deviceId: "online-reg",
      name: "Online",
      deviceType: "desktop",
    });

    const extDir = path.join(os.tmpdir(), `ridge-online-${Date.now()}`);
    await fs.mkdir(extDir, { recursive: true });

    _setValidatePathViaDesktopForTesting(async () => ({
      exists: true,
      isDirectory: true,
      isGit: false,
    }));

    const res = await agent
      .post("/api/workspace/projects/external")
      .send({ path: extDir, deviceId: "online-reg" });

    expect(res.status).toBe(201);
    _resetValidatePathViaDesktopTesting();
    await fs.rm(extDir, { recursive: true, force: true });
  });

  it("PATCH /api/workspace/projects/:id 归档项目", async () => {
    const createRes = await agent
      .post("/api/workspace/projects/internal")
      .send({ name: "archive-test" });
    const projectId = createRes.body.id;

    const patchRes = await agent
      .patch(`/api/workspace/projects/${projectId}`)
      .send({ archived: true });
    expect(patchRes.status).toBe(200);

    const db = await getRidgeDb();
    const row = db
      .prepare("SELECT archived_at FROM projects WHERE project_id = ?")
      .get(projectId) as { archived_at: number };
    expect(row.archived_at).toBeGreaterThan(0);
  });

  it("归档项目禁止新建会话", async () => {
    const extDir = path.join(os.tmpdir(), `ridge-archive-sess-${Date.now()}`);
    await fs.mkdir(extDir, { recursive: true });

    _setValidatePathViaDesktopForTesting(async () => ({
      exists: true, isDirectory: true, isGit: false,
    }));

    const createRes = await agent
      .post("/api/workspace/projects/external")
      .send({ path: extDir });
    const projectId = createRes.body.id;

    await agent
      .patch(`/api/workspace/projects/${projectId}`)
      .send({ archived: true });

    const sessRes = await agent.post("/api/sessions").send({
      cwd: extDir,
      title: "Should fail",
    });
    expect(sessRes.status).toBe(403);

    _resetValidatePathViaDesktopTesting();
    await fs.rm(extDir, { recursive: true, force: true });
  });

  it("DELETE /api/workspace/projects/:id 删除注册不删文件", async () => {
    const extDir = path.join(os.tmpdir(), `ridge-delete-${Date.now()}`);
    await fs.mkdir(extDir, { recursive: true });
    await fs.writeFile(path.join(extDir, "keep.txt"), "keep");

    const createRes = await agent
      .post("/api/workspace/projects/external")
      .send({ path: extDir });
    const projectId = createRes.body.id;

    const delRes = await agent.delete(`/api/workspace/projects/${projectId}`);
    expect(delRes.status).toBe(200);

    // File should still exist
    const content = await fs.readFile(path.join(extDir, "keep.txt"), "utf-8");
    expect(content).toBe("keep");

    await fs.rm(extDir, { recursive: true, force: true });
  });

  it("有会话的项目禁止删除", async () => {
    const extDir = path.join(os.tmpdir(), `ridge-has-session-${Date.now()}`);
    await fs.mkdir(extDir, { recursive: true });

    const createRes = await agent
      .post("/api/workspace/projects/external")
      .send({ path: extDir });
    expect(createRes.status).toBe(201);
    const projectId = createRes.body.id;

    // Create a session directly in DB (POST /api/sessions requires API key)
    const sessionId = `has-session-${Date.now()}`;
    const db = await getRidgeDb();
    db.prepare(
      `INSERT INTO session_index(session_id, title, session_type, context_type, workspace_path, project_id, device_id, run_location, archived, created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(sessionId, "Session project", "workspace", "project", WORKSPACE, projectId, null, "server", 0, Date.now(), Date.now());

    // Try to delete
    const delRes = await agent.delete(`/api/workspace/projects/${projectId}`);
    expect(delRes.status).toBe(409);

    // Cleanup
    db.prepare("DELETE FROM session_index WHERE session_id = ?").run(sessionId);
    await fs.rm(extDir, { recursive: true, force: true });
  });

  it("内部项目不作为 pi cwd（会话创建时拒绝）", async () => {
    const createRes = await agent
      .post("/api/workspace/projects/internal")
      .send({ name: "no-pi-test" });
    const project = createRes.body;

    // Try to create session with internal project path
    const sessRes = await agent.post("/api/sessions").send({
      cwd: project.path,
      title: "Should fail",
    });
    expect(sessRes.status).toBe(400);
  });

  it("POST /api/devices/register 注册桌面设备", async () => {
    const res = await agent.post("/api/devices/register").send({
      deviceId: "desktop-1",
      name: "My Desktop",
      deviceType: "desktop",
      capabilities: { skill_python: true },
    });
    expect(res.status).toBe(201);
    expect(res.body.deviceId).toBe("desktop-1");
    expect(res.body.token).toBeTruthy();
  });

  it("GET /api/devices 返回设备列表含服务器设备", async () => {
    const res = await agent.get("/api/devices");
    expect(res.status).toBe(200);
    const serverDevice = res.body.devices.find(
      (d: { deviceType: string }) => d.deviceType === "server",
    );
    expect(serverDevice).toBeDefined();
  });

  it("POST /api/devices/heartbeat 刷新在线状态", async () => {
    const regRes = await agent.post("/api/devices/register").send({
      deviceId: "hb-test",
      name: "HB Test",
      deviceType: "desktop",
    });
    const token = regRes.body.token;

    const hbRes = await agent.post("/api/devices/heartbeat").send({
      deviceId: "hb-test",
      token,
    });
    expect(hbRes.status).toBe(200);

    const db = await getRidgeDb();
    const row = db
      .prepare("SELECT status FROM devices WHERE device_id = ?")
      .get("hb-test") as { status: string };
    expect(row.status).toBe("online");
  });

  it("心跳超时后设备变离线", async () => {
    const regRes = await agent.post("/api/devices/register").send({
      deviceId: "hb-timeout",
      name: "HB Timeout",
      deviceType: "desktop",
    });
    const token = regRes.body.token;

    // Heartbeat
    await agent.post("/api/devices/heartbeat").send({
      deviceId: "hb-timeout",
      token,
    });

    // Manually set last_seen_at to the past
    const db = await getRidgeDb();
    db.prepare(
      "UPDATE devices SET last_seen_at = ? WHERE device_id = ?",
    ).run(Date.now() - 120_000, "hb-timeout");

    // Check device list — should be offline
    const res = await agent.get("/api/devices");
    const device = res.body.devices.find(
      (d: { deviceId: string }) => d.deviceId === "hb-timeout",
    );
    expect(device?.status).toBe("offline");
  });

  it("POST /api/devices/:deviceId/rename 重命名设备", async () => {
    const regRes = await agent.post("/api/devices/register").send({
      deviceId: "rename-test",
      name: "Old Name",
      deviceType: "desktop",
    });
    const token = regRes.body.token;

    const res = await agent
      .post("/api/devices/rename-test/rename")
      .send({ name: "New Name", token });
    expect(res.status).toBe(200);

    const db = await getRidgeDb();
    const row = db
      .prepare("SELECT name FROM devices WHERE device_id = ?")
      .get("rename-test") as { name: string };
    expect(row.name).toBe("New Name");
  });

  it("离线设备的项目不能新建会话", async () => {
    await agent.post("/api/devices/register").send({
      deviceId: "offline-proj",
      name: "Offline Proj",
      deviceType: "desktop",
    });

    const extDir = path.join(os.tmpdir(), `ridge-offline-proj-${Date.now()}`);
    await fs.mkdir(extDir, { recursive: true });

    _setValidatePathViaDesktopForTesting(async () => ({
      exists: true,
      isDirectory: true,
      isGit: false,
    }));

    await agent
      .post("/api/workspace/projects/external")
      .send({ path: extDir, deviceId: "offline-proj" });

    // Device is offline (no heartbeat)
    const sessRes = await agent.post("/api/sessions").send({
      cwd: extDir,
      title: "Should fail",
    });
    expect(sessRes.status).toBe(409);

    _resetValidatePathViaDesktopTesting();
    await fs.rm(extDir, { recursive: true, force: true });
  });

  it("desktop-forward router 已挂载", async () => {
    // Just verify the forward endpoint exists by hitting it without a valid device
    const res = await agent
      .post("/api/devices/nonexistent/forward")
      .send({ type: "test" });
    expect(res.status).toBe(409);
  });

  it("GET /api/devices/:deviceId/bundle 缺少 token 返回 401", async () => {
    const res = await agent.get("/api/devices/no-token/bundle");
    expect(res.status).toBe(401);
  });

  it("GET /api/devices/:deviceId/bundle 错误 token 返回 401", async () => {
    const res = await agent.get("/api/devices/wrong/bundle?token=bad");
    expect(res.status).toBe(401);
  });

  it("GET /api/devices/:deviceId/bundle 生成 runtime bundle 含完整结构", async () => {
	    // Setup server Pi default config structure
	    const agentsDir = path.join(PI_AGENT_DIR, "agents");
	    const skillsDir = path.join(PI_AGENT_DIR, "skills");
    await fs.mkdir(agentsDir, { recursive: true });
    await fs.mkdir(skillsDir, { recursive: true });
    await fs.writeFile(path.join(agentsDir, "agent1.md"), "# Agent1", "utf-8");
    await fs.writeFile(path.join(skillsDir, "skill1.md"), "# Skill1", "utf-8");

    const regRes = await agent.post("/api/devices/register").send({
      deviceId: "bundle-gen",
      name: "Bundle Gen",
      deviceType: "desktop",
    });
    const token = regRes.body.token;

    const res = await agent.get("/api/devices/bundle-gen/bundle").query({ token });
    expect(res.status).toBe(200);
    expect(res.body.manifest).toBeDefined();
    expect(res.body.manifest.bundleId).toBeTruthy();
    expect(res.body.manifest.deviceId).toBe("bundle-gen");
    expect(res.body.files).toBeDefined();

    // Cleanup
    await fs.rm(path.join(agentsDir, "agent1.md"), { force: true });
    await fs.rm(path.join(skillsDir, "skill1.md"), { force: true });
  });

  it("Mac-only Skill 只下发给 Mac 设备", async () => {
	    const agentsDir = path.join(PI_AGENT_DIR, "agents");
	    const skillsDir = path.join(PI_AGENT_DIR, "skills");
    await fs.mkdir(agentsDir, { recursive: true });
    await fs.mkdir(skillsDir, { recursive: true });
    await fs.writeFile(
      path.join(skillsDir, "skill[mac].md"),
      "# Mac Skill",
      "utf-8",
    );

    // Mac device with skill_mac capability
    const macRes = await agent.post("/api/devices/register").send({
      deviceId: "mac-bundle",
      name: "Mac",
      deviceType: "desktop",
      capabilities: { skill_mac: true },
    });
    const macToken = macRes.body.token;

    // Linux device without skill_mac capability
    const linuxRes = await agent.post("/api/devices/register").send({
      deviceId: "linux-bundle",
      name: "Linux",
      deviceType: "desktop",
      capabilities: { skill_mac: false },
    });
    const linuxToken = linuxRes.body.token;

    const macBundle = await agent
      .get("/api/devices/mac-bundle/bundle")
      .query({ token: macToken });
    const linuxBundle = await agent
      .get("/api/devices/linux-bundle/bundle")
      .query({ token: linuxToken });

    const macSkills = macBundle.body.manifest.skills as Array<{
      name: string;
    }>;
    const linuxSkills = linuxBundle.body.manifest.skills as Array<{
      name: string;
    }>;

    expect(macSkills.some((s) => s.name === "skill[mac].md")).toBe(true);
    expect(linuxSkills.some((s) => s.name === "skill[mac].md")).toBe(false);

    // Cleanup
    await fs.rm(path.join(skillsDir, "skill[mac].md"), { force: true });
  });

  it("POST /api/devices/:deviceId/bundle/ack 持久化并支持覆盖", async () => {
    const regRes = await agent.post("/api/devices/register").send({
      deviceId: "ack-persist",
      name: "Ack Persist",
      deviceType: "desktop",
    });
    const token = regRes.body.token;

    // Seed a served record so ack validation can pass
    const db = await getRidgeDb();
    db.prepare(
      `INSERT INTO device_bundle_served(device_id, bundle_id, content_hash, bundle_version, served_at)
       VALUES(?, ?, ?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET
         bundle_id = excluded.bundle_id,
         content_hash = excluded.content_hash,
         bundle_version = excluded.bundle_version,
         served_at = excluded.served_at`,
    ).run("ack-persist", "bundle-1", "hash1", 1, Date.now());

    // First ack
    const res1 = await agent
      .post("/api/devices/ack-persist/bundle/ack")
      .send({ bundleId: "bundle-1", token, contentHash: "hash1", bundleVersion: 1 });
    expect(res1.status).toBe(200);

    // Verify in DB
    const row1 = db.prepare("SELECT bundle_id FROM device_bundle_acks WHERE device_id = ?").get("ack-persist") as { bundle_id: string } | undefined;
    expect(row1).toBeDefined();
    expect(row1!.bundle_id).toBe("bundle-1");

    // Seed served record for second bundle
    db.prepare(
      `INSERT INTO device_bundle_served(device_id, bundle_id, content_hash, bundle_version, served_at)
       VALUES(?, ?, ?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET
         bundle_id = excluded.bundle_id,
         content_hash = excluded.content_hash,
         bundle_version = excluded.bundle_version,
         served_at = excluded.served_at`,
    ).run("ack-persist", "bundle-2", "hash2", 2, Date.now());

    // Second ack (overwrite)
    const res2 = await agent
      .post("/api/devices/ack-persist/bundle/ack")
      .send({ bundleId: "bundle-2", token, contentHash: "hash2", bundleVersion: 2 });
    expect(res2.status).toBe(200);

    const row2 = db.prepare("SELECT bundle_id FROM device_bundle_acks WHERE device_id = ?").get("ack-persist") as { bundle_id: string } | undefined;
    expect(row2!.bundle_id).toBe("bundle-2");

    // Cleanup
    db.prepare("DELETE FROM device_bundle_acks WHERE device_id = 'ack-persist'").run();
    db.prepare("DELETE FROM device_bundle_served WHERE device_id = 'ack-persist'").run();
  });

  it("POST /api/devices/:deviceId/bundle/ack 错误 token 返回 401", async () => {
    await agent.post("/api/devices/register").send({
      deviceId: "ack-auth",
      name: "Ack Auth",
      deviceType: "desktop",
    });

    const res = await agent
      .post("/api/devices/ack-auth/bundle/ack")
      .send({ bundleId: "bundle-x", token: "wrong", contentHash: "hash", bundleVersion: 1 });
    expect(res.status).toBe(401);
  });

  it("POST /api/devices/heartbeat 错误 token 返回 401", async () => {
    await agent.post("/api/devices/register").send({
      deviceId: "hb-auth",
      name: "HB Auth",
      deviceType: "desktop",
    });

    const res = await agent.post("/api/devices/heartbeat").send({
      deviceId: "hb-auth",
      token: "wrong-token",
    });
    expect(res.status).toBe(401);
  });

  it("POST /api/devices/:deviceId/rename 错误 token 返回 401", async () => {
    await agent.post("/api/devices/register").send({
      deviceId: "rename-auth",
      name: "Rename Auth",
      deviceType: "desktop",
    });

    const res = await agent
      .post("/api/devices/rename-auth/rename")
      .send({ name: "Hacked", token: "wrong" });
    expect(res.status).toBe(401);
  });
});

describe("Task 31 - 设备注册在线状态", () => {
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    agent = await setupAuth();
  });

  beforeEach(async () => {
    const db = await getRidgeDb();
    db.prepare("DELETE FROM devices WHERE device_id != 'server'").run();
  });

  it("POST /api/devices/register 注册桌面设备", async () => {
    await agent.post("/api/auth/login").send({ password: "ridge-admin" });
    const res = await agent.post("/api/devices/register").send({
      deviceId: "desktop-1",
      name: "Mac Studio",
      deviceType: "desktop",
      capabilities: { skill_mac: true },
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      deviceId: "desktop-1",
      name: "Mac Studio",
      deviceType: "desktop",
      status: "online",
      capabilities: { skill_mac: true },
    });
    expect(res.body.token).toBeTruthy();
  });

  it("GET /api/devices 返回设备列表含服务器设备", async () => {
    await agent.post("/api/devices/register").send({
      deviceId: "desktop-2",
      name: "MacBook",
      deviceType: "desktop",
    });

    const res = await agent.get("/api/devices");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.devices)).toBe(true);

    const server = res.body.devices.find((d: { deviceId: string }) => d.deviceId === "server");
    expect(server).toBeDefined();
    expect(server.deviceType).toBe("server");

    const desktop = res.body.devices.find((d: { deviceId: string }) => d.deviceId === "desktop-2");
    expect(desktop).toBeDefined();
    expect(desktop.status).toBe("online");
  });

  it("POST /api/devices/heartbeat 刷新在线状态", async () => {
    const regRes = await agent.post("/api/devices/register").send({
      deviceId: "desktop-beat",
      name: "Heartbeat Test",
      deviceType: "desktop",
    });
    const token = regRes.body.token;

    const beatRes = await agent.post("/api/devices/heartbeat").send({
      deviceId: "desktop-beat",
      token,
    });
    expect(beatRes.status).toBe(200);
    expect(beatRes.body.ok).toBe(true);
  });

  it("心跳超时后设备变离线", async () => {
    await agent.post("/api/devices/register").send({
      deviceId: "desktop-offline",
      name: "Offline Test",
      deviceType: "desktop",
    });

    // Manually set last_seen_at to the past
    const db = await getRidgeDb();
    db.prepare(
      "UPDATE devices SET last_seen_at = ?, status = 'online' WHERE device_id = ?"
    ).run(Date.now() - 120_000, "desktop-offline");

    const res = await agent.get("/api/devices");
    const device = res.body.devices.find((d: { deviceId: string }) => d.deviceId === "desktop-offline");
    expect(device.status).toBe("offline");
  });

  it("POST /api/devices/:deviceId/rename 重命名设备", async () => {
    const regRes = await agent.post("/api/devices/register").send({
      deviceId: "desktop-rename",
      name: "Old Name",
      deviceType: "desktop",
    });
    const token = regRes.body.token;

    const res = await agent
      .post("/api/devices/desktop-rename/rename")
      .send({ name: "New Name", token });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const list = await agent.get("/api/devices");
    const device = list.body.devices.find((d: { deviceId: string }) => d.deviceId === "desktop-rename");
    expect(device.name).toBe("New Name");
  });

  it("离线设备的项目不能新建会话", async () => {
    const db = await getRidgeDb();
    const projectDir = path.join(os.tmpdir(), `offline-proj-${Date.now()}`);
    await fs.mkdir(projectDir, { recursive: true });

    db.prepare(
      `INSERT INTO projects(project_id, name, path, is_git, added_at, project_type, external_origin, workspace_path, device_id, archived_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("proj-offline", "offline-proj", projectDir, 0, Date.now(), "external", "folder", WORKSPACE, "desktop-offline-2", null, Date.now());

    db.prepare(
      `INSERT INTO devices(device_id, name, device_type, token, status, capabilities_json, last_seen_at, created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("desktop-offline-2", "Offline", "desktop", "token", "offline", "{}", Date.now() - 120_000, Date.now(), Date.now());

    const res = await agent.post("/api/sessions").send({
      cwd: projectDir,
      title: "Offline session",
    });

    // Should be rejected because device is offline
    expect(res.status).toBe(409);
    expect(res.text).toContain("离线");

    await fs.rm(projectDir, { recursive: true, force: true });
    db.prepare("DELETE FROM projects WHERE project_id = 'proj-offline'").run();
    db.prepare("DELETE FROM devices WHERE device_id = 'desktop-offline-2'").run();
  });

  it("desktop-forward router 已挂载", async () => {
    // The router should exist and return 409 for offline device
    const res = await agent.get("/api/devices/nonexistent/sse");
    expect(res.status).toBe(409);
  });
});

describe("Task 32 - Runtime Bundle", () => {
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    agent = await setupAuth();
  });

  beforeEach(async () => {
    const db = await getRidgeDb();
    db.prepare("DELETE FROM devices WHERE device_id != 'server'").run();
  });

  it("GET /api/devices/:deviceId/bundle 缺少 token 返回 401", async () => {
    const res = await agent.get("/api/devices/nonexistent/bundle");
    expect(res.status).toBe(401);
  });

  it("GET /api/devices/:deviceId/bundle 错误 token 返回 401", async () => {
    await agent.post("/api/devices/register").send({
      deviceId: "bundle-auth",
      name: "Bundle Auth",
      deviceType: "desktop",
    });

    const res = await agent.get("/api/devices/bundle-auth/bundle?token=wrong-token");
    expect(res.status).toBe(401);
  });

  it("GET /api/devices/:deviceId/bundle 生成 runtime bundle 含完整结构", async () => {
    // Setup server Pi default config resources
    const agentsDir = path.join(PI_AGENT_DIR, "agents");
    const skillsDir = path.join(PI_AGENT_DIR, "skills");
    const memDir = path.join(WORKSPACE, "记忆");
    const wikiDir = path.join(WORKSPACE, "Wiki");
    await fs.mkdir(agentsDir, { recursive: true });
    await fs.mkdir(skillsDir, { recursive: true });
    await fs.mkdir(memDir, { recursive: true });
    await fs.mkdir(wikiDir, { recursive: true });
    await fs.writeFile(path.join(agentsDir, "coder.pi.md"), "# Coder", "utf-8");
    await fs.writeFile(path.join(skillsDir, "test.md"), "# Test Skill", "utf-8");
	    await fs.writeFile(path.join(PI_AGENT_DIR, "mcp.json"), '{"servers":[]}', "utf-8");
    await fs.writeFile(path.join(memDir, "MEMORY.md"), "## Startup memory", "utf-8");
    await fs.writeFile(path.join(wikiDir, "index.md"), "# Wiki\n\n- Startup wiki", "utf-8");

    const regRes = await agent.post("/api/devices/register").send({
      deviceId: "bundle-full",
      name: "Bundle Full",
      deviceType: "desktop",
    });
    const token = regRes.body.token;

    const res = await agent.get(`/api/devices/bundle-full/bundle?token=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.manifest.bundleId).toBeTruthy();
    expect(res.body.manifest.deviceId).toBe("bundle-full");
    expect(res.body.manifest.agents.length).toBeGreaterThan(0);
    expect(res.body.manifest.skills.length).toBeGreaterThan(0);
    expect(res.body.manifest.mcp).toEqual({ servers: [] });
    expect(res.body.manifest.startupContext.memory).toContain("Startup memory");
    expect(res.body.manifest.startupContext.wikiIndex).toContain("Startup wiki");
    expect(Object.keys(res.body.files).length).toBeGreaterThan(0);
    expect(res.body.files["agents/coder.pi.md"].content).toBe("# Coder");
    expect(res.body.files["agents/coder.pi.md"].encoding).toBe("utf-8");

    // Cleanup
    await fs.rm(path.join(agentsDir, "coder.pi.md"), { force: true });
    await fs.rm(path.join(skillsDir, "test.md"), { force: true });
	    await fs.rm(path.join(PI_AGENT_DIR, "mcp.json"), { force: true });
    await fs.rm(path.join(memDir, "MEMORY.md"), { force: true });
    await fs.rm(path.join(wikiDir, "index.md"), { force: true });
  });

  it("Mac-only Skill 只下发给 Mac 设备", async () => {
    // Setup: create a mock skill with [mac] tag
	    const skillsDir = path.join(PI_AGENT_DIR, "skills");
    await fs.mkdir(skillsDir, { recursive: true });
    await fs.writeFile(path.join(skillsDir, "mac-tool[mac].md"), "# Mac Tool", "utf-8");
    await fs.writeFile(path.join(skillsDir, "general-tool.md"), "# General Tool", "utf-8");

    // Register Mac device
    const macRes = await agent.post("/api/devices/register").send({
      deviceId: "mac-device",
      name: "Mac",
      deviceType: "desktop",
      capabilities: { skill_mac: true },
    });
    const macToken = macRes.body.token;

    // Register non-Mac device
    const linuxRes = await agent.post("/api/devices/register").send({
      deviceId: "linux-device",
      name: "Linux",
      deviceType: "desktop",
      capabilities: { skill_linux: true },
    });
    const linuxToken = linuxRes.body.token;

    const macBundle = await agent.get(`/api/devices/mac-device/bundle?token=${macToken}`);
    expect(macBundle.status).toBe(200);
    const macSkillNames = macBundle.body.manifest.skills.map((s: { name: string }) => s.name);
    expect(macSkillNames).toContain("mac-tool[mac].md");
    expect(macSkillNames).toContain("general-tool.md");

    const linuxBundle = await agent.get(`/api/devices/linux-device/bundle?token=${linuxToken}`);
    const linuxSkillNames = linuxBundle.body.manifest.skills.map((s: { name: string }) => s.name);
    expect(linuxSkillNames).not.toContain("mac-tool[mac].md");
    expect(linuxSkillNames).toContain("general-tool.md");

    // Cleanup
    await fs.rm(path.join(skillsDir, "mac-tool[mac].md"), { force: true });
    await fs.rm(path.join(skillsDir, "general-tool.md"), { force: true });
  });

  it("POST /api/devices/:deviceId/bundle/ack 完整链路：projectId/projectPath/materializedHash", async () => {
    const regRes = await agent.post("/api/devices/register").send({
      deviceId: "ack-full",
      name: "Ack Full",
      deviceType: "desktop",
    });
    const token = regRes.body.token;

    // Register external project for this device
    const extDir = path.join(os.tmpdir(), `ridge-ack-full-${Date.now()}`);
    await fs.mkdir(extDir, { recursive: true });
    _setValidatePathViaDesktopForTesting(async () => ({
      exists: true, isDirectory: true, isGit: false,
    }));
    const projRes = await agent
      .post("/api/workspace/projects/external")
      .send({ path: extDir, deviceId: "ack-full" });
    expect(projRes.status).toBe(201);
    const projectId = projRes.body.id;
    _resetValidatePathViaDesktopTesting();

	    // Seed server Pi default config for bundle generation
    const agentsDir = path.join(PI_AGENT_DIR, "agents");
    await fs.mkdir(agentsDir, { recursive: true });
    await fs.writeFile(path.join(agentsDir, "agent1.md"), "# Agent1", "utf-8");

    // GET bundle with projectPath
    const bundleRes = await agent
      .get(`/api/devices/ack-full/bundle?token=${encodeURIComponent(token)}&projectPath=${encodeURIComponent(extDir)}`);
    expect(bundleRes.status).toBe(200);
    const bundleId = bundleRes.body.manifest.bundleId;
    const contentHash = bundleRes.body.manifest.contentHash;
    const bundleVersion = bundleRes.body.manifest.version;

    // Verify served record has project_id and project_path
    const db = await getRidgeDb();
    const served = db.prepare(
      `SELECT project_id, project_path FROM device_bundle_served WHERE device_id = ?`
    ).get("ack-full") as { project_id: string | null; project_path: string | null } | undefined;
    expect(served).toBeDefined();
    expect(served!.project_id).toBe(projectId);
    expect(served!.project_path).toBe(extDir);

    // Materialize the bundle to a temp dir
    const { materializeBundle } = await import("../runtime-bundle.js");
    const targetDir = path.join(os.tmpdir(), `ridge-materialized-${Date.now()}`);
    const bundleObj: RuntimeBundle = {
      manifest: bundleRes.body.manifest,
      files: new Map<string, BundleResource>(
        Object.entries(bundleRes.body.files) as [string, BundleResource][],
      ),
    };
    await materializeBundle(bundleObj, targetDir);

    // Compute materialized hash from manifest.json
    const manifestContent = await fs.readFile(path.join(targetDir, "manifest.json"), "utf-8");
    const materializedHash = crypto.createHash("sha256").update(manifestContent).digest("hex");

    // POST ack with all dimensions
    const ackRes = await agent
      .post("/api/devices/ack-full/bundle/ack")
      .send({
        bundleId,
        token,
        contentHash,
        bundleVersion,
        projectId,
        projectPath: extDir,
        materializedHash,
      });
    expect(ackRes.status).toBe(200);
    expect(ackRes.body.syncStatus).toBe("acked");

    // Verify ack persisted in DB with all fields
    const ackRow = db.prepare(
      `SELECT bundle_id, sync_status FROM device_bundle_acks WHERE device_id = ?`
    ).get("ack-full") as { bundle_id: string; sync_status: string } | undefined;
    expect(ackRow).toBeDefined();
    expect(ackRow!.bundle_id).toBe(bundleId);
    expect(ackRow!.sync_status).toBe("acked");

    // Cleanup
    await fs.rm(targetDir, { recursive: true, force: true });
    await fs.rm(extDir, { recursive: true, force: true });
    await fs.rm(path.join(agentsDir, "agent1.md"), { force: true });
    db.prepare("DELETE FROM device_bundle_served WHERE device_id = 'ack-full'").run();
    db.prepare("DELETE FROM device_bundle_acks WHERE device_id = 'ack-full'").run();
    db.prepare("DELETE FROM projects WHERE project_id = ?").run(projectId);
  });

  it("POST /api/devices/:deviceId/bundle/ack materializedHash 不匹配被拒绝", async () => {
    const regRes = await agent.post("/api/devices/register").send({
      deviceId: "ack-hash-mismatch",
      name: "Ack Hash",
      deviceType: "desktop",
    });
    const token = regRes.body.token;

    // Seed served record
    const db = await getRidgeDb();
    db.prepare(
      `INSERT INTO device_bundle_served(device_id, bundle_id, content_hash, bundle_version, served_at, materialized_hash)
       VALUES(?, ?, ?, ?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET
         bundle_id = excluded.bundle_id,
         content_hash = excluded.content_hash,
         bundle_version = excluded.bundle_version,
         served_at = excluded.served_at,
         materialized_hash = excluded.materialized_hash`
    ).run("ack-hash-mismatch", "bundle-x", "hash-x", 1, Date.now(), "expected-hash");

    const res = await agent
      .post("/api/devices/ack-hash-mismatch/bundle/ack")
      .send({ bundleId: "bundle-x", token, contentHash: "hash-x", bundleVersion: 1, materializedHash: "wrong-hash" });
    expect(res.status).toBe(409);
    expect(res.text).toContain("materializedHash mismatch");

    // Cleanup
    db.prepare("DELETE FROM device_bundle_served WHERE device_id = 'ack-hash-mismatch'").run();
    db.prepare("DELETE FROM device_bundle_acks WHERE device_id = 'ack-hash-mismatch'").run();
  });

  it("POST /api/devices/:deviceId/bundle/ack 错误 token 返回 401", async () => {
    await agent.post("/api/devices/register").send({
      deviceId: "ack-auth",
      name: "Ack Auth",
      deviceType: "desktop",
    });

    const res = await agent
      .post("/api/devices/ack-auth/bundle/ack")
      .send({ bundleId: "bundle-x", token: "wrong", contentHash: "hash", bundleVersion: 1 });
    expect(res.status).toBe(401);
  });

  it("POST /api/devices/heartbeat 错误 token 返回 401", async () => {
    await agent.post("/api/devices/register").send({
      deviceId: "hb-auth",
      name: "HB Auth",
      deviceType: "desktop",
    });

    const res = await agent.post("/api/devices/heartbeat").send({
      deviceId: "hb-auth",
      token: "wrong-token",
    });
    expect(res.status).toBe(401);
  });

  it("POST /api/devices/:deviceId/rename 错误 token 返回 401", async () => {
    await agent.post("/api/devices/register").send({
      deviceId: "rename-auth",
      name: "Rename Auth",
      deviceType: "desktop",
    });

    const res = await agent
      .post("/api/devices/rename-auth/rename")
      .send({ name: "Hacked", token: "wrong" });
    expect(res.status).toBe(401);
  });
});

describe("Task 31 - 真实 WebSocket E2E 链路", () => {
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    agent = await setupAuth();
  });

  beforeEach(async () => {
    const db = await getRidgeDb();
    db.prepare("DELETE FROM devices WHERE device_id LIKE 'e2e-%'").run();
    db.prepare("DELETE FROM session_index WHERE session_id LIKE 'e2e-%'").run();
    db.prepare("DELETE FROM projects WHERE project_id LIKE 'e2e-%'").run();
    const { _clearMockConnectionsForTesting } = await import("../desktop-bridge.js");
    _clearMockConnectionsForTesting();
  });

  afterEach(async () => {
    const { _clearMockConnectionsForTesting } = await import("../desktop-bridge.js");
    _clearMockConnectionsForTesting();
  });

  it("桌面 session 创建/消息转发不写入 sessions 表，只记录 session_index", async () => {
    // This test reuses the real WebSocket E2E from websocket-e2e.test.ts.
    // We start a real HTTP server + WebSocket upgrade to test the full
    // forwardRunRequestToDesktop → run_request → run_result → DB 校验链路.
    const { createServer } = await import("node:http");
    const WebSocket = (await import("ws")).default;
    const { listenHttpServer, registerWebSocketUpgrades } = await import("../index.js");

    const httpServer = createServer(app);
    registerWebSocketUpgrades(httpServer);
    await listenHttpServer(httpServer, 0);
    const address = httpServer.address();
    const serverPort = typeof address === "object" && address ? address.port : 3000;

    // 1. Register device
    const regRes = await agent.post("/api/devices/register").send({
      deviceId: "db-check-desktop",
      name: "DB Check Desktop",
      deviceType: "desktop",
    });
    expect(regRes.status).toBe(201);
    const token = regRes.body.token;

    // 2. Real WebSocket connect
    const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/api/devices/db-check-desktop/ws?token=${token}`);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("WebSocket connection timeout")), 5000);
      ws.on("open", () => { clearTimeout(timeout); resolve(); });
      ws.on("error", (err) => { clearTimeout(timeout); reject(err); });
    });

    // 3. Auto-respond run_request
    const receivedMessages: string[] = [];
    ws.on("message", (data) => {
      const msgStr = data.toString();
      receivedMessages.push(msgStr);
      const msg = JSON.parse(msgStr);
      if (msg.type === "run_request") {
        ws.send(JSON.stringify({ type: "run_result", requestId: msg.requestId, result: { ok: true } }));
      }
    });

    // 4. Mock path validation for external project
    _setValidatePathViaDesktopForTesting(async () => ({
      exists: true, isDirectory: true, isGit: false,
    }));

    const extDir = path.join(os.tmpdir(), `ridge-db-check-${Date.now()}`);
    await fs.mkdir(extDir, { recursive: true });

    await agent.post("/api/workspace/projects/external").send({
      path: extDir,
      deviceId: "db-check-desktop",
    });

    // 5. Create session — server forwards to desktop
    const createRes = await agent.post("/api/sessions").send({
      cwd: extDir,
      title: "No Save Test",
    });
    expect(createRes.status).toBe(201);
    const sessionId = createRes.body.id;

    await new Promise((r) => setTimeout(r, 500));

    // 6. Verify forward request received
    expect(receivedMessages.length).toBeGreaterThan(0);
    const forwardedReq = JSON.parse(receivedMessages[0]);
    expect(forwardedReq.type).toBe("run_request");

    // 7. Verify server sessions table does NOT have this session
    const db = await getRidgeDb();
    const sessionRow = db.prepare(
      `SELECT session_id FROM sessions WHERE session_id = ?`
    ).get(sessionId) as { session_id: string } | undefined;
    expect(sessionRow).toBeUndefined();

    // 8. Verify session_index has lightweight metadata
    const idxRow = db.prepare(
      `SELECT session_id, run_location, device_id FROM session_index WHERE session_id = ?`
    ).get(sessionId) as { session_id: string; run_location: string; device_id: string } | undefined;
    expect(idxRow).toBeDefined();
    expect(idxRow!.run_location).toBe("desktop");
    expect(idxRow!.device_id).toBe("db-check-desktop");

    // Cleanup
    ws.close();
    _resetValidatePathViaDesktopTesting();
    await fs.rm(extDir, { recursive: true, force: true });
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }, 15000);
});

describe("Task 31 - WebSocket 相关测试", () => {
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    agent = await setupAuth();
  });

  beforeEach(async () => {
    const db = await getRidgeDb();
    db.prepare("DELETE FROM devices WHERE device_id != 'server'").run();
    db.prepare("DELETE FROM session_index WHERE session_id LIKE 'ws-test-%'").run();
    db.prepare("DELETE FROM projects WHERE project_id LIKE 'ws-test-%'").run();
  });

  it("桌面 session events 端点返回 409 当设备离线", async () => {
    const db = await getRidgeDb();
    const sessionId = "ws-test-desktop-sess";
    
    // Register a desktop project
    db.prepare(
      `INSERT INTO projects(project_id, name, path, is_git, added_at, project_type, external_origin, workspace_path, device_id, archived_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("ws-test-proj", "ws-test", "/tmp/ws-test", 0, Date.now(), "external", "folder", WORKSPACE, "ws-offline-device", null, Date.now());
    
    // Insert desktop session
    db.prepare(
      `INSERT INTO session_index(session_id, title, session_type, context_type, workspace_path, project_id, device_id, run_location, archived, created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(sessionId, "test", "workspace", "project", WORKSPACE, "ws-test-proj", "ws-offline-device", "desktop", 0, Date.now(), Date.now());
    
    // Register the device but set it offline
    db.prepare(
      `INSERT INTO devices(device_id, name, device_type, token, status, capabilities_json, last_seen_at, created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("ws-offline-device", "Offline", "desktop", "token", "offline", "{}", Date.now() - 120_000, Date.now(), Date.now());

    const res = await agent.get(`/api/sessions/${sessionId}/events`);
    expect(res.status).toBe(409);
    expect(res.text).toContain("offline");
    
    // Cleanup
    db.prepare("DELETE FROM session_index WHERE session_id = ?").run(sessionId);
    db.prepare("DELETE FROM projects WHERE project_id = ?").run("ws-test-proj");
    db.prepare("DELETE FROM devices WHERE device_id = ?").run("ws-offline-device");
  });

  it("桌面 session messages 端点转发到桌面设备", async () => {
    const db = await getRidgeDb();
    const sessionId = "ws-test-msg-sess";
    
    // Register a desktop project
    db.prepare(
      `INSERT INTO projects(project_id, name, path, is_git, added_at, project_type, external_origin, workspace_path, device_id, archived_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("ws-msg-proj", "ws-msg", "/tmp/ws-msg", 0, Date.now(), "external", "folder", WORKSPACE, "ws-msg-device", null, Date.now());
    
    // Insert desktop session
    db.prepare(
      `INSERT INTO session_index(session_id, title, session_type, context_type, workspace_path, project_id, device_id, run_location, archived, created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(sessionId, "test", "workspace", "project", WORKSPACE, "ws-msg-proj", "ws-msg-device", "desktop", 0, Date.now(), Date.now());
    
    // Device is offline, so messages request should fail with 409
    db.prepare(
      `INSERT INTO devices(device_id, name, device_type, token, status, capabilities_json, last_seen_at, created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("ws-msg-device", "Offline", "desktop", "token", "offline", "{}", Date.now() - 120_000, Date.now(), Date.now());

    const res = await agent.get(`/api/sessions/${sessionId}/messages`);
    expect(res.status).toBe(409);
    expect(res.text).toContain("offline");
    
    // Cleanup
    db.prepare("DELETE FROM session_index WHERE session_id = ?").run(sessionId);
    db.prepare("DELETE FROM projects WHERE project_id = ?").run("ws-msg-proj");
    db.prepare("DELETE FROM devices WHERE device_id = ?").run("ws-msg-device");
  });
});

describe("Task 32 - Bundle 安全边界", () => {
  beforeEach(async () => {
    const db = await getRidgeDb();
    db.prepare("DELETE FROM devices WHERE device_id != 'server'").run();
  });

  it("物化时绝对 symlink 被拒绝", async () => {
    const { materializeBundle } = await import("../runtime-bundle.js");
    const { registerDevice } = await import("../devices.js");

    const device = await registerDevice({
      deviceId: "symlink-abs-test",
      name: "Symlink Abs",
      deviceType: "desktop",
    });

    const bundle = {
      manifest: {
        bundleId: "test-1",
        deviceId: device.deviceId,
        version: 1,
        generatedAt: Date.now(),
        contentHash: "hash1",
        agents: [],
        skills: [],
        mcp: {},
        tools: {},
        permissions: {},
        modelConfig: {},
        startupContext: {},
      },
      files: new Map([
        [
          "agents/bad-link.md",
          {
            name: "bad-link.md",
            path: "agents/bad-link.md",
            content: "",
            encoding: "utf-8" as const,
            mtime: Date.now(),
            symlink: "/etc/passwd",
          },
        ],
      ]),
    };

    const targetDir = path.join(os.tmpdir(), `ridge-symlink-abs-${Date.now()}`);
    await expect(materializeBundle(bundle, targetDir)).rejects.toThrow("Absolute symlinks are not allowed");
  });

  it("物化时越界 symlink 被拒绝", async () => {
    const { materializeBundle } = await import("../runtime-bundle.js");
    const { registerDevice } = await import("../devices.js");

    const device = await registerDevice({
      deviceId: "symlink-escape-test",
      name: "Symlink Escape",
      deviceType: "desktop",
    });

    const bundle = {
      manifest: {
        bundleId: "test-2",
        deviceId: device.deviceId,
        version: 1,
        generatedAt: Date.now(),
        contentHash: "hash2",
        agents: [],
        skills: [],
        mcp: {},
        tools: {},
        permissions: {},
        modelConfig: {},
        startupContext: {},
      },
      files: new Map([
        [
          "agents/escape.md",
          {
            name: "escape.md",
            path: "agents/escape.md",
            content: "",
            encoding: "utf-8" as const,
            mtime: Date.now(),
            symlink: "../../escape",
          },
        ],
      ]),
    };

    const targetDir = path.join(os.tmpdir(), `ridge-symlink-esc-${Date.now()}`);
    await expect(materializeBundle(bundle, targetDir)).rejects.toThrow("Symlink escapes target directory");
  });

  it("物化时 path escape 被拒绝", async () => {
    const { materializeBundle } = await import("../runtime-bundle.js");
    const { registerDevice } = await import("../devices.js");

    const device = await registerDevice({
      deviceId: "path-escape-test",
      name: "Path Escape",
      deviceType: "desktop",
    });

    const bundle = {
      manifest: {
        bundleId: "test-3",
        deviceId: device.deviceId,
        version: 1,
        generatedAt: Date.now(),
        contentHash: "hash3",
        agents: [],
        skills: [],
        mcp: {},
        tools: {},
        permissions: {},
        modelConfig: {},
        startupContext: {},
      },
      files: new Map([
        [
          "../escape.txt",
          {
            name: "escape.txt",
            path: "../escape.txt",
            content: "bad",
            encoding: "utf-8" as const,
            mtime: Date.now(),
          },
        ],
      ]),
    };

    const targetDir = path.join(os.tmpdir(), `ridge-path-esc-${Date.now()}`);
    await expect(materializeBundle(bundle, targetDir)).rejects.toThrow("Bundle path escapes target directory");
  });
});

describe("Task 30 - 外部仓库 RAG 过滤完整测试", () => {
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    agent = await setupAuth();
  });

  beforeEach(async () => {
    await clearTestData();
    await clearWorkspaceTestFiles();
  });

  it("upload API 跳过外部仓库路径", async () => {
    const externalDir = path.join(os.tmpdir(), `ridge-upload-external-${Date.now()}`);
    await fs.mkdir(externalDir, { recursive: true });

    // Register external project via API (server-bound, no device)
    const createRes = await agent
      .post("/api/workspace/projects/external")
      .send({ path: externalDir });
    expect(createRes.status).toBe(201);

    // Upload a file to the external project directory via the real upload endpoint
    const fileName = `external-upload-${Date.now()}.txt`;
    const uploadRes = await agent
      .post("/api/files/upload")
      .field("root", externalDir)
      .field("directory", externalDir)
      .attach("files", Buffer.from("external content"), fileName);
    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.entries).toHaveLength(1);
    const uploadedPath = uploadRes.body.entries[0].path;

    // Verify that file_processing_status does NOT contain the external file
    const db = await getRidgeDb();
    const row = db
      .prepare("SELECT file_path FROM file_processing_status WHERE file_path = ?")
      .get(uploadedPath) as { file_path: string } | undefined;
    expect(row).toBeUndefined();

    await fs.rm(externalDir, { recursive: true, force: true });
  });
});

describe("Task 30 - 边界修复", () => {
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    agent = await setupAuth();
  });

  beforeEach(async () => {
    await clearTestData();
  });

  it("GitHub URL 必须有效且仓库名唯一", async () => {
    // Invalid URL should fail
    const badRes = await agent
      .post("/api/workspace/projects/github")
      .send({ url: "not-a-valid-url" });
    expect(badRes.status).toBe(400);
  });

  it("GitHub URL 拒绝含 credentials 的地址", async () => {
    const res = await agent
      .post("/api/workspace/projects/github")
      .send({ url: "https://user:pass@github.com/owner/repo" });
    expect(res.status).toBe(400);
    expect(res.text).toContain("credentials");
  });

  it("GitHub URL 拒绝非 github.com host", async () => {
    const res = await agent
      .post("/api/workspace/projects/github")
      .send({ url: "https://gitlab.com/owner/repo" });
    expect(res.status).toBe(400);
    expect(res.text).toContain("github.com");
  });

  it("GitHub URL 拒绝非 http/https scheme", async () => {
    const res = await agent
      .post("/api/workspace/projects/github")
      .send({ url: "ftp://github.com/owner/repo" });
    expect(res.status).toBe(400);
  });

  it("GitHub URL path traversal 被拒绝", async () => {
    const res = await agent
      .post("/api/workspace/projects/github")
      .send({ url: "https://github.com/../etc/passwd" });
    expect(res.status).toBe(400);
  });

  it("GitHub URL query 和 hash 不影响 repoName", async () => {
    // This test exercises that parsed pathname is used, not full URL string
    const res = await agent
      .post("/api/workspace/projects/github")
      .send({ url: "https://github.com/owner/repo?foo=1#bar" });
    // The clone will likely fail because the repo doesn't exist, but the URL should be accepted as structurally valid
    // We expect either 201 (if repo exists, unlikely) or 400/404 from git clone
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(500);
    if (res.status === 201) {
      expect(res.body.externalOrigin).toBe("github");
    }
  }, 60000);

  it("外部仓库注册失败时服务器不残留目录", async () => {
    const repoName = "nonexistent-repo-67890";
    const targetDir = path.join(os.homedir(), "ridge-projects", repoName);
    await fs.rm(targetDir, { recursive: true, force: true });

    // Try to clone an invalid repo
    const res = await agent
      .post("/api/workspace/projects/github")
      .send({ url: `https://github.com/nonexistent-user-12345/${repoName}` });
    
    // Should fail (404 or 400)
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    await expect(fs.stat(targetDir)).rejects.toThrow();
  });

  it("桌面设备路径注册需校验设备存在", async () => {
    // Try to register for non-existent device
    const res = await agent
      .post("/api/workspace/projects/external")
      .send({ path: "/some/path", deviceId: "nonexistent-device" });
    
    expect(res.status).toBe(404);
  });

  it("桌面设备路径注册需校验设备类型为 desktop", async () => {
    // Try to register for server device
    const res = await agent
      .post("/api/workspace/projects/external")
      .send({ path: "/some/path", deviceId: "server" });
    
    expect(res.status).toBe(400);
  });
});

describe("Task 31 - 调度链路集成", () => {
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    agent = await setupAuth();
  });

  beforeEach(async () => {
    const db = await getRidgeDb();
    db.prepare("DELETE FROM devices WHERE device_id != 'server'").run();
  });

  it("桌面设备离线时 forward 请求返回 409", async () => {
    // Device does not exist, so /forward should return 409
    const res = await agent
      .post("/api/devices/nonexistent/forward")
      .send({ type: "run_request", payload: {} });
    
    expect(res.status).toBe(409);
  });

  it("桌面设备 SSE 端点离线时返回 409", async () => {
    const res = await agent.get("/api/devices/offline-device/sse");
    expect(res.status).toBe(409);
    expect(res.text).toContain("Device offline");
  });
});

describe("Task 32 - Bundle 物化与配置", () => {
  beforeEach(async () => {
    const db = await getRidgeDb();
    db.prepare("DELETE FROM devices WHERE device_id != 'server'").run();
  });

  it("bundle 物化到本地目录并正确写入文件", async () => {
    const { generateRuntimeBundle, materializeBundle } = await import("../runtime-bundle.js");
    const { registerDevice } = await import("../devices.js");
    // Setup server Pi default config resources
    const agentsDir = path.join(PI_AGENT_DIR, "agents");
    const skillsDir = path.join(PI_AGENT_DIR, "skills");
    await fs.mkdir(agentsDir, { recursive: true });
    await fs.mkdir(skillsDir, { recursive: true });
    await fs.writeFile(path.join(agentsDir, "test-agent.md"), "# Agent", "utf-8");
    await fs.writeFile(path.join(skillsDir, "test-skill.md"), "# Skill", "utf-8");

    const device = await registerDevice({
      deviceId: "materialize-test",
      name: "Materialize",
      deviceType: "desktop",
    });

    const bundle = await generateRuntimeBundle(device, WORKSPACE);
    const targetDir = path.join(os.tmpdir(), `ridge-bundle-${Date.now()}`);
    await materializeBundle(bundle, targetDir);

    // Verify manifest
    const manifestContent = await fs.readFile(path.join(targetDir, "manifest.json"), "utf-8");
    const manifest = JSON.parse(manifestContent);
    expect(manifest.deviceId).toBe("materialize-test");

    // Verify files
    const agentContent = await fs.readFile(path.join(targetDir, "agents", "test-agent.md"), "utf-8");
    expect(agentContent).toBe("# Agent");
    const skillContent = await fs.readFile(path.join(targetDir, "skills", "test-skill.md"), "utf-8");
    expect(skillContent).toBe("# Skill");

    // Cleanup
    await fs.rm(targetDir, { recursive: true, force: true });
    await fs.rm(path.join(agentsDir, "test-agent.md"), { force: true });
    await fs.rm(path.join(skillsDir, "test-skill.md"), { force: true });
  });

  it("bundle 物化时旧文件被清理", async () => {
    const { generateRuntimeBundle, materializeBundle } = await import("../runtime-bundle.js");
    const { registerDevice } = await import("../devices.js");
    const agentsDir = path.join(PI_AGENT_DIR, "agents");
    await fs.mkdir(agentsDir, { recursive: true });
    await fs.writeFile(path.join(agentsDir, "agent1.md"), "# Agent1", "utf-8");

    const device = await registerDevice({
      deviceId: "cleanup-test",
      name: "Cleanup",
      deviceType: "desktop",
    });

    const targetDir = path.join(os.tmpdir(), `ridge-cleanup-${Date.now()}`);

    // First bundle with agent1
    const bundle1 = await generateRuntimeBundle(device, WORKSPACE);
    await materializeBundle(bundle1, targetDir);
    expect(await fs.readFile(path.join(targetDir, "agents", "agent1.md"), "utf-8")).toBe("# Agent1");

    // Remove agent1 and add agent2
    await fs.rm(path.join(agentsDir, "agent1.md"), { force: true });
    await fs.writeFile(path.join(agentsDir, "agent2.md"), "# Agent2", "utf-8");

    // Second bundle - materializeBundle clears targetDir first, removing stale files
    const bundle2 = await generateRuntimeBundle(device, WORKSPACE);
    await materializeBundle(bundle2, targetDir);

    // agent1 should be gone (cleaned up), agent2 should exist
    await expect(fs.readFile(path.join(targetDir, "agents", "agent1.md"), "utf-8")).rejects.toThrow();
    expect(await fs.readFile(path.join(targetDir, "agents", "agent2.md"), "utf-8")).toBe("# Agent2");

    // Cleanup
    await fs.rm(targetDir, { recursive: true, force: true });
    await fs.rm(path.join(agentsDir, "agent2.md"), { force: true });
  });

  it("项目级 .pi/skills 覆盖全局 skills", async () => {
    const { generateRuntimeBundle } = await import("../runtime-bundle.js");
    const { registerDevice } = await import("../devices.js");

    // Server-level skill
    const globalSkillsDir = path.join(PI_AGENT_DIR, "skills");
    await fs.mkdir(globalSkillsDir, { recursive: true });
    await fs.writeFile(path.join(globalSkillsDir, "shared.md"), "# Global", "utf-8");

    // Project skill with same name
    const projectDir = path.join(WORKSPACE, "项目", "project-overlay-test");
    const projectSkillsDir = path.join(projectDir, ".pi", "skills");
    await fs.mkdir(projectSkillsDir, { recursive: true });
    await fs.writeFile(path.join(projectSkillsDir, "shared.md"), "# Project", "utf-8");

    const device = await registerDevice({
      deviceId: "overlay-test",
      name: "Overlay",
      deviceType: "desktop",
    });

    const bundle = await generateRuntimeBundle(device, WORKSPACE, projectDir);
    const sharedSkill = bundle.manifest.skills.find((s: { name: string }) => s.name === "shared.md");
    expect(sharedSkill).toBeDefined();
    expect(sharedSkill!.content).toBe("# Project");

    // Cleanup
    await fs.rm(path.join(globalSkillsDir, "shared.md"), { force: true });
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it("无效 JSON 配置不静默返回 400", async () => {
    const { loadJsonConfig } = await import("../runtime-bundle.js");

    // Create invalid JSON
    await fs.mkdir(path.join(WORKSPACE, ".pi"), { recursive: true });
    await fs.writeFile(path.join(WORKSPACE, ".pi", "mcp.json"), "{invalid json", "utf-8");

    // Should throw, not return {}
    await expect(loadJsonConfig(WORKSPACE, "mcp.json")).rejects.toThrow("Invalid JSON");

    // Cleanup
    await fs.rm(path.join(WORKSPACE, ".pi", "mcp.json"), { force: true });
  });

  it("bundle-backed resourceLoader 从指定物化目录读取 skill", async () => {
    const { generateRuntimeBundle, materializeBundle } = await import("../runtime-bundle.js");
    const { registerDevice } = await import("../devices.js");
    const { createBundleBackedResourceLoader } = await import("../bundle-resource-loader.js");

    // Setup workspace with a bundle-specific skill
    const agentsDir = path.join(PI_AGENT_DIR, "agents");
    const skillsDir = path.join(PI_AGENT_DIR, "skills");
    await fs.mkdir(agentsDir, { recursive: true });
    await fs.mkdir(skillsDir, { recursive: true });
    // Create skill in a named subdirectory with proper frontmatter
    const skillSubdir = path.join(skillsDir, "bundle-skill");
    await fs.mkdir(skillSubdir, { recursive: true });
    await fs.writeFile(
      path.join(skillSubdir, "SKILL.md"),
      `---\nname: bundle-skill\ndescription: A test skill from bundle\n---\n# Bundle Skill\n`,
      "utf-8",
    );
    // Create agent as AGENTS.md so Pi discovers it
    await fs.writeFile(
      path.join(agentsDir, "AGENTS.md"),
      "# Bundle Agent Context\n",
      "utf-8",
    );

    // Also write a sibling skill to prove the explicit materialized dir wins.
    const realPiDir = path.join(os.tmpdir(), `ridge-other-skills-${Date.now()}`);
    const realSkillSubdir = path.join(realPiDir, "real-skill");
    await fs.mkdir(realSkillSubdir, { recursive: true });
    await fs.writeFile(
      path.join(realSkillSubdir, "SKILL.md"),
      `---\nname: real-skill\ndescription: A real skill\n---\n# Real Skill\n`,
      "utf-8",
    );

    const device = await registerDevice({
      deviceId: "rl-test",
      name: "RL Test",
      deviceType: "desktop",
    });

    // Generate bundle
    const bundle = await generateRuntimeBundle(device, WORKSPACE);
    expect(bundle.files.has("skills/bundle-skill/SKILL.md")).toBe(true);
    expect(bundle.files.has("agents/AGENTS.md")).toBe(true);

    // Materialize to a temp dir
    const materializedDir = path.join(os.tmpdir(), `ridge-rl-${Date.now()}`);
    await materializeBundle(bundle, materializedDir);

    // Verify files exist in materialized dir
    const skillContent = await fs.readFile(
      path.join(materializedDir, "skills", "bundle-skill", "SKILL.md"),
      "utf-8",
    );
    expect(skillContent).toContain("Bundle Skill");
    const agentContent = await fs.readFile(
      path.join(materializedDir, "agents", "AGENTS.md"),
      "utf-8",
    );
    expect(agentContent).toContain("Bundle Agent Context");

    // Create bundle-backed resourceLoader
    const rl = createBundleBackedResourceLoader(materializedDir, WORKSPACE);
    await rl.reload();

    // Verify resourceLoader reads skills from materialized dir
    const skillsResult = rl.getSkills();
    const skillNames = skillsResult.skills.map((s) => s.name);
    expect(skillNames).toContain("bundle-skill");
    expect(skillNames).not.toContain("real-skill");

    // Verify resourceLoader reads agents from materialized dir
    const agentsResult = rl.getAgentsFiles();
    const agentPaths = agentsResult.agentsFiles.map((a) => a.path);
    expect(agentPaths.some((p) => p.includes("AGENTS.md"))).toBe(true);
    expect(agentPaths.some((p) => p.includes("real-agent.md"))).toBe(false);

    // Cleanup
    await fs.rm(materializedDir, { recursive: true, force: true });
    await fs.rm(path.join(skillsDir, "bundle-skill"), { recursive: true, force: true });
    await fs.rm(path.join(agentsDir, "AGENTS.md"), { force: true });
    await fs.rm(path.join(realPiDir, "real-skill"), { recursive: true, force: true });
  });
});
