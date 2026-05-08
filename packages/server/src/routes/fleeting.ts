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

interface FleetingRouterDeps {
	db: RidgeDatabase;
	workspaceDir: string;
	analysisRunner?: FleetingAnalysisRunner;
}

const createFleetingSchema = z.object({
	content: z.string().trim().min(1),
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

const ensureFleetingSchema = (db: RidgeDatabase) => {
	db.exec(`
CREATE TABLE IF NOT EXISTS fleeting_notes (
  note_id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  status TEXT NOT NULL,
  analysis_status TEXT NOT NULL,
  recommendation_type TEXT,
  recommendation_text TEXT,
  draft TEXT,
  requires_input INTEGER NOT NULL DEFAULT 0,
  pi_session_id TEXT,
  pi_session_file TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fleeting_notes_created_at
  ON fleeting_notes(created_at DESC);

CREATE TABLE IF NOT EXISTS clips (
  clip_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT,
  content TEXT NOT NULL,
  source TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clips_created_at
  ON clips(created_at DESC);
`);
};

const toPublicNote = (row: Record<string, unknown>) => ({
	id: row.note_id,
	content: row.content,
	status: row.status,
	analysisStatus: row.analysis_status,
	recommendationType: row.recommendation_type,
	recommendationText: row.recommendation_text,
	draft: row.draft,
	requiresInput: row.requires_input === 1,
	piSessionId: row.pi_session_id,
	piSessionFile: row.pi_session_file,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
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

export function createFleetingRouter(deps: FleetingRouterDeps) {
	const router = express.Router();
	const { db, workspaceDir, analysisRunner } = deps;
	ensureFleetingSchema(db);

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
			void Promise.resolve(analysisRunner?.run(id)).catch(() => undefined);
			const note = getNoteOrThrow(db, id);
			res.status(201).json({ note: toPublicNote(note) });
		} catch (error) {
			forwardError(error, next);
		}
	});

	router.delete("/:noteId", (req: Request, res: Response, next: NextFunction) => {
		try {
			const info = db
				.prepare("DELETE FROM fleeting_notes WHERE note_id = ?")
				.run(req.params.noteId);
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
				const journalPath = await appendToTodayJournal(workspaceDir, payload.content);
				db.prepare("DELETE FROM fleeting_notes WHERE note_id = ?").run(req.params.noteId);
				res.json({ deleted: true, journalPath });
			} catch (error) {
				forwardError(error, next);
			}
		},
	);

	router.post(
		"/:noteId/process/clip",
		(req: Request, res: Response, next: NextFunction) => {
			try {
				getNoteOrThrow(db, req.params.noteId);
				const payload = clipSchema.parse(req.body ?? {});
				const now = Date.now();
				const clipId = makeId("clip");
				const createAndDelete = db.transaction(() => {
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
