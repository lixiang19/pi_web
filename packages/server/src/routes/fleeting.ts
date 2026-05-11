import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import express, {
	type NextFunction,
	type Request,
	type Response,
} from "express";
import { z } from "zod";
import { atomicWriteFile } from "../utils/fs.js";

interface SqliteStatement {
	run: (...args: unknown[]) => { changes?: number };
	get: (...args: unknown[]) => unknown;
	all: (...args: unknown[]) => unknown[];
}

interface RidgeDatabase {
	exec: (sql: string) => void;
	prepare: (sql: string) => SqliteStatement;
	transaction: (fn: () => void) => () => void;
}
type HttpError = Error & { statusCode?: number };

export interface FleetingAnalysisRunner {
	run: (noteId: string) => Promise<void> | void;
}

interface FleetingAttachmentRecord {
	attachment_id: string;
	note_id: string;
	original_name: string;
	stored_name: string;
	temp_path: string;
	final_path: string | null;
	mime_type: string;
	size: number;
	sha256: string;
	created_at: number;
}

interface FleetingRouterDeps {
	db: RidgeDatabase;
	workspaceDir: string;
	analysisRunner?: FleetingAnalysisRunner;
}

const createFleetingSchema = z.object({
	content: z.string().optional().default(""),
}).strict();

const patchFleetingSchema = z.object({
	content: z.string().trim().min(1).optional(),
	status: z.enum(["pending", "processing"]).optional(),
	analysisStatus: z.enum(["unanalyzed", "analyzing", "suggested", "failed"]).optional(),
	suggestion: z.string().optional(),
}).strict().refine(
	(payload) => Object.keys(payload).length > 0,
	{
		message: "至少要更新一个字段",
	},
);

const analysisSchema = z.object({
	recommendationType: z.enum(["journal", "clip", "task", "delete"]),
	recommendationText: z.string().trim().min(1),
	draft: z.string().optional().default(""),
	requiresInput: z.boolean().optional().default(false),
	piSessionId: z.string().optional(),
	piSessionFile: z.string().optional(),
});

const journalSchema = z.object({
	content: z.string().trim().min(1),
});

const clipSchema = z.object({
	title: z.string().trim().min(1),
	url: z.string().trim().optional().default(""),
	content: z.string().trim().min(1),
	source: z.string().trim().optional().default(""),
});

const toPublicAttachment = (row: FleetingAttachmentRecord) => ({
	id: row.attachment_id,
	originalName: row.original_name,
	storedName: row.stored_name,
	mimeType: row.mime_type,
	size: row.size,
	sha256: row.sha256,
	createdAt: row.created_at,
});

const toPublicNote = (row: Record<string, unknown>, attachments: FleetingAttachmentRecord[] = []) => ({
	id: row.note_id,
	type: row.type,
	content: row.content,
	status: row.status,
	analysisStatus: row.analysis_status,
	suggestion: row.suggestion,
	recommendationType: row.recommendation_type,
	recommendationText: row.recommendation_text,
	draft: row.draft,
	requiresInput: row.requires_input === 1,
	piSessionId: row.pi_session_id,
	piSessionFile: row.pi_session_file,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
	attachments: attachments.map(toPublicAttachment),
});

const makeId = (prefix: string) =>
	`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const shortId = () => Math.random().toString(36).slice(2, 8);

const forwardError = (error: unknown, next: NextFunction) => {
	if (error instanceof z.ZodError) {
		const httpError = new Error(error.issues[0]?.message ?? "请求参数无效") as HttpError;
		httpError.statusCode = 400;
		next(httpError);
		return;
	}
	next(error);
};

const getNoteOrThrow = (db: RidgeDatabase, noteId: string) => {
	const note = db
		.prepare("SELECT * FROM fleeting_notes WHERE note_id = ?")
		.get(noteId) as Record<string, unknown> | undefined;
	if (!note) {
		const error = new Error("闪念不存在") as HttpError;
		error.statusCode = 404;
		throw error;
	}
	return note;
};

const getTodayJournalPath = (workspaceDir: string) => {
	const today = new Date();
	const year = String(today.getFullYear());
	const month = String(today.getMonth() + 1).padStart(2, "0");
	const date = `${year}-${month}-${String(today.getDate()).padStart(2, "0")}`;
	return path.join(workspaceDir, "日记", year, month, `${date}.md`);
};

const appendToTodayJournal = async (workspaceDir: string, content: string) => {
	const journalPath = getTodayJournalPath(workspaceDir);
	await fs.mkdir(path.dirname(journalPath), { recursive: true });
	let existing = "";
	try {
		existing = await fs.readFile(journalPath, "utf-8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
			throw error;
		}
	}

	const now = new Date();
	const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
	const entry = `- ${time}  \n  ${content}\n`;
	const hasFleetingHeading = /^## 闪念$/m.test(existing);
	const prefix = existing.trim() ? "\n\n" : "";
	const next = hasFleetingHeading
		? `${existing.trimEnd()}\n${entry}`
		: `${existing}${prefix}## 闪念\n\n${entry}`;
	await atomicWriteFile(journalPath, next);
	return journalPath;
};

const getFilesFromRequest = (req: Request): Array<{ originalname: string; buffer: Buffer; mimetype: string; size: number }> => {
	if (!req.files) return [];
	if (Array.isArray(req.files)) {
		return req.files as Array<{ originalname: string; buffer: Buffer; mimetype: string; size: number }>;
	}
	// req.files is a fields map from multer.fields()
	const map = req.files as Record<string, Express.Multer.File[]>;
	const attachments = map["attachments"] ?? [];
	const files = map["files"] ?? [];
	return [...attachments, ...files] as Array<{ originalname: string; buffer: Buffer; mimetype: string; size: number }>;
};

const sanitizeFileName = (name: string) => {
	// Normalize backslashes to forward slashes first
	const normalized = name.replace(/\\/g, "/");
	const base = path.basename(normalized).replace(/[\x00-\x1f\x7f\/<>:"|?*]/g, "_");
	if (!base || base === "." || base === ".." || /^[._]+$/.test(base)) {
		return "unnamed";
	}
	return base;
};

const computeSha256 = (buffer: Buffer) =>
	crypto.createHash("sha256").update(buffer).digest("hex");

const getFleetingAttachmentBase = (workspaceDir: string) =>
	path.join(workspaceDir, ".ridge", "fleeting-attachments");

const getSafeNoteAttachmentDir = async (workspaceDir: string, noteId: string) => {
	const safeId = path.basename(noteId);
	if (!safeId || safeId !== noteId || safeId.startsWith(".")) {
		throw new Error("无效的 noteId");
	}
	const baseDir = getFleetingAttachmentBase(workspaceDir);
	await fs.mkdir(baseDir, { recursive: true });
	const baseReal = await fs.realpath(baseDir);
	const targetDir = path.join(baseDir, safeId);
	const parentDir = path.dirname(targetDir);
	await fs.mkdir(parentDir, { recursive: true });
	const parentReal = await fs.realpath(parentDir);
	const targetReal = path.join(parentReal, path.basename(targetDir));
	const relativeToBase = path.relative(baseReal, targetReal);
	if (!relativeToBase || path.isAbsolute(relativeToBase) || relativeToBase.startsWith("..")) {
		throw new Error("路径越界");
	}
	if (!targetReal.startsWith(baseReal + path.sep) && targetReal !== baseReal) {
		throw new Error("路径越界");
	}
	return targetReal;
};

const saveFleetingAttachments = async (
	workspaceDir: string,
	db: RidgeDatabase,
	noteId: string,
	files: Array<{ originalname: string; buffer: Buffer; mimetype: string; size: number }>,
): Promise<FleetingAttachmentRecord[]> => {
	if (files.length === 0) return [];
	const targetDir = await getSafeNoteAttachmentDir(workspaceDir, noteId);
	await fs.mkdir(targetDir, { recursive: true });
	const records: FleetingAttachmentRecord[] = [];
	const insert = db.prepare(
		`INSERT INTO fleeting_attachments(
		  attachment_id, note_id, original_name, stored_name, temp_path,
		  mime_type, size, sha256, created_at
		) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	);
	for (const file of files) {
		const original = sanitizeFileName(file.originalname);
		const sha = computeSha256(file.buffer);
		// stored_name includes short id to avoid collisions inside same note dir
		const ext = path.extname(original);
		const base = path.basename(original, ext);
		const stored = `${base}-${shortId()}${ext}`;
		const tempPath = path.join(targetDir, stored);
		await fs.writeFile(tempPath, file.buffer);
		const now = Date.now();
		const attachmentId = makeId("att");
		insert.run(
			attachmentId,
			noteId,
			original,
			stored,
			tempPath,
			file.mimetype || "application/octet-stream",
			file.size,
			sha,
			now,
		);
		records.push({
			attachment_id: attachmentId,
			note_id: noteId,
			original_name: original,
			stored_name: stored,
			temp_path: tempPath,
			final_path: null,
			mime_type: file.mimetype || "application/octet-stream",
			size: file.size,
			sha256: sha,
			created_at: now,
		});
	}
	return records;
};

const listFleetingAttachments = (db: RidgeDatabase, noteId: string): FleetingAttachmentRecord[] => {
	return db
		.prepare("SELECT * FROM fleeting_attachments WHERE note_id = ? ORDER BY created_at DESC")
		.all(noteId) as FleetingAttachmentRecord[];
};

const cleanupFleetingAttachments = async (workspaceDir: string, db: RidgeDatabase, noteId: string) => {
	try {
		const safeId = path.basename(noteId);
		if (!safeId || safeId !== noteId || safeId.startsWith(".")) {
			return;
		}
		const baseDir = path.join(workspaceDir, ".ridge", "fleeting-attachments");
		await fs.mkdir(baseDir, { recursive: true });
		const baseReal = await fs.realpath(baseDir);
		const targetDir = path.join(baseDir, safeId);
		const parentDir = path.dirname(targetDir);
		await fs.mkdir(parentDir, { recursive: true });
		const parentReal = await fs.realpath(parentDir);
		const targetReal = path.join(parentReal, path.basename(targetDir));
		const relativeToBase = path.relative(baseReal, targetReal);
		if (!relativeToBase || relativeToBase === "" || relativeToBase.startsWith("..")) {
			return;
		}
		if (!targetReal.startsWith(baseReal + path.sep) && targetReal !== baseReal) {
			return;
		}
		await fs.rm(targetReal, { recursive: true, force: true });
	} catch {
		// Ignore cleanup errors; don't block delete
	} finally {
		try {
			db.prepare("DELETE FROM fleeting_attachments WHERE note_id = ?").run(noteId);
		} catch {
			// ignore
		}
	}
};

const migrateAttachmentsToFinal = async (
	workspaceDir: string,
	db: RidgeDatabase,
	noteId: string,
): Promise<string[]> => {
	const attachments = listFleetingAttachments(db, noteId);
	if (attachments.length === 0) return [];
	const baseDir = getFleetingAttachmentBase(workspaceDir);
	await fs.mkdir(baseDir, { recursive: true });
	const baseReal = await fs.realpath(baseDir);
	const finalDir = path.join(workspaceDir, "附件");
	await fs.mkdir(finalDir, { recursive: true });
	const finalReal = await fs.realpath(finalDir);
	const finalPaths: string[] = [];
	const migratedIds: string[] = [];
	const update = db.prepare(
		"UPDATE fleeting_attachments SET final_path = ? WHERE attachment_id = ?",
	);
	try {
		for (const att of attachments) {
			// Skip already migrated attachments to avoid double-copy
			if (att.final_path) {
				continue;
			}
			// Verify temp_path is still inside the fleeting attachments base
			const tempResolved = await fs.realpath(att.temp_path).catch(() => null);
			if (!tempResolved || !tempResolved.startsWith(baseReal + path.sep)) {
				throw new Error("临时附件路径越界");
			}
			const original = att.original_name;
			let candidate = path.join(finalDir, original);
			// De-duplicate by appending short id before extension; loop to ensure unique
			while (true) {
				try {
					await fs.access(candidate);
					const ext = path.extname(original);
					const base = path.basename(original, ext);
					candidate = path.join(finalDir, `${base}-${shortId()}${ext}`);
				} catch {
					// file does not exist, use candidate name
					break;
				}
			}
			const candidateReal = await fs.realpath(path.dirname(candidate));
			const dest = path.join(candidateReal, path.basename(candidate));
			const relativeToFinal = path.relative(finalReal, dest);
			if (!relativeToFinal || path.isAbsolute(relativeToFinal) || relativeToFinal.startsWith("..")) {
				throw new Error("正式附件路径越界");
			}
			await fs.copyFile(att.temp_path, dest);
			finalPaths.push(dest);
			migratedIds.push(att.attachment_id);
			update.run(dest, att.attachment_id);
		}
		return finalPaths;
	} catch (error) {
		// Rollback any already-copied final attachments and reset DB final_path on failure
		await rollbackMigratedAttachments(finalPaths, db, migratedIds);
		throw error;
	}
};

const rollbackMigratedAttachments = async (finalPaths: string[], db: RidgeDatabase, attachmentIds: string[]) => {
	for (const p of finalPaths) {
		try {
			await fs.unlink(p);
		} catch {
			// ignore rollback errors
		}
	}
	for (const id of attachmentIds) {
		try {
			db.prepare("UPDATE fleeting_attachments SET final_path = NULL WHERE attachment_id = ?").run(id);
		} catch {
			// ignore
		}
	}
};

export function createFleetingRouter(deps: FleetingRouterDeps) {
	const router = express.Router();
	const { db, workspaceDir, analysisRunner } = deps;

	router.get("/", (_req: Request, res: Response, next: NextFunction) => {
		try {
			const rows = db
				.prepare("SELECT * FROM fleeting_notes ORDER BY created_at DESC")
				.all() as Record<string, unknown>[];
			const noteIds = rows.map((r) => r.note_id as string);
			const attachmentsByNote: Record<string, FleetingAttachmentRecord[]> = {};
			if (noteIds.length > 0) {
				const placeholders = noteIds.map(() => "?").join(",");
				const attRows = db
					.prepare(`SELECT * FROM fleeting_attachments WHERE note_id IN (${placeholders})`)
					.all(...noteIds) as FleetingAttachmentRecord[];
				for (const att of attRows) {
					if (!attachmentsByNote[att.note_id]) attachmentsByNote[att.note_id] = [];
					attachmentsByNote[att.note_id].push(att);
				}
			}
			res.json({
				notes: rows.map((row) => toPublicNote(row, attachmentsByNote[row.note_id as string] ?? [])),
			});
		} catch (error) {
			forwardError(error, next);
		}
	});

	router.get("/clips", (_req: Request, res: Response, next: NextFunction) => {
		try {
			const rows = db
				.prepare("SELECT * FROM clips ORDER BY created_at DESC")
				.all() as Record<string, unknown>[];
			res.json({
				clips: rows.map((row) => ({
					id: row.clip_id,
					title: row.title,
					url: row.url,
					content: row.content,
					source: row.source,
					createdAt: row.created_at,
					updatedAt: row.updated_at,
				})),
			});
		} catch (error) {
			forwardError(error, next);
		}
	});

	router.post("/", async (req: Request, res: Response, next: NextFunction) => {
		try {
			const body = req.body ?? {};
			const files = getFilesFromRequest(req);
			// Always validate body with zod to reject extra fields like projectId
			createFleetingSchema.parse(body);
			const content = typeof body.content === "string" ? body.content.trim() : "";
			if (!content && files.length === 0) {
				const error = new Error("内容或附件至少提供一个") as HttpError;
				error.statusCode = 400;
				throw error;
			}
			const now = Date.now();
			const id = makeId("flash");
			db.prepare(
				`INSERT INTO fleeting_notes(
				  note_id, type, content, status, analysis_status, created_at, updated_at
				) VALUES(?, ?, ?, 'pending', 'unanalyzed', ?, ?)`,
			).run(id, files.length > 0 ? "file" : "text", content || "", now, now);
			let savedAttachments: FleetingAttachmentRecord[] = [];
			try {
				savedAttachments = files.length > 0
					? await saveFleetingAttachments(workspaceDir, db, id, files)
					: [];
			} catch (saveError) {
				// On attachment save failure, cleanup note, DB records, and temp files
				try {
					await cleanupFleetingAttachments(workspaceDir, db, id);
				} catch {}
				try {
					db.prepare("DELETE FROM fleeting_notes WHERE note_id = ?").run(id);
				} catch {}
				throw saveError;
			}
			void Promise.resolve(analysisRunner?.run(id)).catch(() => undefined);
			const note = getNoteOrThrow(db, id);
			res.status(201).json({ note: toPublicNote(note, savedAttachments) });
		} catch (error) {
			forwardError(error, next);
		}
	});

	router.patch("/:noteId", (req: Request, res: Response, next: NextFunction) => {
		try {
			getNoteOrThrow(db, req.params.noteId);
			const payload = patchFleetingSchema.parse(req.body ?? {});
			const now = Date.now();
			const sets: string[] = ["updated_at = ?"];
			const params: unknown[] = [now];

			if (payload.content !== undefined) {
				sets.push("content = ?");
				params.push(payload.content);
			}
			if (payload.status !== undefined) {
				sets.push("status = ?");
				params.push(payload.status);
			}
			if (payload.analysisStatus !== undefined) {
				sets.push("analysis_status = ?");
				params.push(payload.analysisStatus);
			}
			if (payload.suggestion !== undefined) {
				sets.push("suggestion = ?");
				params.push(payload.suggestion);
			}

			params.push(req.params.noteId);
			db.prepare(
				`UPDATE fleeting_notes SET ${sets.join(", ")} WHERE note_id = ?`,
			).run(...params);

			const note = getNoteOrThrow(db, req.params.noteId);
			const attachments = listFleetingAttachments(db, req.params.noteId);
			res.json({ note: toPublicNote(note, attachments) });
		} catch (error) {
			forwardError(error, next);
		}
	});

	router.delete("/:noteId", async (req: Request, res: Response, next: NextFunction) => {
		try {
			const info = db
				.prepare("DELETE FROM fleeting_notes WHERE note_id = ?")
				.run(req.params.noteId);
			if (info.changes === 0) {
				const error = new Error("闪念不存在") as HttpError;
				error.statusCode = 404;
				throw error;
			}
			await cleanupFleetingAttachments(workspaceDir, db, req.params.noteId);
			res.json({ deleted: true });
		} catch (error) {
			forwardError(error, next);
		}
	});

	router.patch(
		"/:noteId/analysis",
		(req: Request, res: Response, next: NextFunction) => {
			try {
				const existing = db
					.prepare("SELECT note_id FROM fleeting_notes WHERE note_id = ?")
					.get(req.params.noteId);
				if (!existing) {
					res.json({ ignored: true });
					return;
				}
				const payload = analysisSchema.parse(req.body ?? {});
				const now = Date.now();
				db.prepare(
					`UPDATE fleeting_notes SET
					  analysis_status = 'suggested',
					  recommendation_type = ?,
					  recommendation_text = ?,
					  draft = ?,
					  requires_input = ?,
					  pi_session_id = ?,
					  pi_session_file = ?,
					  updated_at = ?
					 WHERE note_id = ?`,
				).run(
					payload.recommendationType,
					payload.recommendationText,
					payload.draft,
					payload.requiresInput ? 1 : 0,
					payload.piSessionId ?? null,
					payload.piSessionFile ?? null,
					now,
					req.params.noteId,
				);
				const note = getNoteOrThrow(db, req.params.noteId);
				const attachments = listFleetingAttachments(db, req.params.noteId);
				res.json({ ignored: false, note: toPublicNote(note, attachments) });
			} catch (error) {
				forwardError(error, next);
			}
		},
	);

	router.post(
		"/:noteId/process/journal",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				getNoteOrThrow(db, req.params.noteId);
				const payload = journalSchema.parse(req.body ?? {});
				// 1. Migrate attachments first so if it fails, nothing new is created
				const finalPaths = await migrateAttachmentsToFinal(workspaceDir, db, req.params.noteId);
				// 2. Create target (journal) only after attachments are safely migrated
				const journalPath = await appendToTodayJournal(workspaceDir, payload.content);
				// 3. Delete note and attachments records, then cleanup temp dir
				db.prepare("DELETE FROM fleeting_notes WHERE note_id = ?").run(req.params.noteId);
				await cleanupFleetingAttachments(workspaceDir, db, req.params.noteId);
				res.json({ deleted: true, journalPath, migratedAttachments: finalPaths });
			} catch (error) {
				forwardError(error, next);
			}
		},
	);

	router.post(
		"/:noteId/process/clip",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				getNoteOrThrow(db, req.params.noteId);
				const payload = clipSchema.parse(req.body ?? {});
				const now = Date.now();
				const clipId = makeId("clip");
				// 1. Migrate attachments first so if it fails, nothing new is created
				const finalPaths = await migrateAttachmentsToFinal(workspaceDir, db, req.params.noteId);
				// 2. Create target (clip) only after attachments are safely migrated
				const createClip = db.transaction(() => {
					db.prepare(
						`INSERT INTO clips(
						  clip_id, title, url, content, source, created_at, updated_at
						) VALUES(?, ?, ?, ?, ?, ?, ?)`,
					).run(
						clipId,
						payload.title,
						payload.url || null,
						payload.content,
						payload.source || null,
						now,
						now,
					);
				});
				createClip();
				// 3. Delete note and cleanup temp dir
				db.prepare("DELETE FROM fleeting_notes WHERE note_id = ?").run(req.params.noteId);
				await cleanupFleetingAttachments(workspaceDir, db, req.params.noteId);
				res.json({
					deleted: true,
					clip: {
						id: clipId,
						title: payload.title,
						url: payload.url || null,
						content: payload.content,
						source: payload.source || null,
						createdAt: now,
						updatedAt: now,
					},
					migratedAttachments: finalPaths,
				});
			} catch (error) {
				forwardError(error, next);
			}
		},
	);

	router.post("/:noteId/process/task", (req: Request, res: Response, next: NextFunction) => {
		try {
			getNoteOrThrow(db, req.params.noteId);
			res.status(202).json({
				processed: false,
				message: "任务系统正在接入中，暂不能从闪念创建任务",
			});
		} catch (error) {
			forwardError(error, next);
		}
	});

	return router;
}
