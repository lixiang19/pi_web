import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

export type HttpError = Error & { statusCode?: number };

export interface TaskItem {
	id: string;
	title: string;
	status: "pending" | "in_progress" | "done";
	priority: "low" | "medium" | "high";
	dueDate: number | null;
	tags: string[];
	createdAt: number;
	updatedAt: number;
	kind?: "goal" | "task";
	sessionId?: string;
	source?: "dashboard";
}

export interface TasksFile {
	tasks: TaskItem[];
	updatedAt: number;
}

export interface CreateTaskInput {
	title: string;
	priority?: TaskItem["priority"];
	dueDate?: number | null;
	tags?: unknown;
	kind?: unknown;
	sessionId?: unknown;
	source?: unknown;
}

export interface UpdateTaskInput {
	status?: TaskItem["status"];
	title?: string;
	priority?: TaskItem["priority"];
	dueDate?: number | null;
	tags?: unknown;
	kind?: unknown;
	sessionId?: unknown;
	source?: unknown;
}

export interface TaskMutationResult {
	task: TaskItem;
	updatedAt: number;
}

export interface TaskDeleteResult {
	updatedAt: number;
}

export interface TaskRepository {
	list(): Promise<TasksFile>;
	create(input: CreateTaskInput, expectedUpdatedAt?: number): Promise<TaskMutationResult>;
	update(taskId: string, patch: UpdateTaskInput, expectedUpdatedAt?: number): Promise<TaskMutationResult>;
	delete(taskId: string, expectedUpdatedAt?: number): Promise<TaskDeleteResult>;
}

type TaskRow = {
	id: string;
	title: string;
	status: TaskItem["status"];
	priority: TaskItem["priority"];
	due_date: number | null;
	tags_json: string;
	created_at: number;
	updated_at: number;
	kind: TaskItem["kind"] | null;
	session_id: string | null;
	source: TaskItem["source"] | null;
};

type VersionRow = { value: number };

const createConflictError = (): HttpError => {
	const error = new Error("tasks 已被修改，请刷新后重试") as HttpError;
	error.statusCode = 409;
	return error;
};

const createNotFoundError = (taskId: string): HttpError => {
	const error = new Error(`Task not found: ${taskId}`) as HttpError;
	error.statusCode = 404;
	return error;
};

const parseTags = (value: string): string[] => {
	try {
		const parsed = JSON.parse(value) as unknown;
		return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
	} catch {
		return [];
	}
};

const mapRowToTask = (row: TaskRow): TaskItem => {
	const task: TaskItem = {
		id: row.id,
		title: row.title,
		status: row.status,
		priority: row.priority,
		dueDate: row.due_date,
		tags: parseTags(row.tags_json),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
	if (row.kind === "goal" || row.kind === "task") task.kind = row.kind;
	if (row.session_id) task.sessionId = row.session_id;
	if (row.source === "dashboard") task.source = row.source;
	return task;
};

const isKnownStatus = (status: unknown): status is TaskItem["status"] =>
	status === "pending" || status === "in_progress" || status === "done";

const isKnownPriority = (priority: unknown): priority is TaskItem["priority"] =>
	priority === "low" || priority === "medium" || priority === "high";

export class SqliteTaskRepository implements TaskRepository {
	private readonly db: InstanceType<typeof Database>;

	constructor(workspaceDir: string) {
		const dbPath = path.join(workspaceDir, ".ridge", "ridge.db");
		fs.mkdirSync(path.dirname(dbPath), { recursive: true });
		this.db = new Database(dbPath);
		this.db.pragma("journal_mode = WAL");
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS task_meta (
				key TEXT PRIMARY KEY,
				value INTEGER NOT NULL
			);

			CREATE TABLE IF NOT EXISTS tasks (
				id TEXT PRIMARY KEY,
				title TEXT NOT NULL,
				status TEXT NOT NULL,
				priority TEXT NOT NULL,
				due_date INTEGER,
				tags_json TEXT NOT NULL,
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL,
				kind TEXT,
				session_id TEXT,
				source TEXT
			);

			CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at DESC);
			CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
		`);
	}

	async list(): Promise<TasksFile> {
		const rows = this.db
			.prepare("SELECT * FROM tasks ORDER BY updated_at DESC, created_at DESC")
			.all() as TaskRow[];
		return { tasks: rows.map(mapRowToTask), updatedAt: this.getUpdatedAt() };
	}

	async create(
		input: CreateTaskInput,
		expectedUpdatedAt?: number,
	): Promise<TaskMutationResult> {
		return this.runWrite(() => {
			this.checkOptimisticLock(expectedUpdatedAt);
			const now = this.nextUpdatedAt();
			const task: TaskItem = {
				id: `task-${now}-${Math.random().toString(36).slice(2, 8)}`,
				title: input.title,
				status: "pending",
				priority: isKnownPriority(input.priority) ? input.priority : "medium",
				dueDate: typeof input.dueDate === "number" ? input.dueDate : null,
				tags: Array.isArray(input.tags) ? input.tags.filter((tag): tag is string => typeof tag === "string") : [],
				createdAt: now,
				updatedAt: now,
			};
			if (input.kind === "goal" || input.kind === "task") task.kind = input.kind;
			if (typeof input.sessionId === "string" && input.sessionId.trim()) {
				task.sessionId = input.sessionId.trim();
			}
			if (input.source === "dashboard") task.source = input.source;

			this.db
				.prepare(`
					INSERT INTO tasks(
						id, title, status, priority, due_date, tags_json, created_at, updated_at, kind, session_id, source
					) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				`)
				.run(
					task.id,
					task.title,
					task.status,
					task.priority,
					task.dueDate,
					JSON.stringify(task.tags),
					task.createdAt,
					task.updatedAt,
					task.kind ?? null,
					task.sessionId ?? null,
					task.source ?? null,
				);
			this.setUpdatedAt(now);
			return { task, updatedAt: now };
		});
	}

	async update(
		taskId: string,
		patch: UpdateTaskInput,
		expectedUpdatedAt?: number,
	): Promise<TaskMutationResult> {
		return this.runWrite(() => {
			this.checkOptimisticLock(expectedUpdatedAt);
			const current = this.getTask(taskId);
			if (!current) throw createNotFoundError(taskId);

			const now = this.nextUpdatedAt();
			const task: TaskItem = { ...current, tags: [...current.tags], updatedAt: now };
			if (patch.status !== undefined && isKnownStatus(patch.status)) task.status = patch.status;
			if (patch.title !== undefined) task.title = patch.title;
			if (patch.priority !== undefined && isKnownPriority(patch.priority)) task.priority = patch.priority;
			if (patch.dueDate !== undefined) task.dueDate = typeof patch.dueDate === "number" ? patch.dueDate : null;
			if (patch.tags !== undefined) {
				task.tags = Array.isArray(patch.tags) ? patch.tags.filter((tag): tag is string => typeof tag === "string") : [];
			}
			if (patch.kind !== undefined && (patch.kind === "goal" || patch.kind === "task")) {
				task.kind = patch.kind;
			}
			if (patch.sessionId !== undefined) {
				if (typeof patch.sessionId === "string" && patch.sessionId.trim()) {
					task.sessionId = patch.sessionId.trim();
				} else {
					delete task.sessionId;
				}
			}
			if (patch.source !== undefined && patch.source === "dashboard") task.source = patch.source;

			this.db
				.prepare(`
					UPDATE tasks SET
						title = ?,
						status = ?,
						priority = ?,
						due_date = ?,
						tags_json = ?,
						updated_at = ?,
						kind = ?,
						session_id = ?,
						source = ?
					WHERE id = ?
				`)
				.run(
					task.title,
					task.status,
					task.priority,
					task.dueDate,
					JSON.stringify(task.tags),
					task.updatedAt,
					task.kind ?? null,
					task.sessionId ?? null,
					task.source ?? null,
					task.id,
				);
			this.setUpdatedAt(now);
			return { task, updatedAt: now };
		});
	}

	async delete(taskId: string, expectedUpdatedAt?: number): Promise<TaskDeleteResult> {
		return this.runWrite(() => {
			this.checkOptimisticLock(expectedUpdatedAt);
			const result = this.db.prepare("DELETE FROM tasks WHERE id = ?").run(taskId);
			if (result.changes === 0) throw createNotFoundError(taskId);
			const now = this.nextUpdatedAt();
			this.setUpdatedAt(now);
			return { updatedAt: now };
		});
	}

	private runWrite<T>(callback: () => T): Promise<T> {
		const transaction = this.db.transaction(callback);
		return Promise.resolve(transaction());
	}

	private getTask(taskId: string): TaskItem | null {
		const row = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as TaskRow | undefined;
		return row ? mapRowToTask(row) : null;
	}

	private getUpdatedAt(): number {
		const row = this.db
			.prepare("SELECT value FROM task_meta WHERE key = 'updated_at'")
			.get() as VersionRow | undefined;
		return row?.value ?? 0;
	}

	private setUpdatedAt(updatedAt: number): void {
		this.db
			.prepare(`
				INSERT INTO task_meta(key, value) VALUES('updated_at', ?)
				ON CONFLICT(key) DO UPDATE SET value = excluded.value
			`)
			.run(updatedAt);
	}

	private nextUpdatedAt(): number {
		return Math.max(Date.now(), this.getUpdatedAt() + 1);
	}

	private checkOptimisticLock(expectedUpdatedAt: number | undefined): void {
		if (expectedUpdatedAt !== undefined && this.getUpdatedAt() !== expectedUpdatedAt) {
			throw createConflictError();
		}
	}
}
