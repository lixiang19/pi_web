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
	setTaskProcessingSessionId,
	updateMilestone,
	updateTask,
} from "../task-system.js";
import type { SessionRecord, SessionSnapshot } from "../types/index.js";
import type { ProjectContextResolver } from "../project-context.js";
import type { WorkspaceChatConfig } from "../workspace-chat.js";
import type { ThinkingLevel } from "../types/index.js";

const actorSchema = z.enum(["user", "agent"]).default("user");

const dueDateSchema = z.number().int().nonnegative().nullable().optional();

const createMilestoneSchema = z.object({
	title: z.string().trim().min(1),
	goal: z.string().trim().min(1),
	acceptanceCriteria: z.string().trim().min(1),
	dueDate: dueDateSchema,
	color: z.string().trim().min(1).optional(),
	projectId: z.string().trim().min(1).nullable().optional(),
});

const updateMilestoneSchema = z
	.object({
		title: z.string().trim().min(1).optional(),
		goal: z.string().trim().min(1).optional(),
		acceptanceCriteria: z.string().trim().min(1).optional(),
		status: z.enum(TASK_STATUSES).optional(),
		dueDate: dueDateSchema,
		color: z.string().trim().min(1).optional(),
		projectId: z.string().trim().min(1).nullable().optional(),
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
	projectId: z.string().trim().min(1).nullable().optional(),
});

const updateTaskSchema = z
	.object({
		title: z.string().trim().min(1).optional(),
		status: z.enum(TASK_STATUSES).optional(),
		priority: z.enum(TASK_PRIORITIES).optional(),
		acceptanceCriteria: z.string().trim().min(1).optional(),
		dueDate: dueDateSchema,
		milestoneId: z.string().trim().min(1).optional(),
		projectId: z.string().trim().min(1).nullable().optional(),
		blockedReason: z.string().trim().nullable().optional(),
		sortOrder: z.number().int().optional(),
		actor: actorSchema,
	})
	.refine((payload) => Object.keys(payload).some((key) => key !== "actor"), {
		message: "至少要更新一个字段",
	});

export interface WorkspaceTasksRouterDeps {
	createSessionRecord: (params: { cwd: string; title?: string; model?: string }) => Promise<SessionRecord>;
	applyTaskSessionAgentSelection: (record: SessionRecord, selection: { agentName?: string; model?: string; thinkingLevel?: ThinkingLevel | null }) => Promise<void>;
	persistSessionRecordMetadata: (record: SessionRecord) => Promise<void>;
	upsertIndexedSessionRecord: (record: SessionRecord, deps: { projectContextResolver: ProjectContextResolver; workspaceChatConfig: WorkspaceChatConfig }) => Promise<void>;
	toSessionSnapshot: (record: SessionRecord, options: { rounds?: number }) => Promise<SessionSnapshot>;
	getProjects: () => Promise<{ projects: Array<{ id: string; path: string; projectType: 'internal' | 'external' | 'workspace'; deviceId?: string; isOnline: boolean }> }>;
	getDefaultModel: () => Promise<string>;
	getDefaultThinkingLevel: () => Promise<ThinkingLevel>;
	projectContextResolver: ProjectContextResolver;
	workspaceChatConfig: WorkspaceChatConfig;
}

export function createWorkspaceTasksRouter(defaultWorkspaceDir: string, deps?: WorkspaceTasksRouterDeps) {
	const router = express.Router();

	router.get("/", async (req: Request, res: Response, next: NextFunction) => {
		try {
			const raw = req.query.projectId;
			const projectId = raw === 'none' ? null : (typeof raw === 'string' ? raw : undefined);
			res.json({ tasks: await listTasks(defaultWorkspaceDir, { projectId }) });
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

	// ===== 任务处理会话 API =====
	router.get(
		"/:taskId/processing-session",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				if (!deps) {
					const error = new Error("处理会话服务尚未初始化") as import("../types/index.js").HttpError;
					error.statusCode = 503;
					throw error;
				}

				const task = await getTask(defaultWorkspaceDir, req.params.taskId);
				if (!task.processingSessionId) {
					const error = new Error("任务无处理会话") as import("../types/index.js").HttpError;
					error.statusCode = 404;
					throw error;
				}

				// 返回已有会话前也要检查绑定项目离线状态
				if (task.projectId) {
					const projectsState = await deps.getProjects();
					const project = projectsState.projects.find((p) => p.id === task.projectId);
					if (project && project.deviceId && !project.isOnline) {
						const error = new Error("项目离线，无法继续处理会话") as import("../types/index.js").HttpError;
						error.statusCode = 409;
						throw error;
					}
				}

				res.json({ sessionId: task.processingSessionId });
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/:taskId/processing-session",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				if (!deps) {
					const error = new Error("处理会话服务尚未初始化") as import("../types/index.js").HttpError;
					error.statusCode = 503;
					throw error;
				}

				const task = await getTask(defaultWorkspaceDir, req.params.taskId);

				// 确定 cwd 并检查项目离线状态（无论是否已有会话都要检查）
				let cwd = defaultWorkspaceDir;
				if (task.projectId) {
					const projectsState = await deps.getProjects();
					const project = projectsState.projects.find((p) => p.id === task.projectId);
					if (!project) {
						const error = new Error(`项目不存在: ${task.projectId}`) as import("../types/index.js").HttpError;
						error.statusCode = 404;
						throw error;
					}
					// 内部项目是组织对象，不作为 pi 运行目录；使用工作空间目录
					if (project.projectType === 'internal') {
						// 内部项目不覆盖 cwd，保持 defaultWorkspaceDir
					} else {
						// 外部仓库可作为运行目录
						cwd = project.path;
					}
					// 有 deviceId 且离线的项目禁止启动/继续处理会话
					if (project.deviceId && !project.isOnline) {
						const error = new Error("项目离线，无法启动处理会话") as import("../types/index.js").HttpError;
						error.statusCode = 409;
						throw error;
					}
				}

				// 已有处理会话时直接返回已有会话（离线检查已通过）
				if (task.processingSessionId) {
					res.status(200).json({ sessionId: task.processingSessionId, created: false });
					return;
				}

				// 创建会话
				const record = await deps.createSessionRecord({
					cwd,
					title: task.title,
				});

				// 强制选择任务 Agent（mode=task 且 enabled）
				const defaultModel = await deps.getDefaultModel();
				const defaultThinkingLevel = await deps.getDefaultThinkingLevel();
				await deps.applyTaskSessionAgentSelection(record, {
					agentName: "task-agent",
					model: defaultModel || undefined,
					thinkingLevel: defaultThinkingLevel || undefined,
				});

				await deps.persistSessionRecordMetadata(record);
				await deps.upsertIndexedSessionRecord(record, {
					projectContextResolver: deps.projectContextResolver,
					workspaceChatConfig: deps.workspaceChatConfig,
				});

				// 原子/条件记录 processing_session_id
				const { existingSessionId } = await setTaskProcessingSessionId(defaultWorkspaceDir, task.id, record.id);
				if (existingSessionId && existingSessionId !== record.id) {
					// 并发情况下已有不同会话，返回已有的
					res.status(200).json({ sessionId: existingSessionId, created: false });
					return;
				}

				const snapshot = await deps.toSessionSnapshot(record, {});
				res.status(201).json({ sessionId: record.id, created: true, snapshot });
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
