import { realpathSync } from "node:fs";
import fs from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	AuthStorage,
	ModelRegistry,
} from "@mariozechner/pi-coding-agent";
import cors from "cors";
import express, {
	type NextFunction,
	type Request,
	type Response,
} from "express";
import multer from "multer";
import { WebSocketServer } from "ws";
import { z } from "zod";
import {
	deleteAgent,
	discoverAgents,
	getAgentByName,
	saveAgent,
	THINKING_LEVELS,
} from "./agents.js";
import {
	type AutomationStore,
	createAutomationScheduler,
	createAutomationStore,
} from "./automations.js";
import { initializeRidgeDb } from "./db/index.js";
import {
	ensureWithinRoot,
	normalizeFsPath,
	normalizeOptionalFsPath,
} from "./file-manager.js";
import { createGitService } from "./git-service.js";
import { createIsoGitService } from "./iso-git-service.js";
import { createNotesRouter } from "./notes.js";
import { createProjectContextResolver } from "./project-context.js";
import { createCoreRouter } from "./routes/core.js";
import { createGitRouter } from "./routes/git.js";
import { createSystemRouter } from "./routes/system.js";
import { createWorkspaceDataRouter } from "./routes/workspace-data.js";
import { createWorkspaceTasksRouter } from "./routes/workspace-tasks.js";
import { createWorktreeRouter } from "./routes/worktrees.js";
import {
	getIndexedSessionTree,
	invalidateManagedProjectScopes,
	listIndexedSessionContexts,
	listIndexedSessions,
	refreshSessionCatalog,
	upsertIndexedSessionRecord,
} from "./session-indexer.js";
import { createSessionMetadataStore } from "./session-metadata.js";
import {
	addFavorite,
	addProject,
	getFavorites,
	getProjects,
	getSettings,
	removeFavorite,
	removeProject,
	setSettings,
} from "./storage/index.js";
import type {
	FileSaveResponse,
	FilesystemBrowseResult,
	HttpError,
	SessionRecord,
} from "./types/index.js";
import { atomicWriteFile } from "./utils/fs.js";
import { toPosixPath } from "./utils/paths.js";
import { normalizeString } from "./utils/strings.js";
import {
	getWorkspaceChatConfig,
	resolveDefaultWorkspaceDir,
} from "./workspace-chat.js";
import { createWorktreeService } from "./worktree-service.js";

const defaultWorkspaceDir = resolveDefaultWorkspaceDir({
	explicitWorkspaceDir: process.env.PI_WORKSPACE_DIR,
	platform: process.platform,
	homeDir: os.homedir(),
});
const port = Number.parseInt(process.env.PORT || "3000", 10);
const workspaceChatConfig = getWorkspaceChatConfig(defaultWorkspaceDir);

export const app = express();
app.use(cors());
app.use(express.json({ limit: "6mb" }));
const upload = multer({
	storage: multer.memoryStorage(),
	limits: {
		files: 20,
		fileSize: 50 * 1024 * 1024,
	},
});

const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);
const activeSessions = new Map<string, SessionRecord>();
const openingSessionRecords = new Map<string, Promise<SessionRecord>>();
const projectContextResolver =
	createProjectContextResolver(defaultWorkspaceDir);
const sessionMetadataStore = createSessionMetadataStore();
const gitService = createGitService();
const isoGitService = createIsoGitService();
const worktreeService = createWorktreeService(gitService);
let automationStore: AutomationStore | null = null;
let automationScheduler: ReturnType<typeof createAutomationScheduler> | null =
	null;
const refreshSessionCatalogIndex = async () =>
	refreshSessionCatalog({
		projectContextResolver,
		activeSessions,
		workspaceChatConfig,
	});

// ===== Zod Schemas =====
const createSessionSchema = z.object({
	cwd: z.string().optional(),
	title: z.string().optional(),
	model: z.string().optional(),
	thinkingLevel: z.enum(THINKING_LEVELS).nullable().optional(),
	parentSessionId: z.string().optional(),
	agent: z.string().nullable().optional(),
});

const messageSchema = z.object({
	prompt: z.string().min(1),
	model: z.string().optional(),
	thinkingLevel: z.enum(THINKING_LEVELS).optional(),
	agent: z.string().nullable().optional(),
});

const automationScheduleSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("daily"),
		time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
	}),
	z.object({
		type: z.literal("weekly"),
		time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
		weekdays: z.array(z.number().int().min(0).max(6)).min(1),
	}),
	z.object({
		type: z.literal("interval"),
		everyMinutes: z.number().int().min(1),
	}),
]);

const automationRuleInputSchema = z.object({
	name: z.string().min(1).max(80),
	enabled: z.boolean(),
	cwd: z.string().min(1),
	agent: z.string().optional(),
	model: z.string().optional(),
	thinkingLevel: z.enum(THINKING_LEVELS).optional(),
	schedule: automationScheduleSchema,
	prompt: z.string().min(1),
});

const automationRulePatchSchema = automationRuleInputSchema
	.partial()
	.refine((payload) => Object.keys(payload).length > 0, {
		message: "至少要更新一个字段",
	});

const automationToggleSchema = z.object({
	enabled: z.boolean(),
});

const updateSessionSchema = z
	.object({
		title: z.string().min(1).max(200).optional(),
		model: z.string().nullable().optional(),
		thinkingLevel: z.enum(THINKING_LEVELS).nullable().optional(),
		agent: z.string().nullable().optional(),
	})
	.refine(
		(payload) =>
			payload.title !== undefined ||
			payload.model !== undefined ||
			payload.thinkingLevel !== undefined ||
			payload.agent !== undefined,
		{
			message: "至少要更新 title、model、thinkingLevel 或 agent 之一",
		},
	);

const resourceCatalogQuerySchema = z.object({
	cwd: z.string().optional(),
	sessionId: z.string().optional(),
});

const sessionSnapshotQuerySchema = z.object({
	rounds: z.coerce.number().int().positive().optional(),
});

const agentUpsertSchema = z
	.object({
		name: z.string().optional(),
		description: z.string().optional(),
		display_name: z.string().nullable().optional(),
		mode: z.enum(["primary", "task", "all"]).optional(),
		model: z.string().nullable().optional(),
		thinking: z
			.enum(["off", "minimal", "low", "medium", "high", "xhigh"])
			.nullable()
			.optional(),
		max_turns: z.number().int().min(1).nullable().optional(),
		grace_turns: z.number().int().min(0).nullable().optional(),
		skills: z
			.union([z.string(), z.array(z.string())])
			.nullable()
			.optional(),
		inherit_context: z.boolean().nullable().optional(),
		run_in_background: z.boolean().nullable().optional(),
		enabled: z.boolean().optional(),
		permission: z.record(z.string(), z.any()).optional(),
		prompt: z.string().optional(),
		scope: z.enum(["user", "project"]).optional(),
	})
	.strict();

const agentScopeQuerySchema = z.object({
	scope: z.enum(["user", "project"]).optional(),
	cwd: z.string().optional(),
});

const archiveSessionSchema = z.object({
	archived: z.boolean(),
});

const terminalCreateSchema = z.object({
	cwd: z.string().optional(),
	title: z.string().optional(),
	cols: z.number().int().min(40).max(300).optional(),
	rows: z.number().int().min(12).max(120).optional(),
});

const terminalUpdateSchema = z.object({
	title: z.string().min(1).max(120),
});

const terminalRestartSchema = z.object({
	cwd: z.string().min(1),
	cols: z.number().int().min(40).max(300).optional(),
	rows: z.number().int().min(12).max(120).optional(),
});

const askAnswerSchema = z.object({
	questionId: z.string().min(1),
	values: z.array(z.string().min(1)).min(1),
});

const askActionSchema = z.discriminatedUnion("action", [
	z.object({
		action: z.literal("submit"),
		answers: z.array(askAnswerSchema).min(1),
	}),
	z.object({
		action: z.literal("dismiss"),
	}),
]);

const permissionActionSchema = z.object({
	action: z.enum(["once", "always", "reject"]),
});

const fileTreeQuerySchema = z.object({
	root: z.string().optional(),
	path: z.string().optional(),
});

const fileContentQuerySchema = z.object({
	root: z.string().optional(),
	path: z.string().optional(),
});

const fileContentWindowQuerySchema = z.object({
	root: z.string().optional(),
	path: z.string().optional(),
	startLine: z.coerce.number().int().min(1).default(1),
	lineCount: z.coerce.number().int().min(1).max(1000).default(1000),
});

const fileSaveSchema = z.object({
	root: z.string().min(1),
	path: z.string().min(1),
	content: z.string().max(5 * 1024 * 1024),
});

const fileEntryCreateSchema = z.object({
	root: z.string().min(1),
	directory: z.string().min(1),
	name: z.string().min(1),
	kind: z.enum(["file", "directory"]),
});

const fileEntryMoveSchema = z
	.object({
		root: z.string().min(1),
		path: z.string().min(1),
		targetDirectory: z.string().min(1).optional(),
		name: z.string().min(1).optional(),
	})
	.refine(
		(value) => value.targetDirectory !== undefined || value.name !== undefined,
		"targetDirectory or name is required",
	);

const filesystemBrowseQuerySchema = z.object({
	path: z.string().optional(),
});

const fileOpenSchema = z.object({
	root: z.string().min(1),
	path: z.string().min(1),
});

const createProjectSchema = z.object({
	path: z.string().min(1),
});

// ===== Constants =====
const DEFAULT_SESSION_ROUND_WINDOW = 3;
const markdownExtensions = new Set([".md", ".markdown"]);

import {
	buildFilePreviewPayload,
	buildFilePreviewWindowPayload,
	ensureFileForPreview,
	imageMimeTypesByExtension,
	openWithDefaultApp,
	resolveDiscoveryCwd,
	toFileSize,
} from "./file-preview.js";
// ===== Session Modules =====
import {
	applySessionAgentSelection,
	cancelPendingPermissions,
	createAgentConfigResponse,
	createAgentSummary,
	createSessionRecord,
	destroySessionRecord,
	emit,
	ensureManagedProjectScope,
	initSessionContext,
	listProviders,
	normalizeAskAnswers,
	persistSessionRecordMetadata,
	serializeProject,
	settlePendingAsk,
	settlePendingPermission,
	updateStatus,
} from "./session-context.js";
import {
	buildResourceCatalog,
	createTransientCatalogSession,
	dispatchAutomationRule,
	ensureSessionRecord,
	getAutomationStore,
	getFileManager,
	getIndexedSessionLookupOrThrow,
	getStoredSessionMessagesPayload,
	getStoredSessionRuntimePayload,
	initSessionPayload,
	terminalManager,
	toSessionMessagesPayload,
	toSessionRuntimePayload,
	toSessionSnapshot,
} from "./session-payload.js";

// Initialize session modules
initSessionContext({
	modelRegistry,
	authStorage,
	sessionMetadataStore,
	activeSessions,
	openingSessionRecords,
	defaultWorkspaceDir,
	workspaceChatConfig,
	projectContextResolver,
	toSessionMessagesPayload,
});
initSessionPayload({
	defaultWorkspaceDir,
	workspaceChatConfig,
	authStorage,
	modelRegistry,
	activeSessions,
	openingSessionRecords,
	projectContextResolver,
	DEFAULT_SESSION_ROUND_WINDOW,
	automationStore,
});
// ===== Routes =====

// ===== Notes API =====
const notesRouter = createNotesRouter(workspaceChatConfig);

app.get("/api/notes", notesRouter.listNotes);
app.get("/api/notes/content", notesRouter.getNoteContent);
app.put("/api/notes/content", notesRouter.saveNoteContent);
app.post("/api/notes", notesRouter.createNote);
app.post("/api/notes/folder", notesRouter.createNoteFolder);
app.patch("/api/notes/rename", notesRouter.renameNote);
app.delete("/api/notes", notesRouter.deleteNote);

// ===== Generic File Create (non-markdown) =====
app.post(
	"/api/files/create",
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const { path: relPath, content } = req.body ?? {};
			if (!relPath || typeof relPath !== "string") {
				const error = new Error("path is required") as HttpError;
				error.statusCode = 400;
				throw error;
			}
			const trimmed = relPath.trim();
			const targetPath = path.resolve(defaultWorkspaceDir, trimmed);
			const rootReal = await fs.realpath(
				await fs.access(defaultWorkspaceDir).then(
					() => defaultWorkspaceDir,
					() => defaultWorkspaceDir,
				),
			);
			const parentDir = path.dirname(targetPath);
			await fs.mkdir(parentDir, { recursive: true });
			const parentReal = await fs.realpath(parentDir);
			if (!parentReal.startsWith(rootReal)) {
				const error = new Error("Path escapes workspace") as HttpError;
				error.statusCode = 403;
				throw error;
			}
			await fs.writeFile(targetPath, content ?? "", "utf-8");
			const stats = await fs.stat(targetPath);
			res.status(201).json({
				name: path.basename(targetPath),
				path: targetPath.replace(/\\/g, "/"),
				relativePath: path
					.relative(defaultWorkspaceDir, targetPath)
					.replace(/\\/g, "/"),
				size: stats.size,
				updatedAt: stats.mtimeMs,
			});
		} catch (error) {
			next(error);
		}
	},
);

// ===== System & Terminals =====
const systemRouter = createSystemRouter({
	port,
	defaultWorkspaceDir,
	workspaceChatConfig,
	terminalManager,
	terminalCreateSchema,
	terminalUpdateSchema,
	terminalRestartSchema,
});
app.use(systemRouter);
// ===== Core Routes =====
const coreRouter = createCoreRouter({
	defaultWorkspaceDir,
	resolveDiscoveryCwd,
	listProviders,
	discoverAgents,
	createAgentSummary,
	createAgentConfigResponse,
	getAgentByName,
	saveAgent,
	deleteAgent,
	getAutomationStore,
	automationScheduler,
	dispatchAutomationRule,
	ensureManagedProjectScope,
	ensureSessionRecord,
	buildResourceCatalog,
	createTransientCatalogSession,
	fileManager: getFileManager(),
	normalizeString,
	toPosixPath,
	agentScopeQuerySchema,
	agentUpsertSchema,
	automationRuleInputSchema,
	automationRulePatchSchema,
	automationToggleSchema,
	resourceCatalogQuerySchema,
	fileTreeQuerySchema,
});
app.use(coreRouter);
const workspaceTasksRouter = createWorkspaceTasksRouter(defaultWorkspaceDir);
app.use("/api/workspace/tasks", workspaceTasksRouter);
// ===== Workspace Data Routes =====
// ===== Workspace Data Routes =====
const workspaceDataRouter = createWorkspaceDataRouter({
	defaultWorkspaceDir,
	fileManager: getFileManager(),
	openWithDefaultApp,
	upload,
	fileEntryCreateSchema,
	fileEntryMoveSchema,
	fileContentQuerySchema,
	fileOpenSchema,
});
app.use(workspaceDataRouter);
app.get(
	"/api/files/content",
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const query = fileContentQuerySchema.parse(req.query ?? {});
			const { rootPath, targetPath, stats } = await ensureFileForPreview(query);
			const payload = await buildFilePreviewPayload(
				rootPath,
				targetPath,
				stats,
			);
			res.json(payload);
		} catch (error) {
			next(error);
		}
	},
);

app.get(
	"/api/files/content-window",
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const query = fileContentWindowQuerySchema.parse(req.query ?? {});
			const { rootPath, targetPath, stats } = await ensureFileForPreview(query);
			const payload = await buildFilePreviewWindowPayload(
				rootPath,
				targetPath,
				stats,
				query.startLine,
				query.lineCount,
			);
			res.json(payload);
		} catch (error) {
			next(error);
		}
	},
);

app.get(
	"/api/files/blob",
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const query = fileContentQuerySchema.parse(req.query ?? {});
			const { targetPath } = await ensureFileForPreview(query);
			const extension = path.extname(targetPath).toLowerCase();
			const mimeType = imageMimeTypesByExtension.get(extension);

			if (!mimeType) {
				const error = new Error(
					"Only image previews are available through this endpoint",
				) as HttpError;
				error.statusCode = 400;
				throw error;
			}

			res.type(mimeType);
			res.sendFile(targetPath);
		} catch (error) {
			next(error);
		}
	},
);

app.put(
	"/api/files/content",
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const payload = fileSaveSchema.parse(req.body ?? {});
			const { rootPath, targetPath, stats } =
				await ensureFileForPreview(payload);
			const extension = path.extname(targetPath).toLowerCase();

			if (!markdownExtensions.has(extension)) {
				const error = new Error(
					"Only Markdown files can be edited",
				) as HttpError;
				error.statusCode = 400;
				throw error;
			}

			await atomicWriteFile(targetPath, payload.content);
			const nextStats = await fs.stat(targetPath);

			const response: FileSaveResponse = {
				root: toPosixPath(rootPath),
				path: toPosixPath(targetPath),
				size: toFileSize(nextStats.size || stats.size),
				savedAt: Date.now(),
			};

			res.json(response);
		} catch (error) {
			next(error);
		}
	},
);

app.get(
	"/api/filesystem/browse",
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const query = filesystemBrowseQuerySchema.parse(req.query ?? {});
			const homeDir = path.resolve(os.homedir());
			const targetPath = normalizeFsPath(query.path || homeDir);

			ensureWithinRoot(targetPath, homeDir);

			const stats = await fs.stat(targetPath);
			if (!stats.isDirectory()) {
				const error = new Error(
					"Requested path is not a directory",
				) as HttpError;
				error.statusCode = 400;
				throw error;
			}

			const entries = (
				await getFileManager().listDirectoryEntries(targetPath, homeDir)
			).filter(
				(entry) => entry.kind === "directory" && !entry.name.startsWith("."),
			);

			res.json({
				homeDir: toPosixPath(homeDir),
				path: toPosixPath(targetPath),
				parent:
					targetPath === homeDir ? null : toPosixPath(path.dirname(targetPath)),
				entries,
			} as FilesystemBrowseResult);
		} catch (error) {
			next(error);
		}
	},
);

app.get(
	"/api/projects",
	async (_req: Request, res: Response, next: NextFunction) => {
		try {
			const state = await getProjects();
			res.json({
				projects: state.projects
					.map(serializeProject)
					.sort(
						(left, right) =>
							(right.addedAt as number) - (left.addedAt as number),
					),
			});
		} catch (error) {
			next(error);
		}
	},
);

app.get(
	"/api/session-contexts",
	async (_req: Request, res: Response, next: NextFunction) => {
		try {
			res.json(await listIndexedSessionContexts());
		} catch (error) {
			next(error);
		}
	},
);

app.post(
	"/api/projects",
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const payload = createProjectSchema.parse(req.body ?? {});
			const homeDir = path.resolve(os.homedir());
			const projectPath = normalizeFsPath(payload.path);

			ensureWithinRoot(projectPath, homeDir);

			const stats = await fs.stat(projectPath);
			if (!stats.isDirectory()) {
				const error = new Error(
					"Project path must be a directory",
				) as HttpError;
				error.statusCode = 400;
				throw error;
			}

			const isGit = await gitService.isGitRepository(projectPath);
			const project = await addProject(projectPath, isGit);
			projectContextResolver.invalidateContext();
			invalidateManagedProjectScopes();
			await refreshSessionCatalogIndex();
			res.json(serializeProject(project));
		} catch (error) {
			next(error);
		}
	},
);

app.delete(
	"/api/projects/:id",
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const projectId = String(req.params.id);
			await removeProject(projectId);
			projectContextResolver.invalidateContext();
			invalidateManagedProjectScopes();
			await refreshSessionCatalogIndex();
			res.json({ ok: true });
		} catch (error) {
			next(error);
		}
	},
);

app.get(
	"/api/sessions",
	async (_req: Request, res: Response, next: NextFunction) => {
		try {
			const sessions = await listIndexedSessions(activeSessions);

			const summaries = sessions.map((session) => ({
				id: session.id,
				title: session.title,
				cwd: String(session.cwd || ""),
				status: session.status,
				createdAt: session.createdAt,
				updatedAt: session.updatedAt,
				archived: session.archived,
				sessionFile: session.sessionFile,
				parentSessionId: session.parentSessionId,
				contextId: session.contextId,
			}));
			res.json(summaries);
		} catch (error) {
			next(error);
		}
	},
);

app.get(
	"/api/sessions/:sessionId/messages",
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const query = sessionSnapshotQuerySchema.parse(req.query ?? {});
			const sessionId = String(req.params.sessionId);
			const record = activeSessions.get(sessionId);
			if (record) {
				res.json(toSessionMessagesPayload(record, query));
				return;
			}

			res.json(await getStoredSessionMessagesPayload(sessionId, query));
		} catch (error) {
			next(error);
		}
	},
);

app.get(
	"/api/sessions/:sessionId/runtime",
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const sessionId = String(req.params.sessionId);
			const record = activeSessions.get(sessionId);
			if (record) {
				res.json(toSessionRuntimePayload(record));
				return;
			}

			res.json(await getStoredSessionRuntimePayload(sessionId));
		} catch (error) {
			next(error);
		}
	},
);

app.get(
	"/api/sessions/:sessionId/hydrate",
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const query = sessionSnapshotQuerySchema.parse(req.query ?? {});
			const sessionId = String(req.params.sessionId);
			const record = activeSessions.get(sessionId);
			if (record) {
				res.json({
					...toSessionMessagesPayload(record, query),
					...toSessionRuntimePayload(record),
				});
				return;
			}

			const [messagesPayload, runtimePayload] = await Promise.all([
				getStoredSessionMessagesPayload(sessionId, query),
				getStoredSessionRuntimePayload(sessionId),
			]);
			res.json({ ...messagesPayload, ...runtimePayload });
		} catch (error) {
			next(error);
		}
	},
);

app.get(
	"/api/sessions/:sessionId/stream",
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const query = sessionSnapshotQuerySchema.parse(req.query ?? {});
			const record = await ensureSessionRecord(String(req.params.sessionId));

			res.setHeader("Content-Type", "text/event-stream");
			res.setHeader("Cache-Control", "no-cache");
			res.setHeader("Connection", "keep-alive");
			res.flushHeaders();

			record.clients.add(res);
			const messagesPayload = toSessionMessagesPayload(record, query);
			emit(record, {
				type: "snapshot",
				sessionId: record.id,
				status: record.status,
				messages: messagesPayload.messages,
				historyMeta: messagesPayload.historyMeta,
				interactiveRequests: messagesPayload.interactiveRequests,
				permissionRequests: messagesPayload.permissionRequests,
			});

			req.on("close", () => {
				record.clients.delete(res);
			});
		} catch (error) {
			next(error);
		}
	},
);

app.post(
	"/api/sessions",
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const payload = createSessionSchema.parse(req.body ?? {});
			const parentSession = payload.parentSessionId
				? await getIndexedSessionLookupOrThrow(payload.parentSessionId)
				: null;
			const sessionCwd =
				normalizeOptionalFsPath(payload.cwd) || parentSession?.cwd || "";
			if (!sessionCwd) {
				const error = new Error("Session project is required") as HttpError;
				error.statusCode = 400;
				throw error;
			}

			await ensureManagedProjectScope(sessionCwd);
			const record = await createSessionRecord({
				cwd: sessionCwd,
				title: payload.title,
				model: payload.model,
				parentSessionPath: parentSession?.sessionFile,
			});
			await applySessionAgentSelection(record, {
				agentName: payload.agent || undefined,
				model: payload.model,
				thinkingLevel: payload.thinkingLevel,
			});
			await persistSessionRecordMetadata(record);
			await upsertIndexedSessionRecord(record, {
				projectContextResolver,
				workspaceChatConfig,
			});
			res.status(201).json(await toSessionSnapshot(record, {}));
		} catch (error) {
			next(error);
		}
	},
);

app.patch(
	"/api/sessions/:sessionId",
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const payload = updateSessionSchema.parse(req.body ?? {});
			const record = await ensureSessionRecord(String(req.params.sessionId));

			if (payload.title !== undefined) {
				record.session.setSessionName(payload.title.trim());
			}

			if (
				payload.agent !== undefined ||
				payload.model !== undefined ||
				payload.thinkingLevel !== undefined
			) {
				await applySessionAgentSelection(record, {
					agentName:
						payload.agent !== undefined
							? payload.agent || undefined
							: record.selectedAgentName,
					model: payload.model || undefined,
					thinkingLevel: payload.thinkingLevel,
				});
			}

			record.updatedAt = Date.now();
			await persistSessionRecordMetadata(record);
			await upsertIndexedSessionRecord(record, {
				projectContextResolver,
				workspaceChatConfig,
			});

			res.json(await toSessionSnapshot(record, {}));
		} catch (error) {
			next(error);
		}
	},
);

app.post(
	"/api/sessions/:sessionId/archive",
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const payload = archiveSessionSchema.parse(req.body ?? {});
			const sessionIds = (
				await getIndexedSessionTree(String(req.params.sessionId))
			).map((item) => item.id);

			if (sessionIds.length === 0) {
				const error = new Error("Session not found") as HttpError;
				error.statusCode = 404;
				throw error;
			}

			await sessionMetadataStore.setArchived(sessionIds, payload.archived);

			res.json({ ok: true, sessionIds });
		} catch (error) {
			next(error);
		}
	},
);

app.delete(
	"/api/sessions/:sessionId",
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const sessionTree = await getIndexedSessionTree(
				String(req.params.sessionId),
			);
			if (sessionTree.length === 0) {
				const error = new Error("Session not found") as HttpError;
				error.statusCode = 404;
				throw error;
			}

			const sessionIds = sessionTree.map((item) => item.id);

			for (const item of sessionTree) {
				const sessionId = item.id;

				const activeRecord = activeSessions.get(sessionId);
				if (activeRecord) {
					destroySessionRecord(activeRecord);
				}

				await fs.rm(item.sessionFile, { force: true });
			}

			await sessionMetadataStore.removeSessions(sessionIds);

			res.json({ ok: true, sessionIds });
		} catch (error) {
			next(error);
		}
	},
);

app.post(
	"/api/sessions/:sessionId/messages",
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const payload = messageSchema.parse(req.body ?? {});
			const record = await ensureSessionRecord(String(req.params.sessionId));

			if (record.turnBudget.exhausted) {
				const error = new Error(
					"当前 agent 的最大轮次已耗尽，请重新选择 agent 或新建会话",
				) as HttpError;
				error.statusCode = 400;
				throw error;
			}

			await applySessionAgentSelection(record, {
				agentName:
					payload.agent !== undefined
						? payload.agent || undefined
						: record.selectedAgentName,
				model: payload.model || undefined,
				thinkingLevel: payload.thinkingLevel,
			});

			updateStatus(record, "streaming");

			void record.session
				.prompt(payload.prompt, { source: "interactive" })
				.catch((error: unknown) => {
					record.status = "error";
					emit(record, {
						type: "error",
						error: error instanceof Error ? error.message : String(error),
					});
				});

			res.json({ ok: true });
		} catch (error) {
			next(error);
		}
	},
);

app.post(
	"/api/sessions/:sessionId/asks/:askId/respond",
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const payload = askActionSchema.parse(req.body ?? {});
			const record = await ensureSessionRecord(String(req.params.sessionId));
			const askId = String(req.params.askId);

			if (payload.action === "dismiss") {
				await settlePendingAsk(record, askId, [], true);
				res.json({ ok: true });
				return;
			}

			const answers = normalizeAskAnswers(record, askId, payload.answers);
			await settlePendingAsk(record, askId, answers, false);
			res.json({ ok: true });
		} catch (error) {
			next(error);
		}
	},
);

app.post(
	"/api/sessions/:sessionId/permissions/:requestId/respond",
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const payload = permissionActionSchema.parse(req.body ?? {});
			const record = await ensureSessionRecord(String(req.params.sessionId));
			const requestId = String(req.params.requestId);

			await settlePendingPermission(record, requestId, payload.action);
			res.json({ ok: true });
		} catch (error) {
			next(error);
		}
	},
);

app.post(
	"/api/sessions/:sessionId/abort",
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const record = await ensureSessionRecord(String(req.params.sessionId));
			await record.session.abort();
			cancelPendingPermissions(record, "Session aborted");
			updateStatus(record, "idle");
			res.json({ ok: true });
		} catch (error) {
			next(error);
		}
	},
);

app.get(
	"/api/storage/settings",
	async (_req: Request, res: Response, next: NextFunction) => {
		try {
			const settings = await getSettings();
			res.json(settings);
		} catch (error) {
			next(error);
		}
	},
);

app.post(
	"/api/storage/settings",
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const settings = await setSettings(req.body ?? {});
			res.json(settings);
		} catch (error) {
			next(error);
		}
	},
);

app.get(
	"/api/storage/favorites",
	async (_req: Request, res: Response, next: NextFunction) => {
		try {
			const favorites = await getFavorites();
			res.json(favorites);
		} catch (error) {
			next(error);
		}
	},
);

app.post(
	"/api/storage/favorites",
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const { id, name, type, data } = req.body ?? {};
			if (!id || !name || !type) {
				const error = new Error(
					"Missing required fields: id, name, type",
				) as HttpError;
				error.statusCode = 400;
				throw error;
			}
			const favorites = await addFavorite({ id, name, type, data });
			res.json(favorites);
		} catch (error) {
			next(error);
		}
	},
);

app.delete(
	"/api/storage/favorites/:id",
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const favoriteId = String(req.params.id);
			const favorites = await removeFavorite(favoriteId);
			res.json(favorites);
		} catch (error) {
			next(error);
		}
	},
);

// ===== Worktree API =====
const worktreeRouter = createWorktreeRouter({
	defaultWorkspaceDir,
	gitService,
	worktreeService,
	projectContextResolver,
	invalidateManagedProjectScopes,
});
app.use("/api/projects", worktreeRouter);
// ===== Git API =====
const gitRouter = createGitRouter({
	defaultWorkspaceDir,
	gitService,
	isoGitService,
});
app.use("/api/git", gitRouter);
// ===== Error Handler =====
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
	if (error instanceof z.ZodError) {
		res.status(400).json({ error: error.issues });
		return;
	}
	const statusCode = Number.isInteger((error as HttpError)?.statusCode)
		? (error as HttpError).statusCode
		: 500;
	const message =
		error instanceof Error ? error.message : "Unknown server error";
	res.status(statusCode as number).send(message);
});

export async function startServer() {
	const httpServer = createServer(app);
	const terminalWebSocketServer = new WebSocketServer({ noServer: true });

	httpServer.on("upgrade", (request, socket, head) => {
		const host = request.headers.host || `127.0.0.1:${port}`;
		const url = new URL(request.url || "/", `http://${host}`);
		const match = url.pathname.match(/^\/api\/terminals\/([^/]+)\/stream$/);

		if (!match) {
			socket.destroy();
			return;
		}

		const terminalId = decodeURIComponent(match[1]);
		if (!terminalManager.hasTerminal(terminalId)) {
			socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
			socket.destroy();
			return;
		}

		terminalWebSocketServer.handleUpgrade(request, socket, head, (ws) => {
			terminalManager.attachSocket(terminalId, ws);
			terminalWebSocketServer.emit("connection", ws, request);
		});
	});

	const db = await initializeRidgeDb(defaultWorkspaceDir);
	automationStore = createAutomationStore(db);
	automationScheduler = createAutomationScheduler({
		store: automationStore,
		dispatchRule: async (rule) => {
			await dispatchAutomationRule(rule);
			await refreshSessionCatalogIndex();
		},
	});
	automationScheduler.start();
	await refreshSessionCatalogIndex();

	return new Promise<void>((resolve) => {
		httpServer.listen(port, () => {
			console.warn(`Pi server listening on http://127.0.0.1:${port}`);
			resolve();
		});
	});
}

const isMainModule =
	process.argv[1] &&
	realpathSync(fileURLToPath(import.meta.url)) ===
		realpathSync(path.resolve(process.argv[1]));

if (isMainModule) {
	startServer().catch((error) => {
		console.error("Failed to initialize ridge.db", error);
		process.exit(1);
	});
}
