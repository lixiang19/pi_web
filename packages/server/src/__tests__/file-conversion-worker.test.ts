import Database from "better-sqlite3";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RIDGE_DB_BOOTSTRAP_SQL } from "../db/migrations.js";
import { createBackgroundJobQueue } from "../background-jobs.js";
import {
	createFileConversionWorker,
	handleConversionResult,
} from "../file-conversion-worker.js";
import {
	ConversionServiceClient,
	type DownloadedArtifact,
} from "../conversion-service-client.js";

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

describe("file conversion worker", () => {
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

	afterEach(async () => {
		worker.stop();
		db.close();
	});

	it("processes a file.convert job successfully via mock Python service", async () => {
		const testDir = path.join(WORKSPACE, "worker-success");
		await fs.rm(testDir, { recursive: true, force: true });
		await fs.mkdir(testDir, { recursive: true });
		const sourcePath = path.join(testDir, "doc.pdf");
		await createTestPdf(sourcePath, "Worker test");

		const posixPath = sourcePath.replace(/\\/g, "/");
		db.prepare(
			`INSERT INTO file_processing_status (
				file_path, workspace_path, status, updated_at
			) VALUES (?, ?, ?, ?)`,
		).run(posixPath, WORKSPACE, "pending", Date.now());

		const job = jobQueue.enqueue({
			type: "file.convert",
			relatedType: "file",
			relatedId: posixPath,
			payload: { sourcePath: posixPath, workspaceDir: WORKSPACE },
			maxAttempts: 2,
		});

		const claimed = jobQueue.claimNext("worker-1", "file.convert");
		expect(claimed).not.toBeNull();
		expect(claimed!.jobId).toBe(job.jobId);

		// Patch processOne to log errors
		try {
			await worker.processOne(claimed!);
		} catch (e) {
			console.error("processOne threw:", e);
			throw e;
		}

		const statusRow = db
			.prepare("SELECT status, error FROM file_processing_status WHERE file_path = ?")
			.get(posixPath) as { status: string; error: string | null } | undefined;
		expect(statusRow?.status).toBe("converted");
		expect(statusRow?.error).toBeNull();

		const mdPath = path.join(testDir, "doc.md");
		expect(await fs.stat(mdPath).then((s) => s.isFile(), () => false)).toBe(true);

		const metaPath = path.join(testDir, "doc.metadata.json");
		expect(await fs.stat(metaPath).then((s) => s.isFile(), () => false)).toBe(true);

		const archivedPath = path.join(testDir, ".originals", "doc.pdf");
		expect(await fs.stat(archivedPath).then((s) => s.isFile(), () => false)).toBe(true);
	});

	it("sets convert_failed when Python service reports failed", async () => {
		const testDir = path.join(WORKSPACE, "worker-fail");
		await fs.rm(testDir, { recursive: true, force: true });
		await fs.mkdir(testDir, { recursive: true });
		const sourcePath = path.join(testDir, "bad.pdf");
		await fs.writeFile(sourcePath, "not a pdf");

		const posixPath = sourcePath.replace(/\\/g, "/");
		db.prepare(
			`INSERT INTO file_processing_status (
				file_path, workspace_path, status, updated_at
			) VALUES (?, ?, ?, ?)`,
		).run(posixPath, WORKSPACE, "pending", Date.now());

		const failClient = createMockConversionClient({
			finalStatus: "failed",
			artifacts: [],
		});
		const failWorker = createFileConversionWorker({
			db,
			jobQueue,
			workspaceDir: WORKSPACE,
			conversionClient: failClient,
			config: {
				baseUrl: "http://127.0.0.1:3000",
				apiKey: "test",
				callbackToken: "test-token",
				callbackBaseUrl: "http://127.0.0.1:3000/api/webhooks/conversion",
			},
			pollFallbackMs: 10,
			maxPollMs: 200,
		});

		const job = jobQueue.enqueue({
			type: "file.convert",
			relatedType: "file",
			relatedId: posixPath,
			payload: { sourcePath: posixPath, workspaceDir: WORKSPACE },
			maxAttempts: 1,
		});

		const claimed = jobQueue.claimNext("worker-1", "file.convert");
		expect(claimed!.jobId).toBe(job.jobId);

		await failWorker.processOne(claimed!);
		failWorker.stop();

		const statusRow = db
			.prepare("SELECT status, error FROM file_processing_status WHERE file_path = ?")
			.get(posixPath) as { status: string; error: string | null } | undefined;
		expect(statusRow?.status).toBe("convert_failed");
		expect(statusRow?.error).toBeTruthy();

		expect(await fs.stat(sourcePath).then((s) => s.isFile(), () => false)).toBe(true);
	});

	it("does nothing when file_processing_status record is missing", async () => {
		const testDir = path.join(WORKSPACE, "worker-no-status");
		await fs.rm(testDir, { recursive: true, force: true });
		await fs.mkdir(testDir, { recursive: true });
		const sourcePath = path.join(testDir, "orphan.pdf");
		await createTestPdf(sourcePath, "Orphan");

		const posixPath = sourcePath.replace(/\\/g, "/");

		const job = jobQueue.enqueue({
			type: "file.convert",
			relatedType: "file",
			relatedId: posixPath,
			payload: { sourcePath: posixPath, workspaceDir: WORKSPACE },
			maxAttempts: 1,
		});

		const claimed = jobQueue.claimNext("worker-1", "file.convert");
		expect(claimed!.jobId).toBe(job.jobId);

		await worker.processOne(claimed!);

		const row = db
			.prepare("SELECT * FROM file_processing_status WHERE file_path = ?")
			.get(posixPath) as unknown;
		expect(row).toBeUndefined();
	});

	it("fails job when status is convert_failed (worker cannot auto-retry)", async () => {
		const testDir = path.join(WORKSPACE, "worker-no-auto-retry");
		await fs.rm(testDir, { recursive: true, force: true });
		await fs.mkdir(testDir, { recursive: true });
		const sourcePath = path.join(testDir, "retry.pdf");
		await createTestPdf(sourcePath, "Retry me");

		const posixPath = sourcePath.replace(/\\/g, "/");
		db.prepare(
			`INSERT INTO file_processing_status (
				file_path, workspace_path, status, error, updated_at
			) VALUES (?, ?, ?, ?, ?)`,
		).run(posixPath, WORKSPACE, "convert_failed", "Previous error", Date.now());

		const job = jobQueue.enqueue({
			type: "file.convert",
			relatedType: "file",
			relatedId: posixPath,
			payload: { sourcePath: posixPath, workspaceDir: WORKSPACE },
			maxAttempts: 1,
		});

		const claimed = jobQueue.claimNext("worker-1", "file.convert");
		expect(claimed!.jobId).toBe(job.jobId);

		await worker.processOne(claimed!);

		const updatedJob = jobQueue.get(job.jobId);
		expect(updatedJob?.status).toBe("failed");

		const statusRow = db
			.prepare("SELECT status, error FROM file_processing_status WHERE file_path = ?")
			.get(posixPath) as { status: string; error: string | null } | undefined;
		expect(statusRow?.status).toBe("convert_failed");
		expect(statusRow?.error).toBe("Previous error");
	});

	it("retry enqueue replaces old delayed pending job so it runs immediately", async () => {
		const testDir = path.join(WORKSPACE, "worker-retry-replace");
		await fs.rm(testDir, { recursive: true, force: true });
		await fs.mkdir(testDir, { recursive: true });
		const sourcePath = path.join(testDir, "replace.pdf");
		await createTestPdf(sourcePath, "Replace me");

		const posixPath = sourcePath.replace(/\\/g, "/");
		db.prepare(
			`INSERT INTO file_processing_status (
				file_path, workspace_path, status, error, updated_at
			) VALUES (?, ?, ?, ?, ?)`,
		).run(posixPath, WORKSPACE, "convert_failed", "Old error", Date.now());

		const oldJob = jobQueue.enqueue({
			type: "file.convert",
			relatedType: "file",
			relatedId: posixPath,
			payload: { sourcePath: posixPath, workspaceDir: WORKSPACE },
			maxAttempts: 3,
		});
		db.prepare(
			`UPDATE background_jobs SET status = 'failed', next_retry_at = ?, updated_at = ? WHERE job_id = ?`,
		).run(Date.now() + 999_999, Date.now(), oldJob.jobId);

		jobQueue.cancel({ type: "file.convert", relatedType: "file", relatedId: posixPath });
		const newJob = jobQueue.enqueue({
			type: "file.convert",
			relatedType: "file",
			relatedId: posixPath,
			payload: { sourcePath: posixPath, workspaceDir: WORKSPACE },
			maxAttempts: 3,
		});

		expect(jobQueue.get(oldJob.jobId)).toBeNull();

		const claimed = jobQueue.claimNext("worker-1", "file.convert");
		expect(claimed).not.toBeNull();
		expect(claimed!.jobId).toBe(newJob.jobId);
		expect(claimed!.status).toBe("running");
	});

	it("handleConversionResult is idempotent for same file", async () => {
		const testDir = path.join(WORKSPACE, "worker-idempotent");
		await fs.rm(testDir, { recursive: true, force: true });
		await fs.mkdir(testDir, { recursive: true });
		const sourcePath = path.join(testDir, "idempotent.pdf");
		await createTestPdf(sourcePath, "Idempotent test");

		const posixPath = sourcePath.replace(/\\/g, "/");
		db.prepare(
			`INSERT INTO file_processing_status (
				file_path, workspace_path, status, updated_at
			) VALUES (?, ?, ?, ?)`,
		).run(posixPath, WORKSPACE, "converting", Date.now());

		const client = createMockConversionClient();
		const pythonJob = await client.getConversion("any");

		const first = await handleConversionResult({
			db,
			jobQueue,
			workspaceDir: WORKSPACE,
			filePath: posixPath,
			pythonJob,
			conversionClient: client,
		});
		expect(first.success).toBe(true);

		// Second call should be no-op (幂等)
		const second = await handleConversionResult({
			db,
			jobQueue,
			workspaceDir: WORKSPACE,
			filePath: posixPath,
			pythonJob,
			conversionClient: client,
		});
		expect(second.success).toBe(true);
	});
});
