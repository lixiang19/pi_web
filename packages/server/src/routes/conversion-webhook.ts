import path from "node:path";
import fs from "node:fs/promises";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import {
	handleConversionResult,
} from "../file-conversion-worker.js";
import type { ConversionServiceClient } from "../conversion-service-client.js";
import type { createBackgroundJobQueue } from "../background-jobs.js";
import type { RidgeDatabase } from "../db/index.js";

export interface ConversionWebhookDeps {
	getRidgeDb: () => Promise<RidgeDatabase>;
	getJobQueue: () => ReturnType<typeof createBackgroundJobQueue> | undefined;
	conversionClient: ConversionServiceClient;
	workspaceDir: string;
	callbackToken: string;
}

const artifactSchema = z.object({
	artifactId: z.string(),
	name: z.string(),
	mimeType: z.string(),
	size: z.number(),
	inline: z.boolean(),
	content: z.string().optional(),
	downloadUrl: z.string().optional(),
});

const errorSchema = z.object({
	code: z.string(),
	message: z.string(),
	details: z.any().optional(),
});

const webhookPayloadSchema = z.object({
	jobId: z.string(),
	status: z.enum(["queued", "running", "succeeded", "failed", "canceled"]),
	task: z.string().optional(),
	createdAt: z.string().optional(),
	startedAt: z.string().optional(),
	completedAt: z.string().optional(),
	clientJobId: z.string().optional(),
	metadata: z.any().optional(),
	result: z.any().optional(),
	artifacts: z.array(artifactSchema).optional(),
	usage: z.object({
		inputTokens: z.number().nullable().optional(),
		outputTokens: z.number().nullable().optional(),
		model: z.string().nullable().optional(),
		credits: z.number().optional(),
	}).optional(),
	warnings: z.array(z.string()).optional(),
	error: errorSchema.nullable().optional(),
});

/**
 * 校验 webhook 路径的 workspace 安全（realpath + symlink）
 */
async function assertWebhookPathSafe(
	filePath: string,
	workspaceDir: string,
): Promise<void> {
	const resolved = path.resolve(workspaceDir, filePath);
	let realResolved: string;
	try {
		realResolved = await fs.realpath(resolved);
	} catch {
		realResolved = resolved;
	}
	const rel = path.relative(workspaceDir, realResolved);
	if (rel.startsWith("..") || path.isAbsolute(rel)) {
		throw new Error(`Webhook path outside workspace: ${filePath}`);
	}
	if (realResolved.includes(`${path.sep}.ridge${path.sep}`) || realResolved.endsWith(`${path.sep}.ridge`)) {
		throw new Error(`.ridge system path rejected: ${filePath}`);
	}
}

export function createConversionWebhookRouter(deps: ConversionWebhookDeps) {
	const router = express.Router();

	router.post("/api/webhooks/conversion", async (req: Request, res: Response, next: NextFunction) => {
		try {
			// 1. Token 验签（callbackToken 为空时拒绝）
			if (!deps.callbackToken || deps.callbackToken.length === 0) {
				res.status(503).json({ error: "Webhook disabled: callback token not configured" });
				return;
			}
			const token = req.query.token;
			if (!token || token !== deps.callbackToken) {
				res.status(401).json({ error: "Unauthorized" });
				return;
			}

			// 2. 严格 schema 校验
			const parseResult = webhookPayloadSchema.safeParse(req.body);
			if (!parseResult.success) {
				res.status(400).json({ error: "Invalid payload", details: parseResult.error.format() });
				return;
			}
			const payload = parseResult.data;

			// 3. 只处理终态回调
			if (payload.status !== "succeeded" && payload.status !== "failed" && payload.status !== "canceled") {
				// 非终态回调，返回 200 但不做任何处理
				res.status(200).json({ received: true, note: "Non-terminal status ignored" });
				return;
			}

			const db = await deps.getRidgeDb();
			const jobQueue = deps.getJobQueue();

			// 4. 通过持久化的 python_conversion_jobs 表查找本地记录
			// 优先用 jobId 查表，而不是从 clientJobId 反推路径
			const jobRow = db
				.prepare("SELECT file_path FROM python_conversion_jobs WHERE python_job_id = ?")
				.get(payload.jobId) as { file_path: string } | undefined;

			let ridgeFileId: string | null = null;
			if (jobRow) {
				ridgeFileId = jobRow.file_path;
			} else {
				// fallback：通过 metadata.ridgeFileId 查找
				if (typeof payload.metadata?.ridgeFileId === "string" && payload.metadata.ridgeFileId) {
					ridgeFileId = payload.metadata.ridgeFileId;
				}
			}

			if (!ridgeFileId) {
				// 找不到关联记录时返回 200，避免 Python 服务重试风暴
				res.status(200).json({ received: true, note: "No local record mapped" });
				return;
			}

			// 5. Workspace 边界校验：确保 ridgeFileId 在 workspace 内（realpath + symlink）
			try {
				await assertWebhookPathSafe(ridgeFileId, deps.workspaceDir);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				res.status(400).json({ error: msg });
				return;
			}

			// 6. 校验 file_processing_status 记录存在（防止操作不存在的文件）
			const statusRow = db
				.prepare("SELECT status FROM file_processing_status WHERE file_path = ?")
				.get(ridgeFileId) as { status: string } | undefined;
			if (!statusRow) {
				res.status(200).json({ received: true, note: "No file_processing_status record" });
				return;
			}

			// 7. jobQueue 为空安全处理
			if (!jobQueue) {
				res.status(503).json({ error: "Job queue not available" });
				return;
			}

			// 8. 构造 ConversionJob 类型（与 schema 严格匹配）
			const pythonJob = {
				jobId: payload.jobId,
				status: payload.status,
				task: (payload.task ?? "document.markdown") as import("../conversion-service-client.js").ConversionTask,
				createdAt: payload.createdAt ?? new Date().toISOString(),
				startedAt: payload.startedAt,
				completedAt: payload.completedAt,
				clientJobId: payload.clientJobId,
				metadata: payload.metadata,
				result: payload.result,
				artifacts: payload.artifacts,
				usage: payload.usage,
				warnings: payload.warnings,
				error: payload.error ?? null,
			};

			await handleConversionResult({
				db,
				jobQueue,
				workspaceDir: deps.workspaceDir,
				filePath: ridgeFileId,
				pythonJob,
				conversionClient: deps.conversionClient,
			});

			res.status(200).json({ received: true });
		} catch (error) {
			next(error);
		}
	});

	return router;
}
