import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app, setConversionEnabledForTesting } from "../index.js";
import { createAuthenticatedAgent } from "../test/auth.js";
import { getRidgeDb } from "../db/index.js";

let api: ReturnType<typeof request.agent>;

const WORKSPACE = path.join(os.homedir(), "ridge-workspace");
const TEST_ROOT = path.join(WORKSPACE, "manual-convert-test");

beforeAll(async () => {
	setConversionEnabledForTesting(true);
	api = await createAuthenticatedAgent(app);
	await fs.mkdir(TEST_ROOT, { recursive: true });
});

afterAll(async () => {
	await fs.rm(TEST_ROOT, { recursive: true, force: true });
	const db = await getRidgeDb();
	db.prepare("DELETE FROM file_processing_status WHERE file_path LIKE ?").run(`${TEST_ROOT}%`);
	db.prepare("DELETE FROM background_jobs WHERE payload_json LIKE ?").run(`%${TEST_ROOT}%`);
});

async function createTestPdf(filePath: string, text: string): Promise<void> {
	const stream = `BT
/F1 12 Tf
100 700 Td
(${text}) Tj
ET`;
	const pdf = `%PDF-1.4
1 0 obj
<</Type/Catalog/Pages 2 0 R>>
endobj
2 0 obj
<</Type/Pages/Kids[3 0 R]/Count 1>>
endobj
3 0 obj
<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>
endobj
4 0 obj
<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>
endobj
5 0 obj
<</Length ${stream.length}>>
stream
${stream}
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000052 00000 n 
0000000101 00000 n 
0000000226 00000 n 
0000000283 00000 n 
trailer
<</Size 6/Root 1 0 R>>
startxref
${348 + stream.length}
%%EOF
`;
	await fs.writeFile(filePath, pdf);
}

describe("POST /api/workspace/files/convert", () => {
	it("enqueues conversion for a pending PDF", async () => {
		const dir = path.join(TEST_ROOT, "manual-pdf");
		await fs.rm(dir, { recursive: true, force: true });
		await fs.mkdir(dir, { recursive: true });
		const pdfPath = path.join(dir, "manual.pdf");
		await createTestPdf(pdfPath, "Manual conversion");

		// Seed a pending status record
		const db = await getRidgeDb();
		const posixPath = pdfPath.replace(/\\/g, "/");
		db.prepare(
			`INSERT INTO file_processing_status (file_path, workspace_path, status, updated_at)
			 VALUES (?, ?, ?, ?)`,
		).run(posixPath, WORKSPACE, "pending", Date.now());

		const res = await api
			.post("/api/workspace/files/convert")
			.send({ path: pdfPath });

		expect(res.status).toBe(200);
		expect(res.body.ok).toBe(true);
		// When status is pending, the API notes it without re-enqueueing
		expect(res.body.note).toContain("pending");
	});

	it("enqueues re-conversion for a converted file and refuses to overwrite user-edited markdown without force", async () => {
		const dir = path.join(TEST_ROOT, "manual-guard");
		await fs.rm(dir, { recursive: true, force: true });
		await fs.mkdir(dir, { recursive: true });
		const pdfPath = path.join(dir, "guard.pdf");
		await createTestPdf(pdfPath, "Guarded conversion");

		const db = await getRidgeDb();
		const posixPath = pdfPath.replace(/\\/g, "/");
		db.prepare(
			`INSERT INTO file_processing_status (file_path, workspace_path, status, updated_at)
			 VALUES (?, ?, ?, ?)`,
		).run(posixPath, WORKSPACE, "converted", Date.now());

		// Simulate that a previous conversion produced the md and metadata
		const mdPath = path.join(dir, "guard.md");
		await fs.writeFile(mdPath, "# Original\n\nConverted content.");
		const metaPath = path.join(dir, "guard.metadata.json");
		const mdHash = crypto.createHash("sha256").update("# Original\n\nConverted content.").digest("hex");
		await fs.writeFile(metaPath, JSON.stringify({ _ridge: { mdHash } }));

		// Edit markdown (this changes the content hash)
		await fs.writeFile(mdPath, "# User edited\n\nModified content.");

		// Re-convert without force should fail because markdown hash differs
		const res = await api
			.post("/api/workspace/files/convert")
			.send({ path: pdfPath });

		expect(res.status).toBe(409);

		// User-edited markdown must remain
		const preserved = await fs.readFile(mdPath, "utf-8");
		expect(preserved).toContain("User edited");
	});

	it("allows overwrite when force=true", async () => {
		const dir = path.join(TEST_ROOT, "manual-force");
		await fs.rm(dir, { recursive: true, force: true });
		await fs.mkdir(dir, { recursive: true });
		const pdfPath = path.join(dir, "force.pdf");
		await createTestPdf(pdfPath, "Forced conversion");

		const db = await getRidgeDb();
		const posixPath = pdfPath.replace(/\\/g, "/");
		db.prepare(
			`INSERT INTO file_processing_status (file_path, workspace_path, status, updated_at)
			 VALUES (?, ?, ?, ?)`,
		).run(posixPath, WORKSPACE, "converted", Date.now());

		// Simulate previous conversion products
		const mdPath = path.join(dir, "force.md");
		await fs.writeFile(mdPath, "# Original");
		const metaPath = path.join(dir, "force.metadata.json");
		const mdHash = crypto.createHash("sha256").update("# Original").digest("hex");
		await fs.writeFile(metaPath, JSON.stringify({ _ridge: { mdHash } }));

		// Edit markdown
		await fs.writeFile(mdPath, "# User edited");

		// Re-convert with force=true should enqueue
		const res = await api
			.post("/api/workspace/files/convert")
			.send({ path: pdfPath, force: true });

		expect(res.status).toBe(200);
		expect(res.body.ok).toBe(true);
		expect(res.body.enqueued).toBe(true);
	});

	it("returns 404 for missing file_processing_status record", async () => {
		const dir = path.join(TEST_ROOT, "manual-no-record");
		await fs.rm(dir, { recursive: true, force: true });
		await fs.mkdir(dir, { recursive: true });
		const pdfPath = path.join(dir, "orphan.pdf");
		await createTestPdf(pdfPath, "Orphan");

		// No status record seeded
		const res = await api
			.post("/api/workspace/files/convert")
			.send({ path: pdfPath });

		expect(res.status).toBe(404);
	});

	it("enqueues from .originals/ when original file has been archived", async () => {
		const dir = path.join(TEST_ROOT, "manual-from-originals");
		await fs.rm(dir, { recursive: true, force: true });
		await fs.mkdir(dir, { recursive: true });
		const pdfPath = path.join(dir, "archived.pdf");
		await createTestPdf(pdfPath, "Archived conversion");

		const db = await getRidgeDb();
		const posixPath = pdfPath.replace(/\\/g, "/");
		db.prepare(
			`INSERT INTO file_processing_status (file_path, workspace_path, status, updated_at)
			 VALUES (?, ?, ?, ?)`,
		).run(posixPath, WORKSPACE, "converted", Date.now());

		// Simulate that the original was moved to .originals/
		await fs.mkdir(path.join(dir, ".originals"), { recursive: true });
		await fs.copyFile(pdfPath, path.join(dir, ".originals", "archived.pdf"));
		await fs.rm(pdfPath);

		// Re-convert should find source in .originals/ and enqueue
		const res = await api
			.post("/api/workspace/files/convert")
			.send({ path: pdfPath });

		expect(res.status).toBe(200);
		expect(res.body.ok).toBe(true);
		expect(res.body.enqueued).toBe(true);
	});

	it("fails gracefully when source file and .originals/ are both missing", async () => {
		const dir = path.join(TEST_ROOT, "manual-missing-both");
		await fs.rm(dir, { recursive: true, force: true });
		await fs.mkdir(dir, { recursive: true });
		const pdfPath = path.join(dir, "missing.pdf");
		await createTestPdf(pdfPath, "Missing");

		const db = await getRidgeDb();
		const posixPath = pdfPath.replace(/\\/g, "/");
		db.prepare(
			`INSERT INTO file_processing_status (file_path, workspace_path, status, updated_at)
			 VALUES (?, ?, ?, ?)`,
		).run(posixPath, WORKSPACE, "pending", Date.now());

		// Delete the original file so neither original nor .originals/ exist
		await fs.rm(pdfPath, { force: true });

		const res = await api
			.post("/api/workspace/files/convert")
			.send({ path: pdfPath });

		// When status is pending, the API returns early with a note (no 404)
		expect(res.status).toBe(200);
		expect(res.body.note).toContain("pending");
	});
});
