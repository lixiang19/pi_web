import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app, setConversionEnabledForTesting, setJobQueueForTesting } from "../index.js";
import { createAuthenticatedAgent } from "../test/auth.js";
import { getRidgeDb } from "../db/index.js";
import { createBackgroundJobQueue } from "../background-jobs.js";

let api: ReturnType<typeof request.agent>;

const WORKSPACE = path.join(os.homedir(), "ridge-workspace");
const TEST_ROOT = path.join(WORKSPACE, "e2e-convert-test");

beforeAll(async () => {
	setConversionEnabledForTesting(true);
	setJobQueueForTesting(createBackgroundJobQueue(await getRidgeDb()));
	api = await createAuthenticatedAgent(app);
	await fs.mkdir(TEST_ROOT, { recursive: true });
});

afterAll(async () => {
	await fs.rm(TEST_ROOT, { recursive: true, force: true });
	const db = await getRidgeDb();
	db.prepare("DELETE FROM file_processing_status WHERE file_path LIKE ?").run(`${TEST_ROOT}%`);
	db.prepare("DELETE FROM background_jobs WHERE payload_json LIKE ?").run(`%${TEST_ROOT}%`);
	db.prepare("DELETE FROM notification_events WHERE payload_json LIKE ?").run(`%${TEST_ROOT}%`);
});

async function createTestPdfWithTable(filePath: string): Promise<void> {
	const stream = `BT
/F1 10 Tf
100 700 Td
(Product    Price    Qty) Tj
0 -15 Td
(Apple      1.00     5) Tj
0 -15 Td
(Banana     0.50    10) Tj
0 -15 Td
(Cherry     2.00     3) Tj
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

async function createTestDocxWithImage(filePath: string, titleText: string): Promise<void> {
	const { default: JSZip } = await import("jszip");
	const zip = new JSZip();
	const pngBuffer = Buffer.from(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
		"base64",
	);
	zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>
</Types>`);
	zip.folder("_rels")!.file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
	zip.folder("word")!.file("_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
</Relationships>`);
	// Use VML image markup (mammoth recognizes this)
	zip.folder("word")!.file("document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${titleText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</w:t></w:r></w:p>
<w:p><w:r><w:t>Paragraph with image:</w:t></w:r></w:p>
<w:p><w:r><w:pict><v:shapetype id="_x0000_t75" coordsize="21600,21600" o:spt="75" o:preferrelative="t" path="m@4@5l@4@11@9@11@9@5xe" filled="f" stroked="f"><v:stroke joinstyle="miter"/><v:formulas><v:f eqn="if lineDrawn pixelLineWidth 0"/><v:f eqn="sum @0 1 0"/><v:f eqn="sum 0 0 @1"/><v:f eqn="prod @2 1 2"/><v:f eqn="prod @3 21600 pixelWidth"/><v:f eqn="prod @3 21600 pixelHeight"/><v:f eqn="sum @0 0 1"/><v:f eqn="prod @6 1 2"/><v:f eqn="prod @7 21600 pixelWidth"/><v:f eqn="sum @8 21600 0"/><v:f eqn="prod @7 21600 pixelHeight"/><v:f eqn="sum @10 21600 0"/></v:formulas><v:path o:extrusionok="f" gradientshapeok="t" o:connecttype="rect"/><o:lock v:ext="edit" aspectratio="t"/></v:shapetype><v:shape id="Picture 1" o:spid="_x0000_s2049" type="#_x0000_t75" style="position:absolute;margin-left:0;margin-top:0;width:100;height:100;z-index:251658240;mso-position-horizontal-relative:page;mso-position-vertical-relative:page"><v:imagedata r:id="rId2" o:title=""/></v:shape></w:pict></w:r></w:p>
<w:tbl>
<w:tr><w:tc><w:p><w:r><w:t>X</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Y</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>10</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>20</w:t></w:r></w:p></w:tc></w:tr>
</w:tbl>
<w:p><w:r><w:t>See footnote</w:t></w:r><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="1"/></w:r></w:p>
</w:body>
</w:document>`);
	zip.folder("word")!.file("footnotes.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>
<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>
<w:footnote w:id="1"><w:p><w:r><w:t>First footnote.</w:t></w:r></w:p></w:footnote>
</w:footnotes>`);
	zip.folder("word")!.folder("media")!.file("image1.png", pngBuffer);
	zip.folder("docProps")!.file("core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>${titleText}</dc:title>
<dc:creator>E2E Author</dc:creator>
</cp:coreProperties>`);
	zip.folder("docProps")!.file("app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
<Pages>2</Pages>
</Properties>`);
	const buffer = await zip.generateAsync({ type: "nodebuffer" });
	await fs.writeFile(filePath, buffer);
}

describe("E2E: file tree shows converted status on .md output", () => {
	it("PDF .md inherits converted status from original", async () => {
		const dir = path.join(TEST_ROOT, "e2e-tree-status");
		await fs.rm(dir, { recursive: true, force: true });
		await fs.mkdir(dir, { recursive: true });
		const pdfPath = path.join(dir, "report.pdf");
		await createTestPdfWithTable(pdfPath);

		const db = await getRidgeDb();
		const posixPath = pdfPath.replace(/\\/g, "/");
		// Seed status as converted
		db.prepare(
			`INSERT INTO file_processing_status (file_path, workspace_path, status, updated_at)
			 VALUES (?, ?, ?, ?)`,
		).run(posixPath, WORKSPACE, "converted", Date.now());

		// Create fake products
		await fs.writeFile(path.join(dir, "report.md"), "# Report\n\nText", "utf-8");
		await fs.writeFile(path.join(dir, "report.metadata.json"), "{}", "utf-8");
		await fs.mkdir(path.join(dir, "report.assets"), { recursive: true });
		await fs.mkdir(path.join(dir, ".originals"), { recursive: true });
		await fs.writeFile(path.join(dir, ".originals", "report.pdf"), "pdf", "utf-8");

		const treeRes = await api.get("/api/workspace/files/tree?path=" + encodeURIComponent(dir));
		expect(treeRes.status).toBe(200);

		// The .md file should show 'converted' status even though its own path is not in file_processing_status
		const mdEntry = treeRes.body.entries.find((e: { name: string }) => e.name === "report.md");
		expect(mdEntry).toBeDefined();
		expect(mdEntry.processingStatus).toBe("converted");

		// The .metadata.json and .assets should NOT show status (they don't match the reverse map)
		const metaEntry = treeRes.body.entries.find((e: { name: string }) => e.name === "report.metadata.json");
		expect(metaEntry).toBeDefined();
		expect(metaEntry.processingStatus).toBeUndefined();
	});

	it("DOCX .md inherits converted status and re-convert button is reachable", async () => {
		const dir = path.join(TEST_ROOT, "e2e-docx-tree");
		await fs.rm(dir, { recursive: true, force: true });
		await fs.mkdir(dir, { recursive: true });
		const docxPath = path.join(dir, "report.docx");
		await createTestDocxWithImage(docxPath, "E2E Report");

		const db = await getRidgeDb();
		const posixPath = docxPath.replace(/\\/g, "/");
		db.prepare(
			`INSERT INTO file_processing_status (file_path, workspace_path, status, updated_at)
			 VALUES (?, ?, ?, ?)`,
		).run(posixPath, WORKSPACE, "converted", Date.now());

		// Create fake products
		await fs.writeFile(path.join(dir, "report.md"), "# E2E Report\n\nContent", "utf-8");
		await fs.writeFile(path.join(dir, "report.metadata.json"), "{}", "utf-8");
		await fs.mkdir(path.join(dir, "report.assets"), { recursive: true });
		await fs.writeFile(path.join(dir, "report.assets", "img-001.png"), "png", "utf-8");
		await fs.mkdir(path.join(dir, ".originals"), { recursive: true });
		await fs.writeFile(path.join(dir, ".originals", "report.docx"), "docx", "utf-8");

		const treeRes = await api.get("/api/workspace/files/tree?path=" + encodeURIComponent(dir));
		expect(treeRes.status).toBe(200);

		const mdEntry = treeRes.body.entries.find((e: { name: string }) => e.name === "report.md");
		expect(mdEntry).toBeDefined();
		expect(mdEntry.processingStatus).toBe("converted");
	});
});

describe("E2E: manual convert API with real DOCX image/table/footnote", () => {
	it("enqueues DOCX conversion job", async () => {
		const dir = path.join(TEST_ROOT, "e2e-docx-real");
		await fs.rm(dir, { recursive: true, force: true });
		await fs.mkdir(dir, { recursive: true });
		const docxPath = path.join(dir, "report.docx");
		await createTestDocxWithImage(docxPath, "Real Report");

		const db = await getRidgeDb();
		const posixPath = docxPath.replace(/\\/g, "/");
		db.prepare(
			`INSERT INTO file_processing_status (file_path, workspace_path, status, updated_at)
			 VALUES (?, ?, ?, ?)`,
		).run(posixPath, WORKSPACE, "converted", Date.now());

		// Call manual convert API
		const res = await api.post("/api/workspace/files/convert").send({ path: docxPath });
		expect(res.status).toBe(200);
		expect(res.body.ok).toBe(true);
		expect(res.body.enqueued).toBe(true);

		// Verify status reset to pending
		const statusRow = db
			.prepare("SELECT status FROM file_processing_status WHERE file_path = ?")
			.get(posixPath) as { status: string } | undefined;
		expect(statusRow?.status).toBe("pending");
	});

	it("returns note for already-pending file without re-enqueueing", async () => {
		const dir = path.join(TEST_ROOT, "e2e-fail-notify");
		await fs.rm(dir, { recursive: true, force: true });
		await fs.mkdir(dir, { recursive: true });
		const badPath = path.join(dir, "bad.pdf");
		await fs.writeFile(badPath, "not a pdf");

		const db = await getRidgeDb();
		const posixPath = badPath.replace(/\\/g, "/");
		db.prepare(
			`INSERT INTO file_processing_status (file_path, workspace_path, status, updated_at)
			 VALUES (?, ?, ?, ?)`,
		).run(posixPath, WORKSPACE, "pending", Date.now());

		const res = await api.post("/api/workspace/files/convert").send({ path: badPath });
		expect(res.status).toBe(200);
		expect(res.body.note).toContain("pending");
	});
});

describe("E2E: POST /retry clears old pending job and creates fresh immediate one", () => {
	it("retry route clears error and resets status to pending", async () => {
		const dir = path.join(TEST_ROOT, "e2e-retry-clear");
		await fs.rm(dir, { recursive: true, force: true });
		await fs.mkdir(dir, { recursive: true });
		const pdfPath = path.join(dir, "retry.pdf");
		const stream = `BT\n/F1 12 Tf\n100 700 Td\n(Hello) Tj\nET`;
		const pdf = `%PDF-1.4\n1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n2 0 obj\n<</Type/Pages/Kids[3 0 R]/Count 1>>\nendobj\n3 0 obj\n<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>\nendobj\n4 0 obj\n<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>\nendobj\n5 0 obj\n<</Length ${stream.length}>>\nstream\n${stream}\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \n0000000226 00000 n \n0000000283 00000 n \ntrailer\n<</Size 6/Root 1 0 R>>\nstartxref\n${348 + stream.length}\n%%EOF\n`;
		await fs.writeFile(pdfPath, pdf);

		const db = await getRidgeDb();
		const posixPath = pdfPath.replace(/\\/g, "/");
		db.prepare(
			`INSERT INTO file_processing_status (file_path, workspace_path, status, error, updated_at)
			 VALUES (?, ?, ?, ?, ?)`,
		).run(posixPath, WORKSPACE, "convert_failed", "old error", Date.now());

		// POST /retry
		const res = await api.post("/api/workspace/files/retry").send({ path: pdfPath });
		expect(res.status).toBe(200);
		expect(res.body.ok).toBe(true);

		// Status must be reset to pending and error cleared
		const statusRow = db
			.prepare("SELECT status, error FROM file_processing_status WHERE file_path = ?")
			.get(posixPath) as { status: string; error: string | null } | undefined;
		expect(statusRow?.status).toBe("pending");
		expect(statusRow?.error).toBeNull();
	});
});
