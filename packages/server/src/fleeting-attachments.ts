import crypto from "node:crypto";
import fs from "node:fs/promises";
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
