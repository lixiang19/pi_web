import express, {
	type NextFunction,
	type Request,
	type Response,
} from "express";

import {
	SqliteTaskRepository,
	type TaskRepository,
} from "../repositories/workspace-task-repository.js";

type HttpError = Error & { statusCode?: number };

export function createWorkspaceTasksRouter(
	defaultWorkspaceDir: string,
	repository?: TaskRepository,
) {
	const router = express.Router();
	let defaultRepository: TaskRepository | null = repository ?? null;
	const getRepository = () => {
		defaultRepository ??= new SqliteTaskRepository(defaultWorkspaceDir);
		return defaultRepository;
	};

	router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
		try {
			const data = await getRepository().list();
			res.json({ tasks: data.tasks, updatedAt: data.updatedAt });
		} catch (error) {
			next(error);
		}
	});

	router.post("/", async (req: Request, res: Response, next: NextFunction) => {
		try {
			const { title, priority, dueDate, tags, kind, sessionId, source, _expectedUpdatedAt } =
				req.body ?? {};
			if (!title || typeof title !== "string") {
				const error = new Error("title is required") as HttpError;
				error.statusCode = 400;
				throw error;
			}

			const result = await getRepository().create(
				{ title, priority, dueDate, tags, kind, sessionId, source },
				_expectedUpdatedAt,
			);
			res.status(201).json({ task: result.task, updatedAt: result.updatedAt });
		} catch (error) {
			next(error);
		}
	});

	router.patch(
		"/:taskId",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const { taskId } = req.params;
				const { status, title, priority, dueDate, tags, kind, sessionId, source, _expectedUpdatedAt } =
					req.body ?? {};

				const result = await getRepository().update(
					taskId,
					{ status, title, priority, dueDate, tags, kind, sessionId, source },
					_expectedUpdatedAt,
				);
				res.json({ ok: true, updatedAt: result.updatedAt });
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
				const result = await getRepository().delete(taskId, _expectedUpdatedAt);
				res.json({ ok: true, updatedAt: result.updatedAt });
			} catch (error) {
				next(error);
			}
		},
	);

	return router;
}
