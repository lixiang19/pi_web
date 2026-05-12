import crypto from "node:crypto";
import fs from "node:fs/promises";
import { accessSync } from "node:fs";
import path from "node:path";
import type { RidgeDatabase } from "./db/index.js";

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

	await fs.writeFile(storedPath, buffer, { mode: 0o600 });

	const createdAt = Date.now();
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

	// Remove from DB first
	db.prepare("DELETE FROM fleeting_attachments WHERE attachment_id = ?").run(attachmentId);

	// Then try to remove file (best effort; don't fail if file already gone)
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

	// Try to remove the note's attachment directory if empty
	try {
		const dir = getFleetingAttachmentsDir(workspaceDir, noteId);
		await fs.rmdir(dir);
	} catch {
		// Directory may not be empty or may not exist; ignore
	}
}

/**
 * Migrate fleeting attachments to the formal attachments directory.
 * Called when a fleeting note is successfully processed (journal/clip/task/etc).
 *
 * Rules:
 * - Target directory: {workspaceDir}/附件/
 * - Preserve original filename
 * - On conflict, append a short random suffix before extension
 * - Remove DB records and temp files after successful migration
 * - Return migrated file paths for caller to reference
 */
export async function migrateFleetingAttachments(
	db: RidgeDatabase,
	workspaceDir: string,
	noteId: string,
): Promise<{ migratedPaths: string[]; failed: string[] }> {
	const attachments = getFleetingAttachments(db, noteId);
	if (attachments.length === 0) {
		return { migratedPaths: [], failed: [] };
	}

	const targetDir = path.join(workspaceDir, "附件");
	await fs.mkdir(targetDir, { recursive: true });

	const migratedPaths: string[] = [];
	const failed: string[] = [];

	for (const att of attachments) {
		try {
			const buffer = await fs.readFile(att.stored_path);
			const targetName = resolveUniqueFileName(targetDir, att.original_name);
			const targetPath = path.join(targetDir, targetName);
			await fs.writeFile(targetPath, buffer, { mode: 0o644 });

			migratedPaths.push(targetPath);

			// Clean up temp DB record and file
			db.prepare("DELETE FROM fleeting_attachments WHERE attachment_id = ?").run(
				att.attachment_id,
			);
			await fs.rm(att.stored_path, { force: true });
		} catch {
			failed.push(att.original_name);
		}
	}

	// Clean up note attachment directory if now empty
	try {
		const dir = getFleetingAttachmentsDir(workspaceDir, noteId);
		await fs.rmdir(dir);
	} catch {
		// Ignore
	}

	return { migratedPaths, failed };
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
	// Use sync fs to check existence; throws if not found
	accessSync(filePath);
}
