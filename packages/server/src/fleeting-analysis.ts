import fs from "node:fs/promises";
import path from "node:path";
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";
import {
	complete as realComplete,
	StringEnum,
	Type,
	type Api,
	type AssistantMessage,
	type Context,
	type Model,
	type ProviderStreamOptions,
	type ThinkingLevel,
	type Tool,
} from "@mariozechner/pi-ai";
import type { RidgeDatabase } from "./db/index.js";
import { getFleetingAttachments } from "./fleeting-attachments.js";
import type { createBackgroundJobQueue } from "./background-jobs.js";
import { createPiDefaultSettingsManager } from "./pi-default-config.js";
import {
	deriveTaskFromExtension,
	type ConversionJob,
	type ConversionServiceClient,
	type DownloadedArtifact,
} from "./conversion-service-client.js";

type BackgroundJobQueue = ReturnType<typeof createBackgroundJobQueue>;

export interface FleetingAnalysisRunner {
	run: (noteId: string) => Promise<void> | void;
	resetJob: (noteId: string) => void;
}

export interface FleetingAnalysisResult {
	recommendationType: "journal" | "clip" | "task" | "delete";
	recommendationText: string;
	draft: string;
	requiresInput: boolean;
}

export type CompleteFn = (
	model: Model<Api>,
	context: Context,
	options?: ProviderStreamOptions,
) => Promise<AssistantMessage>;

export interface FleetingAnalysisSettings {
	defaultProvider?: string;
	defaultModel?: string;
	defaultThinkingLevel?: string;
}

export type FleetingAnalysisSettingsResolver = (
	workspaceDir: string,
) => FleetingAnalysisSettings;

type FleetingAnalysisConversionClient = Pick<
	ConversionServiceClient,
	"createConversionWithFile" | "downloadArtifacts"
>;

interface FleetingAnalysisWorkerOptions {
	db: RidgeDatabase;
	jobQueue: BackgroundJobQueue;
	modelRegistry: ModelRegistry;
	authStorage: AuthStorage;
	workspaceDir: string;
	pollIntervalMs?: number;
	modelSpec?: string;
	completeFn?: CompleteFn;
	settingsResolver?: FleetingAnalysisSettingsResolver;
	getConversionClient?: () => FleetingAnalysisConversionClient | undefined;
}

const FLEETING_ANALYSIS_TOOL_NAME = "fleeting_analysis_result";
const MAX_ATTACHMENT_CONTEXT_CHARS = 16_000;
const MAX_ATTACHMENT_TEXT_CHARS = 6_000;
const MAX_DIRECT_TEXT_BYTES = 64 * 1024;

const FLEETING_ANALYSIS_SYSTEM_PROMPT = `你是 ridge 的闪念分析器。你的唯一任务是根据一次闪念内容和附件列表判断后续处理建议。

边界：
- 只分析用户提供的闪念内容和附件摘要。
- 不读取项目文件，不执行命令，不使用技能、提示词模板、扩展或上下文文件。
- 必须以 ${FLEETING_ANALYSIS_TOOL_NAME} 工具调用作为最终结果。
- 不输出普通文本，不输出 JSON 文本。`;

const analysisResultTool: Tool = {
	name: FLEETING_ANALYSIS_TOOL_NAME,
	description: "Return the final structured analysis result for one fleeting note.",
	parameters: Type.Object({
		recommendationType: StringEnum(["journal", "clip", "task", "delete"] as const, {
			description: "闪念建议类型",
		}),
		recommendationText: Type.String({
			description: "简短的理由说明，20字内",
		}),
		draft: Type.String({
			description: "journal 日记草稿；clip 剪藏内容；task 任务标题和描述；delete 留空",
		}),
		requiresInput: Type.Boolean({
			description: "是否还需要用户补充信息",
		}),
	}),
};

const ANALYSIS_PROMPT_TEMPLATE = `你是一个闪念整理助手。请分析以下用户闪念，给出最合适的处理建议。

可选建议类型：
- journal：适合写入日记的个人想法、备忘、记录
- clip：适合收藏的链接、文章摘录、参考资料
- task：适合转化为待办任务的工作项、需要跟进的事项
- delete：无价值或已过期，建议直接删除

闪念内容：
{content}

附件列表：
{attachments}

附件正文（转换或读取后，可能已截断）：
{attachmentContexts}

必须调用 ${FLEETING_ANALYSIS_TOOL_NAME} 工具返回最终结构化结果。不要输出普通文本，不要输出 JSON 文本。`;

function buildAnalysisPrompt(
	content: string,
	attachments: { originalName: string; mimeType: string; size?: number }[],
	attachmentContexts: { originalName: string; content: string; truncated: boolean }[] = [],
): string {
	const attSummary =
		attachments.length === 0
			? "无"
			: attachments
					.map((a) => `- ${a.originalName} (${a.mimeType}${typeof a.size === "number" ? `, ${a.size} bytes` : ""})`)
					.join("\n");
	const contextSummary =
		attachmentContexts.length === 0
			? "无"
			: attachmentContexts
					.map(
						(a) =>
							`## ${a.originalName}${a.truncated ? "（已截断）" : ""}\n${a.content}`,
					)
					.join("\n\n");
	return ANALYSIS_PROMPT_TEMPLATE.replace("{content}", content).replace(
		"{attachments}",
		attSummary,
	).replace("{attachmentContexts}", contextSummary);
}

function parseAnalysisResult(raw: unknown): FleetingAnalysisResult {
	if (!raw || typeof raw !== "object") {
		throw new Error("Invalid analysis result structure");
	}
	const obj = raw as Record<string, unknown>;
	const type = obj.recommendationType;
	if (
		type !== "journal" &&
		type !== "clip" &&
		type !== "task" &&
		type !== "delete"
	) {
		throw new Error(`Invalid recommendationType: ${String(type)}`);
	}
	return {
		recommendationType: type,
		recommendationText: typeof obj.recommendationText === "string" ? obj.recommendationText : "",
		draft: typeof obj.draft === "string" ? obj.draft : "",
		requiresInput: obj.requiresInput === true,
	};
}

function truncateText(text: string, maxChars: number): { text: string; truncated: boolean } {
	if (text.length <= maxChars) {
		return { text, truncated: false };
	}
	return { text: text.slice(0, maxChars), truncated: true };
}

function isDirectTextAttachment(attachment: { originalName: string; mimeType: string }): boolean {
	const mimeType = attachment.mimeType.toLowerCase();
	const ext = path.extname(attachment.originalName).toLowerCase();
	return (
		mimeType.startsWith("text/") ||
		mimeType === "application/json" ||
		mimeType === "application/xml" ||
		[".md", ".markdown", ".txt", ".csv", ".json", ".jsonl", ".yaml", ".yml", ".xml"].includes(ext)
	);
}

async function readDirectAttachmentText(storedPath: string): Promise<string> {
	const handle = await fs.open(storedPath, "r");
	try {
		const buffer = Buffer.alloc(MAX_DIRECT_TEXT_BYTES);
		const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
		return buffer.subarray(0, bytesRead).toString("utf-8");
	} finally {
		await handle.close();
	}
}

function isTextArtifact(artifact: DownloadedArtifact): boolean {
	const mimeType = artifact.artifact.mimeType.toLowerCase();
	const name = artifact.artifact.name.toLowerCase();
	return (
		mimeType.startsWith("text/") ||
		mimeType === "application/json" ||
		name.endsWith(".md") ||
		name.endsWith(".markdown") ||
		name.endsWith(".txt") ||
		name.endsWith(".json")
	);
}

async function getTextFromConversionJob(
	conversionClient: FleetingAnalysisConversionClient,
	job: ConversionJob,
	attachmentName: string,
): Promise<string> {
	if (job.status !== "succeeded") {
		throw new Error(job.error?.message || `附件转换失败: ${attachmentName}`);
	}
	const artifacts = await conversionClient.downloadArtifacts(job, {
		timeoutMs: 60_000,
		maxSizeBytes: 5 * 1024 * 1024,
	});
	const textArtifact = artifacts.find(isTextArtifact);
	if (!textArtifact) {
		throw new Error(`附件转换结果缺少文本 artifact: ${attachmentName}`);
	}
	return textArtifact.buffer.toString("utf-8");
}

async function buildAttachmentContexts(
	attachments: { originalName: string; mimeType: string; storedPath: string; size: number }[],
	conversionClient: FleetingAnalysisConversionClient | undefined,
): Promise<{ originalName: string; content: string; truncated: boolean }[]> {
	const contexts: { originalName: string; content: string; truncated: boolean }[] = [];
	let remainingChars = MAX_ATTACHMENT_CONTEXT_CHARS;

	for (const attachment of attachments) {
		if (remainingChars <= 0) break;
		let text: string | undefined;
		if (isDirectTextAttachment(attachment)) {
			text = await readDirectAttachmentText(attachment.storedPath);
		} else if (conversionClient) {
			const task = deriveTaskFromExtension(path.extname(attachment.originalName));
			if (task) {
				const job = await conversionClient.createConversionWithFile(attachment.storedPath, {
					task,
					options: task === "audio.transcription"
						? { format: "markdown" }
						: { engine: "markitdown", ocrFallback: true },
					clientJobId: `fleeting-analysis-${path.basename(attachment.storedPath)}-${Date.now()}`,
					metadata: {
						source: "fleeting.analysis",
						originalName: attachment.originalName,
						mimeType: attachment.mimeType,
					},
					preferredFormat: "markdown",
					waitMs: 30_000,
				});
				text = await getTextFromConversionJob(conversionClient, job, attachment.originalName);
			}
		}
		if (!text?.trim()) continue;
		const limit = Math.min(MAX_ATTACHMENT_TEXT_CHARS, remainingChars);
		const truncated = truncateText(text.trim(), limit);
		contexts.push({
			originalName: attachment.originalName,
			content: truncated.text,
			truncated: truncated.truncated || text.trim().length > limit,
		});
		remainingChars -= truncated.text.length;
	}

	return contexts;
}

function getAnalysisToolResult(response: AssistantMessage): FleetingAnalysisResult {
	if (response.stopReason === "error" || response.stopReason === "aborted") {
		throw new Error(response.errorMessage || "Fleeting analysis model request failed");
	}
	for (const block of response.content) {
		if (block.type !== "toolCall") continue;
		if (block.name !== FLEETING_ANALYSIS_TOOL_NAME) continue;
		return parseAnalysisResult(block.arguments);
	}
	throw new Error(`Fleeting analysis did not call ${FLEETING_ANALYSIS_TOOL_NAME}`);
}

function parseModelSpec(modelSpec: string | undefined): { provider: string; modelId: string } | undefined {
	const normalized = modelSpec?.trim();
	if (!normalized) return undefined;
	const slashIndex = normalized.indexOf("/");
	if (slashIndex <= 0 || slashIndex === normalized.length - 1) {
		throw new Error(`Invalid fleeting analysis model spec: ${normalized}`);
	}
	return {
		provider: normalized.slice(0, slashIndex),
		modelId: normalized.slice(slashIndex + 1),
	};
}

function resolveDefaultSettings(workspaceDir: string): FleetingAnalysisSettings {
	const settings = createPiDefaultSettingsManager(workspaceDir);
	return {
		defaultProvider: settings.getDefaultProvider(),
		defaultModel: settings.getDefaultModel(),
		defaultThinkingLevel: settings.getDefaultThinkingLevel(),
	};
}

function resolveReasoningLevel(level: string | undefined): ThinkingLevel | undefined {
	if (
		level === "minimal" ||
		level === "low" ||
		level === "medium" ||
		level === "high" ||
		level === "xhigh"
	) {
		return level;
	}
	return undefined;
}

function resolveAnalysisModel(
	modelRegistry: ModelRegistry,
	modelSpec: string | undefined,
	settings: FleetingAnalysisSettings,
): Model<Api> {
	modelRegistry.refresh();

	const explicit = parseModelSpec(modelSpec);
	if (explicit) {
		const model = modelRegistry.find(explicit.provider, explicit.modelId);
		if (!model) {
			throw new Error(
				`Fleeting analysis model is not available: ${explicit.provider}/${explicit.modelId}`,
			);
		}
		return model;
	}

	if (settings.defaultProvider && settings.defaultModel) {
		const model = modelRegistry.find(settings.defaultProvider, settings.defaultModel);
		if (model) return model;
	}

	const [firstAvailable] = modelRegistry.getAvailable();
	if (!firstAvailable) {
		throw new Error("No configured Pi model is available for fleeting analysis");
	}
	return firstAvailable;
}

async function runAnalysis(
	options: {
		db: RidgeDatabase;
		modelRegistry: ModelRegistry;
		authStorage: AuthStorage;
		workspaceDir: string;
		modelSpec?: string;
		completeFn?: CompleteFn;
		settingsResolver?: FleetingAnalysisSettingsResolver;
		getConversionClient?: () => FleetingAnalysisConversionClient | undefined;
	},
	noteId: string,
): Promise<FleetingAnalysisResult> {
	const {
		db,
		modelRegistry,
		workspaceDir,
		modelSpec,
		completeFn = realComplete,
		settingsResolver = resolveDefaultSettings,
		getConversionClient,
	} = options;

	// 1. Read note
	const note = db
		.prepare("SELECT * FROM fleeting_notes WHERE note_id = ?")
		.get(noteId) as
		| Record<string, unknown>
		| undefined;
	if (!note) {
		throw new Error(`Fleeting note not found: ${noteId}`);
	}

	const content = String(note.content ?? "");

	// 2. Read attachments
	const attachments = getFleetingAttachments(db, noteId).map((att) => ({
		originalName: att.original_name,
		mimeType: att.mime_type,
		storedPath: att.stored_path,
		size: att.size,
	}));

	// 3. Build prompt
	const attachmentContexts = await buildAttachmentContexts(
		attachments,
		getConversionClient?.(),
	);
	const prompt = buildAnalysisPrompt(content, attachments, attachmentContexts);

	// 4. Call the configured Pi model directly via pi-ai.
	const settings = settingsResolver(workspaceDir);
	const model = resolveAnalysisModel(modelRegistry, modelSpec, settings);
	const auth = await modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok) {
		throw new Error(auth.error);
	}

	const completionOptions: ProviderStreamOptions = {
		apiKey: auth.apiKey,
		headers: auth.headers,
		temperature: 0,
		maxTokens: 800,
	};
	const reasoning = model.reasoning
		? resolveReasoningLevel(settings.defaultThinkingLevel)
		: undefined;
	if (reasoning) {
		completionOptions.reasoning = reasoning;
	}

	const context: Context = {
		systemPrompt: FLEETING_ANALYSIS_SYSTEM_PROMPT,
		messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
		tools: [analysisResultTool],
	};
	const response = await completeFn(model, context, completionOptions);

	return getAnalysisToolResult(response);
}

export function createFleetingAnalysisRunner(options: {
	db: RidgeDatabase;
	jobQueue: BackgroundJobQueue;
}): FleetingAnalysisRunner {
	const { db, jobQueue } = options;
	return {
		run: async (noteId: string) => {
			const note = db
				.prepare(
					"SELECT note_id, analysis_status FROM fleeting_notes WHERE note_id = ?",
				)
				.get(noteId) as
					| { note_id: string; analysis_status: string }
					| undefined;
			if (!note) return;
			if (note.analysis_status === "suggested") return;

			jobQueue.enqueue({
				type: "fleeting.analyze",
				relatedType: "fleeting_note",
				relatedId: noteId,
				payload: { noteId },
				maxAttempts: 3,
				notifyOnFailure: true,
			});
		},
		resetJob: (noteId: string) => {
			// Use queue's type-safe cancel: deletes pending/failed, marks running as cancelled.
			jobQueue.cancel({
				type: "fleeting.analyze",
				relatedType: "fleeting_note",
				relatedId: noteId,
			});

			// Reset note status to unanalyzed
			db.prepare(
				`UPDATE fleeting_notes SET
				  analysis_status = 'unanalyzed',
				  last_error = NULL,
				  updated_at = ?
				 WHERE note_id = ?`,
			).run(Date.now(), noteId);

			// Enqueue a fresh job
			jobQueue.enqueue({
				type: "fleeting.analyze",
				relatedType: "fleeting_note",
				relatedId: noteId,
				payload: { noteId },
				maxAttempts: 3,
				notifyOnFailure: true,
			});
		},
	};
}

export function createFleetingAnalysisWorker(
	options: FleetingAnalysisWorkerOptions,
): { start: () => void; stop: () => void } {
	const {
		db,
		jobQueue,
		modelRegistry,
		authStorage,
		workspaceDir,
		pollIntervalMs = 5000,
		modelSpec,
		completeFn,
		settingsResolver,
		getConversionClient,
	} = options;

	let timer: NodeJS.Timeout | null = null;
	let running = false;

	function stop() {
		running = false;
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
	}

	async function processJob() {
		const job = jobQueue.claimNext("fleeting-worker", "fleeting.analyze");
		if (!job) return;

		const payload = job.payload as { noteId?: string } | null;
		const noteId = payload?.noteId ?? job.relatedId;

		if (!noteId) {
			jobQueue.fail(job.jobId, "Missing noteId in job payload");
			return;
		}

		// Update note status to analyzing
		db.prepare(
			"UPDATE fleeting_notes SET analysis_status = 'analyzing', updated_at = ? WHERE note_id = ?",
		).run(Date.now(), noteId);

		let result: FleetingAnalysisResult;
		try {
			result = await runAnalysis(
				{ db, modelRegistry, authStorage, workspaceDir, modelSpec, completeFn, settingsResolver, getConversionClient },
				noteId,
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);

			// If the job was cancelled while we were working, do not touch the note.
			// The note was already reset to 'unanalyzed' by resetJob() and a new job is running.
			const currentJob = jobQueue.get(job.jobId);
			if (currentJob?.status === "cancelled") {
				return;
			}

			const now = Date.now();
			// Note: jobQueue.fail() increments retryCount by 1.
			// We must compute if there will be another retry *after* this fail.
			const willRetry = job.retryCount + 1 < job.maxAttempts;
			if (willRetry) {
				db.prepare(
					`UPDATE fleeting_notes SET
					  analysis_status = 'unanalyzed',
					  last_error = ?,
					  retry_count = retry_count + 1,
					  updated_at = ?
					 WHERE note_id = ?`,
				).run(message, now, noteId);
			} else {
				db.prepare(
					`UPDATE fleeting_notes SET
					  analysis_status = 'failed',
					  last_error = ?,
					  retry_count = retry_count + 1,
					  updated_at = ?
					 WHERE note_id = ?`,
				).run(message, now, noteId);
			}

			jobQueue.fail(
				job.jobId,
				error instanceof Error ? error : new Error(message),
			);
			return;
		}

		// If the job was cancelled while we were working, do not write stale results.
		const currentJob = jobQueue.get(job.jobId);
		if (currentJob?.status === "cancelled") {
			return;
		}

		// Write result to note
		const now = Date.now();
		db.prepare(
			`UPDATE fleeting_notes SET
			  analysis_status = 'suggested',
			  recommendation_type = ?,
			  recommendation_text = ?,
			  draft = ?,
			  requires_input = ?,
			  last_error = NULL,
			  updated_at = ?
			 WHERE note_id = ?`,
		).run(
			result.recommendationType,
			result.recommendationText,
			result.draft,
			result.requiresInput ? 1 : 0,
			now,
			noteId,
		);

		jobQueue.complete(job.jobId, {
			recommendationType: result.recommendationType,
			recommendationText: result.recommendationText,
		});
	}

	async function tick() {
		if (!running) return;
		try {
			await processJob();
		} catch (error) {
			console.error("Fleeting analysis worker error:", error);
		}
		if (running) {
			timer = setTimeout(tick, pollIntervalMs);
		}
	}

	function start() {
		if (running) return;
		running = true;
		void tick();
	}

	return { start, stop };
}
