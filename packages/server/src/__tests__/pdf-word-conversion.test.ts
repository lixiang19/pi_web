import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	convertFileToStandard,
	isConvertibleExtension,
} from "../file-converter.js";

const WORKSPACE = path.join(os.homedir(), "ridge-workspace");
const TEST_ROOT = path.join(WORKSPACE, "conversion-test");

async function ensureCleanDir(dir: string) {
	await fs.rm(dir, { recursive: true, force: true });
	await fs.mkdir(dir, { recursive: true });
}

/**
 * Create a minimal valid PDF with text content.
 * This is a very basic PDF with one page.
 */
async function createTestPdf(filePath: string, text: string): Promise<void> {
	// Use a simple PDF template approach via pdf2md itself by writing
	// a minimal PDF that has text stream. A simpler approach for tests:
	// write a fake PDF header; pdf2md may or may not parse it, but we
	// also want real parsing. We will use a real approach: write a
	// markdown file and test the conversion abstraction layer.
	// For real PDF testing, we write a simple PDF with text stream.
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

/**
 * Create a minimal docx by zipping XML with real core properties, footnotes, and tables.
 */
async function createTestDocx(filePath: string, titleText: string): Promise<void> {
	const { default: JSZip } = await import("jszip");
	const zip = new JSZip();
	zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
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
</Relationships>`);
	zip.folder("word")!.file("document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${titleText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</w:t></w:r></w:p>
<w:p><w:r><w:t>Paragraph one.</w:t></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="ListParagraph"/></w:pPr><w:r><w:t>Bullet item</w:t></w:r></w:p>
<w:tbl>
<w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>2</w:t></w:r></w:p></w:tc></w:tr>
</w:tbl>
<w:p><w:r><w:t>See footnote</w:t></w:r><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="1"/></w:r></w:p>
</w:body>
</w:document>`);
	zip.folder("word")!.file("footnotes.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>
<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>
<w:footnote w:id="1"><w:p><w:r><w:t>First footnote text.</w:t></w:r></w:p></w:footnote>
</w:footnotes>`);
	zip.folder("docProps")!.file("core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${titleText}</dc:title>
<dc:creator>Test Author</dc:creator>
</cp:coreProperties>`);
	zip.folder("docProps")!.file("app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
<Pages>3</Pages>
</Properties>`);
	const buffer = await zip.generateAsync({ type: "nodebuffer" });
	await fs.writeFile(filePath, buffer);
}

describe("isConvertibleExtension", () => {
	it("returns true for pdf and docx", () => {
		expect(isConvertibleExtension(".pdf")).toBe(true);
		expect(isConvertibleExtension(".docx")).toBe(true);
	});
	it("returns false for other extensions", () => {
		expect(isConvertibleExtension(".txt")).toBe(false);
		expect(isConvertibleExtension(".md")).toBe(false);
		expect(isConvertibleExtension(".png")).toBe(false);
	});
});

describe("convertFileToStandard — PDF", () => {
	it("creates all four product artifacts for a PDF", async () => {
		const dir = path.join(TEST_ROOT, "pdf-artifacts");
		await ensureCleanDir(dir);
		const sourcePath = path.join(dir, "paper.pdf");
		await createTestPdf(sourcePath, "Hello PDF World");

		const result = await convertFileToStandard({
			sourcePath,
			workspaceDir: WORKSPACE,
		});

		expect(result.ok).toBe(true);
		expect(result.error).toBeUndefined();

		// .md
		const mdPath = path.join(dir, "paper.md");
		const mdExists = await fs.stat(mdPath).then((s) => s.isFile(), () => false);
		expect(mdExists).toBe(true);
		const mdContent = await fs.readFile(mdPath, "utf-8");
		expect(typeof mdContent).toBe("string");

		// .assets/
		const assetsDir = path.join(dir, "paper.assets");
		const assetsExists = await fs.stat(assetsDir).then((s) => s.isDirectory(), () => false);
		expect(assetsExists).toBe(true);

		// .metadata.json
		const metaPath = path.join(dir, "paper.metadata.json");
		const metaExists = await fs.stat(metaPath).then((s) => s.isFile(), () => false);
		expect(metaExists).toBe(true);
		const meta = JSON.parse(await fs.readFile(metaPath, "utf-8")) as Record<string, unknown>;
		expect(meta.sourceType).toBe("pdf");
		expect(typeof meta.title).toBe("string");
		expect(typeof meta.pages).toBe("number");
		expect(meta.convertedAt).toBeTruthy();
		expect(meta.sourceHash).toBeTruthy();
		// Metadata should have sourceHash for edit detection
		expect(typeof meta.sourceHash).toBe("string");
		expect((meta.sourceHash as string).length).toBe(64); // SHA-256 hex
		// Footnote/endnote are null because pdfnano does not expose them (not fabricated as 0)
		expect(meta.footnotes).toBeNull();
		expect(meta.endnotes).toBeNull();

		// .originals/
		const originalsDir = path.join(dir, ".originals");
		const originalsExists = await fs.stat(originalsDir).then((s) => s.isDirectory(), () => false);
		expect(originalsExists).toBe(true);
		const archivedPdf = path.join(originalsDir, "paper.pdf");
		const archivedExists = await fs.stat(archivedPdf).then((s) => s.isFile(), () => false);
		expect(archivedExists).toBe(true);
	});

	it("preserves original file when conversion fails", async () => {
		const dir = path.join(TEST_ROOT, "pdf-fail");
		await ensureCleanDir(dir);
		const sourcePath = path.join(dir, "bad.pdf");
		// Write intentionally broken PDF
		await fs.writeFile(sourcePath, "this is not a pdf");

		const result = await convertFileToStandard({
			sourcePath,
			workspaceDir: WORKSPACE,
		});

		expect(result.ok).toBe(false);
		expect(result.error).toBeTruthy();

		// Original must still exist at source path
		const originalExists = await fs.stat(sourcePath).then((s) => s.isFile(), () => false);
		expect(originalExists).toBe(true);

		// No products should exist
		const mdPath = path.join(dir, "bad.md");
		expect(await fs.stat(mdPath).then(() => true, () => false)).toBe(false);
	});
});

describe("convertFileToStandard — Word", () => {
	it("creates all four product artifacts for a docx", async () => {
		const dir = path.join(TEST_ROOT, "word-artifacts");
		await ensureCleanDir(dir);
		const sourcePath = path.join(dir, "report.docx");
		await createTestDocx(sourcePath, "Annual Report");

		const result = await convertFileToStandard({
			sourcePath,
			workspaceDir: WORKSPACE,
		});

		expect(result.ok).toBe(true);
		expect(result.error).toBeUndefined();

		// .md
		const mdPath = path.join(dir, "report.md");
		const mdExists = await fs.stat(mdPath).then((s) => s.isFile(), () => false);
		expect(mdExists).toBe(true);
		const mdContent = await fs.readFile(mdPath, "utf-8");
		expect(mdContent.length).toBeGreaterThan(0);

		// .assets/
		const assetsDir = path.join(dir, "report.assets");
		const assetsExists = await fs.stat(assetsDir).then((s) => s.isDirectory(), () => false);
		expect(assetsExists).toBe(true);

		// .metadata.json
		const metaPath = path.join(dir, "report.metadata.json");
		const metaExists = await fs.stat(metaPath).then((s) => s.isFile(), () => false);
		expect(metaExists).toBe(true);
		const meta = JSON.parse(await fs.readFile(metaPath, "utf-8")) as Record<string, unknown>;
		expect(meta.sourceType).toBe("docx");

		// Real document properties extracted from core XML
		expect(meta.title).toBe("Annual Report");
		expect(meta.author).toBe("Test Author");
		expect(meta.pages).toBe(3);
		expect(meta.tables).toBe(1);
		expect(meta.footnotes).toBe(1); // 3 total - 1 separator - 1 continuationSeparator = 1 real footnote
		expect(meta.endnotes).toBe(0);

		// .originals/
		const originalsDir = path.join(dir, ".originals");
		const archivedDocx = path.join(originalsDir, "report.docx");
		expect(await fs.stat(archivedDocx).then((s) => s.isFile(), () => false)).toBe(true);
	});

	it("preserves headings, lists and tables in docx markdown", async () => {
		const dir = path.join(TEST_ROOT, "word-structure");
		await ensureCleanDir(dir);
		const sourcePath = path.join(dir, "structured.docx");
		await createTestDocx(sourcePath, "Heading Text");

		const result = await convertFileToStandard({
			sourcePath,
			workspaceDir: WORKSPACE,
		});

		expect(result.ok).toBe(true);
		const mdPath = path.join(dir, "structured.md");
		const mdContent = await fs.readFile(mdPath, "utf-8");

		// Should contain heading marker (#)
		expect(mdContent).toMatch(/#+\s/);
		// Tables should be preserved as Markdown table or [TABLE] marker
		expect(mdContent).toMatch(/\|.*A.*\|.*B.*\||\*\*\[TABLE\]\*\*/);
		// Content must be present
		expect(mdContent).toContain("Heading Text");
		expect(mdContent).toContain("Paragraph one");
		expect(mdContent).toContain("Bullet item");
	});
});

describe("convertFileToStandard — edit guard", () => {
	it("refuses to overwrite user-edited markdown", async () => {
		const dir = path.join(TEST_ROOT, "edit-guard");
		await ensureCleanDir(dir);
		const sourcePath = path.join(dir, "draft.pdf");
		await createTestPdf(sourcePath, "Original text");

		// First conversion
		const first = await convertFileToStandard({
			sourcePath,
			workspaceDir: WORKSPACE,
		});
		expect(first.ok).toBe(true);

		// Simulate user editing the markdown
		const mdPath = path.join(dir, "draft.md");
		await fs.writeFile(mdPath, "# User edited\n\nThis is modified.");

		// Copy original back from .originals for re-conversion
		const archivedPath = path.join(dir, ".originals", "draft.pdf");
		await fs.copyFile(archivedPath, sourcePath);

		// Re-convert with force=false should refuse
		const second = await convertFileToStandard({
			sourcePath,
			workspaceDir: WORKSPACE,
			force: false,
		});
		expect(second.ok).toBe(false);
		expect(second.skipped).toBe(true);

		// User-edited content must be preserved
		const preserved = await fs.readFile(mdPath, "utf-8");
		expect(preserved).toContain("User edited");
	});

	it("allows overwrite when force=true", async () => {
		const dir = path.join(TEST_ROOT, "force-overwrite");
		await ensureCleanDir(dir);
		const sourcePath = path.join(dir, "force.pdf");
		await createTestPdf(sourcePath, "Original text");

		// First conversion
		await convertFileToStandard({
			sourcePath,
			workspaceDir: WORKSPACE,
		});

		// Edit markdown
		const mdPath = path.join(dir, "force.md");
		await fs.writeFile(mdPath, "# User edited");

		// Copy original back from .originals for re-conversion
		const archivedPath = path.join(dir, ".originals", "force.pdf");
		await fs.copyFile(archivedPath, sourcePath);

		// Re-convert with force=true should succeed
		const second = await convertFileToStandard({
			sourcePath,
			workspaceDir: WORKSPACE,
			force: true,
		});
		expect(second.ok).toBe(true);
	});
});
