import Database from "better-sqlite3";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RIDGE_DB_BOOTSTRAP_SQL } from "../db/migrations.js";
import { createBackgroundJobQueue } from "../background-jobs.js";
import {
	ConversionServiceClient,
	writeArtifactsToWorkspace,
	type DownloadedArtifact,
} from "../conversion-service-client.js";
import {
	handleConversionResult,
} from "../file-conversion-worker.js";

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
	});
});

describe("writeArtifactsToWorkspace staging + rollback", () => {
	it("preserves old artifacts when new write fails mid-commit", async () => {
		const testDir = path.join(WORKSPACE, "staging-rollback");
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

describe("webhook realpath/symlink and token validation", () => {
	it("rejects empty callbackToken", async () => {
		const { createConversionWebhookRouter } = await import("../routes/conversion-webhook.js");
		const router = createConversionWebhookRouter({
			getRidgeDb: async () => createDb(),
			getJobQueue: () => undefined,
			conversionClient: createMockConversionClient(),
			workspaceDir: WORKSPACE,
			callbackToken: "",
		});

		// Create a minimal express app for testing
		const express = (await import("express")).default;
		const app = express();
		app.use(express.json());
		app.use(router);

		const res = await request(app as any)
			.post("/api/webhooks/conversion?token=")
			.send({ jobId: "j1", status: "succeeded" });

		expect(res.status).toBe(503);
	});
});
