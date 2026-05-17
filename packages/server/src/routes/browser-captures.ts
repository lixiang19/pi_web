import crypto from "node:crypto";
import express, {
	type NextFunction,
	type Request,
	type Response,
} from "express";
import { z } from "zod";
import { getDevice, validateDeviceToken } from "../devices.js";
import type { RidgeDatabase } from "../db/index.js";
import type { FleetingAnalysisRunner } from "./fleeting.js";

type HttpError = Error & { statusCode?: number };

interface BrowserCapturesRouterDeps {
	db: RidgeDatabase;
	getAnalysisRunner?: () => FleetingAnalysisRunner | undefined;
}

const SENSITIVE_QUERY_KEYS = new Set([
	"access_token",
	"auth",
	"code",
	"credential",
	"key",
	"password",
	"refresh_token",
	"secret",
	"session",
	"signature",
	"token",
]);

const browserCaptureSchema = z.object({
	deviceId: z.string().trim().min(1),
	token: z.string().trim().min(1),
	url: z.string().trim().url(),
	title: z.string().trim().min(1).max(500),
	siteName: z.string().trim().max(200).optional().default(""),
	language: z.string().trim().max(80).optional().default(""),
	reading: z
		.object({
			dwellMs: z.number().int().nonnegative(),
			maxScrollRatio: z.number().min(0).max(1),
			visitCount: z.number().int().positive().max(10_000),
			capturedAt: z.number().int().nonnegative().optional(),
		})
		.optional(),
});

const makeId = (prefix: string) =>
	`${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

function sanitizeUrl(rawUrl: string): string {
	const url = new URL(rawUrl);
	for (const key of Array.from(url.searchParams.keys())) {
		const normalized = key.toLowerCase();
		if (
			SENSITIVE_QUERY_KEYS.has(normalized) ||
			normalized.startsWith("utm_") ||
			normalized.includes("token") ||
			normalized.includes("secret") ||
			normalized.includes("password")
		) {
			url.searchParams.delete(key);
		}
	}
	url.username = "";
	url.password = "";
	return url.toString();
}

const toPublicNote = (row: Record<string, unknown>) => ({
	id: row.note_id,
	content: row.content,
	status: row.status,
	analysisStatus: row.analysis_status,
	captureType: row.capture_type,
	metadata: JSON.parse(String(row.metadata_json ?? "{}")) as Record<string, unknown>,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

const forwardError = (error: unknown, next: NextFunction) => {
	if (error instanceof z.ZodError) {
		const httpError = new Error(error.issues[0]?.message ?? "请求参数无效") as HttpError;
		httpError.statusCode = 400;
		next(httpError);
		return;
	}
	next(error);
};

const getNote = (db: RidgeDatabase, noteId: string) =>
	db
		.prepare("SELECT * FROM fleeting_notes WHERE note_id = ?")
		.get(noteId) as Record<string, unknown>;

export function createBrowserCapturesRouter(deps: BrowserCapturesRouterDeps) {
	const router = express.Router();
	const { db, getAnalysisRunner } = deps;

	router.post("/", async (req: Request, res: Response, next: NextFunction) => {
		let noteId: string | null = null;
		try {
			const payload = browserCaptureSchema.parse(req.body ?? {});
			const device = await getDevice(payload.deviceId);
			if (device?.deviceType !== "browser") {
				const error = new Error("Browser device not found") as HttpError;
				error.statusCode = 401;
				throw error;
			}
			const valid = await validateDeviceToken(payload.deviceId, payload.token);
			if (!valid) {
				const error = new Error("Invalid device token") as HttpError;
				error.statusCode = 401;
				throw error;
			}

			const now = Date.now();
			const sanitizedUrl = sanitizeUrl(payload.url);
			noteId = makeId("browser");
			const metadata = {
				source: "browser",
				deviceId: payload.deviceId,
				url: sanitizedUrl,
				title: payload.title,
				siteName: payload.siteName,
				language: payload.language,
				reading: payload.reading ?? null,
			};
				db.prepare(
					`INSERT INTO fleeting_notes(
					  note_id, content, status, capture_type, metadata_json, analysis_status, created_at, updated_at
					) VALUES(?, ?, 'pending', 'browser_page', ?, 'unanalyzed', ?, ?)`,
				).run(noteId, sanitizedUrl, JSON.stringify(metadata), now, now);

			void Promise.resolve(getAnalysisRunner?.()?.run(noteId)).catch((err: unknown) => {
				console.error(`[fleeting-analysis] noteId=${noteId} route=POST /api/browser/captures`, err);
			});

			res.status(201).json({ note: toPublicNote(getNote(db, noteId)) });
		} catch (error) {
			if (noteId) {
				db.prepare("DELETE FROM fleeting_notes WHERE note_id = ?").run(noteId);
			}
			forwardError(error, next);
		}
	});

	return router;
}

export const __test = {
	sanitizeUrl,
};
