import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { app } from "../index.js";
import { getRidgeDb } from "../db/index.js";

const WORKSPACE = path.join(os.homedir(), "ridge-workspace");

async function clearTask53State() {
	const db = await getRidgeDb();
	db.prepare("DELETE FROM session_index WHERE session_id LIKE 'task53-%' OR title LIKE 'task53%'").run();
	db.prepare("DELETE FROM sessions WHERE session_id LIKE 'task53-%' OR title LIKE 'task53%'").run();
	db.prepare("DELETE FROM devices WHERE device_id LIKE 'android-task53%'").run();
}

async function registerAndroidDevice(deviceId = "android-task53") {
	const res = await request(app).post("/api/devices/register").send({
		deviceId,
		name: "Pixel",
		deviceType: "android",
		capabilities: { mobile_capture: true, camera: true, microphone: true },
	});
	expect(res.status).toBe(201);
	return {
		deviceId: String(res.body.deviceId),
		token: String(res.body.token),
	};
}

describe("Task 53 - Android light chat session contract", () => {
	afterEach(async () => {
		await clearTask53State();
	});

	it("lets Android token create a plain server workspace session without exposing cwd", async () => {
		const registration = await registerAndroidDevice("android-task53-create");

		const res = await request(app)
			.post("/api/sessions")
			.set("Authorization", `Bearer ${registration.token}`)
			.send({ title: "task53 mobile chat" });

		expect(res.status).toBe(201);
		expect(res.body.title).toBe("task53 mobile chat");
		expect(res.body.cwd).toBe(WORKSPACE);

		const db = await getRidgeDb();
		const row = db
			.prepare("SELECT session_id, workspace_path, device_id, run_location, session_type FROM session_index WHERE session_id = ?")
			.get(res.body.id) as
			| {
				session_id: string;
				workspace_path: string;
				device_id: string | null;
				run_location: string;
				session_type: string;
			}
			| undefined;

		expect(row).toMatchObject({
			session_id: res.body.id,
			workspace_path: WORKSPACE,
			device_id: null,
			run_location: "server",
			session_type: "workspace",
		});
	});

	it("rejects Android attempts to choose cwd, fork, or task-only agent", async () => {
		const registration = await registerAndroidDevice("android-task53-boundary");

		const withCwd = await request(app)
			.post("/api/sessions")
			.set("Authorization", `Bearer ${registration.token}`)
			.send({ title: "task53 reject cwd", cwd: WORKSPACE });
		expect(withCwd.status).toBe(400);

		const withParent = await request(app)
			.post("/api/sessions")
			.set("Authorization", `Bearer ${registration.token}`)
			.send({ title: "task53 reject parent", parentSessionId: "session-parent" });
		expect(withParent.status).toBe(400);

		const withTaskAgent = await request(app)
			.post("/api/sessions")
			.set("Authorization", `Bearer ${registration.token}`)
			.send({ title: "task53 reject task agent", agent: "task-agent" });
		expect(withTaskAgent.status).toBe(400);
	});

	it("rejects invalid Bearer token before creating a session", async () => {
		const res = await request(app)
			.post("/api/sessions")
			.set("Authorization", "Bearer rdt_invalid_task53_token")
			.send({ title: "task53 invalid token" });

		expect(res.status).toBe(401);

		const db = await getRidgeDb();
		expect(
			db.prepare("SELECT COUNT(*) AS count FROM session_index WHERE title = ?").get("task53 invalid token"),
		).toEqual({ count: 0 });
	});

	it("accepts Android token on existing message and cancel endpoints", async () => {
		const registration = await registerAndroidDevice("android-task53-message");
		const createRes = await request(app)
			.post("/api/sessions")
			.set("Authorization", `Bearer ${registration.token}`)
			.send({ title: "task53 send" });
		expect(createRes.status).toBe(201);

		const messageRes = await request(app)
			.post(`/api/sessions/${createRes.body.id}/messages`)
			.set("Authorization", `Bearer ${registration.token}`)
			.send({ prompt: "hello from android" });
		expect(messageRes.status).toBe(200);
		expect(messageRes.body).toMatchObject({ ok: true });

		const cancelRes = await request(app)
			.post(`/api/sessions/${createRes.body.id}/cancel`)
			.set("Authorization", `Bearer ${registration.token}`)
			.send({});
		expect(cancelRes.status).toBe(200);
		expect(cancelRes.body).toMatchObject({ ok: true });
	});
});
