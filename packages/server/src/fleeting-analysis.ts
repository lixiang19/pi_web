import fs from "node:fs/promises";
import path from "node:path";
import {
	AuthStorage,
	createAgentSession as realCreateAgentSession,
	DefaultResourceLoader,
	ModelRegistry,
	SessionManager,
	type SettingsManager,
} from "@mariozechner/pi-coding-agent";
import type { Api, Model } from "@mariozechner/pi-ai";
import type { RidgeDatabase } from "./db/index.js";
import { getFleetingAttachments } from "./fleeting-attachments.js";
import type { createBackgroundJobQueue } from "./background-jobs.js";
import {
	createPiDefaultSettingsManager,
	getPiDefaultAgentDir,
} from "./pi-default-config.js";
import {
	deriveTaskFromExtension,
	type ConversionOptions,
	type ConversionJob,
	type ConversionServiceClient,
	type DownloadedArtifact,
} from "./conversion-service-client.js";
import { createPlanningToolsExtension } from "./planning-tools.js";
import { createExaToolsExtension } from "./exa-tools.js";
import {
	compileAgentPermission,
	createPermissionGateExtension,
	loadGlobalPermissionConfig,
} from "./agent-permissions.js";
import {
	discoverAgents,
	normalizeThinkingLevel,
	type AgentConfigInternal,
} from "./agents.js";
import type { AgentPermission, ThinkingLevel } from "./types/index.js";
import { normalizeString } from "./utils/strings.js";
import { buildWorkspaceMemoryInjectionSync } from "./workspace-memory.js";
import {
	createInternalTaskCompletionExtension,
	INTERNAL_TASK_COMPLETION_TOOL_NAME,
	normalizeInternalTaskCompletionInput,
	type InternalTaskCompletionInput,
	type InternalTaskCompletionResult,
} from "./internal-agent-tools.js";
import {
	type FleetingEventHub,
	publishFleetingNoteUpdated,
} from "./fleeting-events.js";

type BackgroundJobQueue = ReturnType<typeof createBackgroundJobQueue>;

export interface FleetingAnalysisRunner {
	run: (noteId: string) => Promise<void> | void;
	resetJob: (noteId: string) => void;
}

export type FleetingCompletionInput = InternalTaskCompletionInput;
export type FleetingCompletionResult = InternalTaskCompletionResult;

interface FleetingAgentSession {
	prompt(prompt: string, options?: unknown): Promise<void> | void;
	getActiveToolNames(): string[];
	setActiveToolsByName(names: string[]): Promise<void> | void;
	setModel?(model: Model<Api>): Promise<void> | void;
	setThinkingLevel?(level: ThinkingLevel): Promise<void> | void;
	sessionId?: string;
	sessionFile?: string;
}

interface ShutdownableSessionManager {
	shutdown?: () => Promise<void> | void;
}

export interface CreateFleetingAgentSessionOptions {
	cwd: string;
	authStorage: AuthStorage;
	modelRegistry: ModelRegistry;
	sessionManager: ShutdownableSessionManager;
	settingsManager: SettingsManager;
	resourceLoader: DefaultResourceLoader;
	completeInternalTask: (input: FleetingCompletionInput) => Promise<FleetingCompletionResult>;
}

export type CreateFleetingAgentSessionFn = (
	options: CreateFleetingAgentSessionOptions,
) => Promise<{ session: FleetingAgentSession }>;

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
	createAgentSessionFn?: CreateFleetingAgentSessionFn;
	getConversionClient?: () => FleetingAnalysisConversionClient | undefined;
	eventHub?: FleetingEventHub;
}

const FLEETING_AGENT_NAME = "fleeting-agent";
const MAX_ATTACHMENT_CONTEXT_CHARS = 16_000;
const MAX_ATTACHMENT_TEXT_CHARS = 6_000;
const MAX_DIRECT_TEXT_BYTES = 64 * 1024;

const DEFAULT_FLEETING_AGENT_PROMPT = `你是 ridge 的闪念处理 Agent。你接收一条刚捕捉的闪念、附件信息、工作空间目录和可用工具。

职责：
- 判断闪念适合沉淀到日记、笔记、剪藏、任务、里程碑或正式附件。
- 使用工作空间文件、规划工具和命令完成沉淀动作。
- 需要任务或里程碑时使用规划工具创建或更新。
- 需要日记、笔记、剪藏时直接读写工作空间文件。
- 闪念内容是 URL 时，优先调用 exa_get_contents 提取页面正文，再写入剪藏或资料 Markdown；不要依赖 MCP 版 Exa。
- 需要理解上下文时先探索相关目录和已有内容。
- 处理完成后调用 ${INTERNAL_TASK_COMPLETION_TOOL_NAME} 汇报结果。

完成汇报：
- status 为 completed 表示闪念已经完成沉淀。
- status 为 failed 表示本次处理遇到可记录的错误。
- summary 写明完成内容或失败原因。`;

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
				const options: ConversionOptions = task === "audio.transcription"
					? { format: "markdown" }
					: task === "image.ocr"
						? { language: "auto", outputBlocks: true }
						: { engine: "markitdown", ocrFallback: true };
				const job = await conversionClient.createConversionWithFile(attachment.storedPath, {
					task,
					options,
					clientJobId: `fleeting-analysis-${path.basename(attachment.storedPath)}-${Date.now()}`,
					metadata: {
						source: "fleeting.agent",
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

const formatAttachmentList = (
	attachments: { originalName: string; mimeType: string; size?: number }[],
): string =>
	attachments.length === 0
		? "无"
		: attachments
				.map((a) => `- ${a.originalName} (${a.mimeType}${typeof a.size === "number" ? `, ${a.size} bytes` : ""})`)
				.join("\n");

const formatAttachmentContexts = (
	attachmentContexts: { originalName: string; content: string; truncated: boolean }[],
): string =>
	attachmentContexts.length === 0
		? "无"
		: attachmentContexts
				.map((a) => `## ${a.originalName}${a.truncated ? "（已截断）" : ""}\n${a.content}`)
				.join("\n\n");

function buildFleetingAgentPrompt(
	input: {
		noteId: string;
		content: string;
		workspaceDir: string;
		attachments: { originalName: string; mimeType: string; size?: number }[];
		attachmentContexts: { originalName: string; content: string; truncated: boolean }[];
	},
): string {
	return `请处理这条闪念。

闪念 ID:
${input.noteId}

工作空间:
${input.workspaceDir}

常用沉淀目录:
- 日记/
- 笔记/
- 剪藏/
- 附件/
- 记忆/
- Wiki/
- 项目/

闪念内容:
${input.content}

附件列表:
${formatAttachmentList(input.attachments)}

附件正文:
${formatAttachmentContexts(input.attachmentContexts)}

URL 处理要求:
- 如果闪念内容包含公开网页 URL，先调用 exa_get_contents 获取页面正文。
- 将提取正文整理为 剪藏/ 或资料类 Markdown，YAML 里记录 url、title、captured_at。
- Exa 提取失败时可以记录失败原因并调用 ${INTERNAL_TASK_COMPLETION_TOOL_NAME} 汇报 failed。

完成后调用 ${INTERNAL_TASK_COMPLETION_TOOL_NAME}。`;
}

function resolveModel(
	modelRegistry: ModelRegistry,
	modelSpec: string | undefined,
): Model<Api> | null {
	const normalized = normalizeString(modelSpec);
	if (!normalized) {
		return null;
	}
	const slashIndex = normalized.indexOf("/");
	if (slashIndex <= 0 || slashIndex === normalized.length - 1) {
		throw new Error(`Invalid fleeting agent model spec: ${normalized}`);
	}
	modelRegistry.refresh();
	const provider = normalized.slice(0, slashIndex);
	const modelId = normalized.slice(slashIndex + 1);
	const model = modelRegistry.find(provider, modelId);
	if (!model) {
		throw new Error(`Fleeting agent model is not available: ${normalized}`);
	}
	return model;
}

async function getFleetingAgent(workspaceDir: string): Promise<AgentConfigInternal> {
	const agents = await discoverAgents(workspaceDir);
	const agent = agents.find((item) => item.name === FLEETING_AGENT_NAME);
	if (!agent || agent.enabled === false) {
		return {
			name: FLEETING_AGENT_NAME,
			description: "自动处理闪念",
			displayName: "Fleeting Agent",
			mode: "all",
			visible: false,
			enabled: true,
			permission: {
				ask: "deny",
				subagent: "deny",
			} as AgentPermission,
			systemPrompt: DEFAULT_FLEETING_AGENT_PROMPT,
			source: "builtin:fleeting-agent",
			sourceScope: "default",
		} as AgentConfigInternal;
	}
	return {
		...agent,
		visible: false,
		permission: {
			...(agent.permission || {}),
			ask: "deny",
			subagent: "deny",
		},
	};
}

const defaultCreateFleetingAgentSession: CreateFleetingAgentSessionFn = async (options) => {
	await options.resourceLoader.reload();
	const { session } = await realCreateAgentSession({
		cwd: options.cwd,
		authStorage: options.authStorage,
		modelRegistry: options.modelRegistry,
		sessionManager: options.sessionManager as SessionManager,
		settingsManager: options.settingsManager,
		resourceLoader: options.resourceLoader,
	});
	return { session: session as unknown as FleetingAgentSession };
};

async function runFleetingAgent(
	options: {
		db: RidgeDatabase;
		modelRegistry: ModelRegistry;
		authStorage: AuthStorage;
		workspaceDir: string;
		modelSpec?: string;
		createAgentSessionFn: CreateFleetingAgentSessionFn;
		getConversionClient?: () => FleetingAnalysisConversionClient | undefined;
	},
	noteId: string,
): Promise<FleetingCompletionResult> {
	const note = options.db
		.prepare("SELECT * FROM fleeting_notes WHERE note_id = ?")
		.get(noteId) as Record<string, unknown> | undefined;
	if (!note) {
		throw new Error(`Fleeting note not found: ${noteId}`);
	}

	const attachments = getFleetingAttachments(options.db, noteId).map((att) => ({
		originalName: att.original_name,
		mimeType: att.mime_type,
		storedPath: att.stored_path,
		size: att.size,
	}));
	const attachmentContexts = await buildAttachmentContexts(
		attachments,
		options.getConversionClient?.(),
	);

	const agent = await getFleetingAgent(options.workspaceDir);
	let completion: FleetingCompletionResult | null = null;

	const completeInternalTask = async (
		rawInput: FleetingCompletionInput,
	): Promise<FleetingCompletionResult> => {
		const input = normalizeInternalTaskCompletionInput(rawInput);
		const now = Date.now();
		if (input.status === "completed") {
			options.db.prepare(
				`UPDATE fleeting_notes SET
				  status = 'processed',
				  analysis_status = 'processed',
				  recommendation_type = NULL,
				  recommendation_text = ?,
				  draft = NULL,
				  requires_input = 0,
				  last_error = NULL,
				  updated_at = ?
				 WHERE note_id = ?`,
			).run(input.summary, now, noteId);
		} else {
			options.db.prepare(
				`UPDATE fleeting_notes SET
				  analysis_status = 'failed',
				  recommendation_type = NULL,
				  recommendation_text = ?,
				  draft = NULL,
				  requires_input = 0,
				  last_error = ?,
				  updated_at = ?
				 WHERE note_id = ?`,
			).run(input.summary, input.error || input.summary, now, noteId);
		}
		completion = {
			agentName: FLEETING_AGENT_NAME,
			status: input.status,
			summary: input.summary,
			error: input.status === "failed" ? (input.error || input.summary) : undefined,
			completedAt: now,
		};
		return completion;
	};

	let permissionPolicy: ReturnType<typeof compileAgentPermission> | null = null;
	const settingsManager = createPiDefaultSettingsManager(options.workspaceDir);
	const sessionManager = SessionManager.inMemory(options.workspaceDir) as ShutdownableSessionManager;
	const resourceLoader = new DefaultResourceLoader({
		cwd: options.workspaceDir,
		agentDir: getPiDefaultAgentDir(),
		settingsManager,
		appendSystemPromptOverride: (base: string[]) => {
			const sections = [...base];
			const memoryInjection = buildWorkspaceMemoryInjectionSync(options.workspaceDir);
			if (memoryInjection) {
				sections.push(memoryInjection);
			}
			sections.push(agent.systemPrompt || DEFAULT_FLEETING_AGENT_PROMPT);
			return sections;
		},
		extensionFactories: [
			createPermissionGateExtension(() => permissionPolicy),
			createPlanningToolsExtension(options.workspaceDir),
			createExaToolsExtension(),
			createInternalTaskCompletionExtension({
				agentName: FLEETING_AGENT_NAME,
				onComplete: completeInternalTask,
			}),
		],
	});

	try {
		const { session } = await options.createAgentSessionFn({
			cwd: options.workspaceDir,
			authStorage: options.authStorage,
			modelRegistry: options.modelRegistry,
			sessionManager,
			settingsManager,
			resourceLoader,
			completeInternalTask,
		});

		const model = resolveModel(options.modelRegistry, options.modelSpec || agent.model);
		if (model && session.setModel) {
			await session.setModel(model);
		}

		const thinking = normalizeThinkingLevel(agent.thinking);
		if (thinking && session.setThinkingLevel) {
			await session.setThinkingLevel(thinking);
		}

		permissionPolicy = compileAgentPermission(
			options.workspaceDir,
			agent.permission,
			session.getActiveToolNames(),
			await loadGlobalPermissionConfig(getPiDefaultAgentDir()),
		);
		await session.setActiveToolsByName(permissionPolicy.activeToolNames);

		const prompt = buildFleetingAgentPrompt({
			noteId,
			content: String(note.content ?? ""),
			workspaceDir: options.workspaceDir,
			attachments,
			attachmentContexts,
		});
		await session.prompt(prompt, { source: "background" });

		if (!completion) {
			throw new Error(`${FLEETING_AGENT_NAME} did not call ${INTERNAL_TASK_COMPLETION_TOOL_NAME}`);
		}
		return completion;
	} finally {
		await sessionManager.shutdown?.();
	}
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
					"SELECT note_id, status, analysis_status FROM fleeting_notes WHERE note_id = ?",
				)
				.get(noteId) as
					| { note_id: string; status: string; analysis_status: string }
					| undefined;
			if (!note) return;
			if (note.status === "processed" || note.analysis_status === "processed") return;

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
			jobQueue.cancel({
				type: "fleeting.analyze",
				relatedType: "fleeting_note",
				relatedId: noteId,
			});

			db.prepare(
				`UPDATE fleeting_notes SET
				  analysis_status = 'unanalyzed',
				  last_error = NULL,
				  updated_at = ?
				 WHERE note_id = ?`,
			).run(Date.now(), noteId);

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
		createAgentSessionFn = defaultCreateFleetingAgentSession,
		getConversionClient,
		eventHub,
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

		db.prepare(
			"UPDATE fleeting_notes SET analysis_status = 'analyzing', updated_at = ? WHERE note_id = ?",
		).run(Date.now(), noteId);
		publishFleetingNoteUpdated(
			eventHub,
			db.prepare("SELECT * FROM fleeting_notes WHERE note_id = ?").get(noteId) as
				| Record<string, unknown>
				| undefined,
		);

		let result: FleetingCompletionResult;
		try {
			result = await runFleetingAgent(
				{
					db,
					modelRegistry,
					authStorage,
					workspaceDir,
					modelSpec,
					createAgentSessionFn,
					getConversionClient,
				},
				noteId,
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);

			const currentJob = jobQueue.get(job.jobId);
			if (currentJob?.status === "cancelled") {
				return;
			}

			const now = Date.now();
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
			publishFleetingNoteUpdated(
				eventHub,
				db.prepare("SELECT * FROM fleeting_notes WHERE note_id = ?").get(noteId) as
					| Record<string, unknown>
					| undefined,
			);

			jobQueue.fail(
				job.jobId,
				error instanceof Error ? error : new Error(message),
			);
			return;
		}

		const currentJob = jobQueue.get(job.jobId);
		if (currentJob?.status === "cancelled") {
			return;
		}

		jobQueue.complete(job.jobId, result);
		publishFleetingNoteUpdated(
			eventHub,
			db.prepare("SELECT * FROM fleeting_notes WHERE note_id = ?").get(noteId) as
				| Record<string, unknown>
				| undefined,
		);
	}

	async function tick() {
		if (!running) return;
		try {
			await processJob();
		} catch (error) {
			console.error("Fleeting agent worker error:", error);
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
