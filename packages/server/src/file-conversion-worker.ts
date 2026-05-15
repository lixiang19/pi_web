import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type Database from "better-sqlite3";
import {
	ConversionServiceClient,
	ConversionServiceError,
	mapErrorToRidgeAction,
	deriveTaskFromExtension,
	generateClientJobId,
	writeArtifactsToWorkspace,
	type ConversionJob,
	type ConversionOptions,
	type ConversionServiceConfig,
} from "./conversion-service-client.js";
import type { createBackgroundJobQueue } from "./background-jobs.js";
import { toPosixPath } from "./utils/paths.js";

type RidgeDatabase = InstanceType<typeof Database>;
type BackgroundJobQueue = ReturnType<typeof createBackgroundJobQueue>;

export interface FileConversionWorkerOptions {
	db: RidgeDatabase;
	jobQueue: BackgroundJobQueue;
	workspaceDir: string;
	pollIntervalMs?: number;
	conversionClient: ConversionServiceClient;
	config: ConversionServiceConfig;
	/** 补偿轮询间隔（毫秒），默认 30000 */
	pollFallbackMs?: number;
	/** 最大轮询时间（毫秒），默认 600000（10分钟） */
	maxPollMs?: number;
	/** 补偿轮询全局扫描间隔（毫秒），默认 60000 */
	compensationScanMs?: number;
}

export interface HandleConversionResultOptions {
	db: RidgeDatabase;
	jobQueue: BackgroundJobQueue;
	workspaceDir: string;
	filePath: string;
	pythonJob: ConversionJob;
	conversionClient: ConversionServiceClient;
}

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 校验 workspace 安全：realpath 解 symlink 后检查在 workspace 内、不是 .ridge、不越界。
 * 对不存在路径逐级解析已存在父目录，防止父级 symlink 绕过。
 */
async function assertWorkspaceSafe(
	filePath: string,
	workspaceDir: string,
): Promise<void> {
	// 先 realpath workspaceDir 本身，确保比较基准正确
	let realWorkspaceDir: string;
	try {
		realWorkspaceDir = await fs.realpath(workspaceDir);
	} catch {
		realWorkspaceDir = workspaceDir;
	}

	// 尝试 realpath 完整路径
	const resolved = path.resolve(workspaceDir, filePath);
	let realResolved: string;
	try {
		realResolved = await fs.realpath(resolved);
	} catch {
		// 文件可能不存在，逐级解析已存在父目录
		let current = resolved;
		realResolved = resolved;
		while (current !== path.dirname(current)) {
			current = path.dirname(current);
			try {
				const realParent = await fs.realpath(current);
				// 将 resolved 中未解析的后缀拼接到 realParent 上
				const suffix = path.relative(current, resolved);
				realResolved = path.join(realParent, suffix);
				break;
			} catch {
				// 继续向上
			}
		}
	}

	const rel = path.relative(realWorkspaceDir, realResolved);
	if (rel.startsWith("..") || path.isAbsolute(rel)) {
		throw new Error(`Path outside workspace: ${filePath} (real: ${realResolved})`);
	}
	if (realResolved.includes(`${path.sep}.ridge${path.sep}`) || realResolved.endsWith(`${path.sep}.ridge`)) {
		throw new Error(`.ridge system path rejected: ${filePath}`);
	}
}

/**
 * Resolve the actual source file path for conversion.
 * logicalPath: 状态机/DB 使用的逻辑路径（如 /workspace/doc.pdf）
 * 如果逻辑路径存在，返回它；否则尝试 .originals/ fallback。
 * 返回实际文件系统路径（可能指向 .originals/）。
 */
async function resolveActualSourcePath(logicalPath: string): Promise<string> {
	try {
		const st = await fs.stat(logicalPath);
		if (st.isFile()) return logicalPath;
	} catch {
		// Original not found; try .originals/ fallback
	}
	const dir = path.dirname(logicalPath);
	const name = path.basename(logicalPath);
	const originalsFallback = path.join(dir, ".originals", name);
	try {
		const st = await fs.stat(originalsFallback);
		if (st.isFile()) return originalsFallback;
	} catch {
		// Neither exists
	}
	throw new Error(`Source file not found at ${logicalPath} or in .originals/`);
}

/**
 * 处理 Python 服务返回的终态结果（幂等）。
 * 可被 worker 轮询和 webhook 回调同时调用。
 *
 * 关键约束：
 * - Python job 未终态前不能 jobQueue.complete()
 * - 成功落盘后才 complete background job
 * - 最终失败后才 fail background job
 * - transient retry 不能把 file_processing_status 写死为 convert_failed
 */
export async function handleConversionResult(
	options: HandleConversionResultOptions,
): Promise<{ success: boolean, error?: string }> {
	const { db, jobQueue, workspaceDir, filePath, pythonJob, conversionClient } =
		options;

	// 幂等：已经是终态则跳过
	const current = db
		.prepare("SELECT status FROM file_processing_status WHERE file_path = ?")
		.get(filePath) as { status: string } | undefined;

	if (
		!current ||
		current.status === "converted" ||
		current.status === "convert_failed" ||
		current.status === "index_failed"
	) {
		return { success: current?.status === "converted" };
	}

	// workspace 安全校验（realpath + symlink）
	try {
		await assertWorkspaceSafe(filePath, workspaceDir);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return failConversion(db, jobQueue, filePath, msg);
	}

	if (pythonJob.status === "succeeded") {
		try {
			// 下载所有产物（通过 ConversionServiceClient 公开方法）
			const downloaded = await conversionClient.downloadArtifacts(pythonJob, {
				maxSizeBytes: 100 * 1024 * 1024, // 100MB
				timeoutMs: 60_000,
			});

			// 校验必需产物
			const hasMd = downloaded.some((d) => d.artifact.name.endsWith(".md"));
			const hasMeta = downloaded.some((d) => d.artifact.name.endsWith(".metadata.json"));
			if (!hasMd) throw new Error("Missing required artifact: .md");
			if (!hasMeta) throw new Error("Missing required artifact: .metadata.json");

			// 落盘到 workspace（原子操作：失败不归档）
			await writeArtifactsToWorkspace(filePath, workspaceDir, downloaded);

			const now = Date.now();
			db.prepare(
				"UPDATE file_processing_status SET status = ?, converted_at = ?, updated_at = ? WHERE file_path = ?",
			).run("converted", now, now, filePath);

			// 写入 search_index_status 作为 RAG 入口（图片 OCR / 音频转写 / 文档 Markdown）
			const mdPath = filePath.replace(/\.[^.]+$/, ".md");
			const mdBuffer = downloaded.find((d) => d.artifact.name.endsWith(".md"))?.buffer ?? null;
			const mdHash = mdBuffer ? crypto.createHash("sha256").update(mdBuffer).digest("hex") : "";
			db.prepare(
				`INSERT INTO search_index_status (target_path, target_type, status, content_hash, updated_at)
				 VALUES (?, 'file', 'pending', ?, ?)
				 ON CONFLICT(target_path) DO UPDATE SET
					status = excluded.status,
					content_hash = excluded.content_hash,
					updated_at = excluded.updated_at`,
			).run(mdPath, mdHash, now);

			// Enqueue RAG indexing job so worker will chunk the converted content
			jobQueue.enqueue({
				type: "rag.index",
				relatedType: "file",
				relatedId: mdPath,
				payload: { targetPath: mdPath },
				maxAttempts: 3,
			});

			// 更新 python_conversion_jobs 为终态
			db.prepare(
				"UPDATE python_conversion_jobs SET status = ?, updated_at = ? WHERE file_path = ?",
			).run("succeeded", now, filePath);

			// complete 对应的 background job（如果有且仍是 running）
			const jobRow = db
				.prepare(
					"SELECT job_id FROM background_jobs WHERE related_type = 'file' AND related_id = ? AND status = 'running' ORDER BY created_at DESC LIMIT 1",
				)
				.get(filePath) as { job_id: string } | undefined;
			if (jobRow) {
				jobQueue.complete(jobRow.job_id, {
					converted: true,
					pythonJobId: pythonJob.jobId,
				});
			}

			return { success: true };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			// 下载/落盘失败是直接失败，不重试
			return failConversion(db, jobQueue, filePath, message);
		}
	}

	if (pythonJob.status === "canceled") {
		return failConversion(
			db,
			jobQueue,
			filePath,
			"Conversion canceled by Python service",
		);
	}

	// failed：根据错误码判断是否需要重试
	const errorCode = pythonJob.error?.code ?? "conversion_failed";
	const errorMessage = pythonJob.error?.message ?? "Conversion failed";
	const mapped = mapErrorToRidgeAction(
		new ConversionServiceError(
			errorMessage,
			errorCode,
			500,
			pythonJob.error?.details,
		),
	);

	if (mapped.shouldRetry && mapped.retryCount && mapped.retryCount > 0) {
		// transient retry：检查 background_jobs 是否已耗尽 maxAttempts
		const runningJobRow = db
			.prepare(
				"SELECT job_id, attempt_count, max_attempts FROM background_jobs WHERE related_type = 'file' AND related_id = ? AND status = 'running' ORDER BY created_at DESC LIMIT 1",
			)
			.get(filePath) as { job_id: string; attempt_count: number; max_attempts: number } | undefined;

		// 如果 running job 的 attempt_count >= max_attempts，说明即将耗尽重试，直接失败
		const willExhaust = runningJobRow && runningJobRow.attempt_count >= runningJobRow.max_attempts;

		if (!willExhaust) {
			// 未耗尽：让 background job 自然 retry，状态回到 pending
			const now = Date.now();
			db.prepare(
				"UPDATE file_processing_status SET status = ?, error = NULL, updated_at = ? WHERE file_path = ?",
			).run("pending", now, filePath);

			db.prepare(
				"UPDATE python_conversion_jobs SET status = ?, retry_count = retry_count + 1, updated_at = ? WHERE file_path = ?",
			).run("failed", now, filePath);

			// fail 该 background job 触发 retry 机制
			if (runningJobRow) {
				jobQueue.fail(
					runningJobRow.job_id,
					new Error(`${errorMessage} (will retry, left: ${mapped.retryCount})`),
				);
			}

			return {
				success: false,
				error: `${errorMessage} (retry scheduled, left: ${mapped.retryCount})`,
			};
		}
		// 耗尽后继续走到最终 failConversion
	}

	// 最终失败
	return failConversion(db, jobQueue, filePath, mapped.userMessage);
}

function failConversion(
	db: RidgeDatabase,
	jobQueue: BackgroundJobQueue,
	filePath: string,
	errorMessage: string,
): { success: false, error: string } {
	const updatedAt = Date.now();
	const fileName = filePath.split("/").pop() || filePath;

	// 先检查是否有对应的 file_processing_status 记录
	const statusRow = db
		.prepare("SELECT status FROM file_processing_status WHERE file_path = ?")
		.get(filePath) as { status: string } | undefined;

	if (statusRow) {
		// Atomic transaction: update status + insert notification
		const tx = db.transaction(() => {
			db.prepare(
				"UPDATE file_processing_status SET status = ?, error = ?, updated_at = ? WHERE file_path = ?",
			).run("convert_failed", errorMessage, updatedAt, filePath);
			db.prepare(
				`INSERT INTO notification_events(
					event_id, event_type, source, severity, title, body,
					related_type, related_id, actions_json, payload_json,
					status, created_at, updated_at, read_at, handled_at
				) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			).run(
				`notification-${crypto.randomUUID()}`,
				"file_processing.convert_failed",
				"file_processing",
				"error",
				`文件转换失败: ${fileName}`,
				errorMessage,
				"file",
				filePath,
				JSON.stringify([{ id: "retry", label: "重试" }, { id: "open_related", label: "打开对象" }]),
				JSON.stringify({ filePath, error: errorMessage }),
				"unread",
				updatedAt,
				updatedAt,
				null,
				null,
			);
		});
		tx();

		// 更新 python_conversion_jobs 为终态失败
		db.prepare(
			"UPDATE python_conversion_jobs SET status = ?, updated_at = ? WHERE file_path = ?",
		).run("failed", updatedAt, filePath);
	}

	// Fail the background job if it exists and is running
	const jobRow = db
		.prepare(
			"SELECT job_id FROM background_jobs WHERE related_type = 'file' AND related_id = ? AND status = 'running' ORDER BY created_at DESC LIMIT 1",
		)
		.get(filePath) as { job_id: string } | undefined;
	if (jobRow) {
		jobQueue.fail(jobRow.job_id, new Error(errorMessage));
	}

	return { success: false, error: errorMessage };
}

export function createFileConversionWorker(options: FileConversionWorkerOptions) {
	const {
		db,
		jobQueue,
		workspaceDir,
		pollIntervalMs = 5000,
		conversionClient,
		config,
		pollFallbackMs = 30_000,
		maxPollMs = 600_000,
		compensationScanMs = 60_000,
	} = options;
	let timer: NodeJS.Timeout | null = null;
	let pollTimer: NodeJS.Timeout | null = null;
	let running = false;

	function stop() {
		running = false;
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		if (pollTimer) {
			clearTimeout(pollTimer);
			pollTimer = null;
		}
	}

	async function processOne(
		job: ReturnType<typeof jobQueue.claimNext> & {},
	): Promise<void> {
		const payload = job.payload as
			| { sourcePath?: string; workspaceDir?: string }
			| undefined;
		const logicalPath = payload?.sourcePath ?? job.relatedId;
		if (!logicalPath || typeof logicalPath !== "string") {
			failConversion(
				db,
				jobQueue,
				job.relatedId,
				"Missing sourcePath in job payload",
			);
			return;
		}

		const posixPath = toPosixPath(logicalPath);

		// workspace 安全校验（logical path）
		try {
			await assertWorkspaceSafe(posixPath, workspaceDir);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			failConversion(db, jobQueue, posixPath, msg);
			return;
		}

		// Look up existing file_processing_status record
		const statusRow = db
			.prepare("SELECT status FROM file_processing_status WHERE file_path = ?")
			.get(posixPath) as { status: string } | undefined;

		if (!statusRow) {
			jobQueue.complete(job.jobId, {
				note: "No file_processing_status record; skipped conversion",
			});
			return;
		}

		const currentStatus = statusRow.status;
		if (currentStatus !== "pending") {
			// 已终态（convert_failed / index_failed 等）不得破坏既有 status 和 error
			const isTerminalFailed =
				currentStatus === "convert_failed" || currentStatus === "index_failed";
			const msg =
				`Cannot convert from status ${currentStatus}. ` +
				(isTerminalFailed
					? "Use POST /api/workspace/files/retry to retry."
					: "");
			// 仅 fail background job，不覆盖 file_processing_status
			jobQueue.fail(job.jobId, new Error(msg));
			return;
		}

		const ext = path.extname(posixPath).toLowerCase();
		const task = deriveTaskFromExtension(ext);
		if (!task) {
			failConversion(
				db,
				jobQueue,
				posixPath,
				`Unsupported file type: ${ext}`,
			);
			return;
		}

		// Resolve actual source file (may be in .originals/ after previous conversion)
		// actualSourcePath 仅用于上传给 Python 服务，不用于状态机/DB
		let actualSourcePath: string;
		try {
			actualSourcePath = await resolveActualSourcePath(posixPath);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			failConversion(
				db,
				jobQueue,
				posixPath,
				message,
			);
			return;
		}

		// 校验 actual source path 也在 workspace 内（包括 .originals fallback）
		try {
			await assertWorkspaceSafe(actualSourcePath, workspaceDir);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			failConversion(
				db,
				jobQueue,
				posixPath,
				msg,
			);
			return;
		}

		const now = Date.now();
		db.prepare(
			"UPDATE file_processing_status SET status = ?, updated_at = ? WHERE file_path = ?",
		).run("converting", now, posixPath);

		// 提交 Python 通用转化服务任务
		const clientJobId = generateClientJobId(posixPath);
		const callbackUrl = config.callbackBaseUrl
			? `${config.callbackBaseUrl}?token=${encodeURIComponent(config.callbackToken)}`
			: undefined;

		let pythonJob: ConversionJob;
		try {
			let options: ConversionOptions = {};
			if (task === "document.markdown") {
				options = {
					engine: "markitdown",
					extractImages: true,
					extractTables: true,
				};
			} else if (task === "audio.transcription") {
				options = {
					language: "auto",
					segmentDuration: 30,
					format: "markdown",
				};
			} else if (task === "image.ocr") {
				options = {
					language: "auto",
					outputBlocks: true,
				};
			}

			pythonJob = await conversionClient.createConversionWithFile(
				actualSourcePath,
				{
					task,
					clientJobId,
					callbackUrl,
					metadata: {
						ridgeFileId: posixPath,
						ridgeWorkspacePath: posixPath,
					},
					options,
				},
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			failConversion(db, jobQueue, posixPath, message);
			return;
		}

		// 持久化 pythonJobId / clientJobId / ridgeFileId 到 python_conversion_jobs
		// 使用 logical path（posixPath）作为 file_path，保持一致性
		db.prepare(
			`INSERT INTO python_conversion_jobs (
				file_path, python_job_id, client_job_id, status, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?)
			ON CONFLICT(file_path) DO UPDATE SET
				python_job_id = excluded.python_job_id,
				client_job_id = excluded.client_job_id,
				status = excluded.status,
				updated_at = excluded.updated_at`,
		).run(posixPath, pythonJob.jobId, clientJobId, "submitted", now, now);

		// 更新 background job 的 result_json 记录 pythonJobId，便于调试和后续关联
		// 注意：job 保持 running 状态，不 complete，等待 callback 或轮询到终态
		db.prepare(
			"UPDATE background_jobs SET result_json = ? WHERE job_id = ?",
		).run(
			JSON.stringify({ submitted: true, pythonJobId: pythonJob.jobId, clientJobId }),
			job.jobId,
		);

		// 启动补偿轮询（阻塞当前 job 直到终态或超时）
		const startPoll = Date.now();
		while (Date.now() - startPoll < maxPollMs) {
			await sleep(pollFallbackMs);

			let polled: ConversionJob;
			try {
				polled = await conversionClient.getConversion(pythonJob.jobId);
			} catch {
				// 查询失败继续轮询
				continue;
			}

			if (
				polled.status === "succeeded" ||
				polled.status === "failed" ||
				polled.status === "canceled"
			) {
				await handleConversionResult({
					db,
					jobQueue,
					workspaceDir,
					filePath: posixPath,
					pythonJob: polled,
					conversionClient,
				});
				return;
			}
			// queued / running：更新 python_conversion_jobs 状态为 running
			db.prepare(
				"UPDATE python_conversion_jobs SET status = ?, updated_at = ? WHERE file_path = ?",
			).run("running", Date.now(), posixPath);
		}

		// 轮询超时：最终失败
		failConversion(
			db,
			jobQueue,
			posixPath,
			"Conversion polling timeout: Python service did not complete within expected time",
		);
	}

	/**
	 * 持续补偿轮询：扫描所有未终态的 python_conversion_jobs，逐个查询状态。
	 * 启动时执行一次，之后每 compensationScanMs 执行一次。
	 */
	async function resumePollingJobs(): Promise<void> {
		const rows = db
			.prepare(
				"SELECT file_path, python_job_id FROM python_conversion_jobs WHERE status IN (?, ?)",
			)
			.all("submitted", "running") as Array<{
				file_path: string;
				python_job_id: string;
			}>;

		for (const row of rows) {
			try {
				const polled = await conversionClient.getConversion(
					row.python_job_id,
				);
				if (
					polled.status === "succeeded" ||
					polled.status === "failed" ||
					polled.status === "canceled"
				) {
					await handleConversionResult({
						db,
						jobQueue,
						workspaceDir,
						filePath: row.file_path,
						pythonJob: polled,
						conversionClient,
					});
				} else {
					// queued / running：更新状态为 running
					db.prepare(
						"UPDATE python_conversion_jobs SET status = ?, updated_at = ? WHERE file_path = ?",
					).run("running", Date.now(), row.file_path);
				}
			} catch {
				// 查询失败，保持原状态，等下次 resume
			}
		}
	}

	async function tick() {
		if (!running) return;
		try {
			const job = jobQueue.claimNext(
				"file-conversion-worker",
				"file.convert",
			);
			if (job) {
				await processOne(job);
			}
		} catch (error) {
			console.error("File conversion worker error:", error);
		}
		if (running) {
			timer = setTimeout(tick, pollIntervalMs);
		}
	}

	async function compensationTick() {
		if (!running) return;
		try {
			await resumePollingJobs();
		} catch (error) {
			console.error("Compensation polling error:", error);
		}
		if (running) {
			pollTimer = setTimeout(compensationTick, compensationScanMs);
		}
	}

	function start() {
		if (running) return;
		running = true;
		void tick();
		// 启动时恢复之前的轮询
		void resumePollingJobs();
		// 启动持续补偿轮询
		void compensationTick();
	}

	return { start, stop, processOne, resumePollingJobs };
}
