import crypto from "node:crypto";
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { createBackgroundJobQueue } from "./background-jobs.js";
import type { RidgeDatabase } from "./db/index.js";
import type { TaskPriority, TaskStatus } from "./task-system.js";

type BackgroundJobQueue = ReturnType<typeof createBackgroundJobQueue>;

type ReviewTrigger = "manual" | "scheduled";

interface TaskReviewOptions {
	workspaceDir: string;
	trigger: ReviewTrigger;
	now?: () => number;
}

interface TaskReviewWorkerOptions {
	db: RidgeDatabase;
	jobQueue: BackgroundJobQueue;
	workspaceDir: string;
	now?: () => number;
	pollIntervalMs?: number;
}

interface TaskRow {
	task_id: string;
	workspace_path: string;
	project_id: string | null;
	milestone_id: string;
	title: string;
	status: TaskStatus;
	priority: TaskPriority;
	acceptance_criteria: string;
	due_date: number | null;
	blocked_reason: string | null;
	processing_session_id: string | null;
	sort_order: number;
	created_at: number;
	updated_at: number;
}

interface MilestoneRow {
	milestone_id: string;
	workspace_path: string;
	project_id: string | null;
	title: string;
	goal: string;
	acceptance_criteria: string;
	status: TaskStatus;
	due_date: number | null;
	is_system: number;
	color: string;
	sort_order: number;
	created_at: number;
	updated_at: number;
	open_task_count: number;
}

interface SessionIndexRow {
	session_id: string;
	task_id: string | null;
	title: string;
	archived: number;
	updated_at: number;
}

interface TaskProcessingSessionRow {
	session_id: string;
	task_id: string;
	title: string;
	archived: number;
	updated_at: number;
}

interface DailyEntry {
	filePath: string;
	content: string;
	updatedAt: number;
}

interface ReviewSuggestion {
	suggestionType:
		| "overdue_task"
		| "blocked_stale"
		| "confirm_complete"
		| "split_task"
		| "next_step"
		| "milestone_risk"
		| "daily_inconsistency";
	relatedType: "task" | "milestone";
	relatedId: string;
	relatedTaskId?: string;
	relatedMilestoneId?: string;
	title: string;
	reason: string;
	proposedAction: string;
	suggestion: Record<string, unknown>;
}

export interface TaskReviewResult {
	created: number;
	skipped: number;
	suggestions: ReviewSuggestion[];
}

const DAY_MS = 86_400_000;
const BLOCKED_STALE_MS = 3 * DAY_MS;
const REVIEWING_STALE_MS = DAY_MS;
const SESSION_STALE_MS = 3 * DAY_MS;

const normalizeWorkspacePath = (workspaceDir: string) => path.resolve(workspaceDir);

const startOfDay = (timestamp: number) => {
	const date = new Date(timestamp);
	return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};

const listTasks = (db: RidgeDatabase, workspacePath: string): TaskRow[] =>
	db
		.prepare("SELECT * FROM workspace_tasks WHERE workspace_path = ? ORDER BY created_at ASC")
		.all(workspacePath) as TaskRow[];

const listMilestones = (db: RidgeDatabase, workspacePath: string): MilestoneRow[] =>
	db
		.prepare(
			`SELECT m.*, COUNT(t.task_id) AS open_task_count
			   FROM workspace_milestones m
			   LEFT JOIN workspace_tasks t
			     ON t.milestone_id = m.milestone_id
			    AND t.status != 'completed'
			  WHERE m.workspace_path = ?
			  GROUP BY m.milestone_id
			  ORDER BY m.created_at ASC`,
		)
		.all(workspacePath) as MilestoneRow[];

const listSessionIndex = (db: RidgeDatabase, workspacePath: string): SessionIndexRow[] =>
	db
		.prepare(
			`SELECT session_id, task_id, title, archived, updated_at
			   FROM session_index
			  WHERE workspace_path = ? AND task_id IS NOT NULL AND archived = 0
			  ORDER BY updated_at DESC`,
		)
		.all(workspacePath) as SessionIndexRow[];

const listTaskProcessingSessions = (
	db: RidgeDatabase,
	workspacePath: string,
): TaskProcessingSessionRow[] =>
	db
		.prepare(
			`SELECT
				 t.processing_session_id AS session_id,
				 t.task_id,
				 COALESCE(NULLIF(s.title, ''), t.title) AS title,
				 COALESCE(s.archived, 0) AS archived,
				 COALESCE(NULLIF(s.updated_at, 0), t.updated_at) AS updated_at
			   FROM workspace_tasks t
			   LEFT JOIN sessions s ON s.session_id = t.processing_session_id
			  WHERE t.workspace_path = ? AND t.processing_session_id IS NOT NULL
			  ORDER BY updated_at DESC`,
		)
		.all(workspacePath) as TaskProcessingSessionRow[];

const buildSessionByTaskId = (db: RidgeDatabase, workspacePath: string) => {
	const taskProcessingSessions = listTaskProcessingSessions(db, workspacePath);
	const taskIdsWithProcessingSession = new Set(
		taskProcessingSessions.map((session) => session.task_id),
	);
	const entries = [
		...taskProcessingSessions
			.filter((session) => session.archived === 0)
			.map<[string, SessionIndexRow]>((session) => [
				session.task_id,
				{
					session_id: session.session_id,
					task_id: session.task_id,
					title: session.title,
					archived: session.archived,
					updated_at: session.updated_at,
				},
			]),
		...listSessionIndex(db, workspacePath)
			.filter((session): session is SessionIndexRow & { task_id: string } => {
				if (!session.task_id) return false;
				return !taskIdsWithProcessingSession.has(session.task_id);
			})
			.map<[string, SessionIndexRow]>((session) => [session.task_id, session]),
	];

	return new Map(
		entries.reduce<Array<[string, SessionIndexRow]>>((uniqueEntries, entry) => {
			const [taskId] = entry;
			if (!uniqueEntries.some(([existingTaskId]) => existingTaskId === taskId)) {
				uniqueEntries.push(entry);
			}
			return uniqueEntries;
		}, []),
	);
};

const readRecentDaily = async (workspaceDir: string, limit = 7): Promise<DailyEntry[]> => {
	const dailyRoot = path.join(workspaceDir, "记忆", "daily");
	const files: Array<{ filePath: string; updatedAt: number }> = [];

	const walk = async (dir: string) => {
		let entries: Dirent[];
		try {
			entries = await fs.readdir(dir, { withFileTypes: true });
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
			throw error;
		}
		for (const entry of entries) {
			const nextPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				await walk(nextPath);
			} else if (entry.isFile() && entry.name.endsWith(".md")) {
				const stat = await fs.stat(nextPath);
				files.push({ filePath: nextPath, updatedAt: stat.mtimeMs });
			}
		}
	};

	await walk(dailyRoot);
	const recentFiles = files
		.sort((a, b) => b.filePath.localeCompare(a.filePath) || b.updatedAt - a.updatedAt)
		.slice(0, limit);
	return Promise.all(
		recentFiles.map(async (file) => ({
			...file,
			content: await fs.readFile(file.filePath, "utf8"),
		})),
	);
};

const dailyMentions = (dailyEntries: DailyEntry[], taskTitle: string, keywords: string[]) => {
	const normalizedTitle = taskTitle.trim();
	if (!normalizedTitle) return null;
	for (const entry of dailyEntries) {
		if (!entry.content.includes(normalizedTitle)) continue;
		const hasKeyword = keywords.some((keyword) => entry.content.includes(keyword));
		if (hasKeyword) {
			return path.relative(path.dirname(path.dirname(path.dirname(entry.filePath))), entry.filePath);
		}
	}
	return null;
};

const isOpenSuggestion = (
	db: RidgeDatabase,
	suggestion: ReviewSuggestion,
): boolean => {
	const rows = db
		.prepare(
			`SELECT payload_json
			   FROM notification_events
			  WHERE event_type = 'task_review.suggestion'
			    AND related_type = ?
			    AND related_id = ?
			    AND status NOT IN ('handled', 'dismissed')`,
		)
		.all(suggestion.relatedType, suggestion.relatedId) as Array<{ payload_json: string }>;
	return rows.some((row) => {
		try {
			const payload = JSON.parse(row.payload_json) as { suggestionType?: unknown };
			return payload.suggestionType === suggestion.suggestionType;
		} catch {
			return false;
		}
	});
};

const createNotification = (
	db: RidgeDatabase,
	suggestion: ReviewSuggestion,
	trigger: ReviewTrigger,
	timestamp: number,
) => {
	db.prepare(
		`INSERT INTO notification_events(
			event_id, event_type, source, severity, title, body,
			related_type, related_id, actions_json, payload_json,
			status, created_at, updated_at, read_at, handled_at
		) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	).run(
		`notification-${crypto.randomUUID()}`,
		"task_review.suggestion",
		"task_review",
		"info",
		suggestion.title,
		`${suggestion.reason}\n建议动作：${suggestion.proposedAction}`,
		suggestion.relatedType,
		suggestion.relatedId,
		JSON.stringify([
			{ id: "open_related", label: "打开对象" },
			{ id: "accept_suggestion", label: "接受建议" },
			{ id: "reject_suggestion", label: "拒绝建议" },
		]),
		JSON.stringify({
			suggestionType: suggestion.suggestionType,
			relatedTaskId: suggestion.relatedTaskId,
			relatedMilestoneId: suggestion.relatedMilestoneId,
			title: suggestion.title,
			reason: suggestion.reason,
			proposedAction: suggestion.proposedAction,
			trigger,
			suggestion: suggestion.suggestion,
		}),
		"pending",
		timestamp,
		timestamp,
		null,
		null,
	);
};

const buildTaskSuggestions = (
	task: TaskRow,
	context: {
		todayStart: number;
		now: number;
		sessionByTaskId: Map<string, SessionIndexRow>;
		dailyEntries: DailyEntry[];
	},
): ReviewSuggestion[] => {
	if (task.status === "completed") return [];
	const suggestions: ReviewSuggestion[] = [];
	const base = {
		relatedType: "task" as const,
		relatedId: task.task_id,
		relatedTaskId: task.task_id,
	};

	if (task.due_date !== null && task.due_date < context.todayStart) {
		suggestions.push({
			...base,
			suggestionType: "overdue_task",
			title: `任务已过期：${task.title}`,
			reason: `截止日期早于今天，当前仍为 ${task.status}，需要用户决定延期、推进或降范围。`,
			proposedAction: "将任务优先级调整为紧急",
			suggestion: {
				kind: "task.update",
				taskId: task.task_id,
				patch: { priority: "urgent", actor: "user" },
			},
		});
	}

	if (task.status === "blocked" && context.now - task.updated_at >= BLOCKED_STALE_MS) {
		suggestions.push({
			...base,
			suggestionType: "blocked_stale",
			title: `阻塞任务需要回看：${task.title}`,
			reason: `任务已阻塞超过 3 天，阻塞原因：${task.blocked_reason || "未填写"}。`,
			proposedAction: "清除阻塞并恢复进行中",
			suggestion: {
				kind: "task.update",
				taskId: task.task_id,
				patch: { status: "in_progress", blockedReason: null, actor: "user" },
			},
		});
	}

	const completionDaily = dailyMentions(context.dailyEntries, task.title, ["已完成", "完成", "待确认"]);
	if (task.status === "reviewing" && (context.now - task.updated_at >= REVIEWING_STALE_MS || completionDaily)) {
		suggestions.push({
			...base,
			suggestionType: "confirm_complete",
			title: `确认任务是否完成：${task.title}`,
			reason: completionDaily
				? `任务处于审核中，recent daily ${completionDaily} 提到它已经完成或等待确认。`
				: "任务处于审核中超过 1 天，需要用户确认是否完成。",
			proposedAction: "请用户确认任务是否已经完成",
			suggestion: {
				kind: "task.update",
				taskId: task.task_id,
				patch: { status: "completed", actor: "user" },
			},
		});
	}

	const session = context.sessionByTaskId.get(task.task_id);
	if (
		task.status === "in_progress" &&
		session &&
		context.now - session.updated_at >= SESSION_STALE_MS
	) {
		suggestions.push({
			...base,
			suggestionType: "next_step",
			title: `处理会话长期无进展：${task.title}`,
			reason: `关联处理会话 ${session.session_id} 超过 3 天没有更新，需要推进下一步或重新确认阻塞。`,
			proposedAction: "将任务优先级调整为重要",
			suggestion: {
				kind: "task.update",
				taskId: task.task_id,
				patch: { priority: task.priority === "urgent" ? "urgent" : "important", actor: "user" },
			},
		});
	}

	const doneDaily = dailyMentions(context.dailyEntries, task.title, ["已完成", "完成"]);
	if (task.status === "in_progress" && doneDaily) {
		suggestions.push({
			...base,
			suggestionType: "daily_inconsistency",
			title: `任务状态与 daily 不一致：${task.title}`,
			reason: `recent daily ${doneDaily} 提到任务已完成，但任务仍在进行中。`,
			proposedAction: "将任务推进到审核中，由用户再确认完成",
			suggestion: {
				kind: "task.update",
				taskId: task.task_id,
				patch: { status: "reviewing", actor: "user" },
			},
		});
	}

	const textSize = `${task.title}\n${task.acceptance_criteria}`.length;
	if (task.status === "pending" && textSize > 100) {
		suggestions.push({
			...base,
			suggestionType: "split_task",
			title: `任务可能需要拆分：${task.title}`,
			reason: "任务标题和完成标准较长，可能包含多个可独立推进的步骤。",
			proposedAction: "创建一个拆分跟进任务",
			suggestion: {
				kind: "task.create",
				task: {
					title: `拆分：${task.title}`,
					priority: task.priority,
					acceptanceCriteria: "把原任务拆为可独立验收的子任务清单。",
					milestoneId: task.milestone_id,
					projectId: task.project_id,
				},
			},
		});
	}

	return suggestions;
};

const buildMilestoneSuggestions = (
	milestone: MilestoneRow,
	todayStart: number,
): ReviewSuggestion[] => {
	if (
		milestone.status === "completed" ||
		milestone.is_system === 1 ||
		milestone.due_date === null ||
		milestone.due_date >= todayStart ||
		milestone.open_task_count === 0 ||
		!["pending", "in_progress"].includes(milestone.status)
	) {
		return [];
	}
	const nextStatus = milestone.status === "pending" ? "in_progress" : "blocked";
	return [
		{
			suggestionType: "milestone_risk",
			relatedType: "milestone",
			relatedId: milestone.milestone_id,
			relatedMilestoneId: milestone.milestone_id,
			title: `里程碑存在延期风险：${milestone.title}`,
			reason: `里程碑已过期且仍有 ${milestone.open_task_count} 个未完成任务。`,
			proposedAction: nextStatus === "blocked" ? "将里程碑标记为阻塞" : "将里程碑推进为进行中",
			suggestion: {
				kind: "milestone.update",
				milestoneId: milestone.milestone_id,
				patch: { status: nextStatus, actor: "user" },
			},
		},
	];
};

export const runTaskReview = async (
	db: RidgeDatabase,
	options: TaskReviewOptions,
): Promise<TaskReviewResult> => {
	const workspacePath = normalizeWorkspacePath(options.workspaceDir);
	const now = options.now?.() ?? Date.now();
	const todayStart = startOfDay(now);
	const tasks = listTasks(db, workspacePath);
	const milestones = listMilestones(db, workspacePath);
	const sessionByTaskId = buildSessionByTaskId(db, workspacePath);
	const dailyEntries = await readRecentDaily(options.workspaceDir);
	const suggestions = [
		...tasks.flatMap((task) =>
			buildTaskSuggestions(task, {
				todayStart,
				now,
				sessionByTaskId,
				dailyEntries,
			}),
		),
		...milestones.flatMap((milestone) => buildMilestoneSuggestions(milestone, todayStart)),
	];

	let created = 0;
	let skipped = 0;
	db.transaction(() => {
		for (const suggestion of suggestions) {
			if (isOpenSuggestion(db, suggestion)) {
				skipped += 1;
				continue;
			}
			createNotification(db, suggestion, options.trigger, now);
			created += 1;
		}
	})();

	return { created, skipped, suggestions };
};

export const enqueueTaskReviewJob = (
	jobQueue: BackgroundJobQueue,
	options: {
		workspaceDir: string;
		trigger: ReviewTrigger;
		runAfter?: number | null;
	},
) =>
	jobQueue.enqueue({
		type: "task.review",
		relatedType: "workspace",
		relatedId: normalizeWorkspacePath(options.workspaceDir),
		payload: {
			workspaceDir: normalizeWorkspacePath(options.workspaceDir),
			trigger: options.trigger,
		},
		runAfter: options.runAfter ?? null,
		maxAttempts: 3,
		notifyOnFailure: true,
	});

export function createTaskReviewWorkers(options: TaskReviewWorkerOptions) {
	const pollIntervalMs = options.pollIntervalMs ?? 5000;
	let timer: NodeJS.Timeout | null = null;
	let running = false;

	const processReviewJob = async () => {
		const job = options.jobQueue.claimNext("task-review-worker", "task.review");
		if (!job) return;
		const payload = job.payload as { workspaceDir?: string; trigger?: ReviewTrigger } | null;
		const workspaceDir = payload?.workspaceDir || options.workspaceDir;
		const trigger = payload?.trigger === "scheduled" ? "scheduled" : "manual";

		try {
			const result = await runTaskReview(options.db, {
				workspaceDir,
				trigger,
				now: options.now,
			});
			options.jobQueue.complete(job.jobId, {
				created: result.created,
				skipped: result.skipped,
			});
		} catch (error) {
			options.jobQueue.fail(job.jobId, error instanceof Error ? error : new Error(String(error)));
		}
	};

	const tick = async () => {
		if (!running) return;
		try {
			await processReviewJob();
		} catch (error) {
			console.error("Task review worker error:", error);
		}
		if (running) {
			timer = setTimeout(tick, pollIntervalMs);
		}
	};

	const start = () => {
		if (running) return;
		running = true;
		void tick();
	};

	const stop = () => {
		running = false;
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
	};

	return { processReviewJob, start, stop };
}

export function createTaskReviewScheduler(options: {
	jobQueue: BackgroundJobQueue;
	workspaceDir: string;
	intervalMs?: number;
}) {
	const intervalMs = options.intervalMs ?? 6 * 60 * 60 * 1000;
	let timer: NodeJS.Timeout | null = null;

	const enqueue = () => {
		enqueueTaskReviewJob(options.jobQueue, {
			workspaceDir: options.workspaceDir,
			trigger: "scheduled",
		});
	};

	const start = () => {
		if (timer) return;
		timer = setInterval(enqueue, intervalMs);
	};

	const stop = () => {
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
	};

	return { enqueue, start, stop };
}
