import express from "express";
import multer from "multer";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createWorkspaceDataRouter } from "../routes/workspace-data.js";
import { createFileManager } from "../file-manager.js";
import { getRidgeDb } from "../db/index.js";

const WORKSPACE = path.join(os.homedir(), "ridge-workspace");
const TEST_ROOT = path.join(WORKSPACE, "upload-convert-router-test");

const upload = multer({ storage: multer.memoryStorage() });

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

describe("upload route enqueues conversion job for PDF/DOCX", () => {
	let api: ReturnType<typeof request.agent>;
	const enqueuedJobs: Array<{ type: string; relatedId: string; payload: Record<string, unknown> }> = [];
	let mockJobQueue: ReturnType<typeof import("../background-jobs.js").createBackgroundJobQueue>;

	beforeAll(async () => {
		await fs.mkdir(TEST_ROOT, { recursive: true });

		mockJobQueue = {
			enqueue: (input: { type: string; relatedType?: string; relatedId?: string; payload?: unknown }) => {
				enqueuedJobs.push({
					type: input.type,
					relatedId: input.relatedId ?? "",
					payload: (input.payload ?? {}) as Record<string, unknown>,
				});
				return { jobId: `job-${Date.now()}` };
			},
		} as unknown as ReturnType<typeof import("../background-jobs.js").createBackgroundJobQueue>;

		const fileManager = createFileManager({
			defaultWorkspaceDir: TEST_ROOT,
			ensureManagedProjectScope: async () => {},
		});

		const router = createWorkspaceDataRouter({
			defaultWorkspaceDir: TEST_ROOT,
			fileManager,
			openWithDefaultApp: async () => {},
			upload,
			getJobQueue: () => mockJobQueue,
			isConversionEnabled: () => true,
			fileEntryCreateSchema: {
				parse: (data: unknown) => {
					const d = data as Record<string, unknown>;
					return {
						root: d.root,
						directory: d.directory,
						name: d.name,
						kind: d.kind as "file" | "directory",
					};
				},
			},
			fileEntryMoveSchema: {
				parse: (data: unknown) => {
					const d = data as Record<string, unknown>;
					return {
						root: d.root,
						path: d.path,
						targetDirectory: d.targetDirectory,
						name: d.name,
					};
				},
			},
			fileContentQuerySchema: {
				parse: (data: unknown) => {
					const d = data as Record<string, unknown>;
					return {
						root: typeof d.root === "string" ? d.root : undefined,
						path: typeof d.path === "string" ? d.path : undefined,
					};
				},
			},
			fileOpenSchema: {
				parse: (data: unknown) => {
					const d = data as Record<string, unknown>;
					return {
						root: String(d.root ?? ""),
						path: String(d.path ?? ""),
					};
				},
			},
		});

		const app = express();
		app.use(router);
		api = request.agent(app);
	});

	afterAll(async () => {
		await fs.rm(TEST_ROOT, { recursive: true, force: true });
		const db = await getRidgeDb();
		db.prepare("DELETE FROM file_processing_status WHERE file_path LIKE ?").run(`${TEST_ROOT}%`);
	});

	beforeEach(() => {
		enqueuedJobs.length = 0;
	});

	it("enqueues file.convert for PDF upload", async () => {
		const targetDir = path.join(TEST_ROOT, "router-pdf");
		await fs.rm(targetDir, { recursive: true, force: true });
		await fs.mkdir(targetDir, { recursive: true });
		const tmpDir = path.join(TEST_ROOT, "tmp-router-pdf");
		await fs.mkdir(tmpDir, { recursive: true });
		const pdfPath = path.join(tmpDir, `report-${Date.now()}.pdf`);
		await createTestPdf(pdfPath, "Hello");

		const res = await api
			.post("/api/files/upload")
			.field("root", TEST_ROOT)
			.field("directory", targetDir)
			.attach("files", pdfPath);

		expect(res.status).toBe(201);
		expect(enqueuedJobs).toHaveLength(1);
		expect(enqueuedJobs[0].type).toBe("file.convert");
		expect(enqueuedJobs[0].payload.sourcePath).toBe(res.body.entries[0].path);
	});

	it("enqueues file.convert for DOCX upload", async () => {
		const targetDir = path.join(TEST_ROOT, "router-docx");
		await fs.rm(targetDir, { recursive: true, force: true });
		await fs.mkdir(targetDir, { recursive: true });
		const tmpDir = path.join(TEST_ROOT, "tmp-router-docx");
		await fs.mkdir(tmpDir, { recursive: true });
		const docxPath = path.join(tmpDir, `report-${Date.now()}.docx`);
		const { default: JSZip } = await import("jszip");
		const zip = new JSZip();
		zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
		zip.folder("_rels")!.file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
		zip.folder("word")!.file("document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello</w:t></w:r></w:p></w:body></w:document>`);
		const buf = await zip.generateAsync({ type: "nodebuffer" });
		await fs.writeFile(docxPath, buf);

		const res = await api
			.post("/api/files/upload")
			.field("root", TEST_ROOT)
			.field("directory", targetDir)
			.attach("files", docxPath);

		expect(res.status).toBe(201);
		expect(enqueuedJobs).toHaveLength(1);
		expect(enqueuedJobs[0].type).toBe("file.convert");
	});

	it("enqueues file.convert for TXT upload (txt is convertible)", async () => {
		const targetDir = path.join(TEST_ROOT, "router-txt");
		await fs.rm(targetDir, { recursive: true, force: true });
		await fs.mkdir(targetDir, { recursive: true });
		const tmpDir = path.join(TEST_ROOT, "tmp-router-txt");
		await fs.mkdir(tmpDir, { recursive: true });
		const txtPath = path.join(tmpDir, `readme-${Date.now()}.txt`);
		await fs.writeFile(txtPath, "hello");

		const res = await api
			.post("/api/files/upload")
			.field("root", TEST_ROOT)
			.field("directory", targetDir)
			.attach("files", txtPath);

		expect(res.status).toBe(201);
		expect(enqueuedJobs).toHaveLength(1);
		expect(enqueuedJobs[0].type).toBe("file.convert");
	});

	it("does NOT enqueue when isConversionEnabled returns false", async () => {
		const targetDir = path.join(TEST_ROOT, "router-disabled");
		await fs.rm(targetDir, { recursive: true, force: true });
		await fs.mkdir(targetDir, { recursive: true });
		const tmpDir = path.join(TEST_ROOT, "tmp-router-disabled");
		await fs.mkdir(tmpDir, { recursive: true });
		const pdfPath = path.join(tmpDir, `disabled-${Date.now()}.pdf`);
		await fs.writeFile(pdfPath, "%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\nxref\n0 2\n0000000000 65535 f\n0000000009 00000 n\ntrailer\n<<\n/Size 2\n/Root 1 0 R\n>>\nstartxref\n42\n%%EOF\n");

		// Rebuild router with isConversionEnabled returning false
		const fileManager = createFileManager({
			defaultWorkspaceDir: TEST_ROOT,
			ensureManagedProjectScope: async () => {},
		});
		const disabledRouter = createWorkspaceDataRouter({
			defaultWorkspaceDir: TEST_ROOT,
			fileManager,
			openWithDefaultApp: async () => {},
			upload,
			getJobQueue: () => mockJobQueue,
			isConversionEnabled: () => false,
			fileEntryCreateSchema: {
				parse: (data: unknown) => {
					const d = data as Record<string, unknown>;
					return {
						root: d.root,
						directory: d.directory,
						name: d.name,
						kind: d.kind as "file" | "directory",
					};
				},
			},
			fileEntryMoveSchema: {
				parse: (data: unknown) => {
					const d = data as Record<string, unknown>;
					return {
						root: d.root,
						path: d.path,
						targetDirectory: d.targetDirectory,
						name: d.name,
					};
				},
			},
			fileContentQuerySchema: {
				parse: (data: unknown) => {
					const d = data as Record<string, unknown>;
					return {
						root: typeof d.root === "string" ? d.root : undefined,
						path: typeof d.path === "string" ? d.path : undefined,
					};
				},
			},
			fileOpenSchema: {
				parse: (data: unknown) => {
					const d = data as Record<string, unknown>;
					return {
						root: String(d.root ?? ""),
						path: String(d.path ?? ""),
					};
				},
			},
		});

		const disabledApp = express();
		disabledApp.use(disabledRouter);
		const disabledApi = request.agent(disabledApp);

		const beforeCount = enqueuedJobs.length;
		const res = await disabledApi
			.post("/api/files/upload")
			.field("root", TEST_ROOT)
			.field("directory", targetDir)
			.attach("files", pdfPath);

		expect(res.status).toBe(201);
		expect(enqueuedJobs.length).toBe(beforeCount);
	});
});
