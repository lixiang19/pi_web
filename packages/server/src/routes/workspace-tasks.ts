import fs from "node:fs/promises";
import path from "node:path";
import express, {
	type NextFunction,
	type Request,
	type Response,
} from "express";

import { writeJsonFile } from "../utils/fs.js";

type HttpError = Error & { statusCode?: number };

interface TaskItem {
	id: string;
	title: string;
	status: "pending" | "in_progress" | "done";
	priority: "low" | "medium" | "high";
	dueDate: number | null;
	tags: string[];
	createdAt: number;
	updatedAt: number;
}

interface TasksFile {
	tasks: TaskItem[];
	updatedAt: number;
}

const TASKS_FILE_NAME = "tasks.json";

const getTasksFilePath = (workspaceDir: string): string =>
	path.join(workspaceDir, ".ridge", TASKS_FILE_NAME);

const readTasksFile = async (filePath: string): Promise<TasksFile> => {
	try {
		const content = await fs.readFile(filePath, "utf-8");
		return JSON.parse(content) as TasksFile;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return { tasks: [], updatedAt: 0 };
		}
		throw error;
	}
};

const writeTasksFile = async (
	filePath: string,
	data: TasksFile,
): Promise<void> => {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await writeJsonFile(filePath, data);
};

const checkOptimisticLock = (
	fileData: TasksFile,
	expected: number | undefined,
): void => {
	if (expected !== undefined && fileData.updatedAt !== expected) {
		const error = new Error("tasks.json 已被修改，请刷新后重试") as HttpError;
		error.statusCode = 409;
		throw error;
	}
};

export function createWorkspaceTasksRouter(defaultWorkspaceDir: string) {
	const router = express.Router();

	router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
		try {
			const filePath = getTasksFilePath(defaultWorkspaceDir);
			const data = await readTasksFile(filePath);
			res.json({ tasks: data.tasks, updatedAt: data.updatedAt });
		} catch (error) {
			next(error);
		}
	});

	router.post("/", async (req: Request, res: Response, next: NextFunction) => {
		try {
			const { title, priority, dueDate, tags, _expectedUpdatedAt } =
				req.body ?? {};
			if (!title || typeof title !== "string") {
				const error = new Error("title is required") as HttpError;
				error.statusCode = 400;
				throw error;
			}
			const filePath = getTasksFilePath(defaultWorkspaceDir);
			const data = await readTasksFile(filePath);
			checkOptimisticLock(data, _expectedUpdatedAt);

			const now = Date.now();
			const task: TaskItem = {
				id: `task-${now}-${Math.random().toString(36).slice(2, 8)}`,
				title,
				status: "pending",
				priority: priority || "medium",
				dueDate: dueDate ?? null,
				tags: Array.isArray(tags) ? tags : [],
				createdAt: now,
				updatedAt: now,
			};
			data.tasks.unshift(task);
			data.updatedAt = now;
			await writeTasksFile(filePath, data);
			res.status(201).json({ task, updatedAt: data.updatedAt });
		} catch (error) {
			next(error);
		}
	});

	router.patch(
		"/:taskId",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const { taskId } = req.params;
				const { status, title, priority, dueDate, tags, _expectedUpdatedAt } =
					req.body ?? {};
				const filePath = getTasksFilePath(defaultWorkspaceDir);
				const data = await readTasksFile(filePath);
				checkOptimisticLock(data, _expectedUpdatedAt);

				const task = data.tasks.find((t) => t.id === taskId);
				if (!task) {
					const error = new Error(`Task not found: ${taskId}`) as HttpError;
					error.statusCode = 404;
					throw error;
				}

				const now = Date.now();
				if (status !== undefined) task.status = status;
				if (title !== undefined) task.title = title;
				if (priority !== undefined) task.priority = priority;
				if (dueDate !== undefined) task.dueDate = dueDate;
				if (tags !== undefined) task.tags = Array.isArray(tags) ? tags : [];
				task.updatedAt = now;
				data.updatedAt = now;
				await writeTasksFile(filePath, data);
				res.json({ ok: true, updatedAt: data.updatedAt });
			} catch (error) {
				next(error);
			}
		},
	);

	router.delete(
		"/:taskId",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const { taskId } = req.params;
				const { _expectedUpdatedAt } = req.body ?? {};
				const filePath = getTasksFilePath(defaultWorkspaceDir);
				const data = await readTasksFile(filePath);
				checkOptimisticLock(data, _expectedUpdatedAt);

				const index = data.tasks.findIndex((t) => t.id === taskId);
				if (index === -1) {
					const error = new Error(`Task not found: ${taskId}`) as HttpError;
					error.statusCode = 404;
					throw error;
				}

				data.tasks.splice(index, 1);
				data.updatedAt = Date.now();
				await writeTasksFile(filePath, data);
				res.json({ ok: true, updatedAt: data.updatedAt });
			} catch (error) {
				next(error);
			}
		},
	);

	return router;
}
