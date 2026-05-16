import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { app } from "../index.js";
import { getRidgeDb } from "../db/index.js";

async function clearMobileCaptureState() {
	const db = await getRidgeDb();
	db.prepare("DELETE FROM fleeting_attachments").run();
	db.prepare("DELETE FROM fleeting_notes").run();
	db.prepare("DELETE FROM devices WHERE device_id LIKE 'android-task52%'").run();
	await fs.rm(path.join(os.homedir(), "ridge-workspace", ".ridge", "fleeting-attachments"), {
		recursive: true,
		force: true,
	});
}

async function registerAndroidDevice(deviceId = "android-task52") {
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

describe("Task 52 - Android mobile capture API", () => {
	afterEach(async () => {
		await clearMobileCaptureState();
	});

	it("creates a fleeting note and real fleeting attachment records from an Android capture", async () => {
		const registration = await registerAndroidDevice();
		const imageBuffer = Buffer.from("android-photo-bytes");

		const res = await request(app)
			.post("/api/mobile/captures")
			.send({
				deviceId: registration.deviceId,
				token: registration.token,
				text: "路上想到的产品点",
				attachments: [
					{
						kind: "photo",
						name: "street.png",
						mimeType: "image/png",
						base64: imageBuffer.toString("base64"),
					},
				],
			});

		expect(res.status).toBe(201);
		expect(res.body.note.content).toBe("路上想到的产品点");
		expect(res.body.note.captureType).toBe("mobile_capture");
		expect(res.body.attachments).toHaveLength(1);
		expect(res.body.attachments[0]).toMatchObject({
			noteId: res.body.note.id,
			originalName: "street.png",
			mimeType: "image/png",
			size: imageBuffer.length,
		});

		const db = await getRidgeDb();
		const note = db
			.prepare("SELECT * FROM fleeting_notes WHERE note_id = ?")
			.get(res.body.note.id) as { content: string; capture_type: string } | undefined;
		expect(note).toMatchObject({
			content: "路上想到的产品点",
			capture_type: "mobile_capture",
		});

		const attachments = db
			.prepare("SELECT * FROM fleeting_attachments WHERE note_id = ?")
			.all(res.body.note.id) as { stored_path: string }[];
		expect(attachments).toHaveLength(1);
		await expect(fs.readFile(attachments[0]!.stored_path)).resolves.toEqual(imageBuffer);
		expect(attachments[0]!.stored_path).toContain(
			path.join(".ridge", "fleeting-attachments", res.body.note.id),
		);
	});

	it("rejects invalid Android tokens without creating half-written fleeting rows", async () => {
		const registration = await registerAndroidDevice("android-task52-bad-token");

		const res = await request(app)
			.post("/api/mobile/captures")
			.send({
				deviceId: registration.deviceId,
				token: "wrong-token",
				text: "不能写入",
				attachments: [
					{
						kind: "audio",
						name: "idea.webm",
						mimeType: "audio/webm",
						base64: Buffer.from("audio").toString("base64"),
					},
				],
			});

		expect(res.status).toBe(401);
		const db = await getRidgeDb();
		expect(db.prepare("SELECT COUNT(*) AS count FROM fleeting_notes").get()).toEqual({
			count: 0,
		});
		expect(db.prepare("SELECT COUNT(*) AS count FROM fleeting_attachments").get()).toEqual({
			count: 0,
		});
	});

	it("rejects invalid attachment payloads before creating orphan notes", async () => {
		const registration = await registerAndroidDevice("android-task52-invalid-attachment");

		const res = await request(app)
			.post("/api/mobile/captures")
			.send({
				deviceId: registration.deviceId,
				token: registration.token,
				text: "坏附件不能留下半条闪念",
				attachments: [
					{
						kind: "photo",
						name: "broken.png",
						mimeType: "image/png",
						base64: "not base64",
					},
				],
			});

		expect(res.status).toBe(400);
		const db = await getRidgeDb();
		expect(db.prepare("SELECT COUNT(*) AS count FROM fleeting_notes").get()).toEqual({
			count: 0,
		});
		expect(db.prepare("SELECT COUNT(*) AS count FROM fleeting_attachments").get()).toEqual({
			count: 0,
		});
	});
});
