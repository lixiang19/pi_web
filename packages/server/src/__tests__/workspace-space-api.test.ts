import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { createAuthenticatedAgent } from "../test/auth.js";

let api: ReturnType<typeof request.agent>;

const WORKSPACE = path.join(os.homedir(), "ridge-workspace");
const SPACE_ROOT = path.join(WORKSPACE, "空间");
const demoName = "任务21私有预览";
const demoDir = path.join(SPACE_ROOT, demoName);
const demoId = Buffer.from(demoName, "utf8").toString("base64url");

describe("workspace space private preview API", () => {
	beforeAll(async () => {
		api = await createAuthenticatedAgent(app);
		await fs.mkdir(demoDir, { recursive: true });
		await fs.writeFile(
			path.join(demoDir, "index.html"),
			"<!doctype html><html><body><h1>space demo</h1></body></html>",
			"utf8",
		);
		await fs.mkdir(path.join(SPACE_ROOT, "缺少首页"), { recursive: true });
		await fs.mkdir(path.join(SPACE_ROOT, ".ridge"), { recursive: true });
		await fs.writeFile(path.join(SPACE_ROOT, ".ridge", "index.html"), "<h1>hidden</h1>", "utf8");
	});

	afterAll(async () => {
		await fs.rm(demoDir, { recursive: true, force: true });
		await fs.rm(path.join(SPACE_ROOT, "缺少首页"), { recursive: true, force: true });
		await fs.rm(path.join(SPACE_ROOT, ".ridge"), { recursive: true, force: true });
		await fs.rm(path.join(SPACE_ROOT, "外部链接"), { recursive: true, force: true });
		await fs.rm(path.join(SPACE_ROOT, "隐藏链接"), { recursive: true, force: true });
		await fs.rm(path.join(os.tmpdir(), "ridge-space-outside"), { recursive: true, force: true });
	});

	it("lists only first-level space works with index.html", async () => {
		const res = await api.get("/api/workspace/space");

		expect(res.status).toBe(200);
		expect(res.body.root).toBe(SPACE_ROOT.replace(/\\/g, "/"));
		expect(res.body.works).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: demoId,
					name: demoName,
					path: demoDir.replace(/\\/g, "/"),
					indexPath: path.join(demoDir, "index.html").replace(/\\/g, "/"),
				}),
			]),
		);
		expect(
			res.body.works.some((item: { name: string }) => item.name === "缺少首页"),
		).toBe(false);
		expect(
			res.body.works.some((item: { name: string }) => item.name === ".ridge"),
		).toBe(false);
	});

	it("returns private HTML by service-generated work id", async () => {
		const res = await api.get(`/api/workspace/space/${demoId}/preview-html`);

		expect(res.status).toBe(200);
		expect(res.body).toMatchObject({
			id: demoId,
			name: demoName,
			indexPath: path.join(demoDir, "index.html").replace(/\\/g, "/"),
			html: expect.stringContaining("space demo"),
		});
		expect(res.body.html).not.toContain("/api/workspace/space/");
	});

	it("rejects ids that resolve outside the space root through symlinks", async () => {
		const outsideDir = path.join(os.tmpdir(), "ridge-space-outside");
		await fs.mkdir(outsideDir, { recursive: true });
		await fs.writeFile(path.join(outsideDir, "index.html"), "<h1>outside</h1>", "utf8");

		const linkName = "外部链接";
		const linkPath = path.join(SPACE_ROOT, linkName);
		await fs.rm(linkPath, { recursive: true, force: true });
		try {
			await fs.symlink(outsideDir, linkPath);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
				throw error;
			}
		}

		const linkId = Buffer.from(linkName, "utf8").toString("base64url");
		const res = await api.get(`/api/workspace/space/${linkId}/preview-html`);

		expect(res.status).toBe(400);
	});

	it("rejects works that resolve into a hidden .ridge segment", async () => {
		const linkName = "隐藏链接";
		const linkPath = path.join(SPACE_ROOT, linkName);
		await fs.rm(linkPath, { recursive: true, force: true });
		try {
			await fs.symlink(path.join(SPACE_ROOT, ".ridge"), linkPath);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
				throw error;
			}
		}

		const linkId = Buffer.from(linkName, "utf8").toString("base64url");
		const res = await api.get(`/api/workspace/space/${linkId}/preview-html`);

		expect(res.status).toBe(400);
	});

	it("returns 404 when index.html is missing", async () => {
		const missingId = Buffer.from("缺少首页", "utf8").toString("base64url");
		const res = await api.get(`/api/workspace/space/${missingId}/preview-html`);

		expect(res.status).toBe(404);
	});

	it("does not expose arbitrary workspace files as space preview html", async () => {
		const notSpaceName = "../readme";
		const notSpaceId = Buffer.from(notSpaceName, "utf8").toString("base64url");
		const res = await api.get(`/api/workspace/space/${notSpaceId}/preview-html`);

		expect(res.status).toBe(400);
	});
});
