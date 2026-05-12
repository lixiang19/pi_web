import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import express, {
	type NextFunction,
	type Request,
	type Response,
} from "express";
import { z } from "zod";
import multer from "multer";
import { atomicWriteFile } from "../utils/fs.js";
import {
	storeFleetingAttachment,
	getFleetingAttachments,
	deleteFleetingAttachmentsForNote,
	copyFleetingAttachmentsToFormal,
	deleteFleetingAttachmentRecords,
	deleteFleetingTempFiles,
} from "../fleeting-attachments.js";
import type { RidgeDatabase } from "../db/index.js";

// --- Task system helpers (direct DB access to avoid circular deps / async global DB) ---
// These mirror task-system.ts logic but work with the injected db and workspaceDir.

const TASK_PRIORITIES = ["normal", "important", "urgent"] as const;

const DEFAULT_MILESTONE_TITLE = "未归属";
const DEFAULT_MILESTONE_COLOR = "#64748b";

const normalizeWorkspacePath = (workspaceDir: string): string =>
	path.resolve(workspaceDir);

const createId = (prefix: string): string => `${prefix}-${crypto.randomUUID()}`;

const ensureDefaultMilestone = (db: RidgeDatabase, workspaceDir: string) => {
	const workspacePath = normalizeWorkspacePath(workspaceDir);
	const existing = db
		.prepare(
			`SELECT m.*, COUNT(t.task_id) AS task_count
       FROM workspace_milestones m
       LEFT JOIN workspace_tasks t ON t.milestone_id = m.milestone_id
       WHERE m.workspace_path = ? AND m.is_system = 1 AND m.title = ?
       GROUP BY m.milestone_id`,
		)
		.get(workspacePath, DEFAULT_MILESTONE_TITLE) as Record<string, unknown> | undefined;

	if (existing) {
		return existing.milestone_id as string;
	}

	const now = Date.now();
	const id = createId("milestone");
	db.prepare(
		`INSERT INTO workspace_milestones(
      milestone_id, workspace_path, title, goal, acceptance_criteria, status,
      due_date, is_system, color, sort_order, created_at, updated_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	).run(
		id,
		workspacePath,
		DEFAULT_MILESTONE_TITLE,
		"系统默认里程碑，用于承载未手动归属的任务",
		"系统里程碑不允许完成",
		"pending",
		null,
		1,
		DEFAULT_MILESTONE_COLOR,
		0,
		now,
		now,
	);
	return id;
};

type HttpError = Error & { statusCode?: number };

export interface FleetingAnalysisRunner {
	run: (noteId: string) => Promise<void> | void;
	resetJob: (noteId: string) => void;
}

interface FleetingRouterDeps {
	db: RidgeDatabase;
	workspaceDir: string;
	getAnalysisRunner?: () => FleetingAnalysisRunner | undefined;
}

const captureSchema = z.object({
	content: z.string().optional().default(""),
	type: z.enum([
		"text",
		"screenshot_region",
		"screenshot_window",
		"screenshot_fullscreen",
		"file",
		"clipboard",
		"selection",
		"browser_url",
		"audio",
	]),
	metadata: z.record(z.string(), z.unknown()).optional(),
	attachments: z
		.array(
			z.object({
				name: z.string().min(1),
				mimeType: z.string().min(1),
				base64: z.string().min(1),
			}),
		)
		.optional()
		.default([]),
	delayAnalysis: z.boolean().optional().default(false),
});

const createFleetingSchema = z.object({
	content: z.string().trim().min(1),
	delayAnalysis: z.boolean().optional().default(false),
});

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

const taskSchema = z.object({
	title: z.string().trim().min(1),
	priority: z.enum(TASK_PRIORITIES),
	acceptanceCriteria: z.string().trim().min(1),
	dueDate: z.number().int().nonnegative().nullable().optional(),
	projectId: z.string().trim().min(1).nullable().optional(),
});

const milestoneSchema = z.object({
	title: z.string().trim().min(1),
	goal: z.string().trim().min(1),
	acceptanceCriteria: z.string().trim().min(1),
	dueDate: z.number().int().nonnegative().nullable().optional(),
	color: z.string().trim().min(1).optional(),
	projectId: z.string().trim().min(1).nullable().optional(),
});

const toPublicNote = (row: Record<string, unknown>) => ({
	id: row.note_id,
	content: row.content,
	status: row.status,
	analysisStatus: row.analysis_status,
	recommendationType: row.recommendation_type,
	recommendationText: row.recommendation_text,
	draft: row.draft,
	requiresInput: row.requires_input === 1,
	lastError: row.last_error,
	retryCount: row.retry_count,
	piSessionId: row.pi_session_id,
	piSessionFile: row.pi_session_file,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

const toPublicAttachment = (row: Record<string, unknown>) => ({
	id: row.attachment_id,
	noteId: row.note_id,
	originalName: row.original_name,
	storedName: row.stored_name,
	mimeType: row.mime_type,
	size: row.size,
	sha256: row.sha256,
	createdAt: row.created_at,
});

const makeId = (prefix: string) =>
	`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

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

const upload = multer({
	storage: multer.memoryStorage(),
	limits: {
		files: 10,
		fileSize: 50 * 1024 * 1024,
	},
});

export function createFleetingRouter(deps: FleetingRouterDeps) {
	const router = express.Router();
	const { db, workspaceDir, getAnalysisRunner } = deps;
	const workspacePath = normalizeWorkspacePath(workspaceDir);

	router.get("/", (_req: Request, res: Response, next: NextFunction) => {
		try {
			const rows = db
				.prepare("SELECT * FROM fleeting_notes ORDER BY created_at DESC")
				.all() as Record<string, unknown>[];
			res.json({ notes: rows.map(toPublicNote) });
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

	router.post("/", (req: Request, res: Response, next: NextFunction) => {
		try {
			const payload = createFleetingSchema.parse(req.body ?? {});
			const now = Date.now();
			const id = makeId("flash");
			db.prepare(
				`INSERT INTO fleeting_notes(
				  note_id, content, status, analysis_status, created_at, updated_at
				) VALUES(?, ?, 'pending', 'unanalyzed', ?, ?)`,
			).run(id, payload.content, now, now);
			if (!payload.delayAnalysis) {
				void Promise.resolve(getAnalysisRunner?.()?.run(id)).catch(() => undefined);
			}
			const note = getNoteOrThrow(db, id);
			res.status(201).json({ note: toPublicNote(note) });
		} catch (error) {
			forwardError(error, next);
		}
	});

	router.post("/capture", async (req: Request, res: Response, next: NextFunction) => {
		try {
			const payload = captureSchema.parse(req.body ?? {});
			const now = Date.now();
			const id = makeId("flash");
			db.prepare(
				`INSERT INTO fleeting_notes(
				  note_id, content, status, capture_type, metadata_json, analysis_status, created_at, updated_at
				) VALUES(?, ?, 'pending', ?, ?, 'unanalyzed', ?, ?)`,
			).run(
				id,
				payload.content,
				payload.type,
				JSON.stringify(payload.metadata ?? {}),
				now,
				now,
			);

			const attachmentRecords = [];
			for (const att of payload.attachments) {
				const buffer = Buffer.from(att.base64, "base64");
				const record = await storeFleetingAttachment(
					db,
					workspaceDir,
					id,
					att.name,
					buffer,
					att.mimeType,
				);
				attachmentRecords.push(record);
			}

			// Only enqueue analysis after attachments are stored.
			// If delayAnalysis is true, skip entirely (caller will trigger later).
			if (!payload.delayAnalysis) {
				void Promise.resolve(getAnalysisRunner?.()?.run(id)).catch(() => undefined);
			}

			const note = getNoteOrThrow(db, id);
			res.status(201).json({
				note: {
					...toPublicNote(note),
					captureType: payload.type,
					metadata: payload.metadata ?? {},
				},
				attachments: attachmentRecords.map((r) =>
					toPublicAttachment(r as unknown as Record<string, unknown>),
				),
			});
		} catch (error) {
			forwardError(error, next);
		}
	});

	router.post(
		"/:noteId/attachments",
		upload.array("files", 10),
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const noteId = req.params.noteId;
				getNoteOrThrow(db, noteId);
				const files = req.files as Express.Multer.File[] | undefined;
				if (!files || files.length === 0) {
					const error = new Error("No files uploaded") as HttpError;
					error.statusCode = 400;
					throw error;
				}

				const records = [];
				for (const file of files) {
					const record = await storeFleetingAttachment(
						db,
						workspaceDir,
						noteId,
						file.originalname,
						file.buffer,
						file.mimetype,
					);
					records.push(record);
				}

				res.status(201).json({
					attachments: records.map((r) => toPublicAttachment(r as unknown as Record<string, unknown>)),
				});
			} catch (error) {
				forwardError(error, next);
			}
		},
	);

	router.get(
		"/:noteId/attachments",
		(req: Request, res: Response, next: NextFunction) => {
			try {
				const noteId = req.params.noteId;
				getNoteOrThrow(db, noteId);
				const rows = getFleetingAttachments(db, noteId);
				res.json({
					attachments: rows.map((r) => toPublicAttachment(r as unknown as Record<string, unknown>)),
				});
			} catch (error) {
				forwardError(error, next);
			}
		},
	);

	router.delete("/:noteId", async (req: Request, res: Response, next: NextFunction) => {
		try {
			const noteId = req.params.noteId;
			// 1. 清理临时附件（先删 DB 和文件，再删闪念记录）
			await deleteFleetingAttachmentsForNote(db, workspaceDir, noteId);

			const info = db
				.prepare("DELETE FROM fleeting_notes WHERE note_id = ?")
				.run(noteId);
			if (info.changes === 0) {
				const error = new Error("闪念不存在") as HttpError;
				error.statusCode = 404;
				throw error;
			}
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
				res.json({ ignored: false, note: toPublicNote(getNoteOrThrow(db, req.params.noteId)) });
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
				const { migratedPaths } = await copyFleetingAttachmentsToFormal(
					db,
					workspaceDir,
					req.params.noteId,
				);
				const journalPath = await appendToTodayJournal(workspaceDir, payload.content);
				const cleanup = db.transaction(() => {
					deleteFleetingAttachmentRecords(db, req.params.noteId);
					db.prepare("DELETE FROM fleeting_notes WHERE note_id = ?").run(req.params.noteId);
				});
				cleanup();
				await deleteFleetingTempFiles(workspaceDir, req.params.noteId);
				res.json({ deleted: true, journalPath, migratedAttachments: migratedPaths });
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
				const { migratedPaths } = await copyFleetingAttachmentsToFormal(
					db,
					workspaceDir,
					req.params.noteId,
				);
				const now = Date.now();
				const clipId = makeId("clip");
				const createAndDelete = db.transaction(() => {
					deleteFleetingAttachmentRecords(db, req.params.noteId);
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
					db.prepare("DELETE FROM fleeting_notes WHERE note_id = ?").run(
						req.params.noteId,
					);
				});
				createAndDelete();
				await deleteFleetingTempFiles(workspaceDir, req.params.noteId);
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
					migratedAttachments: migratedPaths,
				});
			} catch (error) {
				forwardError(error, next);
			}
		},
	);

	// ====== process/task ======
	router.post("/:noteId/process/task", async (req: Request, res: Response, next: NextFunction) => {
		try {
			getNoteOrThrow(db, req.params.noteId);
			const payload = taskSchema.parse(req.body ?? {});
			const { migratedPaths } = await copyFleetingAttachmentsToFormal(
				db,
				workspaceDir,
				req.params.noteId,
			);
			const defaultMilestoneId = ensureDefaultMilestone(db, workspaceDir);
			const now = Date.now();
			const taskId = createId("task");

			const createAndDelete = db.transaction(() => {
				deleteFleetingAttachmentRecords(db, req.params.noteId);
				db.prepare(
					`INSERT INTO workspace_tasks(
					  task_id, workspace_path, project_id, milestone_id, title, status, priority,
					  acceptance_criteria, due_date, blocked_reason, processing_session_id,
					  sort_order, created_at, updated_at
					) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				).run(
					taskId,
					workspacePath,
					payload.projectId ?? null,
					defaultMilestoneId,
					payload.title,
					"pending",
					payload.priority,
					payload.acceptanceCriteria,
					payload.dueDate ?? null,
					null,
					null,
					now,
					now,
					now,
				);
				db.prepare("DELETE FROM fleeting_notes WHERE note_id = ?").run(req.params.noteId);
			});
			createAndDelete();
			await deleteFleetingTempFiles(workspaceDir, req.params.noteId);

			const row = db
				.prepare("SELECT * FROM workspace_tasks WHERE task_id = ?")
				.get(taskId) as Record<string, unknown>;
			res.json({
				deleted: true,
				task: {
					id: row.task_id,
					workspacePath: row.workspace_path,
					projectId: row.project_id || null,
					milestoneId: row.milestone_id,
					title: row.title,
					status: row.status,
					priority: row.priority,
					acceptanceCriteria: row.acceptance_criteria,
					dueDate: row.due_date,
					blockedReason: row.blocked_reason,
					processingSessionId: row.processing_session_id,
					sortOrder: row.sort_order,
					createdAt: row.created_at,
					updatedAt: row.updated_at,
				},
				migratedAttachments: migratedPaths,
			});
		} catch (error) {
			forwardError(error, next);
		}
	});

	// ====== process/milestone ======
	router.post("/:noteId/process/milestone", async (req: Request, res: Response, next: NextFunction) => {
		try {
			getNoteOrThrow(db, req.params.noteId);
			const payload = milestoneSchema.parse(req.body ?? {});
			const { migratedPaths } = await copyFleetingAttachmentsToFormal(
				db,
				workspaceDir,
				req.params.noteId,
			);
			const now = Date.now();
			const milestoneId = createId("milestone");

			const createAndDelete = db.transaction(() => {
				deleteFleetingAttachmentRecords(db, req.params.noteId);
				db.prepare(
					`INSERT INTO workspace_milestones(
					  milestone_id, workspace_path, project_id, title, goal, acceptance_criteria, status,
					  due_date, is_system, color, sort_order, created_at, updated_at
					) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				).run(
					milestoneId,
					workspacePath,
					payload.projectId ?? null,
					payload.title,
					payload.goal,
					payload.acceptanceCriteria,
					"pending",
					payload.dueDate ?? null,
					0,
					payload.color || DEFAULT_MILESTONE_COLOR,
					now,
					now,
					now,
				);
				db.prepare("DELETE FROM fleeting_notes WHERE note_id = ?").run(req.params.noteId);
			});
			createAndDelete();
			await deleteFleetingTempFiles(workspaceDir, req.params.noteId);

			const row = db
				.prepare("SELECT * FROM workspace_milestones WHERE milestone_id = ?")
				.get(milestoneId) as Record<string, unknown>;
			res.json({
				deleted: true,
				milestone: {
					id: row.milestone_id,
					workspacePath: row.workspace_path,
					projectId: row.project_id || null,
					title: row.title,
					goal: row.goal,
					acceptanceCriteria: row.acceptance_criteria,
					status: row.status,
					dueDate: row.due_date,
					isSystem: row.is_system === 1,
					color: row.color,
					sortOrder: row.sort_order,
					createdAt: row.created_at,
					updatedAt: row.updated_at,
				},
				migratedAttachments: migratedPaths,
			});
		} catch (error) {
			forwardError(error, next);
		}
	});

	// ====== process/attachment ======
	router.post("/:noteId/process/attachment", async (req: Request, res: Response, next: NextFunction) => {
		try {
			getNoteOrThrow(db, req.params.noteId);
			const attachments = getFleetingAttachments(db, req.params.noteId);
			if (attachments.length === 0) {
				const error = new Error("该闪念没有附件") as HttpError;
				error.statusCode = 400;
				throw error;
			}
			const { migratedPaths } = await copyFleetingAttachmentsToFormal(
				db,
				workspaceDir,
				req.params.noteId,
			);
			const cleanup = db.transaction(() => {
				deleteFleetingAttachmentRecords(db, req.params.noteId);
				db.prepare("DELETE FROM fleeting_notes WHERE note_id = ?").run(req.params.noteId);
			});
			cleanup();
			await deleteFleetingTempFiles(workspaceDir, req.params.noteId);
			res.json({ deleted: true, migratedAttachments: migratedPaths });
		} catch (error) {
			forwardError(error, next);
		}
	});

	router.post(
		"/:noteId/analyze",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const note = getNoteOrThrow(db, req.params.noteId);
				const runner = getAnalysisRunner?.();
				if (!runner) {
					const error = new Error("分析服务尚未就绪，请稍后重试") as HttpError;
					error.statusCode = 503;
					throw error;
				}
				// Reset to unanalyzed and trigger re-analysis
				const now = Date.now();
				db.prepare(
					`UPDATE fleeting_notes SET
					  analysis_status = 'unanalyzed',
					  last_error = NULL,
					  updated_at = ?
					 WHERE note_id = ?`,
				).run(now, req.params.noteId);

				runner.resetJob(req.params.noteId);
				res.json({ triggered: true, note: toPublicNote({ ...note, analysis_status: 'unanalyzed', updated_at: now }) });
			} catch (error) {
				forwardError(error, next);
			}
		},
	);

	router.get(
		"/:noteId/analysis",
		(req: Request, res: Response, next: NextFunction) => {
			try {
				const note = getNoteOrThrow(db, req.params.noteId);
				res.json({
					analysisStatus: note.analysis_status,
					recommendationType: note.recommendation_type,
					recommendationText: note.recommendation_text,
					draft: note.draft,
					requiresInput: note.requires_input === 1,
					lastError: note.last_error,
					retryCount: note.retry_count,
					updatedAt: note.updated_at,
				});
			} catch (error) {
				forwardError(error, next);
			}
		},
	);

	router.get(
		"/suggestions",
		(req: Request, res: Response, next: NextFunction) => {
			try {
				const status = req.query.status as string | undefined;
				let sql = "SELECT * FROM fleeting_notes";
				const params: (string | number)[] = [];
				if (status) {
					sql += " WHERE analysis_status = ?";
					params.push(status);
				}
				sql += " ORDER BY created_at DESC";
				const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
				res.json({ notes: rows.map(toPublicNote) });
			} catch (error) {
				forwardError(error, next);
			}
		},
	);

	return router;
}
