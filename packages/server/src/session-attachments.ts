import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import express, { type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { getRidgeDb } from "./db/index.js";
import { getStorageDir } from "./utils/paths.js";
import type { HttpError, SessionRecord } from "./types/index.js";

export interface SessionAttachmentRecord {
	attachment_id: string;
	session_id: string;
	original_name: string;
	stored_name: string;
	stored_path: string;
	mime_type: string;
	size: number;
	sha256: string;
	created_at: number;
}

const upload = multer({
	storage: multer.memoryStorage(),
	limits: {
		files: 20,
		fileSize: 50 * 1024 * 1024,
	},
});

async function getSessionAttachmentsDir(sessionId: string): Promise<string> {
	const storageDir = await getStorageDir();
	const dir = path.join(storageDir, "session-attachments", sessionId);
	await fs.mkdir(dir, { recursive: true, mode: 0o700 });
	return dir;
}

function generateAttachmentId(): string {
	return `att-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function sanitizeStoredName(originalName: string): string {
	// Normalize backslashes to forward slashes, then take basename
	const normalized = originalName.replace(/\\/g, "/");
	const base = path.basename(normalized);
	// Replace unsafe chars with underscore; collapse multiple dots
	const safe = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.{2,}/g, "_");
	// Prevent empty or meaningless result (e.g. all underscores) by falling back to "file"
	return /[a-zA-Z0-9]/.test(safe) ? safe : "file";
}

export async function storeSessionAttachment(
	sessionId: string,
	originalName: string,
	buffer: Buffer,
	mimeType: string,
): Promise<SessionAttachmentRecord> {
	const dir = await getSessionAttachmentsDir(sessionId);
	const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
	const attachmentId = generateAttachmentId();
	const safeName = sanitizeStoredName(originalName);
	const storedName = `${attachmentId}-${safeName}`;
	const storedPath = path.join(dir, storedName);

	await fs.writeFile(storedPath, buffer, { mode: 0o600 });

	const createdAt = Date.now();
	const db = await getRidgeDb();
	db.prepare(
		`INSERT INTO session_attachments (
			attachment_id, session_id, original_name, stored_name, stored_path, mime_type, size, sha256, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	).run(
		attachmentId,
		sessionId,
		originalName,
		storedName,
		storedPath,
		mimeType,
		buffer.length,
		sha256,
		createdAt,
	);

	return {
		attachment_id: attachmentId,
		session_id: sessionId,
		original_name: originalName,
		stored_name: storedName,
		stored_path: storedPath,
		mime_type: mimeType,
		size: buffer.length,
		sha256,
		created_at: createdAt,
	};
}

export async function getSessionAttachments(sessionId: string): Promise<SessionAttachmentRecord[]> {
	const db = await getRidgeDb();
	return db
		.prepare("SELECT * FROM session_attachments WHERE session_id = ? ORDER BY created_at DESC")
		.all(sessionId) as SessionAttachmentRecord[];
}

export async function validateAttachmentIds(sessionId: string, attachmentIds: string[]): Promise<boolean> {
	if (attachmentIds.length === 0) return true;
	const db = await getRidgeDb();
	const rows = db
		.prepare("SELECT attachment_id FROM session_attachments WHERE session_id = ? AND attachment_id IN (" + attachmentIds.map(() => "?").join(",") + ")")
		.all(sessionId, ...attachmentIds) as { attachment_id: string }[];
	return rows.length === attachmentIds.length;
}

export async function getAttachmentById(attachmentId: string): Promise<SessionAttachmentRecord | null> {
	const db = await getRidgeDb();
	const row = db
		.prepare("SELECT * FROM session_attachments WHERE attachment_id = ?")
		.get(attachmentId) as SessionAttachmentRecord | undefined;
	return row ?? null;
}

export async function readAttachmentContent(attachmentId: string): Promise<{ content: string; truncated: boolean } | null> {
	const att = await getAttachmentById(attachmentId);
	if (!att) return null;

	const buffer = await fs.readFile(att.stored_path);
	const isText = isTextMimeType(att.mime_type, att.original_name);
	if (!isText) {
		return {
			content: `[Binary file: ${att.original_name}, type=${att.mime_type}, size=${att.size} bytes]`,
			truncated: false,
		};
	}

	const MAX_BYTES = 64 * 1024; // 64KB per file
	const content = buffer.toString("utf-8", 0, Math.min(buffer.length, MAX_BYTES));
	const truncated = buffer.length > MAX_BYTES;
	return { content, truncated };
}

function isTextMimeType(mimeType: string, fileName: string): boolean {
	if (mimeType.startsWith("text/")) return true;
	const textTypes = [
		"application/json",
		"application/xml",
		"application/javascript",
		"application/typescript",
		"application/x-javascript",
		"application/x-typescript",
		"application/x-sh",
		"application/x-httpd-php",
		"application/x-yaml",
		"application/toml",
	];
	if (textTypes.includes(mimeType)) return true;
	const textExts = [
		".md", ".markdown", ".txt", ".js", ".ts", ".jsx", ".tsx", ".vue", ".html",
		".css", ".scss", ".less", ".sass", ".json", ".yaml", ".yml", ".toml", ".xml",
		".csv", ".sql", ".sh", ".bash", ".zsh", ".fish", ".ps1", ".bat", ".cmd",
		".py", ".rb", ".php", ".go", ".rs", ".java", ".c", ".cpp", ".h", ".hpp",
		".cs", ".swift", ".kt", ".scala", ".clj", ".cljs", ".erl", ".ex", ".exs",
		".lua", ".pl", ".r", ".jl", ".cr", ".nim", ".d", ".dart", ".f", ".f90",
		".for", ".fs", ".fsx", ".ml", ".mli", ".pas", ".pp", ".inc", ".dfm",
	];
	const ext = path.extname(fileName).toLowerCase();
	return textExts.includes(ext);
}

export async function buildAttachmentContext(attachmentIds: string[]): Promise<string> {
	if (attachmentIds.length === 0) return "";
	const MAX_TOTAL_PROMPT_BYTES = 192 * 1024; // 192KB total

	let totalBytes = 0;
	const parts: string[] = [];
	parts.push("\n\n--- Session Attachments ---\n");

	for (const id of attachmentIds) {
		const att = await getAttachmentById(id);
		if (!att) {
			parts.push(`[Attachment ${id}: not found]\n`);
			continue;
		}

		const result = await readAttachmentContent(id);
		if (!result) {
			parts.push(`[Attachment ${att.original_name}: unable to read]\n`);
			continue;
		}

		const header = `File: ${att.original_name} (${att.mime_type}, ${att.size} bytes)\n`;
		const content = result.content;
		const footer = result.truncated ? "\n[...truncated]\n" : "\n";
		const block = `${header}${content}${footer}`;

		if (totalBytes + Buffer.byteLength(block, "utf-8") > MAX_TOTAL_PROMPT_BYTES) {
			parts.push("[Remaining attachments omitted due to size limit]\n");
			break;
		}

		parts.push(block);
		totalBytes += Buffer.byteLength(block, "utf-8");
	}

	return parts.join("");
}

export function createSessionAttachmentsRouter(
	ensureSessionRecord: (sessionId: string) => Promise<SessionRecord>,
) {
	const router = express.Router({ mergeParams: true });

	router.post(
		"/",
		upload.array("files", 20),
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const sessionId = String(req.params.sessionId);
				const files = req.files as Express.Multer.File[] | undefined;
				if (!files || files.length === 0) {
					const error = new Error("No files uploaded") as HttpError;
					error.statusCode = 400;
					throw error;
				}

				// Verify session exists before writing any files/DB records
				await ensureSessionRecord(sessionId);

				const records: SessionAttachmentRecord[] = [];
				for (const file of files) {
					const record = await storeSessionAttachment(
						sessionId,
						file.originalname,
						file.buffer,
						file.mimetype,
					);
					records.push(record);
				}

				res.status(201).json({
					attachments: records.map((r) => ({
						id: r.attachment_id,
						sessionId: r.session_id,
						originalName: r.original_name,
						storedName: r.stored_name,
						mimeType: r.mime_type,
						size: r.size,
						sha256: r.sha256,
						createdAt: r.created_at,
					})),
				});
			} catch (error) {
				next(error);
			}
		},
	);

	router.get(
		"/",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const sessionId = String(req.params.sessionId);
				// Verify session exists before returning list
				await ensureSessionRecord(sessionId);

				const records = await getSessionAttachments(sessionId);
				res.json({
					attachments: records.map((r) => ({
						id: r.attachment_id,
						sessionId: r.session_id,
						originalName: r.original_name,
						storedName: r.stored_name,
						mimeType: r.mime_type,
						size: r.size,
						sha256: r.sha256,
						createdAt: r.created_at,
					})),
				});
			} catch (error) {
				next(error);
			}
		},
	);

	return router;
}
