import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { convert as pdf2mdConvert } from "@pdf2md/core";
import mammoth from "mammoth";
import TurndownService from "turndown";

const turndownService = new TurndownService({
	headingStyle: "atx",
	bulletListMarker: "-",
	codeBlockStyle: "fenced",
});

turndownService.addRule("table", {
	filter: "table",
	replacement(_content: string, node: unknown) {
		const el = node as {
			rows?: Array<{
				cells: Array<{ textContent: string | null }>;
			}>;
		};
		let markdown = "\n\n**[TABLE]**\n\n";
		if (el.rows && el.rows.length > 0) {
			const lines: string[] = [];
			for (let r = 0; r < el.rows.length; r++) {
				const row = el.rows[r];
				const cells: string[] = [];
				for (let c = 0; c < row.cells.length; c++) {
					cells.push(row.cells[c].textContent ?? "");
				}
				lines.push("| " + cells.join(" | ") + " |");
				if (r === 0) {
					lines.push("| " + cells.map(() => "---").join(" | ") + " |");
				}
			}
			markdown = "\n\n" + lines.join("\n") + "\n\n";
		}
		return markdown;
	},
});

turndownService.addRule("img", {
	filter: "img",
	replacement(_content: string, node: unknown) {
		const el = node as {
			getAttribute?: (name: string) => string | null;
			alt?: string;
		};
		const src = el.getAttribute ? el.getAttribute("src") ?? "" : "";
		const alt = el.alt || "";
		return `![${alt}](${src})`;
	},
});

export function isConvertibleExtension(ext: string): boolean {
	return ext === ".pdf" || ext === ".docx";
}

export interface ConversionResult {
	ok: boolean;
	markdown?: string;
	metadata?: Record<string, unknown>;
	extractedAssets?: Array<{ name: string; path: string }>;
	error?: string;
	skipped?: boolean;
}

export interface ConvertFileToStandardOptions {
	sourcePath: string;
	workspaceDir: string;
	force?: boolean;
	/** If set, products (.md/.assets/.metadata.json) are written here instead of sourcePath's directory */
	outputDir?: string;
}

function deriveBaseName(sourcePath: string): string {
	const name = path.basename(sourcePath);
	const ext = path.extname(name).toLowerCase();
	return ext === ".pdf" || ext === ".docx" ? name.slice(0, -ext.length) : name;
}

function deriveOutputPaths(sourcePath: string, outputDir?: string) {
	const dir = outputDir ?? path.dirname(sourcePath);
	const base = deriveBaseName(sourcePath);
	return {
		md: path.join(dir, `${base}.md`),
		assets: path.join(dir, `${base}.assets`),
		metadata: path.join(dir, `${base}.metadata.json`),
		originalsDir: path.join(dir, ".originals"),
		originalName: path.basename(sourcePath),
		baseName: base,
	};
}

async function ensureDir(dirPath: string): Promise<void> {
	await fs.mkdir(dirPath, { recursive: true });
}

async function moveToOriginals(sourcePath: string, originalsDir: string): Promise<void> {
	await ensureDir(originalsDir);
	const target = path.join(originalsDir, path.basename(sourcePath));
	await fs.rename(sourcePath, target);
}

async function readMdIfExists(mdPath: string): Promise<string | null> {
	try {
		return await fs.readFile(mdPath, "utf-8");
	} catch {
		return null;
	}
}

async function readMetadataIfExists(metadataPath: string): Promise<Record<string, unknown> | null> {
	try {
		const raw = await fs.readFile(metadataPath, "utf-8");
		return JSON.parse(raw) as Record<string, unknown>;
	} catch {
		return null;
	}
}

/**
 * Detect if existing markdown has been user-edited by comparing
 * its content hash with the hash stored in metadata.json from the
 * last system conversion. If no metadata exists or hashes differ,
 * we consider it potentially user-edited.
 */
function isUserEdited(existingMd: string | null, metadata: Record<string, unknown> | null): boolean {
	if (!existingMd) return false;
	const trimmed = existingMd.trim();
	if (trimmed.length === 0) return false;

	// If system-generated metadata exists with a source hash, compare it
	const expectedHash = metadata?.sourceHash;
	if (typeof expectedHash === "string" && expectedHash.length > 0) {
		const currentHash = crypto.createHash("sha256").update(trimmed).digest("hex");
		return currentHash !== expectedHash;
	}

	// Fallback: no metadata or no hash stored — treat non-empty as potentially edited
	return true;
}

/**
 * Rewrite image src in Markdown HTML output to point to `<base>.assets/<img>`.
 */
function rewriteImageLinks(
	markdown: string,
	baseName: string,
	extractedAssets: Array<{ name: string }>,
): string {
	if (extractedAssets.length === 0) return markdown;

	const assetNames = new Set(extractedAssets.map((a) => a.name));
	// Match both Markdown ![alt](src) and HTML <img src="...">
	let result = markdown;
	result = result.replace(
		/!\[([^\]]*)\]\(([^)]+)\)/g,
		(_match, alt, src) => {
			const fileName = path.basename(src);
			if (assetNames.has(fileName)) {
				return `![${alt}](${baseName}.assets/${fileName})`;
			}
			return _match;
		},
	);
	return result;
}

/**
 * Extract Word core properties (title, author, etc.) from docx ZIP.
 */
async function extractDocxCoreProperties(sourcePath: string): Promise<{
	title: string;
	author: string;
	pages: number;
	footnotes: number;
	endnotes: number;
}> {
	const result = {
		title: "",
		author: "",
		pages: 0,
		footnotes: 0,
		endnotes: 0,
	};

	try {
		const { default: JSZip } = await import("jszip");
		const buffer = await fs.readFile(sourcePath);
		const zip = await JSZip.loadAsync(buffer);

		// Read core properties
		const coreXml = zip.file("docProps/core.xml");
		if (coreXml) {
			const text = await coreXml.async("text");
			// Extract title
			const titleMatch = text.match(/<dc:title>([^<]*)<\/dc:title>/);
			if (titleMatch) result.title = titleMatch[1].trim();
			// Extract creator/author
			const creatorMatch = text.match(/<dc:creator>([^<]*)<\/dc:creator>/);
			if (creatorMatch) result.author = creatorMatch[1].trim();
		}

		// Count footnotes
		const footnotesXml = zip.file("word/footnotes.xml");
		if (footnotesXml) {
			const text = await footnotesXml.async("text");
			// Each footnote reference is a <w:footnote> element; count them minus the separator footnotes
			const matches = text.match(/<w:footnote\s/g);
			if (matches) {
				// Word typically includes separator and continuation-separator footnotes
				const separatorCount = (text.match(/w:type="separator"/g) ?? []).length;
				const continuationCount = (text.match(/w:type="continuationSeparator"/g) ?? []).length;
				result.footnotes = Math.max(0, matches.length - separatorCount - continuationCount);
			}
		}

		// Count endnotes
		const endnotesXml = zip.file("word/endnotes.xml");
		if (endnotesXml) {
			const text = await endnotesXml.async("text");
			const matches = text.match(/<w:endnote\s/g);
			if (matches) {
				const separatorCount = (text.match(/w:type="separator"/g) ?? []).length;
				result.endnotes = Math.max(0, matches.length - separatorCount);
			}
		}

		// Try to get page count from app.xml (Extended Properties)
		const appXml = zip.file("docProps/app.xml");
		if (appXml) {
			const text = await appXml.async("text");
			const pagesMatch = text.match(/<Pages>(\d+)<\/Pages>/);
			if (pagesMatch) result.pages = Number(pagesMatch[1]);
		}
	} catch {
		// Keep empty defaults if ZIP parsing fails
	}

	return result;
}

async function convertPdf(sourcePath: string, assetsDir: string): Promise<{
	markdown: string;
	metadata: Record<string, unknown>;
	extractedAssets: Array<{ name: string; path: string }>;
}> {
	// 1. Read PDF into buffer for pdf2md (single parse, preserves headings/tables/structure)
	const pdfBuffer = await fs.readFile(sourcePath);
	const arrayBuffer = pdfBuffer.buffer.slice(
		pdfBuffer.byteOffset,
		pdfBuffer.byteOffset + pdfBuffer.byteLength,
	);

	const pdf2mdResult = await pdf2mdConvert(arrayBuffer);
	if (pdf2mdResult.status === "failed") {
		const messages = pdf2mdResult.messages
			.map((m) => `${m.code}: ${m.message}`)
			.join("; ");
		throw new Error(`PDF conversion failed: ${messages || "unknown error"}`);
	}

	const markdown = pdf2mdResult.markdown;
	const stats = pdf2mdResult.stats;

	// 2. Extract images via pdfnano (pdf2md does not extract images)
	// We use pdfnano's parseFile which gives us per-page images.
	const { PDFParser } = await import("pdfnano");
	const parser = new PDFParser();
	const doc = await parser.parseFile(sourcePath);

	const extractedAssets: Array<{ name: string; path: string }> = [];
	if (doc.pages && Array.isArray(doc.pages)) {
		let imageIndex = 0;
		for (const page of doc.pages) {
			if (page.images && Array.isArray(page.images)) {
				for (const img of page.images) {
					if (img.data) {
						imageIndex++;
						const ext = img.mimeType
							? `.${img.mimeType.split("/").pop()}`
							: ".png";
						const imgName = `img-${String(imageIndex).padStart(3, "0")}${ext}`;
						const imgPath = path.join(assetsDir, imgName);
						await fs.writeFile(imgPath, Buffer.from(img.data));
						extractedAssets.push({ name: imgName, path: imgPath });
					}
				}
			}
		}
	}

	// Count tables from the generated markdown (pdf2md produces actual Markdown tables)
	// Count table header rows (| --- | --- |) which are the reliable table boundary marker
	const tableCount = (markdown.match(/^\|.*---.*\|/gm) ?? []).length;

	const metadata: Record<string, unknown> = {
		sourceType: "pdf",
		title: pdf2mdResult.metadata?.title ?? "",
		author: pdf2mdResult.metadata?.author ?? "",
		pages: stats.pageCount,
		images: extractedAssets.length,
		tables: tableCount,
		// pdf2md handles structure but does not expose footnote/endnote extraction.
		// Mark as null rather than 0 to distinguish "not extracted" from "0 present".
		footnotes: null,
		endnotes: null,
	};

	return { markdown, metadata, extractedAssets };
}

async function convertDocx(
	sourcePath: string,
	assetsDir: string,
	baseName: string,
): Promise<{
	markdown: string;
	metadata: Record<string, unknown>;
	extractedAssets: Array<{ name: string; path: string }>;
}> {
	const extractedAssets: Array<{ name: string; path: string }> = [];
	let imageCounter = 0;
	// Collect promises for all image writes so we can await them deterministically
	const imageWritePromises: Array<Promise<void>> = [];

	const convertImage = mammoth.images.imgElement(function (image) {
		return image.readAsBuffer().then(function (buffer) {
			imageCounter++;
			const ext = (image.contentType ?? "image/png").split("/").pop() ?? "png";
			const imgName = `img-${String(imageCounter).padStart(3, "0")}.${ext}`;
			const imgPath = path.join(assetsDir, imgName);
			// Capture the write promise so we await it later
			const writePromise = fs
				.writeFile(imgPath, buffer)
				.then(() => {
					extractedAssets.push({ name: imgName, path: imgPath });
				})
				.catch((err) => {
					throw new Error(
						`Failed to write image asset ${imgName}: ${err instanceof Error ? err.message : String(err)}`,
					);
				});
			imageWritePromises.push(writePromise);
			return {
				src: `${baseName}.assets/${imgName}`,
			};
		});
	});

	const result = await mammoth.convertToHtml(
		{ path: sourcePath },
		{ convertImage },
	);

	// Await all image writes deterministically
	await Promise.all(imageWritePromises);

	const markdown = turndownService.turndown(result.value);

	// Count tables from raw HTML
	const tableCount = (result.value.match(/<table/gi) ?? []).length;

	// Extract real document properties from docx core XML
	const coreProps = await extractDocxCoreProperties(sourcePath);

	const metadata: Record<string, unknown> = {
		sourceType: "docx",
		title: coreProps.title,
		author: coreProps.author,
		pages: coreProps.pages,
		images: extractedAssets.length,
		tables: tableCount,
		footnotes: coreProps.footnotes,
		endnotes: coreProps.endnotes,
	};

	return { markdown, metadata, extractedAssets };
}

export async function convertFileToStandard(
	options: ConvertFileToStandardOptions,
): Promise<ConversionResult> {
	const { sourcePath, force = false } = options;

	// Check source file exists before attempting conversion
	try {
		const srcStat = await fs.stat(sourcePath);
		if (!srcStat.isFile()) {
			return { ok: false, error: `Source path is not a file: ${sourcePath}` };
		}
	} catch {
		return { ok: false, error: `Source file not found: ${sourcePath}` };
	}

	const ext = path.extname(sourcePath).toLowerCase();
	if (!isConvertibleExtension(ext)) {
		return { ok: false, error: `Unsupported file type: ${ext}` };
	}

	const outputs = deriveOutputPaths(sourcePath, options.outputDir);

	// Check for user-edited markdown guard using content hash
	const existingMd = await readMdIfExists(outputs.md);
	const existingMeta = await readMetadataIfExists(outputs.metadata);
	if (!force && isUserEdited(existingMd, existingMeta)) {
		return {
			ok: false,
			skipped: true,
			error: "Markdown already exists and may be user-edited; use force=true to overwrite",
		};
	}

	let markdown: string;
	let metadata: Record<string, unknown>;
	let extractedAssets: Array<{ name: string; path: string }>;

	try {
		// Ensure .assets directory exists before conversion
		await ensureDir(outputs.assets);

		if (ext === ".pdf") {
			({ markdown, metadata, extractedAssets } = await convertPdf(
				sourcePath,
				outputs.assets,
			));
		} else {
			({ markdown, metadata, extractedAssets } = await convertDocx(
				sourcePath,
				outputs.assets,
				outputs.baseName,
			));
		}

		// Rewrite image links to point into <name>.assets/
		markdown = rewriteImageLinks(markdown, outputs.baseName, extractedAssets);

		// Compute content hash of the generated markdown for edit detection
		const sourceHash = crypto.createHash("sha256").update(markdown.trim()).digest("hex");

		// Write to temporary directory first, then atomically rename
		const tmpDir = path.join(path.dirname(outputs.md), `.tmp-${outputs.baseName}-${Date.now()}`);
		await fs.mkdir(tmpDir, { recursive: true });

		const tmpMd = path.join(tmpDir, `${outputs.baseName}.md`);
		const tmpMeta = path.join(tmpDir, `${outputs.baseName}.metadata.json`);
		const tmpAssets = path.join(tmpDir, `${outputs.baseName}.assets`);

		await fs.writeFile(tmpMd, markdown, "utf-8");

		// Verify assets exist on disk; if any are missing, that's a conversion error
		const verifiedAssets: Array<{ name: string; size: number }> = [];
		if (extractedAssets.length > 0) {
			await fs.mkdir(tmpAssets, { recursive: true });
			for (const asset of extractedAssets) {
				const st = await fs.stat(asset.path);
				if (!st.isFile()) {
					throw new Error(`Asset ${asset.name} is not a file`);
				}
				const dest = path.join(tmpAssets, asset.name);
				await fs.copyFile(asset.path, dest);
				verifiedAssets.push({ name: asset.name, size: st.size });
			}
		}

		// Write metadata
		metadata.convertedAt = Date.now();
		metadata.sourcePath = sourcePath;
		metadata.assets = verifiedAssets;
		metadata.sourceHash = sourceHash;
		await fs.writeFile(tmpMeta, JSON.stringify(metadata, null, 2), "utf-8");

		// Atomically move from tmp to final location
		await fs.rename(tmpMd, outputs.md);
		if (extractedAssets.length > 0) {
			// Remove old assets dir if exists
			try {
				await fs.rm(outputs.assets, { recursive: true, force: true });
			} catch {
				// ignore
			}
			await fs.rename(tmpAssets, outputs.assets);
		}
		await fs.rename(tmpMeta, outputs.metadata);

		// Clean up tmp dir
		await fs.rm(tmpDir, { recursive: true, force: true });

		// Archive original to .originals
		await moveToOriginals(sourcePath, outputs.originalsDir);

		return { ok: true, markdown, metadata, extractedAssets };
	} catch (error) {
		// Clean up any temp artifacts
		const tmpDirs = await fs.readdir(path.dirname(outputs.md)).catch(() => [] as string[]);
		for (const d of tmpDirs) {
			if (d.startsWith(`.tmp-${outputs.baseName}-`)) {
				await fs.rm(path.join(path.dirname(outputs.md), d), { recursive: true, force: true });
			}
		}
		const message = error instanceof Error ? error.message : String(error);
		return { ok: false, error: message };
	}
}
