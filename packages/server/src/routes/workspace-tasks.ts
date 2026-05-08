import express, {
	type NextFunction,
	type Request,
	type Response,
} from "express";
import { z } from "zod";
import {
	TASK_PRIORITIES,
	TASK_STATUSES,
	createMilestone,
	createTask,
	deleteMilestone,
	deleteTask,
	getMilestone,
	getTask,
	listMilestones,
	listTasks,
	updateMilestone,
	updateTask,
} from "../task-system.js";

const actorSchema = z.enum(["user", "agent"]).default("user");

const dueDateSchema = z.number().int().nonnegative().nullable().optional();

const createMilestoneSchema = z.object({
	title: z.string().trim().min(1),
	goal: z.string().trim().min(1),
	acceptanceCriteria: z.string().trim().min(1),
	dueDate: dueDateSchema,
	color: z.string().trim().min(1).optional(),
});

const updateMilestoneSchema = z
	.object({
		title: z.string().trim().min(1).optional(),
		goal: z.string().trim().min(1).optional(),
		acceptanceCriteria: z.string().trim().min(1).optional(),
		status: z.enum(TASK_STATUSES).optional(),
		dueDate: dueDateSchema,
		color: z.string().trim().min(1).optional(),
		actor: actorSchema,
	})
	.refine((payload) => Object.keys(payload).some((key) => key !== "actor"), {
		message: "至少要更新一个字段",
	});

const createTaskSchema = z.object({
	title: z.string().trim().min(1),
	priority: z.enum(TASK_PRIORITIES),
	acceptanceCriteria: z.string().trim().min(1),
	dueDate: dueDateSchema,
	milestoneId: z.string().trim().min(1).nullable().optional(),
});

const updateTaskSchema = z
	.object({
		title: z.string().trim().min(1).optional(),
		status: z.enum(TASK_STATUSES).optional(),
		priority: z.enum(TASK_PRIORITIES).optional(),
		acceptanceCriteria: z.string().trim().min(1).optional(),
		dueDate: dueDateSchema,
		milestoneId: z.string().trim().min(1).optional(),
		blockedReason: z.string().trim().nullable().optional(),
		processingSessionId: z.string().trim().min(1).nullable().optional(),
		sortOrder: z.number().int().optional(),
		actor: actorSchema,
	})
	.refine((payload) => Object.keys(payload).some((key) => key !== "actor"), {
		message: "至少要更新一个字段",
	});

export function createWorkspaceTasksRouter(defaultWorkspaceDir: string) {
	const router = express.Router();

	router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
		try {
			res.json({ tasks: await listTasks(defaultWorkspaceDir) });
		} catch (error) {
			next(error);
		}
	});

	router.post("/", async (req: Request, res: Response, next: NextFunction) => {
		try {
			const payload = createTaskSchema.parse(req.body ?? {});
			const task = await createTask(defaultWorkspaceDir, payload);
			res.status(201).json({ task });
		} catch (error) {
			next(error);
		}
	});

	router.get(
		"/:taskId",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				res.json({ task: await getTask(defaultWorkspaceDir, req.params.taskId) });
			} catch (error) {
				next(error);
			}
		},
	);

	router.patch(
		"/:taskId",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const payload = updateTaskSchema.parse(req.body ?? {});
				const task = await updateTask(defaultWorkspaceDir, req.params.taskId, payload);
				res.json({ task });
			} catch (error) {
				next(error);
			}
		},
	);

	router.delete(
		"/:taskId",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				await deleteTask(defaultWorkspaceDir, req.params.taskId);
				res.json({ ok: true });
			} catch (error) {
				next(error);
			}
		},
	);

	return router;
}

export function createWorkspaceMilestonesRouter(defaultWorkspaceDir: string) {
	const router = express.Router();

	router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
		try {
			res.json({ milestones: await listMilestones(defaultWorkspaceDir) });
		} catch (error) {
			next(error);
		}
	});

	router.post("/", async (req: Request, res: Response, next: NextFunction) => {
		try {
			const payload = createMilestoneSchema.parse(req.body ?? {});
			const milestone = await createMilestone(defaultWorkspaceDir, payload);
			res.status(201).json({ milestone });
		} catch (error) {
			next(error);
		}
	});

	router.get(
		"/:milestoneId",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				res.json({
					milestone: await getMilestone(
						defaultWorkspaceDir,
						req.params.milestoneId,
					),
				});
			} catch (error) {
				next(error);
			}
		},
	);

	router.patch(
		"/:milestoneId",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const payload = updateMilestoneSchema.parse(req.body ?? {});
				const milestone = await updateMilestone(
					defaultWorkspaceDir,
					req.params.milestoneId,
					payload,
				);
				res.json({ milestone });
			} catch (error) {
				next(error);
			}
		},
	);

	router.delete(
		"/:milestoneId",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				await deleteMilestone(defaultWorkspaceDir, req.params.milestoneId);
				res.json({ ok: true });
			} catch (error) {
				next(error);
			}
		},
	);

	return router;
}
