import {
	createAgentSession as realCreateAgentSession,
	SessionManager as RealSessionManager,
	AuthStorage,
	ModelRegistry,
} from "@mariozechner/pi-coding-agent";
import type { RidgeDatabase } from "./db/index.js";
import { getFleetingAttachments } from "./fleeting-attachments.js";
import type { createBackgroundJobQueue } from "./background-jobs.js";

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

/**
 * Minimal duck-type interface for the session object used by runAnalysis.
 * Allows tests to inject lightweight mocks without needing the full AgentSession type.
 */
export interface PromptableSession {
	prompt(prompt: string, options?: unknown): Promise<void>;
	messages: Array<{ role: string; content: unknown }>;
}

/**
 * Minimal duck-type interface for the session manager used by runAnalysis.
 * Only requires shutdown() for cleanup.
 */
export interface ShutdownableSessionManager {
	shutdown(): Promise<void>;
}

/**
 * Options passed to the injected createAgentSession function.
 */
export interface InjectedCreateAgentSessionOptions {
	cwd: string;
	authStorage: unknown;
	modelRegistry: unknown;
	noTools: string;
	sessionManager: ShutdownableSessionManager;
}

/**
 * Dependency-injected createAgentSession replacement.
 * Accepts PromptableSession in the result so tests don't need full AgentSession mocks.
 */
export type CreateAgentSessionFn = (
	options: InjectedCreateAgentSessionOptions,
) => Promise<{ session: PromptableSession; extensionsResult: unknown }>;

interface FleetingAnalysisWorkerOptions {
	db: RidgeDatabase;
	jobQueue: BackgroundJobQueue;
	modelRegistry: ModelRegistry;
	authStorage: AuthStorage;
	workspaceDir: string;
	pollIntervalMs?: number;
	modelSpec?: string;
	createAgentSessionFn?: CreateAgentSessionFn;
	sessionManagerFactory?: (workspaceDir: string) => ShutdownableSessionManager;
}

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

请严格用以下 JSON 格式回复（不要包含任何其他文字）：
{
  "recommendationType": "journal|clip|task|delete",
  "recommendationText": "简短的理由说明（20字内）",
  "draft": "如果是 journal 给出日记草稿；如果是 clip 给出剪藏内容；如果是 task 给出任务标题和描述；如果是 delete 留空",
  "requiresInput": false
}`;

function buildAnalysisPrompt(
	content: string,
	attachments: { originalName: string; mimeType: string }[],
): string {
	const attSummary =
		attachments.length === 0
			? "无"
			: attachments
					.map((a) => `- ${a.originalName} (${a.mimeType})`)
					.join("\n");
	return ANALYSIS_PROMPT_TEMPLATE.replace("{content}", content).replace(
		"{attachments}",
		attSummary,
	);
}

function extractJsonFromResponse(text: string): unknown {
	const jsonMatch = text.match(/\{[\s\S]*\}/);
	if (!jsonMatch) {
		throw new Error("Response does not contain valid JSON");
	}
	return JSON.parse(jsonMatch[0]) as unknown;
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

function toMessageText(content: unknown): string {
	if (typeof content === "string") {
		return content;
	}
	if (!Array.isArray(content)) {
		return "";
	}
	return content
		.map((item) => {
			if (!item || typeof item !== "object") {
				return "";
			}
			const typed = item as Record<string, unknown>;
			if (typed.type === "text") {
				return typeof typed.text === "string" ? typed.text : "";
			}
			if (typed.type === "thinking") {
				return typeof typed.thinking === "string" ? typed.thinking : "";
			}
			return "";
		})
		.filter(Boolean)
		.join("\n");
}

function getLastAssistantText(session: PromptableSession): string {
	const messages = session.messages;
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (message.role !== "assistant") continue;
		const text = toMessageText(message.content).trim();
		if (text) return text;
	}
	return "";
}

async function runAnalysis(
	options: {
		db: RidgeDatabase;
		modelRegistry: ModelRegistry;
		authStorage: AuthStorage;
		workspaceDir: string;
		modelSpec?: string;
		createAgentSessionFn?: CreateAgentSessionFn;
		sessionManagerFactory?: (workspaceDir: string) => ShutdownableSessionManager;
	},
	noteId: string,
): Promise<FleetingAnalysisResult> {
	const {
		db,
		modelRegistry,
		authStorage,
		workspaceDir,
		createAgentSessionFn = realCreateAgentSession as unknown as CreateAgentSessionFn,
		sessionManagerFactory = (dir: string) => RealSessionManager.inMemory(dir) as unknown as ShutdownableSessionManager,
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
	}));

	// 3. Build prompt
	const prompt = buildAnalysisPrompt(content, attachments);

	// 4. Call LLM via lightweight session (no tools, in-memory)
	const sessionManager = sessionManagerFactory(workspaceDir);
	const { session } = await createAgentSessionFn({
		cwd: workspaceDir,
		authStorage,
		modelRegistry,
		noTools: "all",
		sessionManager,
	});

	try {
		await session.prompt(prompt, { source: "interactive" });

		const responseText = getLastAssistantText(session);

		if (!responseText.trim()) {
			throw new Error("Empty response from LLM");
		}

		const rawJson = extractJsonFromResponse(responseText);
		return parseAnalysisResult(rawJson);
		} finally {
			// Best effort cleanup of the temp session
			try {
				await (sessionManager as { shutdown?: () => Promise<void> | void }).shutdown?.();
			} catch {
				// Ignore cleanup errors
			}
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
		createAgentSessionFn,
		sessionManagerFactory,
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
				{ db, modelRegistry, authStorage, workspaceDir, modelSpec, createAgentSessionFn, sessionManagerFactory },
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
