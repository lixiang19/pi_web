import crypto from "node:crypto";
import path from "node:path";
import type Database from "better-sqlite3";
import { getRidgeDb } from "./db/index.js";

type RidgeDatabase = InstanceType<typeof Database>;

export const TASK_STATUSES = [
	"pending",
	"in_progress",
	"blocked",
	"reviewing",
	"completed",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["normal", "important", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export type TaskActor = "user" | "agent";

export interface WorkspaceMilestone {
	id: string;
	workspacePath: string;
	projectId: string | null;
	title: string;
	goal: string;
	acceptanceCriteria: string;
	status: TaskStatus;
	dueDate: number | null;
	isSystem: boolean;
	color: string;
	sortOrder: number;
	createdAt: number;
	updatedAt: number;
	taskCount: number;
}

export interface WorkspaceTask {
	id: string;
	workspacePath: string;
	projectId: string | null;
	milestoneId: string;
	title: string;
	status: TaskStatus;
	priority: TaskPriority;
	acceptanceCriteria: string;
	dueDate: number | null;
	blockedReason: string | null;
	processingSessionId: string | null;
	sortOrder: number;
	createdAt: number;
	updatedAt: number;
}

type MilestoneRow = {
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
	task_count?: number;
};

type TaskRow = {
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
};

type HttpError = Error & { statusCode?: number };

const DEFAULT_MILESTONE_TITLE = "未归属";
const DEFAULT_MILESTONE_COLOR = "#64748b";

const createHttpError = (message: string, statusCode: number): HttpError => {
	const error = new Error(message) as HttpError;
	error.statusCode = statusCode;
	return error;
};

const normalizeWorkspacePath = (workspaceDir: string): string =>
	path.resolve(workspaceDir);

const createId = (prefix: string): string => `${prefix}-${crypto.randomUUID()}`;

const isValidStatus = (status: string): status is TaskStatus =>
	(TASK_STATUSES as readonly string[]).includes(status);

const assertStatusAllowed = ({
	currentStatus,
	status,
	actor,
	isDefaultMilestone,
}: {
	currentStatus?: TaskStatus;
	status: TaskStatus;
	actor: TaskActor;
	isDefaultMilestone?: boolean;
}) => {
	if (currentStatus && currentStatus !== status) {
		const allowedNextStatuses: Record<TaskStatus, TaskStatus[]> = {
			pending: ["in_progress"],
			in_progress: ["blocked", "reviewing"],
			blocked: ["in_progress"],
			reviewing: ["completed"],
			completed: [],
		};
		if (!allowedNextStatuses[currentStatus].includes(status)) {
			throw createHttpError(
				`非法状态流转: ${currentStatus} -> ${status}`,
				400,
			);
		}
	}
	if (actor === "agent" && status === "completed") {
		throw createHttpError("Agent 不能把任务或里程碑改为完成", 400);
	}
	if (isDefaultMilestone && status === "completed") {
		throw createHttpError("未归属里程碑不允许完成", 400);
	}
};

const mapMilestone = (row: MilestoneRow): WorkspaceMilestone => ({
	id: row.milestone_id,
	workspacePath: row.workspace_path,
	projectId: row.project_id || null,
	title: row.title,
	goal: row.goal,
	acceptanceCriteria: row.acceptance_criteria,
	status: row.status,
	dueDate: row.due_date,
	isSystem: row.is_system === 1,
	color: row.color,
	sortOrder: row.sort_order,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
	taskCount: row.task_count ?? 0,
});

const mapTask = (row: TaskRow): WorkspaceTask => ({
	id: row.task_id,
	workspacePath: row.workspace_path,
	projectId: row.project_id || null,
	milestoneId: row.milestone_id,
	title: row.title,
	status: row.status,
	priority: row.priority,
	acceptanceCriteria: row.acceptance_criteria,
	dueDate: row.due_date,
	blockedReason: row.blocked_reason,
	processingSessionId: row.processing_session_id,
	sortOrder: row.sort_order,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

const getMilestoneById = (
	db: RidgeDatabase,
	workspacePath: string,
	milestoneId: string,
): WorkspaceMilestone | null => {
	const row = db
		.prepare(
			`SELECT m.*, COUNT(t.task_id) AS task_count
       FROM workspace_milestones m
       LEFT JOIN workspace_tasks t ON t.milestone_id = m.milestone_id
       WHERE m.workspace_path = ? AND m.milestone_id = ?
       GROUP BY m.milestone_id`,
		)
		.get(workspacePath, milestoneId) as MilestoneRow | undefined;
	return row ? mapMilestone(row) : null;
};

export const ensureDefaultMilestone = async (
	workspaceDir: string,
): Promise<WorkspaceMilestone> => {
	const db = await getRidgeDb();
	const workspacePath = normalizeWorkspacePath(workspaceDir);

	// Race-safe: use INSERT OR IGNORE so concurrent callers don't crash on unique index
	const now = Date.now();
	const id = createId("milestone");
	db.prepare(
		`INSERT OR IGNORE INTO workspace_milestones(
      milestone_id, workspace_path, title, goal, acceptance_criteria, status,
      due_date, is_system, color, sort_order, created_at, updated_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	).run(
		id,
		workspacePath,
		DEFAULT_MILESTONE_TITLE,
		"系统默认里程碑，用于承载未手动归属的任务",
		"系统里程碑不允许完成",
		"pending",
		null,
		1,
		DEFAULT_MILESTONE_COLOR,
		0,
		now,
		now,
	);

	const row = db
		.prepare(
			`SELECT m.*, COUNT(t.task_id) AS task_count
       FROM workspace_milestones m
       LEFT JOIN workspace_tasks t ON t.milestone_id = m.milestone_id
       WHERE m.workspace_path = ? AND m.is_system = 1 AND m.title = ?
       GROUP BY m.milestone_id`,
		)
		.get(workspacePath, DEFAULT_MILESTONE_TITLE) as MilestoneRow | undefined;

	return mapMilestone(row!);
};

export const listMilestones = async (
	workspaceDir: string,
): Promise<WorkspaceMilestone[]> => {
	await ensureDefaultMilestone(workspaceDir);
	const db = await getRidgeDb();
	const workspacePath = normalizeWorkspacePath(workspaceDir);
	const rows = db
		.prepare(
			`SELECT m.*, COUNT(t.task_id) AS task_count
       FROM workspace_milestones m
       LEFT JOIN workspace_tasks t ON t.milestone_id = m.milestone_id
       WHERE m.workspace_path = ?
       GROUP BY m.milestone_id
       ORDER BY m.is_system DESC, m.sort_order ASC, m.created_at ASC`,
		)
		.all(workspacePath) as MilestoneRow[];
	return rows.map(mapMilestone);
};

export const createMilestone = async (
	workspaceDir: string,
	input: {
		title: string;
		goal: string;
		acceptanceCriteria: string;
		dueDate?: number | null;
		color?: string;
		projectId?: string | null;
	},
): Promise<WorkspaceMilestone> => {
	const db = await getRidgeDb();
	const workspacePath = normalizeWorkspacePath(workspaceDir);
	const now = Date.now();
	const id = createId("milestone");
	db.prepare(
		`INSERT INTO workspace_milestones(
      milestone_id, workspace_path, project_id, title, goal, acceptance_criteria, status,
      due_date, is_system, color, sort_order, created_at, updated_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	).run(
		id,
		workspacePath,
		input.projectId ?? null,
		input.title,
		input.goal,
		input.acceptanceCriteria,
		"pending",
		input.dueDate ?? null,
		0,
		input.color || DEFAULT_MILESTONE_COLOR,
		now,
		now,
		now,
	);
	return getMilestoneById(db, workspacePath, id)!;
};

export const getMilestone = async (
	workspaceDir: string,
	milestoneId: string,
): Promise<WorkspaceMilestone> => {
	const db = await getRidgeDb();
	const milestone = getMilestoneById(
		db,
		normalizeWorkspacePath(workspaceDir),
		milestoneId,
	);
	if (!milestone) {
		throw createHttpError(`Milestone not found: ${milestoneId}`, 404);
	}
	return milestone;
};

export const updateMilestone = async (
	workspaceDir: string,
	milestoneId: string,
	input: Partial<{
		title: string;
		goal: string;
		acceptanceCriteria: string;
		status: TaskStatus;
		dueDate: number | null;
		color: string;
		projectId: string | null;
		actor: TaskActor;
	}>,
): Promise<WorkspaceMilestone> => {
	const db = await getRidgeDb();
	const workspacePath = normalizeWorkspacePath(workspaceDir);
	const current = getMilestoneById(db, workspacePath, milestoneId);
	if (!current) {
		throw createHttpError(`Milestone not found: ${milestoneId}`, 404);
	}
	if (input.status !== undefined) {
		assertStatusAllowed({
			currentStatus: current.status,
			status: input.status,
			actor: input.actor || "user",
			isDefaultMilestone: current.isSystem,
		});
	}

	db.prepare(
		`UPDATE workspace_milestones SET
       title = ?, goal = ?, acceptance_criteria = ?, status = ?, due_date = ?,
       color = ?, project_id = ?, updated_at = ?
     WHERE workspace_path = ? AND milestone_id = ?`,
	).run(
		input.title ?? current.title,
		input.goal ?? current.goal,
		input.acceptanceCriteria ?? current.acceptanceCriteria,
		input.status ?? current.status,
		input.dueDate !== undefined ? input.dueDate : current.dueDate,
		input.color ?? current.color,
		input.projectId !== undefined ? input.projectId : current.projectId,
		Date.now(),
		workspacePath,
		milestoneId,
	);
	return getMilestone(workspaceDir, milestoneId);
};

export const deleteMilestone = async (
	workspaceDir: string,
	milestoneId: string,
): Promise<void> => {
	const db = await getRidgeDb();
	const workspacePath = normalizeWorkspacePath(workspaceDir);
	const milestone = getMilestoneById(db, workspacePath, milestoneId);
	if (!milestone) {
		throw createHttpError(`Milestone not found: ${milestoneId}`, 404);
	}
	if (milestone.isSystem) {
		throw createHttpError("系统里程碑不允许删除", 400);
	}
	const taskCount = db
		.prepare(
			`SELECT COUNT(*) AS count FROM workspace_tasks WHERE workspace_path = ? AND milestone_id = ?`,
		)
		.get(workspacePath, milestoneId) as { count: number };
	if (taskCount.count > 0) {
		throw createHttpError("里程碑下仍有任务，不能删除", 409);
	}
	db.prepare(
		`DELETE FROM workspace_milestones WHERE workspace_path = ? AND milestone_id = ?`,
	).run(workspacePath, milestoneId);
};

export const listTasks = async (
	workspaceDir: string,
	options?: { projectId?: string | null },
): Promise<WorkspaceTask[]> => {
	await ensureDefaultMilestone(workspaceDir);
	const db = await getRidgeDb();
	const workspacePath = normalizeWorkspacePath(workspaceDir);
	const { projectId } = options ?? {};

	let sql = `SELECT * FROM workspace_tasks WHERE workspace_path = ?`;
	const params: (string | null)[] = [workspacePath];
	if (projectId !== undefined) {
		if (projectId === null) {
			sql += ` AND project_id IS NULL`;
		} else {
			sql += ` AND project_id = ?`;
			params.push(projectId);
		}
	}
	sql += ` ORDER BY created_at DESC, task_id DESC`;

	const rows = db.prepare(sql).all(...params) as TaskRow[];
	return rows.map(mapTask);
};

export const getTask = async (
	workspaceDir: string,
	taskId: string,
): Promise<WorkspaceTask> => {
	const db = await getRidgeDb();
	const workspacePath = normalizeWorkspacePath(workspaceDir);
	const row = db
		.prepare(`SELECT * FROM workspace_tasks WHERE workspace_path = ? AND task_id = ?`)
		.get(workspacePath, taskId) as TaskRow | undefined;
	if (!row) {
		throw createHttpError(`Task not found: ${taskId}`, 404);
	}
	return mapTask(row);
};

export const createTask = async (
	workspaceDir: string,
	input: {
		title: string;
		priority: TaskPriority;
		acceptanceCriteria: string;
		dueDate?: number | null;
		milestoneId?: string | null;
		projectId?: string | null;
	},
): Promise<WorkspaceTask> => {
	const defaultMilestone = await ensureDefaultMilestone(workspaceDir);
	const db = await getRidgeDb();
	const workspacePath = normalizeWorkspacePath(workspaceDir);
	const milestoneId = input.milestoneId || defaultMilestone.id;
	const milestone = getMilestoneById(db, workspacePath, milestoneId);
	if (!milestone) {
		throw createHttpError(`Milestone not found: ${milestoneId}`, 404);
	}
	const projectId = input.projectId !== undefined ? input.projectId : milestone.projectId;
	const now = Date.now();
	const id = createId("task");
	db.prepare(
		`INSERT INTO workspace_tasks(
      task_id, workspace_path, project_id, milestone_id, title, status, priority,
      acceptance_criteria, due_date, blocked_reason, processing_session_id,
      sort_order, created_at, updated_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	).run(
		id,
		workspacePath,
		projectId,
		milestoneId,
		input.title,
		"pending",
		input.priority,
		input.acceptanceCriteria,
		input.dueDate ?? null,
		null,
		null,
		now,
		now,
		now,
	);
	return getTask(workspaceDir, id);
};

export const updateTask = async (
	workspaceDir: string,
	taskId: string,
	input: Partial<{
		title: string;
		status: TaskStatus;
		priority: TaskPriority;
		acceptanceCriteria: string;
		dueDate: number | null;
		milestoneId: string;
		projectId: string | null;
		blockedReason: string | null;
		sortOrder: number;
		actor: TaskActor;
	}>,
): Promise<WorkspaceTask> => {
	const current = await getTask(workspaceDir, taskId);
	const db = await getRidgeDb();
	const workspacePath = normalizeWorkspacePath(workspaceDir);
	if (input.status !== undefined) {
		assertStatusAllowed({
			currentStatus: current.status,
			status: input.status,
			actor: input.actor || "user",
		});
	}
	if (input.milestoneId !== undefined) {
		const milestone = getMilestoneById(db, workspacePath, input.milestoneId);
		if (!milestone) {
			throw createHttpError(`Milestone not found: ${input.milestoneId}`, 404);
		}
	}
	db.prepare(
		`UPDATE workspace_tasks SET
       milestone_id = ?, project_id = ?, title = ?, status = ?, priority = ?, acceptance_criteria = ?,
       due_date = ?, blocked_reason = ?, sort_order = ?, updated_at = ?
     WHERE workspace_path = ? AND task_id = ?`,
	).run(
		input.milestoneId ?? current.milestoneId,
		input.projectId !== undefined ? input.projectId : current.projectId,
		input.title ?? current.title,
		input.status ?? current.status,
		input.priority ?? current.priority,
		input.acceptanceCriteria ?? current.acceptanceCriteria,
		input.dueDate !== undefined ? input.dueDate : current.dueDate,
		input.blockedReason !== undefined ? input.blockedReason : current.blockedReason,
		input.sortOrder ?? current.sortOrder,
		Date.now(),
		workspacePath,
		taskId,
	);
	return getTask(workspaceDir, taskId);
};

/** 内部专用：原子/条件设置任务的 processingSessionId。
 *  - 传入 null：清除（用于销毁会话时解绑）。
 *  - 传入 string：
 *      • DB 已有相同值 → 返回当前任务（幂等）。
 *      • DB 已有不同值 → 返回已有值的任务（不覆盖，防止并发创建多个会话）。
 *      • DB 无值 → 写入新值并返回。
 */
export const setTaskProcessingSessionId = async (
	workspaceDir: string,
	taskId: string,
	processingSessionId: string | null,
): Promise<{ task: WorkspaceTask; existingSessionId: string | null }> => {
	const db = await getRidgeDb();
	const workspacePath = normalizeWorkspacePath(workspaceDir);

	if (processingSessionId === null) {
		db.prepare(
			`UPDATE workspace_tasks SET processing_session_id = ?, updated_at = ? WHERE workspace_path = ? AND task_id = ?`,
		).run(null, Date.now(), workspacePath, taskId);
		return { task: await getTask(workspaceDir, taskId), existingSessionId: null };
	}

	// 先读取当前值
	const existing = db
		.prepare(
			`SELECT processing_session_id FROM workspace_tasks WHERE workspace_path = ? AND task_id = ?`,
		)
		.get(workspacePath, taskId) as { processing_session_id: string | null } | undefined;

	if (existing?.processing_session_id) {
		if (existing.processing_session_id === processingSessionId) {
			// 幂等：相同值，不写入，直接返回
			return { task: await getTask(workspaceDir, taskId), existingSessionId: processingSessionId };
		}
		// 已有不同值 → 不覆盖，返回已有值
		return { task: await getTask(workspaceDir, taskId), existingSessionId: existing.processing_session_id };
	}

	// 无值 → 写入
	db.prepare(
		`UPDATE workspace_tasks SET processing_session_id = ?, updated_at = ? WHERE workspace_path = ? AND task_id = ?`,
	).run(processingSessionId, Date.now(), workspacePath, taskId);
	return { task: await getTask(workspaceDir, taskId), existingSessionId: null };
};

export const deleteTask = async (
	workspaceDir: string,
	taskId: string,
): Promise<void> => {
	await getTask(workspaceDir, taskId);
	const db = await getRidgeDb();
	db.prepare(`DELETE FROM workspace_tasks WHERE workspace_path = ? AND task_id = ?`).run(
		normalizeWorkspacePath(workspaceDir),
		taskId,
	);
};

export const validateTaskStatus = (status: string): TaskStatus => {
	if (!isValidStatus(status)) {
		throw createHttpError(`Invalid status: ${status}`, 400);
	}
	return status;
};
