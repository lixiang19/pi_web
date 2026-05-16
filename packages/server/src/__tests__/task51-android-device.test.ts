import request from "supertest";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { app } from "../index.js";
import { getRidgeDb } from "../db/index.js";

async function clearAndroidDevices() {
  const db = await getRidgeDb();
  db.prepare("DELETE FROM device_bundle_served WHERE device_id LIKE 'android-%'").run();
  db.prepare("DELETE FROM device_bundle_acks WHERE device_id LIKE 'android-%'").run();
  db.prepare("DELETE FROM devices WHERE device_id LIKE 'android-%'").run();
}

describe("Task 51 - Android device registration and heartbeat", () => {
  afterEach(async () => {
    await clearAndroidDevices();
  });

  afterAll(async () => {
    await clearAndroidDevices();
  });

  it("allows unauthenticated Android registration without returning a runtime bundle", async () => {
    const res = await request(app).post("/api/devices/register").send({
      deviceId: "android-public-register",
      name: "Pixel",
      deviceType: "android",
      capabilities: {
        mobile_capture: true,
        camera: true,
        microphone: true,
        skill_android: true,
      },
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      deviceId: "android-public-register",
      name: "Pixel",
      deviceType: "android",
      status: "online",
      capabilities: {
        mobile_capture: true,
        camera: true,
        microphone: true,
      },
    });
    expect(res.body.capabilities).not.toHaveProperty("skill_android");
    expect(res.body.token).toMatch(/^rdt_/);
    expect(res.body).not.toHaveProperty("runtimeBundle");
  });

  it("keeps Android token cleartext out of the database", async () => {
    const res = await request(app).post("/api/devices/register").send({
      deviceId: "android-token-hash",
      name: "Pixel",
      deviceType: "android",
      capabilities: { mobile_capture: true, camera: true, microphone: true },
    });

    expect(res.status).toBe(201);

    const db = await getRidgeDb();
    const row = db
      .prepare("SELECT token, token_hash FROM devices WHERE device_id = ?")
      .get("android-token-hash") as { token: string | null; token_hash: string | null } | undefined;

    expect(row?.token).toBeNull();
    expect(row?.token_hash).toHaveLength(64);
    expect(row?.token_hash).not.toBe(res.body.token);
  });

  it("requires a valid Android token for REST heartbeat", async () => {
    const res = await request(app).post("/api/devices/register").send({
      deviceId: "android-heartbeat",
      name: "Pixel",
      deviceType: "android",
      capabilities: { mobile_capture: true, camera: true, microphone: true },
    });

    expect(res.status).toBe(201);

    const bad = await request(app).post("/api/devices/heartbeat").send({
      deviceId: "android-heartbeat",
      token: "wrong-token",
    });
    expect(bad.status).toBe(401);

    const ok = await request(app).post("/api/devices/heartbeat").send({
      deviceId: "android-heartbeat",
      token: res.body.token,
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ ok: true });
  });

  it("does not serve runtime bundles to Android devices", async () => {
    const res = await request(app).post("/api/devices/register").send({
      deviceId: "android-no-bundle",
      name: "Pixel",
      deviceType: "android",
      capabilities: { mobile_capture: true, camera: true, microphone: true },
    });

    expect(res.status).toBe(201);

    const runtimeBundle = await request(app)
      .get("/api/runtime/bundle")
      .set("Authorization", `Bearer ${res.body.token}`);
    expect(runtimeBundle.status).toBe(403);

    const deviceBundle = await request(app)
      .get("/api/devices/android-no-bundle/bundle")
      .query({ token: res.body.token });
    expect(deviceBundle.status).toBe(403);
  });
});
