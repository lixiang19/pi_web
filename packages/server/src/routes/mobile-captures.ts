import crypto from "node:crypto";
import express, {
	type NextFunction,
	type Request,
	type Response,
} from "express";
import { z } from "zod";
import { getDevice, validateDeviceToken } from "../devices.js";
import type { RidgeDatabase } from "../db/index.js";
import {
	deleteFleetingAttachmentsForNote,
	storeFleetingAttachment,
} from "../fleeting-attachments.js";
import type { FleetingAnalysisRunner } from "./fleeting.js";

type HttpError = Error & { statusCode?: number };

interface MobileCapturesRouterDeps {
	db: RidgeDatabase;
	workspaceDir: string;
	getAnalysisRunner?: () => FleetingAnalysisRunner | undefined;
}

const base64Regex = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const mobileCaptureAttachmentSchema = z.object({
	kind: z.enum(["audio", "photo"]),
	name: z.string().trim().min(1),
	mimeType: z.string().trim().min(1),
	base64: z.string().trim().min(1).refine((value) => base64Regex.test(value), {
		message: "附件内容必须是有效 base64",
	}),
});

const mobileCaptureSchema = z
	.object({
		deviceId: z.string().trim().min(1),
		token: z.string().trim().min(1),
		text: z.string().optional().default(""),
		attachments: z.array(mobileCaptureAttachmentSchema).max(10).optional().default([]),
	})
	.refine(
		(value) => value.text.trim().length > 0 || value.attachments.length > 0,
		{ message: "文字或附件至少需要一个" },
	);

const makeId = (prefix: string) =>
	`${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

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

export function createMobileCapturesRouter(deps: MobileCapturesRouterDeps) {
	const router = express.Router();
	const { db, workspaceDir, getAnalysisRunner } = deps;

	router.post("/", async (req: Request, res: Response, next: NextFunction) => {
		let noteId: string | null = null;
		try {
			const payload = mobileCaptureSchema.parse(req.body ?? {});
			const device = await getDevice(payload.deviceId);
			if (device?.deviceType !== "android") {
				const error = new Error("Android device not found") as HttpError;
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
			noteId = makeId("flash");
			const metadata = {
				source: "android",
				deviceId: payload.deviceId,
				attachmentKinds: payload.attachments.map((attachment) => attachment.kind),
			};
			db.prepare(
				`INSERT INTO fleeting_notes(
				  note_id, content, status, capture_type, metadata_json, analysis_status, created_at, updated_at
				) VALUES(?, ?, 'pending', 'mobile_capture', ?, 'unanalyzed', ?, ?)`,
			).run(noteId, payload.text, JSON.stringify(metadata), now, now);

			const attachmentRecords = [];
			for (const attachment of payload.attachments) {
				const buffer = Buffer.from(attachment.base64, "base64");
				const record = await storeFleetingAttachment(
					db,
					workspaceDir,
					noteId,
					attachment.name,
					buffer,
					attachment.mimeType,
				);
				attachmentRecords.push(record);
			}

			void Promise.resolve(getAnalysisRunner?.()?.run(noteId)).catch((err: unknown) => {
				console.error(`[fleeting-analysis] noteId=${noteId} route=POST /api/mobile/captures`, err);
			});

			res.status(201).json({
				note: toPublicNote(getNote(db, noteId)),
				attachments: attachmentRecords.map((record) =>
					toPublicAttachment(record as unknown as Record<string, unknown>),
				),
			});
		} catch (error) {
			if (noteId) {
				await deleteFleetingAttachmentsForNote(db, workspaceDir, noteId);
				db.prepare("DELETE FROM fleeting_notes WHERE note_id = ?").run(noteId);
			}
			forwardError(error, next);
		}
	});

	return router;
}
