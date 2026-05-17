import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { app } from "../index.js";
import { getRidgeDb } from "../db/index.js";

async function clearBrowserCaptureState() {
	const db = await getRidgeDb();
	db.prepare("DELETE FROM fleeting_notes WHERE note_id LIKE 'browser-%'").run();
	db.prepare("DELETE FROM devices WHERE device_id LIKE 'browser-test-%'").run();
}

async function registerBrowserDevice(deviceId = "browser-test-capture") {
	const res = await request(app).post("/api/devices/register").send({
		deviceId,
		name: "Chrome",
		deviceType: "browser",
		capabilities: { browser_capture: true, silent_reading_capture: true, cookies: true },
	});
	expect(res.status).toBe(201);
	return {
		deviceId: String(res.body.deviceId),
		token: String(res.body.token),
	};
}

describe("browser capture API", () => {
	afterEach(async () => {
		await clearBrowserCaptureState();
	});

	it("registers browser devices without runtime bundles and filters unsafe capabilities", async () => {
		const res = await request(app).post("/api/devices/register").send({
			deviceId: "browser-test-register",
			name: "Chrome",
			deviceType: "browser",
			capabilities: {
				browser_capture: true,
				silent_reading_capture: true,
				cookies: true,
				keylogger: true,
			},
		});

		expect(res.status).toBe(201);
		expect(res.body).toMatchObject({
			deviceId: "browser-test-register",
			deviceType: "browser",
			capabilities: {
				browser_capture: true,
				silent_reading_capture: true,
			},
		});
		expect(res.body.capabilities).not.toHaveProperty("cookies");
		expect(res.body.capabilities).not.toHaveProperty("keylogger");
		expect(res.body).not.toHaveProperty("runtimeBundle");
		expect(res.body.token).toMatch(/^rdt_/);
	});

	it("creates a browser URL-only fleeting note with sanitized provenance metadata", async () => {
		const registration = await registerBrowserDevice();

		const res = await request(app)
			.post("/api/browser/captures")
			.send({
				deviceId: registration.deviceId,
				token: registration.token,
				url: "https://example.com/article?utm_source=newsletter&token=secret&x=1",
				title: "Readable Article",
				reading: {
					dwellMs: 76_000,
					maxScrollRatio: 0.82,
					visitCount: 3,
					capturedAt: 1_772_000_000_000,
				},
			});

		expect(res.status).toBe(201);
		expect(res.body.note).toMatchObject({
			content: "https://example.com/article?x=1",
			captureType: "browser_page",
		});
		expect(res.body.note.metadata).toMatchObject({
			source: "browser",
			deviceId: registration.deviceId,
			title: "Readable Article",
			url: "https://example.com/article?x=1",
			reading: {
				dwellMs: 76000,
				maxScrollRatio: 0.82,
				visitCount: 3,
			},
		});

		const db = await getRidgeDb();
		const note = db
			.prepare("SELECT content, capture_type, metadata_json FROM fleeting_notes WHERE note_id = ?")
			.get(res.body.note.id) as
			| { content: string; capture_type: string; metadata_json: string }
			| undefined;

		expect(note?.capture_type).toBe("browser_page");
		expect(note?.content).toBe("https://example.com/article?x=1");
		expect(JSON.parse(note?.metadata_json ?? "{}")).toMatchObject({
			url: "https://example.com/article?x=1",
		});
		expect(note?.metadata_json).not.toContain("secret");
	});

	it("rejects invalid browser tokens without creating half-written notes", async () => {
		const registration = await registerBrowserDevice("browser-test-bad-token");

		const res = await request(app)
			.post("/api/browser/captures")
			.send({
				deviceId: registration.deviceId,
				token: "wrong-token",
				url: "https://example.com/article",
				title: "Nope",
				reading: { dwellMs: 60_000, maxScrollRatio: 0.5, visitCount: 1 },
			});

		expect(res.status).toBe(401);
		const db = await getRidgeDb();
		expect(db.prepare("SELECT COUNT(*) AS count FROM fleeting_notes").get()).toEqual({
			count: 0,
		});
	});
});
