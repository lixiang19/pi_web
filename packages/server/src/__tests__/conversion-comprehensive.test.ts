import Database from "better-sqlite3";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { RIDGE_DB_BOOTSTRAP_SQL } from "../db/migrations.js";
import { createBackgroundJobQueue } from "../background-jobs.js";
import {
	createFileConversionWorker,
	handleConversionResult,
} from "../file-conversion-worker.js";
import {
	ConversionServiceClient,
	writeArtifactsToWorkspace,
	type DownloadedArtifact,
} from "../conversion-service-client.js";
import {
	app,
	setConversionEnabledForTesting,
	setJobQueueForTesting,
	getJobQueueForTesting,
} from "../index.js";
import { createAuthenticatedAgent } from "../test/auth.js";
import { getRidgeDb } from "../db/index.js";

const WORKSPACE = path.join(os.homedir(), "ridge-workspace");

const createDb = () => {
	const db = new Database(":memory:");
	db.exec(RIDGE_DB_BOOTSTRAP_SQL);
	return db;
};

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

function createMockConversionClient(options: {
	finalStatus?: "succeeded" | "failed";
	artifacts?: DownloadedArtifact[];
} = {}): ConversionServiceClient {
	const finalStatus = options.finalStatus ?? "succeeded";
	const mockArtifacts = options.artifacts ?? [
		{
			artifact: {
				artifactId: "art-1",
				name: "doc.md",
				mimeType: "text/markdown",
				size: 100,
				inline: true,
				content: "# Test Document\n\nConverted by mock Python service.",
			},
			buffer: Buffer.from("# Test Document\n\nConverted by mock Python service.", "utf-8"),
		},
		{
			artifact: {
				artifactId: "art-2",
				name: "doc.metadata.json",
				mimeType: "application/json",
				size: 50,
				inline: true,
				content: "{}",
			},
			buffer: Buffer.from("{}", "utf-8"),
		},
	];

	return {
		async createConversionWithFile() {
			return {
				jobId: "mock-python-job-01",
				status: "queued" as const,
				task: "document.markdown" as const,
				createdAt: new Date().toISOString(),
			};
		},
		async getConversion() {
			return {
				jobId: "mock-python-job-01",
				status: finalStatus,
				task: "document.markdown" as const,
				createdAt: new Date().toISOString(),
				completedAt: new Date().toISOString(),
				artifacts: mockArtifacts.map((d) => d.artifact),
				error: null,
			};
		},
		async downloadArtifacts() {
			return mockArtifacts;
		},
	} as unknown as ConversionServiceClient;
}

describe("worker pre-check failures write convert_failed", () => {
	let db: ReturnType<typeof createDb>;
	let jobQueue: ReturnType<typeof createBackgroundJobQueue>;
	let worker: ReturnType<typeof createFileConversionWorker>;

	beforeEach(() => {
		db = createDb();
		jobQueue = createBackgroundJobQueue(db, {
			now: () => Date.now(),
			retryDelaysMs: [10, 20, 30],
		});
		worker = createFileConversionWorker({
			db,
			jobQueue,
			workspaceDir: WORKSPACE,
			conversionClient: createMockConversionClient(),
			config: {
				baseUrl: "http://127.0.0.1:3000",
				apiKey: "test",
				callbackToken: "test-token",
				callbackBaseUrl: "http://127.0.0.1:3000/api/webhooks/conversion",
			},
			pollFallbackMs: 10,
			maxPollMs: 200,
		});
	});

	afterEach(() => {
		worker.stop();
		db.close();
	});

	it("source not found writes convert_failed and notification", async () => {
		const testDir = path.join(WORKSPACE, "pre-source-missing");
		await fs.rm(testDir, { recursive: true, force: true });
		await fs.mkdir(testDir, { recursive: true });
		const sourcePath = path.join(testDir, "missing.pdf");
		// Do NOT create the file

		const posixPath = sourcePath.replace(/\\/g, "/");
		db.prepare(
			`INSERT INTO file_processing_status (file_path, workspace_path, status, updated_at)
			 VALUES (?, ?, ?, ?)`,
		).run(posixPath, WORKSPACE, "pending", Date.now());

		const job = jobQueue.enqueue({
			type: "file.convert",
			relatedType: "file",
			relatedId: posixPath,
			payload: { workspaceDir: WORKSPACE },
			maxAttempts: 1,
		});

		const claimed = jobQueue.claimNext("worker-1", "file.convert");
		expect(claimed).not.toBeNull();

		await worker.processOne(claimed!);

		// Status must be convert_failed
		const statusRow = db
			.prepare("SELECT status, error FROM file_processing_status WHERE file_path = ?")
			.get(posixPath) as { status: string; error: string | null } | undefined;
		expect(statusRow?.status).toBe("convert_failed");
		expect(statusRow?.error).toContain("not found");

		// Notification must be created
		const notif = db
			.prepare("SELECT * FROM notification_events WHERE payload_json LIKE ?")
			.get(`%${posixPath}%`) as unknown;
		expect(notif).toBeDefined();

		// Background job must be failed
		const jobRow = jobQueue.get(job.jobId);
		expect(jobRow?.status).toBe("failed");
	});

	it("unsupported file type writes convert_failed", async () => {
		const testDir = path.join(WORKSPACE, "pre-unsupported");
		await fs.rm(testDir, { recursive: true, force: true });
		await fs.mkdir(testDir, { recursive: true });
		const sourcePath = path.join(testDir, "bad.xyz");
		await fs.writeFile(sourcePath, "not convertible");

		const posixPath = sourcePath.replace(/\\/g, "/");
		db.prepare(
			`INSERT INTO file_processing_status (file_path, workspace_path, status, updated_at)
			 VALUES (?, ?, ?, ?)`,
		).run(posixPath, WORKSPACE, "pending", Date.now());

		// Enqueue the job first — claimNext requires a pending job in the queue
		jobQueue.enqueue({
			type: "file.convert",
			relatedType: "file",
			relatedId: posixPath,
			payload: { workspaceDir: WORKSPACE },
			maxAttempts: 1,
		});

		const claimed = jobQueue.claimNext("worker-1", "file.convert");
		expect(claimed).not.toBeNull();

		await worker.processOne(claimed!);

		const statusRow = db
			.prepare("SELECT status, error FROM file_processing_status WHERE file_path = ?")
			.get(posixPath) as { status: string; error: string | null } | undefined;
		expect(statusRow?.status).toBe("convert_failed");
		expect(statusRow?.error).toContain("Unsupported");
	});

	it("does NOT write notification when file_processing_status is missing", async () => {
		// If worker encounters a file with no status record, it should NOT write
		// a notification because there is no file processing context.
		const testDir = path.join(WORKSPACE, "no-status-fail");
		await fs.rm(testDir, { recursive: true, force: true });
		await fs.mkdir(testDir, { recursive: true });
		const sourcePath = path.join(testDir, "orphan.pdf");
		await createTestPdf(sourcePath, "Orphan");

		const posixPath = sourcePath.replace(/\\/g, "/");
		// Do NOT insert file_processing_status

		const job = jobQueue.enqueue({
			type: "file.convert",
			relatedType: "file",
			relatedId: posixPath,
			payload: { workspaceDir: WORKSPACE },
			maxAttempts: 1,
		});

		const claimed = jobQueue.claimNext("worker-1", "file.convert");
		expect(claimed).not.toBeNull();

		await worker.processOne(claimed!);

		// Job should be completed (skipped) not failed
		const jobRow = jobQueue.get(job.jobId);
		expect(jobRow?.status).toBe("completed");

		// No notification should be created
		const notif = db
			.prepare("SELECT * FROM notification_events WHERE payload_json LIKE ?")
			.get(`%${posixPath}%`) as unknown;
		expect(notif).toBeUndefined();
	});
});

describe("transient retry exhaustion", () => {
	let db: ReturnType<typeof createDb>;
	let jobQueue: ReturnType<typeof createBackgroundJobQueue>;

	beforeEach(() => {
		db = createDb();
		jobQueue = createBackgroundJobQueue(db, {
			now: () => Date.now(),
			retryDelaysMs: [10, 20, 30],
		});
	});

	afterEach(() => {
		db.close();
	});

	it("enters convert_failed after max attempts exhausted", async () => {
		const testDir = path.join(WORKSPACE, "transient-exhaust");
		await fs.rm(testDir, { recursive: true, force: true });
		await fs.mkdir(testDir, { recursive: true });
		const sourcePath = path.join(testDir, "doc.pdf");
		await createTestPdf(sourcePath, "Transient test");

		const posixPath = sourcePath.replace(/\\/g, "/");
		db.prepare(
			`INSERT INTO file_processing_status (file_path, workspace_path, status, updated_at)
			 VALUES (?, ?, ?, ?)`,
		).run(posixPath, WORKSPACE, "converting", Date.now());

		// Enqueue a job with maxAttempts=1 so it exhausts immediately
		jobQueue.enqueue({
			type: "file.convert",
			relatedType: "file",
			relatedId: posixPath,
			payload: { workspaceDir: WORKSPACE },
			maxAttempts: 1,
		});

		// Claim the job to make it running
		const claimed = jobQueue.claimNext("worker-1", "file.convert");
		expect(claimed).not.toBeNull();

		// handleConversionResult with rate_limited should fail immediately since maxAttempts=1 and attempt_count=1
		const result = await handleConversionResult({
			db,
			jobQueue,
			workspaceDir: WORKSPACE,
			filePath: posixPath,
			pythonJob: {
				jobId: "mock-job",
				status: "failed",
				task: "document.markdown",
				createdAt: new Date().toISOString(),
				error: { code: "rate_limited", message: "Too many requests" },
			},
			conversionClient: createMockConversionClient(),
		});

		expect(result.success).toBe(false);

		// Status must be convert_failed, not pending
		const statusRow = db
			.prepare("SELECT status, error FROM file_processing_status WHERE file_path = ?")
			.get(posixPath) as { status: string; error: string | null } | undefined;
		expect(statusRow?.status).toBe("convert_failed");
		expect(statusRow?.error).toBeTruthy();

		// Notification must be created
		const notif = db
			.prepare("SELECT * FROM notification_events WHERE payload_json LIKE ?")
			.get(`%${posixPath}%`) as unknown;
		expect(notif).toBeDefined();
	});
});

describe("writeArtifactsToWorkspace staging + rollback", () => {
	it("preserves old artifacts when new write succeeds", async () => {
		const testDir = path.join(WORKSPACE, "staging-success");
		await fs.rm(testDir, { recursive: true, force: true });
		await fs.mkdir(testDir, { recursive: true });

		const sourcePath = path.join(testDir, "doc.pdf");
		await fs.writeFile(sourcePath, "original pdf");

		// Create existing products
		const oldMd = path.join(testDir, "doc.md");
		const oldMeta = path.join(testDir, "doc.metadata.json");
		const oldAssets = path.join(testDir, "doc.assets");
		await fs.writeFile(oldMd, "# Old markdown");
		await fs.writeFile(oldMeta, JSON.stringify({ old: true }));
		await fs.mkdir(oldAssets, { recursive: true });
		await fs.writeFile(path.join(oldAssets, "old.png"), "old image");

		const downloaded: DownloadedArtifact[] = [
			{
				artifact: {
					artifactId: "a1",
					name: "doc.md",
					mimeType: "text/markdown",
					size: 20,
					inline: true,
					content: "# New markdown",
				},
				buffer: Buffer.from("# New markdown", "utf-8"),
			},
			{
				artifact: {
					artifactId: "a2",
					name: "doc.metadata.json",
					mimeType: "application/json",
					size: 10,
					inline: true,
					content: '{"new":true}',
				},
				buffer: Buffer.from('{"new":true}', "utf-8"),
			},
		];

		// Write should succeed normally
		await writeArtifactsToWorkspace(sourcePath, WORKSPACE, downloaded);

		// Verify new products exist
		expect(await fs.readFile(oldMd, "utf-8")).toBe("# New markdown");
		const metaContent = JSON.parse(await fs.readFile(oldMeta, "utf-8"));
		expect(metaContent.new).toBe(true);
		expect(metaContent._ridge).toBeDefined();

		// Source should be archived
		const archivedPath = path.join(testDir, ".originals", "doc.pdf");
		expect(await fs.stat(archivedPath).then((s) => s.isFile(), () => false)).toBe(true);
	});

	it("cleans old assets when new artifacts have no assets", async () => {
		const testDir = path.join(WORKSPACE, "staging-no-assets");
		await fs.rm(testDir, { recursive: true, force: true });
		await fs.mkdir(testDir, { recursive: true });

		const sourcePath = path.join(testDir, "doc.pdf");
		await fs.writeFile(sourcePath, "original pdf");

		// Create old assets
		const oldAssets = path.join(testDir, "doc.assets");
		await fs.mkdir(oldAssets, { recursive: true });
		await fs.writeFile(path.join(oldAssets, "old.png"), "old image");

		// New artifacts: only md + metadata, no assets
		const downloaded: DownloadedArtifact[] = [
			{
				artifact: {
					artifactId: "a1",
					name: "doc.md",
					mimeType: "text/markdown",
					size: 20,
					inline: true,
					content: "# No assets",
				},
				buffer: Buffer.from("# No assets", "utf-8"),
			},
			{
				artifact: {
					artifactId: "a2",
					name: "doc.metadata.json",
					mimeType: "application/json",
					size: 10,
					inline: true,
					content: "{}",
				},
				buffer: Buffer.from("{}", "utf-8"),
			},
		];

		await writeArtifactsToWorkspace(sourcePath, WORKSPACE, downloaded);

		// Old assets should be cleaned, not left as empty directory
		const assetsExists = await fs.stat(oldAssets).then(() => true, () => false);
		expect(assetsExists).toBe(false);
	});

	it("supports already-archived source (logical source missing)", async () => {
		const testDir = path.join(WORKSPACE, "already-archived");
		await fs.rm(testDir, { recursive: true, force: true });
		await fs.mkdir(testDir, { recursive: true });

		const logicalSource = path.join(testDir, "doc.pdf");
		// Do NOT create logical source — it's already archived
		const originalsDir = path.join(testDir, ".originals");
		await fs.mkdir(originalsDir, { recursive: true });
		await fs.writeFile(path.join(originalsDir, "doc.pdf"), "archived pdf");

		const downloaded: DownloadedArtifact[] = [
			{
				artifact: {
					artifactId: "a1",
					name: "doc.md",
					mimeType: "text/markdown",
					size: 20,
					inline: true,
					content: "# Already archived source",
				},
				buffer: Buffer.from("# Already archived source", "utf-8"),
			},
			{
				artifact: {
					artifactId: "a2",
					name: "doc.metadata.json",
					mimeType: "application/json",
					size: 10,
					inline: true,
					content: "{}",
				},
				buffer: Buffer.from("{}", "utf-8"),
			},
		];

		// Should succeed without ENOENT because .originals/ exists
		const result = await writeArtifactsToWorkspace(logicalSource, WORKSPACE, downloaded);
		expect(result.archivedTo).toBeNull();

		// Verify new products
		expect(await fs.readFile(path.join(testDir, "doc.md"), "utf-8")).toBe("# Already archived source");

		// Verify .originals/ still intact
		expect(await fs.readFile(path.join(originalsDir, "doc.pdf"), "utf-8")).toBe("archived pdf");
	});

	it("fails when both logical source and .originals/ are missing", async () => {
		const testDir = path.join(WORKSPACE, "both-missing");
		await fs.rm(testDir, { recursive: true, force: true });
		await fs.mkdir(testDir, { recursive: true });

		const logicalSource = path.join(testDir, "doc.pdf");
		// Do NOT create logical source, do NOT create .originals/

		const downloaded: DownloadedArtifact[] = [
			{
				artifact: {
					artifactId: "a1",
					name: "doc.md",
					mimeType: "text/markdown",
					size: 20,
					inline: true,
					content: "# Missing source",
				},
				buffer: Buffer.from("# Missing source", "utf-8"),
			},
			{
				artifact: {
					artifactId: "a2",
					name: "doc.metadata.json",
					mimeType: "application/json",
					size: 10,
					inline: true,
					content: "{}",
				},
				buffer: Buffer.from("{}", "utf-8"),
			},
		];

		// Must throw because source doesn't exist anywhere
		await expect(
			writeArtifactsToWorkspace(logicalSource, WORKSPACE, downloaded),
		).rejects.toThrow("Source file not found");

		// No products should have been written
		expect(await fs.stat(path.join(testDir, "doc.md")).then(() => true, () => false)).toBe(false);
	});

	it("restores old artifacts and original file when metadata JSON.parse fails mid-commit", async () => {
		const testDir = path.join(WORKSPACE, "rollback-parse-fail");
		await fs.rm(testDir, { recursive: true, force: true });
		await fs.mkdir(testDir, { recursive: true });

		const sourcePath = path.join(testDir, "doc.pdf");
		await fs.writeFile(sourcePath, "original pdf");

		// Create existing products
		const oldMd = path.join(testDir, "doc.md");
		const oldMeta = path.join(testDir, "doc.metadata.json");
		await fs.writeFile(oldMd, "# Old markdown");
		await fs.writeFile(oldMeta, JSON.stringify({ old: true }));

		// Downloaded metadata is NOT valid JSON -> JSON.parse will fail mid-commit
		const downloaded: DownloadedArtifact[] = [
			{
				artifact: {
					artifactId: "a1",
					name: "doc.md",
					mimeType: "text/markdown",
					size: 20,
					inline: true,
					content: "# New markdown",
				},
				buffer: Buffer.from("# New markdown", "utf-8"),
			},
			{
				artifact: {
					artifactId: "a2",
					name: "doc.metadata.json",
					mimeType: "application/json",
					size: 10,
					inline: true,
					content: "NOT_VALID_JSON",
				},
				buffer: Buffer.from("NOT_VALID_JSON", "utf-8"),
			},
		];

		await expect(
			writeArtifactsToWorkspace(sourcePath, WORKSPACE, downloaded),
		).rejects.toThrow();

		// Old products must be restored
		expect(await fs.readFile(oldMd, "utf-8")).toBe("# Old markdown");
		expect(JSON.parse(await fs.readFile(oldMeta, "utf-8")).old).toBe(true);

		// Source must NOT have been moved to .originals/
		expect(await fs.readFile(sourcePath, "utf-8")).toBe("original pdf");
		expect(await fs.stat(path.join(testDir, ".originals", "doc.pdf")).then(() => true, () => false)).toBe(false);
	});

	it("aggregates Stage 2/3 rollback errors when restore also fails", async () => {
		const testDir = path.join(WORKSPACE, "rollback-aggregate");
		await fs.rm(testDir, { recursive: true, force: true });
		await fs.mkdir(testDir, { recursive: true });

		const sourcePath = path.join(testDir, "doc.pdf");
		await fs.writeFile(sourcePath, "original pdf");

		// Create existing products so backup happens
		const oldMd = path.join(testDir, "doc.md");
		const oldMeta = path.join(testDir, "doc.metadata.json");
		await fs.writeFile(oldMd, "# Old markdown");
		await fs.writeFile(oldMeta, JSON.stringify({ old: true }));

		// Downloaded metadata is NOT valid JSON -> JSON.parse will fail mid-commit
		const downloaded: DownloadedArtifact[] = [
			{
				artifact: {
					artifactId: "a1",
					name: "doc.md",
					mimeType: "text/markdown",
					size: 20,
					inline: true,
					content: "# New markdown",
				},
				buffer: Buffer.from("# New markdown", "utf-8"),
			},
			{
				artifact: {
					artifactId: "a2",
					name: "doc.metadata.json",
					mimeType: "application/json",
					size: 10,
					inline: true,
					content: "NOT_VALID_JSON",
				},
				buffer: Buffer.from("NOT_VALID_JSON", "utf-8"),
			},
		];

		// Controlled fs.rm wrapper: every call fails, so rollback cleanup
		// and restore of old products both fail.
		const originalRm = fs.rm;
		const rmSpy = vi.spyOn(fs, "rm").mockImplementation(async (...args: unknown[]) => {
			const filepath = args[0] as string;
			// Fail on any rollback rm (new product removal or tmp cleanup)
			if (filepath.includes("rollback-aggregate")) {
				throw new Error(`Simulated rm failure for ${path.basename(filepath)}`);
			}
			return originalRm(args[0] as string, args[1] as object);
		});

		try {
			await expect(
				writeArtifactsToWorkspace(sourcePath, WORKSPACE, downloaded),
			).rejects.toThrow(/Rollback failed with.*error\(s\).*Simulated rm failure/);
		} finally {
			rmSpy.mockRestore();
		}
	});

	it("restores old artifacts and original file when source is missing at both paths", async () => {
		const testDir = path.join(WORKSPACE, "rollback-source-missing");
		await fs.rm(testDir, { recursive: true, force: true });
		await fs.mkdir(testDir, { recursive: true });

		const sourcePath = path.join(testDir, "doc.pdf");
		// Do NOT create source — but create old products
		const oldMd = path.join(testDir, "doc.md");
		const oldMeta = path.join(testDir, "doc.metadata.json");
		await fs.writeFile(oldMd, "# Old markdown");
		await fs.writeFile(oldMeta, JSON.stringify({ old: true }));

		const downloaded: DownloadedArtifact[] = [
			{
				artifact: {
					artifactId: "a1",
					name: "doc.md",
					mimeType: "text/markdown",
					size: 20,
					inline: true,
					content: "# New markdown",
				},
				buffer: Buffer.from("# New markdown", "utf-8"),
			},
			{
				artifact: {
					artifactId: "a2",
					name: "doc.metadata.json",
					mimeType: "application/json",
					size: 10,
					inline: true,
					content: "{}",
				},
				buffer: Buffer.from("{}", "utf-8"),
			},
		];

		await expect(
			writeArtifactsToWorkspace(sourcePath, WORKSPACE, downloaded),
		).rejects.toThrow("Source file not found");

		// Old products must remain untouched
		expect(await fs.readFile(oldMd, "utf-8")).toBe("# Old markdown");
		expect(JSON.parse(await fs.readFile(oldMeta, "utf-8")).old).toBe(true);
	});

	it("full Stage 1 rollback when backup rename fails mid-way and restore also fails", async () => {
		const testDir = path.join(WORKSPACE, "stage1-rollback-mid");
		await fs.rm(testDir, { recursive: true, force: true });
		await fs.mkdir(testDir, { recursive: true });

		const sourcePath = path.join(testDir, "doc.pdf");
		await fs.writeFile(sourcePath, "original pdf");

		// Create existing md, meta, assets so all three backup renames are attempted
		const oldMd = path.join(testDir, "doc.md");
		const oldMeta = path.join(testDir, "doc.metadata.json");
		const oldAssets = path.join(testDir, "doc.assets");
		await fs.writeFile(oldMd, "# Old markdown");
		await fs.writeFile(oldMeta, JSON.stringify({ old: true }));
		await fs.mkdir(oldAssets, { recursive: true });
		await fs.writeFile(path.join(oldAssets, "old.png"), "old image");

		const downloaded: DownloadedArtifact[] = [
			{
				artifact: {
					artifactId: "a1",
					name: "doc.md",
					mimeType: "text/markdown",
					size: 20,
					inline: true,
					content: "# New markdown",
				},
				buffer: Buffer.from("# New markdown", "utf-8"),
			},
			{
				artifact: {
					artifactId: "a2",
					name: "doc.metadata.json",
					mimeType: "application/json",
					size: 10,
					inline: true,
					content: "{}",
				},
				buffer: Buffer.from("{}", "utf-8"),
			},
		];

		// Controlled fs wrapper: fails on 3rd rename (assets -> staging backup) and
		// also fails on 4th rename (md restore from staging) to exercise the
		// "backup partially succeeds, then restore also fails" path.
		const originalRename = fs.rename;
		let renameCount = 0;
		const renameSpy = vi.spyOn(fs, "rename").mockImplementation(async (oldPath, newPath) => {
			renameCount++;
			if (renameCount === 3) {
				// 3rd rename = assets backup into staging — force failure
				throw new Error("Simulated assets backup failure");
			}
			if (renameCount === 4) {
				// 4th rename = md restore from staging — force failure
				throw new Error("Simulated md restore failure");
			}
			return originalRename(oldPath as string, newPath as string);
		});

		try {
			await expect(
				writeArtifactsToWorkspace(sourcePath, WORKSPACE, downloaded),
			).rejects.toThrow(/Stage 1 backup failed and partial restore encountered.*Simulated md restore failure/);
		} finally {
			renameSpy.mockRestore();
		}

		// The error must contain BOTH the original backup failure AND the restore failure.
		expect(renameCount).toBeGreaterThanOrEqual(4);
	});
});

describe("worker path security", () => {
	let db: ReturnType<typeof createDb>;
	let jobQueue: ReturnType<typeof createBackgroundJobQueue>;
	let worker: ReturnType<typeof createFileConversionWorker>;

	beforeEach(() => {
		db = createDb();
		jobQueue = createBackgroundJobQueue(db, {
			now: () => Date.now(),
			retryDelaysMs: [10, 20, 30],
		});
		worker = createFileConversionWorker({
			db,
			jobQueue,
			workspaceDir: WORKSPACE,
			conversionClient: createMockConversionClient(),
			config: {
				baseUrl: "http://127.0.0.1:3000",
				apiKey: "test",
				callbackToken: "test-token",
				callbackBaseUrl: "http://127.0.0.1:3000/api/webhooks/conversion",
			},
			pollFallbackMs: 10,
			maxPollMs: 200,
		});
	});

	afterEach(() => {
		worker.stop();
		db.close();
	});

	it("rejects path outside workspace via absolute path", async () => {
		const evilPath = "/etc/passwd";
		db.prepare(
			`INSERT INTO file_processing_status (file_path, workspace_path, status, updated_at)
			 VALUES (?, ?, ?, ?)`,
		).run(evilPath, WORKSPACE, "pending", Date.now());

		const job = jobQueue.enqueue({
			type: "file.convert",
			relatedType: "file",
			relatedId: evilPath,
			payload: { workspaceDir: WORKSPACE },
			maxAttempts: 1,
		});

		const claimed = jobQueue.claimNext("worker-1", "file.convert");
		expect(claimed).not.toBeNull();

		await worker.processOne(claimed!);

		const statusRow = db
			.prepare("SELECT status, error FROM file_processing_status WHERE file_path = ?")
			.get(evilPath) as { status: string; error: string | null } | undefined;
		expect(statusRow?.status).toBe("convert_failed");
		expect(statusRow?.error).toContain("outside workspace");

		const jobRow = jobQueue.get(job.jobId);
		expect(jobRow?.status).toBe("failed");
	});

	it("rejects artifact path outside workspace via parent symlink", async () => {
		const testDir = path.join(WORKSPACE, "symlink-attack");
		await fs.rm(testDir, { recursive: true, force: true });
		await fs.mkdir(testDir, { recursive: true });

		// Create a parent directory with a symlink pointing outside workspace
		const evilParent = path.join(testDir, "evil");
		await fs.mkdir(evilParent, { recursive: true });
		// Create a symlink within evilParent that points to /tmp
		const symlinkPath = path.join(evilParent, "link");
		try { await fs.unlink(symlinkPath); } catch { /* ignore */ }
		await fs.symlink("/tmp", symlinkPath);

		// ensureWithinWorkspace should reject this
		await expect(
			writeArtifactsToWorkspace(
				path.join(symlinkPath, "doc.pdf"),
				WORKSPACE,
				[
					{
						artifact: {
							artifactId: "a1",
							name: "doc.md",
							mimeType: "text/markdown",
							size: 20,
							inline: true,
							content: "# test",
						},
						buffer: Buffer.from("# test", "utf-8"),
					},
					{
						artifact: {
							artifactId: "a2",
							name: "doc.metadata.json",
							mimeType: "application/json",
							size: 10,
							inline: true,
							content: "{}",
						},
						buffer: Buffer.from("{}", "utf-8"),
					},
				],
			),
		).rejects.toThrow("outside workspace");

		// Cleanup symlink
		await fs.unlink(symlinkPath);
	});
});

describe("downloadArtifact timeout and size constraints", () => {
	it("respects timeoutMs option", async () => {
		const client = new ConversionServiceClient({
			baseUrl: "http://127.0.0.1:1", // invalid port
			apiKey: "test",
		});

		// Should fail quickly with timeout
		const start = Date.now();
		await expect(
			client.downloadArtifact("job-1", "art-1", { timeoutMs: 100 }),
		).rejects.toThrow();
		const elapsed = Date.now() - start;
		expect(elapsed).toBeLessThan(5000); // Much less than default 60s
	});
});

describe("downloadArtifacts via artifactId fallback with real HTTP", () => {
	it("rejects oversized artifact via real fetch path", async () => {
		// Build a fake HTTP server that returns a small buffer
		const { createServer } = await import("node:http");
		const server = createServer((_req, res) => {
			res.writeHead(200, { "Content-Type": "application/octet-stream" });
			res.end(Buffer.from("small content"));
		});

		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const port = (server.address() as { port: number }).port;

		try {
			const client = new ConversionServiceClient({
				baseUrl: `http://127.0.0.1:${port}`,
				apiKey: "test",
			});

			// Job with artifact: no downloadUrl, inline=false → falls back to artifactId → /conversions/{jobId}/artifacts/{artifactId}
			const job = {
				jobId: "job-1",
				status: "succeeded" as const,
				task: "document.markdown" as const,
				createdAt: new Date().toISOString(),
				artifacts: [
					{
						artifactId: "art-1",
						name: "doc.md",
						mimeType: "text/markdown",
						size: 10,
						inline: false,
					},
				],
			};

			// This hits the real HTTP endpoint; maxSizeBytes=5 should reject because "small content" is 13 bytes
			await expect(
				client.downloadArtifacts(job, { maxSizeBytes: 5 }),
			).rejects.toThrow("exceeds max size");
		} finally {
			server.close();
		}
	});
});

describe("callbackBaseUrl not configured", () => {
	it("worker submit does not include callbackUrl when callbackBaseUrl is absent", async () => {
		const testDir = path.join(WORKSPACE, "no-callback");
		await fs.rm(testDir, { recursive: true, force: true });
		await fs.mkdir(testDir, { recursive: true });
		const sourcePath = path.join(testDir, "doc.pdf");
		await createTestPdf(sourcePath, "No callback");

		const posixPath = sourcePath.replace(/\\/g, "/");
		const db = createDb();
		const jobQueue = createBackgroundJobQueue(db, { now: () => Date.now(), retryDelaysMs: [10, 20, 30] });

		let receivedCallbackUrl: string | undefined = "SHOULD_NOT_BE_SET";

		const mockClient = {
			async createConversionWithFile(_filePath: string, req: { callbackUrl?: string }) {
				receivedCallbackUrl = req.callbackUrl;
				return {
					jobId: "mock-python-job-01",
					status: "queued" as const,
					task: "document.markdown" as const,
					createdAt: new Date().toISOString(),
				};
			},
			async getConversion() {
				return {
					jobId: "mock-python-job-01",
					status: "succeeded" as const,
					task: "document.markdown" as const,
					createdAt: new Date().toISOString(),
					completedAt: new Date().toISOString(),
					artifacts: [],
					error: null,
				};
			},
			async downloadArtifacts() {
				return [];
			},
		} as unknown as ConversionServiceClient;

		const worker = createFileConversionWorker({
			db,
			jobQueue,
			workspaceDir: WORKSPACE,
			conversionClient: mockClient,
			config: {
				baseUrl: "http://127.0.0.1:3000",
				apiKey: "test",
				callbackToken: "test-token",
				// callbackBaseUrl intentionally omitted
			},
			pollFallbackMs: 10,
			maxPollMs: 200,
		});

		db.prepare(
			`INSERT INTO file_processing_status (file_path, workspace_path, status, updated_at)
			 VALUES (?, ?, ?, ?)`,
		).run(posixPath, WORKSPACE, "pending", Date.now());

		jobQueue.enqueue({
			type: "file.convert",
			relatedType: "file",
			relatedId: posixPath,
			payload: { workspaceDir: WORKSPACE },
			maxAttempts: 2,
		});

		const claimed = jobQueue.claimNext("worker-1", "file.convert");
		expect(claimed).not.toBeNull();

		await worker.processOne(claimed!);
		worker.stop();

		// callbackUrl must be undefined when callbackBaseUrl is not configured
		expect(receivedCallbackUrl).toBeUndefined();

		db.close();
	});
});

	describe("worker symlink parent directory traversal", () => {
		let db: ReturnType<typeof createDb>;
		let jobQueue: ReturnType<typeof createBackgroundJobQueue>;
		let worker: ReturnType<typeof createFileConversionWorker>;

		beforeEach(() => {
			db = createDb();
			jobQueue = createBackgroundJobQueue(db, {
				now: () => Date.now(),
				retryDelaysMs: [10, 20, 30],
			});
			worker = createFileConversionWorker({
				db,
				jobQueue,
				workspaceDir: WORKSPACE,
				conversionClient: createMockConversionClient(),
				config: {
					baseUrl: "http://127.0.0.1:3000",
					apiKey: "test",
					callbackToken: "test-token",
					callbackBaseUrl: "http://127.0.0.1:3000/api/webhooks/conversion",
				},
				pollFallbackMs: 10,
				maxPollMs: 200,
			});
		});

		afterEach(() => {
			worker.stop();
			db.close();
		});

		it("rejects workspace parent symlink pointing outside + non-existent target", async () => {
			const testDir = path.join(WORKSPACE, "symlink-parent-attack");
			await fs.rm(testDir, { recursive: true, force: true });
			await fs.mkdir(testDir, { recursive: true });

			// Create a parent directory containing a symlink to /tmp
			const parentWithSymlink = path.join(testDir, "parent");
			await fs.mkdir(parentWithSymlink, { recursive: true });
			const symlinkPath = path.join(parentWithSymlink, "outside");
			try { await fs.unlink(symlinkPath); } catch { /* ignore */ }
			await fs.symlink("/tmp", symlinkPath);

			// The target file path is through the symlink and does NOT exist
			// This tests the "non-existent target path" branch of assertWorkspaceSafe
			const evilPath = path.join(symlinkPath, "nonexistent", "doc.pdf");
			const posixPath = evilPath.replace(/\\/g, "/");

			// Seed DB status
			db.prepare(
				`INSERT INTO file_processing_status (file_path, workspace_path, status, updated_at)
				 VALUES (?, ?, ?, ?)`,
			).run(posixPath, WORKSPACE, "pending", Date.now());

			const job = jobQueue.enqueue({
				type: "file.convert",
				relatedType: "file",
				relatedId: posixPath,
				payload: { workspaceDir: WORKSPACE },
				maxAttempts: 1,
			});

			const claimed = jobQueue.claimNext("worker-1", "file.convert");
			expect(claimed).not.toBeNull();

			await worker.processOne(claimed!);

			// Worker must reject the path and write convert_failed
			const statusRow = db
				.prepare("SELECT status, error FROM file_processing_status WHERE file_path = ?")
				.get(posixPath) as { status: string; error: string | null } | undefined;
			expect(statusRow?.status).toBe("convert_failed");
			expect(statusRow?.error).toContain("outside workspace");

			// Notification must be created
			const notif = db
				.prepare("SELECT * FROM notification_events WHERE payload_json LIKE ?")
				.get(`%${posixPath}%`) as unknown;
			expect(notif).toBeDefined();

			// Job must be failed
			const jobRow = jobQueue.get(job.jobId);
			expect(jobRow?.status).toBe("failed");

			// Cleanup symlink
			await fs.unlink(symlinkPath);
		});
	});

	describe(".originals manual convert full chain via real API", () => {
		let api: ReturnType<typeof request.agent>;
		let testJobQueue: ReturnType<typeof createBackgroundJobQueue>;

		beforeAll(async () => {
			setConversionEnabledForTesting(true);
			api = await createAuthenticatedAgent(app);
			// Inject a test-controlled jobQueue into the module singleton
			// so routes using deps.getJobQueue() observe real enqueues.
			const appDb = await getRidgeDb();
			testJobQueue = createBackgroundJobQueue(appDb, {
				now: () => Date.now(),
				retryDelaysMs: [10, 20, 30],
			});
			setJobQueueForTesting(testJobQueue);
		});

		afterAll(() => {
			setJobQueueForTesting(undefined);
		});

		it("archived source in .originals/ is converted by real POST /api/workspace/files/convert → real jobQueue → worker → filesystem", async () => {
			const testDir = path.join(WORKSPACE, "originals-api-full-chain");
			await fs.rm(testDir, { recursive: true, force: true });
			await fs.mkdir(testDir, { recursive: true });

			const logicalPath = path.join(testDir, "doc.pdf");
			const originalsDir = path.join(testDir, ".originals");
			await fs.mkdir(originalsDir, { recursive: true });
			await fs.writeFile(path.join(originalsDir, "doc.pdf"), "archived content");

			const posixPath = logicalPath.replace(/\\/g, "/");

			// Seed the REAL app DB: logical path was previously converted
			const appDb = await getRidgeDb();
			appDb.prepare(
				`INSERT INTO file_processing_status (file_path, workspace_path, status, updated_at)
				 VALUES (?, ?, ?, ?)`,
			).run(posixPath, WORKSPACE, "converted", Date.now());

			// === Real API call ===
			const res = await api
				.post("/api/workspace/files/convert")
				.send({ path: logicalPath, force: true });

			expect(res.status).toBe(200);
			expect(res.body.ok).toBe(true);
			expect(res.body.enqueued).toBe(true);

			// API must have reset status to pending in the REAL DB
			const apiStatusRow = appDb
				.prepare("SELECT status, error FROM file_processing_status WHERE file_path = ?")
				.get(posixPath) as { status: string; error: string | null } | undefined;
			expect(apiStatusRow?.status).toBe("pending");
			expect(apiStatusRow?.error).toBeNull();

			// === Verify the API enqueued a real job into the test jobQueue ===
			const moduleQueue = getJobQueueForTesting();
			expect(moduleQueue).toBe(testJobQueue);
			// The job must exist in the same queue
			const jobRow = appDb
				.prepare("SELECT job_id, status FROM background_jobs WHERE related_type = 'file' AND related_id = ? AND job_type = 'file.convert'")
				.get(posixPath) as { job_id: string; status: string } | undefined;
			expect(jobRow).toBeDefined();
			expect(jobRow!.status).toBe("pending");

			// === Worker processes the REAL enqueued job ===
			const mockClient = createMockConversionClient({
				artifacts: [
					{
						artifact: {
							artifactId: "a1",
							name: "doc.md",
							mimeType: "text/markdown",
							size: 30,
							inline: true,
							content: "# Reconverted\n\nFrom .originals/",
						},
						buffer: Buffer.from("# Reconverted\n\nFrom .originals/", "utf-8"),
					},
					{
						artifact: {
							artifactId: "a2",
							name: "doc.metadata.json",
							mimeType: "application/json",
							size: 50,
							inline: true,
							content: '{"source":"test"}',
						},
						buffer: Buffer.from('{"source":"test"}', "utf-8"),
					},
				],
			});

			const worker = createFileConversionWorker({
				db: appDb,
				jobQueue: testJobQueue,
				workspaceDir: WORKSPACE,
				conversionClient: mockClient,
				config: {
					baseUrl: "http://127.0.0.1:3000",
					apiKey: "test",
					callbackToken: "test-token",
					callbackBaseUrl: "http://127.0.0.1:3000/api/webhooks/conversion",
				},
				pollFallbackMs: 10,
				maxPollMs: 200,
			});

			const claimed = testJobQueue.claimNext("worker-1", "file.convert");
			expect(claimed).not.toBeNull();
			expect(claimed!.jobId).toBe(jobRow!.job_id);

			await worker.processOne(claimed!);
			worker.stop();

			// Status must be converted (in the REAL DB)
			const statusRow = appDb
				.prepare("SELECT status, error FROM file_processing_status WHERE file_path = ?")
				.get(posixPath) as { status: string; error: string | null } | undefined;
			expect(statusRow?.status).toBe("converted");
			expect(statusRow?.error).toBeNull();

			// New md must exist with converted content
			expect(await fs.readFile(path.join(testDir, "doc.md"), "utf-8")).toContain("Reconverted");

			// Metadata _ridge must reference logical sourcePath
			const meta = JSON.parse(await fs.readFile(path.join(testDir, "doc.metadata.json"), "utf-8"));
			expect(meta._ridge.sourcePath).toBe(posixPath);
			expect(meta._ridge.archivedTo).toBe(path.join(originalsDir, "doc.pdf").replace(/\\/g, "/"));

			// .originals/ must still contain the archived source (not moved again)
			expect(await fs.readFile(path.join(originalsDir, "doc.pdf"), "utf-8")).toBe("archived content");
		});
	});
