import crypto from "node:crypto";
import fs from "node:fs/promises";
import { accessSync } from "node:fs";
import path from "node:path";
import type { RidgeDatabase } from "./db/index.js";

type HttpError = Error & { statusCode?: number };

export interface FleetingAttachmentRecord {
	attachment_id: string;
	note_id: string;
	original_name: string;
	stored_name: string;
	stored_path: string;
	mime_type: string;
	size: number;
	sha256: string;
	created_at: number;
}

function generateAttachmentId(): string {
	return `fla-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function sanitizeStoredName(originalName: string): string {
	const normalized = originalName.replace(/\\/g, "/");
	const base = path.basename(normalized);
	const safe = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.{2,}/g, "_");
	return /[a-zA-Z0-9]/.test(safe) ? safe : "file";
}

function getFleetingAttachmentsDir(workspaceDir: string, noteId: string): string {
	return path.join(workspaceDir, ".ridge", "fleeting-attachments", noteId);
}

export async function storeFleetingAttachment(
	db: RidgeDatabase,
	workspaceDir: string,
	noteId: string,
	originalName: string,
	buffer: Buffer,
	mimeType: string,
): Promise<FleetingAttachmentRecord> {
	const dir = getFleetingAttachmentsDir(workspaceDir, noteId);
	await fs.mkdir(dir, { recursive: true, mode: 0o700 });

	const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
	const attachmentId = generateAttachmentId();
	const safeName = sanitizeStoredName(originalName);
	const storedName = `${attachmentId}-${safeName}`;
	const storedPath = path.join(dir, storedName);

	const createdAt = Date.now();
	try {
		await fs.writeFile(storedPath, buffer, { mode: 0o600 });
		db.prepare(
			`INSERT INTO fleeting_attachments (
				attachment_id, note_id, original_name, stored_name, stored_path, mime_type, size, sha256, created_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			attachmentId,
			noteId,
			originalName,
			storedName,
			storedPath,
			mimeType,
			buffer.length,
			sha256,
			createdAt,
		);
	} catch (error) {
		await fs.rm(storedPath, { force: true }).catch(() => undefined);
		throw error;
	}

	return {
		attachment_id: attachmentId,
		note_id: noteId,
		original_name: originalName,
		stored_name: storedName,
		stored_path: storedPath,
		mime_type: mimeType,
		size: buffer.length,
		sha256,
		created_at: createdAt,
	};
}

export function getFleetingAttachments(
	db: RidgeDatabase,
	noteId: string,
): FleetingAttachmentRecord[] {
	return db
		.prepare("SELECT * FROM fleeting_attachments WHERE note_id = ? ORDER BY created_at DESC")
		.all(noteId) as FleetingAttachmentRecord[];
}

export function getFleetingAttachmentById(
	db: RidgeDatabase,
	attachmentId: string,
): FleetingAttachmentRecord | null {
	const row = db
		.prepare("SELECT * FROM fleeting_attachments WHERE attachment_id = ?")
		.get(attachmentId) as FleetingAttachmentRecord | undefined;
	return row ?? null;
}

export async function deleteFleetingAttachment(
	db: RidgeDatabase,
	attachmentId: string,
): Promise<boolean> {
	const row = getFleetingAttachmentById(db, attachmentId);
	if (!row) return false;

	db.prepare("DELETE FROM fleeting_attachments WHERE attachment_id = ?").run(attachmentId);
	try {
		await fs.rm(row.stored_path, { force: true });
	} catch {
		// File may already be deleted or inaccessible; ignore
	}
	return true;
}

export async function deleteFleetingAttachmentsForNote(
	db: RidgeDatabase,
	workspaceDir: string,
	noteId: string,
): Promise<void> {
	const rows = getFleetingAttachments(db, noteId);
	for (const row of rows) {
		db.prepare("DELETE FROM fleeting_attachments WHERE attachment_id = ?").run(row.attachment_id);
		try {
			await fs.rm(row.stored_path, { force: true });
		} catch {
			// Best effort cleanup
		}
	}
	try {
		const dir = getFleetingAttachmentsDir(workspaceDir, noteId);
		await fs.rmdir(dir);
	} catch {
		// Directory may not be empty or may not exist; ignore
	}
}

// ============================================================================
// Safe migration: copy-only + explicit cleanup
// ============================================================================

/**
 * Copy fleeting attachments to the formal attachments directory.
 * Does NOT delete temporary attachments — caller must clean up after confirming success.
 * Throws on first copy failure so caller can abort and keep the fleeting note intact.
 */
export async function copyFleetingAttachmentsToFormal(
	db: RidgeDatabase,
	workspaceDir: string,
	noteId: string,
): Promise<{ migratedPaths: string[] }> {
	const attachments = getFleetingAttachments(db, noteId);
	if (attachments.length === 0) {
		return { migratedPaths: [] };
	}

	const targetDir = path.join(workspaceDir, "附件");
	await fs.mkdir(targetDir, { recursive: true });

	const migratedPaths: string[] = [];
	for (const att of attachments) {
		try {
			const buffer = await fs.readFile(att.stored_path);
			const targetName = resolveUniqueFileName(targetDir, att.original_name);
			const targetPath = path.join(targetDir, targetName);
			await fs.writeFile(targetPath, buffer, { mode: 0o644 });
			migratedPaths.push(targetPath);
		} catch {
			// Clean up any already-copied files on partial failure to avoid
			// leaving half-migrated artifacts in the formal directory.
			for (const copiedPath of migratedPaths) {
				try {
					await fs.rm(copiedPath, { force: true });
				} catch {
					// Best-effort cleanup
				}
			}
			const error = new Error(`附件迁移失败: ${att.original_name}`) as HttpError;
			error.statusCode = 500;
			throw error;
		}
	}

	return { migratedPaths };
}

/**
 * Delete attachment DB records (synchronous, for use inside db.transaction).
 */
export function deleteFleetingAttachmentRecords(db: RidgeDatabase, noteId: string): void {
	const attachments = getFleetingAttachments(db, noteId);
	for (const att of attachments) {
		db.prepare("DELETE FROM fleeting_attachments WHERE attachment_id = ?").run(att.attachment_id);
	}
}

/**
 * Delete temporary attachment files and directory (best effort, after DB success).
 */
export async function deleteFleetingTempFiles(
	workspaceDir: string,
	noteId: string,
): Promise<void> {
	const dir = getFleetingAttachmentsDir(workspaceDir, noteId);
	try {
		const files = await fs.readdir(dir);
		for (const file of files) {
			try {
				await fs.rm(path.join(dir, file), { force: true });
			} catch {
				// Best effort
			}
		}
		await fs.rmdir(dir);
	} catch {
		// Directory may not exist
	}
}

function resolveUniqueFileName(targetDir: string, originalName: string): string {
	const safeName = sanitizeStoredName(originalName);
	const candidate = path.join(targetDir, safeName);
	try {
		fsSyncAccess(candidate);
		// File exists; need unique name
	} catch {
		return safeName;
	}

	const ext = path.extname(safeName);
	const base = path.basename(safeName, ext);
	const suffix = crypto.randomBytes(3).toString("hex");
	return `${base}-${suffix}${ext}`;
}

function fsSyncAccess(filePath: string): void {
	accessSync(filePath);
}
