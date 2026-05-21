import crypto from "node:crypto";
import express, {
	type NextFunction,
	type Request,
	type Response,
} from "express";
import multer from "multer";
import { z } from "zod";
import {
	deleteFleetingAttachmentsForNote,
	getFleetingAttachments,
	storeFleetingAttachment,
} from "../fleeting-attachments.js";
import type { RidgeDatabase } from "../db/index.js";

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
	`${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

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

	router.get("/", (_req: Request, res: Response, next: NextFunction) => {
		try {
			const rows = db
				.prepare("SELECT * FROM fleeting_notes ORDER BY created_at DESC, note_id DESC")
				.all() as Record<string, unknown>[];
			res.json({ notes: rows.map(toPublicNote) });
		} catch (error) {
			forwardError(error, next);
		}
	});

	router.get("/clips", (_req: Request, res: Response, next: NextFunction) => {
		try {
			const rows = db
				.prepare("SELECT * FROM clips ORDER BY created_at DESC, clip_id DESC")
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
				void Promise.resolve(getAnalysisRunner?.()?.run(id)).catch((err: unknown) => {
					console.error(`[fleeting-analysis] noteId=${id} route=POST/`, err);
				});
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

			if (!payload.delayAnalysis) {
				void Promise.resolve(getAnalysisRunner?.()?.run(id)).catch((err: unknown) => {
					console.error(`[fleeting-analysis] noteId=${id} route=POST/capture`, err);
				});
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
				const now = Date.now();
				db.prepare(
					`UPDATE fleeting_notes SET
					  analysis_status = 'unanalyzed',
					  last_error = NULL,
					  updated_at = ?
					 WHERE note_id = ?`,
				).run(now, req.params.noteId);

				runner.resetJob(req.params.noteId);
				res.json({ triggered: true, note: toPublicNote({ ...note, analysis_status: "unanalyzed", updated_at: now }) });
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
				sql += " ORDER BY created_at DESC, note_id DESC";
				const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
				res.json({ notes: rows.map(toPublicNote) });
			} catch (error) {
				forwardError(error, next);
			}
		},
	);

	return router;
}
