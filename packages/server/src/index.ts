import { realpathSync } from "node:fs";
import fs from "node:fs/promises";
import { createServer, type Server } from "node:http";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
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
import { createAuthRuntime } from "./auth.js";
import {
	ensureStoredWorkspaceDir,
	getRidgeDb,
	getStoredWorkspaceDir,
	initializeRidgeDb,
} from "./db/index.js";
import {
	assertNotRidgeSystemPath,
	ensureResolvedPathWithinRoot,
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
import { createProjectRouter } from "./routes/projects.js";
import { createDeviceRouter, createServerDeviceRouter } from "./routes/devices.js";
import { createDesktopForwardRouter } from "./routes/desktop-forward.js";
import { createBundleRouter } from "./routes/bundle.js";
import {
	createWorkspaceMilestonesRouter,
	createWorkspaceTasksRouter,
} from "./routes/workspace-tasks.js";
import { createWorktreeRouter } from "./routes/worktrees.js";
import { createWorkspaceFilesRouter } from "./routes/workspace-files.js";
import { createWorkspaceSpaceRouter } from "./routes/workspace-space.js";
import { createWorkspaceSearchRouter } from "./routes/workspace-search.js";
import { createWorkspaceGraphRouter } from "./routes/workspace-graph.js";
import { createWorkspaceBackupRouter } from "./workspace-backup.js";
import { createWorkspaceMcpRouter } from "./routes/workspace-mcp.js";
import {
	createDeviceRegistrationRouter,
	createRuntimeBundleRouter,
} from "./routes/runtime-bundle.js";
import { createNotificationsRouter } from "./routes/notifications.js";
import { createSessionAttachmentsRouter, validateAttachmentIds, buildAttachmentContext } from "./session-attachments.js";
import { createFleetingRouter } from "./routes/fleeting.js";
import {
	createBackgroundJobQueue,
} from "./background-jobs.js";
import {
	createFleetingAnalysisRunner,
	createFleetingAnalysisWorker,
} from "./fleeting-analysis.js";
import {
	createTaskReviewScheduler,
	createTaskReviewWorkers,
} from "./task-review.js";
import {
	createGraphMaintenanceRunner,
	createPiGraphExtractor,
	type GraphMaintenanceRunner,
} from "./graph-agent.js";
import {
	createPiWikiMaintainer,
	createWikiMaintenanceRunner,
} from "./wiki-agent.js";
import { createConversionWebhookRouter } from "./routes/conversion-webhook.js";
import {
	ConversionServiceClient,
	loadConversionServiceConfigFromDb,
} from "./conversion-service-client.js";
import { createFileConversionWorker } from "./file-conversion-worker.js";
import { createRagWorker } from "./rag-worker.js";
import { markRagTargetPending } from "./rag-indexer.js";
import {
	applyExplicitMemoryCommand,
	createWorkspaceMemoryWorkers,
	enqueueSessionSummaryJob,
} from "./workspace-memory.js";
import {
	getIndexedSessionContext,
	getIndexedSessionTree,
	invalidateManagedProjectScopes,
	listIndexedSessions,
	refreshSessionCatalog,
	upsertIndexedSessionRecord,
} from "./session-indexer.js";
import { createSessionMetadataStore } from "./session-metadata.js";
import {
	addFavorite,
	getFavorites,
	getProjects,
	getSettings,
	removeFavorite,
	setSettings,
} from "./storage/index.js";
import type {
	FileSaveResponse,
	FilesystemBrowseResult,
	HttpError,
	SessionRecord,
} from "./types/index.js";
import { atomicWriteFile } from "./utils/fs.js";
import { getRidgeDbPath, toPosixPath } from "./utils/paths.js";
import { normalizeString } from "./utils/strings.js";
import {
	ensureWorkspaceTemplate,
	getWorkspaceChatConfig,
	resolveDefaultWorkspaceDir,
} from "./workspace-chat.js";
import { createWorktreeService } from "./worktree-service.js";
import { ensureServerDevice } from "./devices.js";
import {
	forwardRunRequestToDesktop,
	isDesktopOnline,
} from "./desktop-bridge.js";

const fallbackWorkspaceDir = resolveDefaultWorkspaceDir({
	homeDir: os.homedir(),
});
await initializeRidgeDb(fallbackWorkspaceDir);
const defaultWorkspaceDir = resolveDefaultWorkspaceDir({
	homeDir: os.homedir(),
	storedWorkspaceDir: await getStoredWorkspaceDir(),
});
await ensureStoredWorkspaceDir(defaultWorkspaceDir);
await ensureServerDevice();
const port = Number.parseInt(process.env.PORT || "3000", 10);
const workspaceChatConfig = getWorkspaceChatConfig(defaultWorkspaceDir);

function resolveAdminPassword(): string {
	const envPassword = process.env.RIDGE_ADMIN_PASSWORD;
	if (envPassword) {
		return envPassword;
	}
	if (process.env.NODE_ENV === "production") {
		console.error("RIDGE_ADMIN_PASSWORD environment variable is required in production");
		process.exit(1);
	}
	return "ridge-admin";
}

export const authRuntime = createAuthRuntime({ adminPassword: resolveAdminPassword() });

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

let automationStore: AutomationStore | undefined;
let automationScheduler: ReturnType<typeof createAutomationScheduler> | undefined;
let jobQueue: ReturnType<typeof createBackgroundJobQueue> | undefined;
let isConversionEnabled: (() => boolean) | undefined;
let graphRunner: GraphMaintenanceRunner | undefined;
const fleetingRunnerRef: {
	value?: ReturnType<typeof createFleetingAnalysisRunner>;
} = {};

/**
 * Test-only helper: override the conversion enabled flag.
 * Do not use in production code.
 */
export function setConversionEnabledForTesting(enabled: boolean): void {
	if (!process.env.VITEST) {
		throw new Error("setConversionEnabledForTesting is only allowed in test environment");
	}
	isConversionEnabled = () => enabled;
}

/**
 * Test-only helper: inject a jobQueue into the module-level singleton
 * so that routes using deps.getJobQueue() can observe real enqueues.
 * Do not use in production code.
 */
export function setJobQueueForTesting(
	q: ReturnType<typeof createBackgroundJobQueue> | undefined,
): void {
	if (!process.env.VITEST) {
		throw new Error("setJobQueueForTesting is only allowed in test environment");
	}
	jobQueue = q;
}

/**
 * Test-only helper: expose the module-level jobQueue singleton.
 * Do not use in production code.
 */
export function getJobQueueForTesting(): ReturnType<typeof createBackgroundJobQueue> | undefined {
	if (!process.env.VITEST) {
		throw new Error("getJobQueueForTesting is only allowed in test environment");
	}
	return jobQueue;
}

export function setGraphRunnerForTesting(
	runner: GraphMaintenanceRunner | undefined,
): void {
	if (!process.env.VITEST) {
		throw new Error("setGraphRunnerForTesting is only allowed in test environment");
	}
	graphRunner = runner;
}

/**
 * Test-only helper: reset all module-level singleton state so that each
 * test file starts with a clean slate when Vitest reuses fork workers.
 * Do not use in production code.
 */
export function resetModuleStateForTests(): void {
	if (!process.env.VITEST) {
		throw new Error("resetModuleStateForTests is only allowed in test environment");
	}
	authRuntime.resetForTests();
	activeSessions.clear();
	openingSessionRecords.clear();
	projectContextResolver.invalidateContext();
	setConversionEnabledForTesting(false);
	setJobQueueForTesting(undefined);
	graphRunner = undefined;
}

export const getAutomationStore = (): AutomationStore => {
	if (!automationStore) {
		const error = new Error("自动化服务尚未初始化") as HttpError;
		error.statusCode = 503;
		throw error;
	}
	return automationStore;
};

export const getAutomationScheduler = (): ReturnType<typeof createAutomationScheduler> | null => {
	return automationScheduler ?? null;
};
const refreshSessionCatalogIndex = async () =>
	refreshSessionCatalog({
		projectContextResolver,
		activeSessions,
		workspaceChatConfig,
	});

const findExistingSessionSummaryJob = (sessionId: string) =>
	jobQueue
		?.list()
		.find(
			(job) =>
				job.type === "summary.daily" &&
				job.relatedType === "session" &&
				job.relatedId === sessionId &&
				job.status !== "failed" &&
				job.status !== "cancelled",
		) ?? null;

const enqueueEndedSessionSummary = async (sessionId: string) => {
	if (!jobQueue) {
		const error = new Error("后台任务队列尚未初始化") as HttpError;
		error.statusCode = 503;
		throw error;
	}

	const activeRecord = activeSessions.get(sessionId);
	if (activeRecord) {
		if (activeRecord.status === "streaming") {
			const error = new Error("会话仍在运行，不能结束整理") as HttpError;
			error.statusCode = 409;
			throw error;
		}
		const existing = findExistingSessionSummaryJob(sessionId);
		if (existing) {
			return existing;
		}
		await persistSessionRecordMetadata(activeRecord);
		await upsertIndexedSessionRecord(activeRecord, {
			projectContextResolver,
			workspaceChatConfig,
		});
		const summary = await resolveSessionSummary(activeRecord);
		const job = enqueueSessionSummaryJob(jobQueue, {
			sessionId,
			sessionFile: activeRecord.sessionFile || summary.sessionFile,
			title: summary.title,
			cwd: summary.cwd,
			workspaceDir: defaultWorkspaceDir,
			projectLabel: summary.projectLabel,
			projectRoot: summary.projectRoot,
		});
		destroySessionRecord(activeRecord);
		return job;
	}

	const existing = findExistingSessionSummaryJob(sessionId);
	if (existing) {
		return existing;
	}

	const lookup = await getIndexedSessionLookupOrThrow(sessionId);
	const context = lookup.contextId
		? await getIndexedSessionContext(lookup.contextId)
		: null;
	return enqueueSessionSummaryJob(jobQueue, {
		sessionId,
		sessionFile: lookup.sessionFile,
		title: lookup.title,
		cwd: lookup.cwd,
		workspaceDir: defaultWorkspaceDir,
		projectLabel: context?.projectLabel,
		projectRoot: context?.projectRoot,
	});
};

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
	attachmentIds: z.array(z.string().min(1)).optional(),
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

const automationRuleBaseSchema = z.object({
	name: z.string().min(1).max(80),
	enabled: z.boolean(),
	scope: z.enum(["workspace", "project"]),
	projectId: z.string().min(1).optional(),
	cwd: z.string().min(1),
	agent: z.string().optional(),
	model: z.string().optional(),
	thinkingLevel: z.enum(THINKING_LEVELS).optional(),
	schedule: automationScheduleSchema,
	prompt: z.string().min(1),
});

const automationRuleInputSchema = automationRuleBaseSchema.refine((payload) => payload.scope !== "project" || Boolean(payload.projectId), {
	message: "项目自动化必须绑定项目",
	path: ["projectId"],
});

const automationRulePatchSchema = automationRuleBaseSchema
	.partial()
	.refine((payload) => Object.keys(payload).length > 0, {
		message: "至少要更新一个字段",
	})
	.refine((payload) => payload.scope !== "project" || Boolean(payload.projectId), {
		message: "项目自动化必须绑定项目",
		path: ["projectId"],
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
	root: z.string().optional().refine((v) => v === undefined || !v.includes("\\"), "root must not contain backslash"),
	path: z.string().optional().refine((v) => v === undefined || !v.includes("\\"), "path must not contain backslash"),
});

const fileContentQuerySchema = z.object({
	root: z.string().optional().refine((v) => v === undefined || !v.includes("\\"), "root must not contain backslash"),
	path: z.string().optional().refine((v) => v === undefined || !v.includes("\\"), "path must not contain backslash"),
});

const fileContentWindowQuerySchema = z.object({
	root: z.string().optional().refine((v) => v === undefined || !v.includes("\\"), "root must not contain backslash"),
	path: z.string().optional().refine((v) => v === undefined || !v.includes("\\"), "path must not contain backslash"),
	startLine: z.coerce.number().int().min(1).default(1),
	lineCount: z.coerce.number().int().min(1).max(1000).default(1000),
});

const fileOpenSchema = z.object({
	root: z.string().min(1).refine((v) => !v.includes("\\"), "root must not contain backslash"),
	path: z.string().min(1).refine((v) => !v.includes("\\"), "path must not contain backslash"),
});

const filesystemBrowseQuerySchema = z.object({
	path: z.string().optional().refine((v) => v === undefined || !v.includes("\\"), "path must not contain backslash"),
});

const fileSaveSchema = z.object({
	root: z.string().min(1).refine((v) => !v.includes("\\"), "root must not contain backslash"),
	path: z.string().min(1).refine((v) => !v.includes("\\"), "Path must not contain backslash"),
	content: z.string().max(5 * 1024 * 1024),
});

const fileEntryCreateSchema = z.object({
	root: z.string().min(1).refine((v) => !v.includes("\\"), "root must not contain backslash"),
	directory: z.string().min(1).refine((v) => !v.includes("\\"), "directory must not contain backslash"),
	name: z.string().min(1),
	kind: z.enum(["file", "directory"]),
});

const fileEntryMoveSchema = z
	.object({
		root: z.string().min(1).refine((v) => !v.includes("\\"), "root must not contain backslash"),
		path: z.string().min(1).refine((v) => !v.includes("\\"), "path must not contain backslash"),
		targetDirectory: z.string().min(1).optional().refine((v) => v === undefined || !v.includes("\\"), "targetDirectory must not contain backslash"),
		name: z.string().min(1).optional(),
	})
	.refine(
		(value) => value.targetDirectory !== undefined || value.name !== undefined,
		"targetDirectory or name is required",
	);


// ===== Constants =====
const DEFAULT_SESSION_ROUND_WINDOW = 3;
const markdownExtensions = new Set([".md", ".markdown"]);

import {
	buildFilePreviewPayload,
	buildFilePreviewWindowPayload,
	ensureFileForPreview,
	imageMimeTypesByExtension,
	audioMimeTypesByExtension,
	openWithDefaultApp,
	resolveDiscoveryCwd,
	toFileSize,
} from "./file-preview.js";
// ===== Session Modules =====
import {
	applySessionAgentSelection,
	applyTaskSessionAgentSelection,
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
	getFileManager,
	getIndexedSessionLookupOrThrow,
	getStoredSessionMessagesPayload,
	getStoredSessionRuntimePayload,
	initSessionPayload,
	resolveSessionSummary,
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
	getAutomationStore,
	dispatchDesktopAutomationRule: async (rule, target) => {
		const db = await getRidgeDb();
		const now = Date.now();
		const sessionId = crypto.randomUUID();
		db.prepare(
			`INSERT INTO session_index (
				session_id, title, session_type, context_type,
				workspace_path, project_id, device_id, run_location,
				archived, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			sessionId,
			rule.name,
			"workspace",
			"project",
			target.cwd,
			target.projectId,
			target.deviceId,
			"desktop",
			0,
			now,
			now,
		);
		await forwardRunRequestToDesktop(target.deviceId!, {
			type: "create_session",
			sessionId,
			cwd: target.cwd,
			title: rule.name,
			model: rule.model,
			agent: rule.agent,
			thinkingLevel: rule.thinkingLevel,
		});
		await forwardRunRequestToDesktop(target.deviceId!, {
			type: "send_message",
			sessionId,
			prompt: rule.prompt,
			model: rule.model,
			agent: rule.agent,
			thinkingLevel: rule.thinkingLevel,
		});
		return { sessionId };
	},
});

function objectPayload(payload: unknown): Record<string, unknown> {
	return payload && typeof payload === "object" && !Array.isArray(payload)
		? payload as Record<string, unknown>
		: {};
}

async function getDesktopSessionDeviceId(sessionId: string): Promise<string | null> {
	const db = await getRidgeDb();
	const sessionRow = db.prepare(
		`SELECT device_id, run_location FROM session_index WHERE session_id = ?`,
	).get(sessionId) as { device_id: string | null; run_location: string | null } | undefined;

	if (sessionRow?.run_location !== "desktop" || !sessionRow.device_id) {
		return null;
	}
	if (!isDesktopOnline(sessionRow.device_id)) {
		const error = new Error("Device offline") as HttpError;
		error.statusCode = 409;
		throw error;
	}
	return sessionRow.device_id;
}

async function assertSessionNotArchived(
	sessionId: string,
	message = "归档会话只读，不能继续操作",
): Promise<void> {
	const db = await getRidgeDb();
	const indexRow = db.prepare(
		`SELECT archived FROM session_index WHERE session_id = ?`,
	).get(sessionId) as { archived: number } | undefined;
	const metadata = await sessionMetadataStore.getSessionMetadata(sessionId);

	if (indexRow?.archived || metadata.archived) {
		const error = new Error(message) as HttpError;
		error.statusCode = 403;
		throw error;
	}
}
// ===== Routes =====
app.get("/api/auth/session", authRuntime.session);
app.post("/api/auth/login", authRuntime.login);
app.post("/api/auth/logout", authRuntime.logout);
app.use(createRuntimeBundleRouter({ defaultWorkspaceDir, getRidgeDb }));
app.use(createWorkspaceMcpRouter({ defaultWorkspaceDir, getRidgeDb }));
app.use(authRuntime.requireApiAuth);
app.use(createDeviceRegistrationRouter({ defaultWorkspaceDir, getRidgeDb }));

app.use("/api/fleeting", createFleetingRouter({
	db: await initializeRidgeDb(defaultWorkspaceDir),
	workspaceDir: defaultWorkspaceDir,
	getAnalysisRunner: () => fleetingRunnerRef.value,
}));

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
			if (path.isAbsolute(trimmed)) {
				const error = new Error("Absolute paths are not allowed") as HttpError;
				error.statusCode = 400;
				throw error;
			}
			// Reject explicit parent directory references
			if (trimmed.split(/[\\/]/).some((segment) => segment === "..")) {
				const error = new Error("Path traversal is not allowed") as HttpError;
				error.statusCode = 400;
				throw error;
			}
			const targetPath = path.resolve(defaultWorkspaceDir, trimmed);
			// Lexical boundary check
			ensureWithinRoot(targetPath, defaultWorkspaceDir);
			assertNotRidgeSystemPath(targetPath, defaultWorkspaceDir);
			const parentDir = path.dirname(targetPath);
			ensureWithinRoot(parentDir, defaultWorkspaceDir);
			assertNotRidgeSystemPath(parentDir, defaultWorkspaceDir);
			// Realpath boundary check before any IO
			await ensureResolvedPathWithinRoot(targetPath, defaultWorkspaceDir);
			await ensureResolvedPathWithinRoot(parentDir, defaultWorkspaceDir);
			await fs.mkdir(parentDir, { recursive: true });
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
	getAutomationScheduler,
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
const workspaceTasksRouter = createWorkspaceTasksRouter(defaultWorkspaceDir, {
	createSessionRecord,
	applyTaskSessionAgentSelection,
	persistSessionRecordMetadata,
	upsertIndexedSessionRecord,
	toSessionSnapshot,
	getProjects,
	async getDefaultModel() {
		const settings = await getSettings();
		return settings.defaultModel;
	},
	async getDefaultThinkingLevel() {
		const settings = await getSettings();
		return settings.defaultThinkingLevel;
	},
	projectContextResolver,
	workspaceChatConfig,
	getJobQueue: () => jobQueue,
});
app.use("/api/workspace/tasks", workspaceTasksRouter);
const workspaceMilestonesRouter =
	createWorkspaceMilestonesRouter(defaultWorkspaceDir);
app.use("/api/workspace/milestones", workspaceMilestonesRouter);
// ===== New Workspace Projects Router (Task 30) =====
app.use("/api/workspace/projects", createProjectRouter(defaultWorkspaceDir));
// ===== Device Router (Task 31) =====
app.use("/api/devices", createDeviceRouter());
app.use("/api/devices", createServerDeviceRouter());
// ===== Desktop Forward Router (Task 31 — SSE + Request Forward) =====
app.use("/api/devices", createDesktopForwardRouter());
// ===== Bundle Router (Task 32) =====
app.use("/api/devices", createBundleRouter(defaultWorkspaceDir));
app.use(
	"/api/notifications",
	createNotificationsRouter({
		defaultWorkspaceDir,
		getRidgeDb,
		getJobQueue: () => jobQueue,
		isConversionEnabled: () => isConversionEnabled?.() ?? false,
		getAutomationStore,
		dispatchAutomationRule,
	}),
);
// ===== Workspace Data Routes =====
// ===== Workspace Data Routes =====
const workspaceDataRouter = createWorkspaceDataRouter({
	defaultWorkspaceDir,
	fileManager: getFileManager(),
	openWithDefaultApp,
	upload,
	getJobQueue: () => jobQueue,
	isConversionEnabled: () => isConversionEnabled?.() ?? false,
	fileEntryCreateSchema,
	fileEntryMoveSchema,
	fileContentQuerySchema,
	fileOpenSchema,
});
app.use(workspaceDataRouter);
const workspaceFilesRouter = createWorkspaceFilesRouter({
	defaultWorkspaceDir,
	fileManager: getFileManager(),
	getRidgeDb,
	getJobQueue: () => jobQueue,
	isConversionEnabled: () => isConversionEnabled?.() ?? false,
});
app.use(workspaceFilesRouter);
app.use(createWorkspaceSpaceRouter({ defaultWorkspaceDir }));
app.use(createWorkspaceSearchRouter({ defaultWorkspaceDir, getRidgeDb }));
app.use(createWorkspaceGraphRouter({ getGraphRunner: () => graphRunner }));
app.use(createWorkspaceBackupRouter({ defaultWorkspaceDir, getRidgeDbPath }));
app.use("/api/sessions/:sessionId/attachments", createSessionAttachmentsRouter(ensureSessionRecord));
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
			const mimeType = imageMimeTypesByExtension.get(extension) ?? audioMimeTypesByExtension.get(extension);

			if (!mimeType) {
				const error = new Error(
					"Only image and audio previews are available through this endpoint",
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

			// Markdown edit: mark search_index_status as pending so RAG will re-index with current content
			if (markdownExtensions.has(extension)) {
				const posixPath = toPosixPath(targetPath);
				await markRagTargetPending(posixPath, {
					workspaceDir: defaultWorkspaceDir,
					refreshPolicy: "deferred",
					event: "edit",
				});
			}

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

// OLD /api/projects WRITE ROUTES DEPRECATED — replaced by /api/workspace/projects
// POST/DELETE now return 410 Gone to force migration to the new project API.
// GET is preserved as read-only compatibility but delegates to the new service.

app.get("/api/projects", async (_req: Request, res: Response, next: NextFunction) => {
	try {
		const state = await getProjects();
		res.json({
			projects: state.projects.map(serializeProject),
		});
	} catch (error) {
		next(error);
	}
});

app.post("/api/projects", (_req: Request, res: Response) => {
	res.status(410).json({ error: "Deprecated: use POST /api/workspace/projects/internal or /external" });
});

app.delete("/api/projects/:id", (_req: Request, res: Response) => {
	res.status(410).json({ error: "Deprecated: use DELETE /api/workspace/projects/:id" });
});

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
				taskId: session.taskId,
				sessionType: session.sessionType,
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

			// Check for desktop session
			const db = await getRidgeDb();
			const sessionRow = db.prepare(
				`SELECT run_location, device_id FROM session_index WHERE session_id = ?`
			).get(sessionId) as { run_location: string | null; device_id: string | null } | undefined;
			
			if (sessionRow?.run_location === 'desktop' && sessionRow.device_id) {
				if (!isDesktopOnline(sessionRow.device_id)) {
					const error = new Error("Device offline") as HttpError;
					error.statusCode = 409;
					throw error;
				}
				const desktopResult = await forwardRunRequestToDesktop(sessionRow.device_id, {
					type: 'get_messages',
					sessionId,
					query,
				});
				res.json(desktopResult);
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

			// Check for desktop session
			const db = await getRidgeDb();
			const sessionRow = db.prepare(
				`SELECT run_location, device_id FROM session_index WHERE session_id = ?`
			).get(sessionId) as { run_location: string | null; device_id: string | null } | undefined;
			
			if (sessionRow?.run_location === 'desktop' && sessionRow.device_id) {
				if (!isDesktopOnline(sessionRow.device_id)) {
					const error = new Error("Device offline") as HttpError;
					error.statusCode = 409;
					throw error;
				}
				const desktopResult = await forwardRunRequestToDesktop(sessionRow.device_id, {
					type: 'get_runtime',
					sessionId,
				});
				res.json(desktopResult);
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

			// Check for desktop session
			const db = await getRidgeDb();
			const sessionRow = db.prepare(
				`SELECT run_location, device_id FROM session_index WHERE session_id = ?`
			).get(sessionId) as { run_location: string | null; device_id: string | null } | undefined;
			
			if (sessionRow?.run_location === 'desktop' && sessionRow.device_id) {
				if (!isDesktopOnline(sessionRow.device_id)) {
					const error = new Error("Device offline") as HttpError;
					error.statusCode = 409;
					throw error;
				}
				const [messagesPayload, runtimePayload] = await Promise.all([
					forwardRunRequestToDesktop(sessionRow.device_id, {
						type: 'get_messages',
						sessionId,
						query,
					}),
					forwardRunRequestToDesktop(sessionRow.device_id, {
						type: 'get_runtime',
						sessionId,
					}),
				]);
				res.json({ ...objectPayload(messagesPayload), ...objectPayload(runtimePayload) });
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
	"/api/sessions/:sessionId/events",
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const query = sessionSnapshotQuerySchema.parse(req.query ?? {});
			const sessionId = String(req.params.sessionId);
			
			// Check if this is a desktop session
			const db = await getRidgeDb();
			const sessionRow = db.prepare(
				`SELECT device_id, run_location FROM session_index WHERE session_id = ?`
			).get(sessionId) as { device_id: string | null; run_location: string } | undefined;
			
			// Desktop session: bridge SSE from desktop device
			if (sessionRow?.run_location === 'desktop' && sessionRow.device_id) {
				if (!isDesktopOnline(sessionRow.device_id)) {
					const error = new Error("Device offline") as HttpError;
					error.statusCode = 409;
					throw error;
				}

				res.setHeader("Content-Type", "text/event-stream");
				res.setHeader("Cache-Control", "no-cache");
				res.setHeader("Connection", "keep-alive");
				res.flushHeaders();

				// Forward desktop SSE events to this response stream
				const { addDesktopSseListener } = await import("./desktop-bridge.js");
				const listener = (event: Record<string, unknown>) => {
					try {
						res.write(`data: ${JSON.stringify(event)}\n\n`);
					} catch (writeErr) {
						// SSE write failure — remove listener to prevent repeated errors
						console.error(`[index] SSE write failed for desktop session ${sessionId}:`, writeErr);
						removeListener();
					}
				};
				const removeListener = addDesktopSseListener(sessionRow.device_id, listener);

				req.on("close", () => {
					removeListener();
				});
				req.on("error", () => {
					removeListener();
				});
				return;
			}
			
			// Local session: existing behavior
			const record = await ensureSessionRecord(sessionId);

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

			// 禁止分叉任务处理会话 — 在查找 parent session 前检查
			if (payload.parentSessionId) {
				const db = await getRidgeDb();
				const taskRow = db.prepare(
					`SELECT task_id FROM workspace_tasks WHERE processing_session_id = ?`,
				).get(payload.parentSessionId) as { task_id: string } | undefined;
				if (taskRow) {
					const error = new Error("任务处理会话不允许分叉") as HttpError;
					error.statusCode = 409;
					throw error;
				}
			}

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

			// 内部项目是组织/关注对象，不作为 pi 运行目录；拦截内部项目路径及其子路径
			const projectsState = await getProjects();
			const internalProjects = projectsState.projects.filter(
				(p) => p.projectType === 'internal',
			);
			const normalizedSessionCwd = normalizeFsPath(sessionCwd);
			for (const internalProject of internalProjects) {
				const projectRoot = normalizeFsPath(internalProject.path);
				const relative = path.relative(projectRoot, normalizedSessionCwd);
				if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
					const error = new Error("Internal project cannot be used as a session working directory") as HttpError;
					error.statusCode = 400;
					throw error;
				}
			}

			// 检查外部仓库绑定的设备是否在线（有 deviceId 且离线的项目禁止启动会话）
			const matchingProject = projectsState.projects.find(
				(p) => p.projectType === 'external' && normalizedSessionCwd.startsWith(normalizeFsPath(p.path)),
			);
			if (matchingProject?.deviceId && matchingProject.deviceId !== 'server' && !matchingProject.isOnline) {
				const error = new Error("项目离线，无法启动会话") as HttpError;
				error.statusCode = 409;
				throw error;
			}

			// 归档项目禁止新建会话
			if (matchingProject?.archivedAt) {
				const error = new Error("项目已归档，无法新建会话") as HttpError;
				error.statusCode = 403;
				throw error;
			}

			// 桌面项目：forward 到桌面设备创建会话，server 不保存消息正文
			if (matchingProject?.deviceId && matchingProject.deviceId !== 'server' && matchingProject.isOnline) {
				const db = await getRidgeDb();
				const now = Date.now();
				const sessionId = crypto.randomUUID();
				// 创建 server 侧轻量 session_index 记录（metadata 层）
				db.prepare(
					`INSERT INTO session_index (
						session_id, title, session_type, context_type,
						workspace_path, project_id, device_id, run_location,
						archived, created_at, updated_at
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
				).run(
					sessionId,
					payload.title || matchingProject.name,
					'workspace',
					'project',
					sessionCwd,
					matchingProject.id,
					matchingProject.deviceId,
					'desktop',
					0,
					now,
					now,
				);
				// Forward 会话创建请求到桌面设备
				const desktopResult = await forwardRunRequestToDesktop(matchingProject.deviceId, {
					type: 'create_session',
					sessionId,
					cwd: sessionCwd,
					title: payload.title,
					model: payload.model,
					agent: payload.agent,
					thinkingLevel: payload.thinkingLevel,
				});
				res.status(201).json({
					id: sessionId,
					...objectPayload(desktopResult),
					desktopSession: true,
					deviceId: matchingProject.deviceId,
				});
				return;
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
			const requestedSessionId = String(req.params.sessionId);
			let sessionIds = (
				await getIndexedSessionTree(requestedSessionId)
			).map((item) => item.id);

			if (sessionIds.length === 0) {
				const db = await getRidgeDb();
				const indexedSession = db.prepare(
					`SELECT session_id FROM session_index WHERE session_id = ?`,
				).get(requestedSessionId) as { session_id: string } | undefined;
				if (!indexedSession) {
					const error = new Error("Session not found") as HttpError;
					error.statusCode = 404;
					throw error;
				}
				sessionIds = [requestedSessionId];
			}

			await sessionMetadataStore.setArchived(sessionIds, payload.archived);
			const db = await getRidgeDb();
			const now = Date.now();
			const updateIndexedSession = db.prepare(
				`UPDATE session_index SET archived = ?, updated_at = ? WHERE session_id = ?`,
			);
			db.transaction((ids: string[]) => {
				for (const sessionId of ids) {
					updateIndexedSession.run(payload.archived ? 1 : 0, now, sessionId);
				}
			})(sessionIds);

			res.json({ ok: true, sessionIds });
		} catch (error) {
			next(error);
		}
	},
);

app.post(
	"/api/sessions/:sessionId/end",
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const job = await enqueueEndedSessionSummary(String(req.params.sessionId));
			res.json({ ok: true, jobId: job.jobId });
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
			const sessionId = String(req.params.sessionId);
			await assertSessionNotArchived(sessionId, "归档会话不可发送消息");
			
			// Check if this is a desktop session FIRST — before any local session lookup
			const db = await getRidgeDb();
			const sessionRow = db.prepare(
				`SELECT device_id, run_location FROM session_index WHERE session_id = ?`
			).get(sessionId) as { device_id: string | null; run_location: string } | undefined;
			
			if (sessionRow?.run_location === 'desktop' && sessionRow.device_id) {
				if (!isDesktopOnline(sessionRow.device_id)) {
					const error = new Error("Device offline") as HttpError;
					error.statusCode = 409;
					throw error;
				}
				await forwardRunRequestToDesktop(sessionRow.device_id, {
					type: 'send_message',
					sessionId,
					prompt: payload.prompt,
					model: payload.model,
					agent: payload.agent,
					thinkingLevel: payload.thinkingLevel,
					attachmentIds: payload.attachmentIds,
				});
				res.json({ ok: true, forwarded: true });
				return;
			}
			
			// Only for local sessions: load the session record
			const record = await ensureSessionRecord(sessionId);

			if (record.turnBudget.exhausted) {
				const error = new Error(
					"当前 agent 的最大轮次已耗尽，请重新选择 agent 或新建会话",
				) as HttpError;
				error.statusCode = 400;
				throw error;
			}

			await applyExplicitMemoryCommand(defaultWorkspaceDir, payload.prompt);

			await applySessionAgentSelection(record, {
				agentName:
					payload.agent !== undefined
						? payload.agent || undefined
						: record.selectedAgentName,
				model: payload.model || undefined,
				thinkingLevel: payload.thinkingLevel,
			});

			updateStatus(record, "streaming");

			let finalPrompt = payload.prompt;
			if (payload.attachmentIds && payload.attachmentIds.length > 0) {
				const valid = await validateAttachmentIds(record.id, payload.attachmentIds);
				if (!valid) {
					const error = new Error("附件 ID 中存在不属于当前会话的附件") as HttpError;
					error.statusCode = 400;
					throw error;
				}
				const attachmentContext = await buildAttachmentContext(payload.attachmentIds);
				finalPrompt = finalPrompt + attachmentContext;
			}

			void record.session
				.prompt(finalPrompt, { source: "interactive" })
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
	"/api/sessions/:sessionId/ask/:requestId",
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const payload = askActionSchema.parse(req.body ?? {});
			const sessionId = String(req.params.sessionId);
			const askId = String(req.params.requestId);
			await assertSessionNotArchived(sessionId);
			const desktopDeviceId = await getDesktopSessionDeviceId(sessionId);
			if (desktopDeviceId) {
				await forwardRunRequestToDesktop(desktopDeviceId, {
					type: "respond_ask",
					sessionId,
					requestId: askId,
					action: payload.action,
					...(payload.action === "submit" ? { answers: payload.answers } : {}),
				});
				res.json({ ok: true, forwarded: true });
				return;
			}

			const record = await ensureSessionRecord(sessionId);

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
	"/api/sessions/:sessionId/permissions/:requestId",
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const payload = permissionActionSchema.parse(req.body ?? {});
			const sessionId = String(req.params.sessionId);
			const requestId = String(req.params.requestId);
			await assertSessionNotArchived(sessionId);
			const desktopDeviceId = await getDesktopSessionDeviceId(sessionId);
			if (desktopDeviceId) {
				await forwardRunRequestToDesktop(desktopDeviceId, {
					type: "respond_permission",
					sessionId,
					requestId,
					action: payload.action,
				});
				res.json({ ok: true, forwarded: true });
				return;
			}

			const record = await ensureSessionRecord(sessionId);
			await settlePendingPermission(record, requestId, payload.action);
			res.json({ ok: true });
		} catch (error) {
			next(error);
		}
	},
);

app.post(
	"/api/sessions/:sessionId/cancel",
	async (req: Request, res: Response, next: NextFunction) => {
		try {
			const sessionId = String(req.params.sessionId);
			await assertSessionNotArchived(sessionId);
			const desktopDeviceId = await getDesktopSessionDeviceId(sessionId);
			if (desktopDeviceId) {
				await forwardRunRequestToDesktop(desktopDeviceId, {
					type: "cancel_session",
					sessionId,
				});
				res.json({ ok: true, forwarded: true });
				return;
			}

			const record = await ensureSessionRecord(sessionId);
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

export function registerWebSocketUpgrades(httpServer: ReturnType<typeof createServer>): void {
	const terminalWebSocketServer = new WebSocketServer({ noServer: true });

	httpServer.on("upgrade", (request, socket, head) => {
		const host = request.headers.host || `127.0.0.1:${port}`;
		const url = new URL(request.url || "/", `http://${host}`);

		// Desktop device WebSocket long-connection
		const deviceMatch = url.pathname.match(/^\/api\/devices\/([^/]+)\/ws$/);
		if (deviceMatch) {
			const deviceId = decodeURIComponent(deviceMatch[1]);
			const token = url.searchParams.get("token");
			if (!token) {
				socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
				socket.destroy();
				return;
			}
			import("./desktop-bridge.js").then(({ validateDeviceToken }) =>
				validateDeviceToken(deviceId, token),
			).then((valid) => {
				if (!valid) {
					socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
					socket.destroy();
					return;
				}
				const wsServer = new WebSocketServer({ noServer: true });
				wsServer.handleUpgrade(request, socket, head, (ws) => {
					import("./desktop-bridge.js").then(({ registerDesktopConnection }) => {
						registerDesktopConnection(deviceId, ws);
						ws.on("message", (data) => {
							try {
								const msg = JSON.parse(String(data));
								if (msg.type === "sse_event") {
									import("./desktop-bridge.js").then(({ forwardDesktopSseEvent }) => {
										forwardDesktopSseEvent(deviceId, msg.event);
									});
								} else if (msg.type === "run_result") {
									// handled by forwardRunRequestToDesktop promise resolver
								} else {
									console.warn(`[index] Unknown WebSocket message type from ${deviceId}: ${msg.type}`);
								}
							} catch (parseErr) {
								console.error(`[index] Invalid WebSocket message from ${deviceId}:`, parseErr);
								try {
									ws.send(JSON.stringify({
										type: "error",
										code: "INVALID_MESSAGE",
										message: "Message could not be parsed as JSON",
									}));
								} catch (sendErr) {
									console.error(`[index] Failed to send error response to ${deviceId}:`, sendErr);
								}
							}
						});
					});
				});
			}).catch(() => {
				socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
				socket.destroy();
			});
			return;
		}

		const match = url.pathname.match(/^\/api\/terminals\/([^/]+)\/stream$/);

		if (!match) {
			socket.destroy();
			return;
		}
		if (!authRuntime.isAuthenticatedCookieHeader(request.headers.cookie)) {
			socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
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
}

export async function startServer() {
	const httpServer = createServer(app);
	registerWebSocketUpgrades(httpServer);

	await ensureWorkspaceTemplate(defaultWorkspaceDir);
	const db = await initializeRidgeDb(defaultWorkspaceDir);
	jobQueue = createBackgroundJobQueue(db);
	graphRunner = createGraphMaintenanceRunner({
		db,
		workspaceDir: defaultWorkspaceDir,
		extract: createPiGraphExtractor({
			workspaceDir: defaultWorkspaceDir,
			authStorage,
			modelRegistry,
		}),
	});
	const wikiRunner = createWikiMaintenanceRunner({
		db,
		workspaceDir: defaultWorkspaceDir,
		maintain: createPiWikiMaintainer({
			workspaceDir: defaultWorkspaceDir,
			authStorage,
			modelRegistry,
		}),
	});
	fleetingRunnerRef.value = createFleetingAnalysisRunner({ db, jobQueue });
	const fleetingAnalysisWorker = createFleetingAnalysisWorker({
		db,
		jobQueue,
		modelRegistry,
		authStorage,
		workspaceDir: defaultWorkspaceDir,
	});
	fleetingAnalysisWorker.start();
	const conversionConfig = await loadConversionServiceConfigFromDb();
	const conversionClient = conversionConfig
		? new ConversionServiceClient({
			baseUrl: conversionConfig.baseUrl,
			apiKey: conversionConfig.apiKey,
		})
		: null;

	isConversionEnabled = () => conversionClient !== null && conversionConfig !== null;

	// Only start conversion worker and register webhook if Python service is configured
	if (conversionClient && conversionConfig) {
		// callbackBaseUrl is only passed if explicitly configured; otherwise pure polling mode
		const callbackBaseUrl = conversionConfig.callbackBaseUrl;

		const fileConversionWorker = createFileConversionWorker({
			db,
			jobQueue,
			workspaceDir: defaultWorkspaceDir,
			conversionClient,
			config: { ...conversionConfig, callbackBaseUrl },
		});
		fileConversionWorker.start();

		const webhookRouter = createConversionWebhookRouter({
			getRidgeDb,
			getJobQueue: () => jobQueue,
			conversionClient,
			workspaceDir: defaultWorkspaceDir,
			callbackToken: conversionConfig.callbackToken,
		});
		app.use(webhookRouter);
	}

	automationStore = createAutomationStore(db);
	automationScheduler = createAutomationScheduler({
		store: automationStore,
		dispatchRule: async (rule) => {
			const result = await dispatchAutomationRule(rule);
			await refreshSessionCatalogIndex();
			return result;
		},
	});
	automationScheduler.start();
	await refreshSessionCatalogIndex();

	// Start RAG worker (always runs, even without Python conversion service)
	const ragWorker = createRagWorker({ jobQueue, workspaceDir: defaultWorkspaceDir, graphRunner, wikiRunner });
	ragWorker.start();

	const taskReviewWorkers = createTaskReviewWorkers({
		db,
		jobQueue,
		workspaceDir: defaultWorkspaceDir,
	});
	taskReviewWorkers.start();
	const taskReviewScheduler = createTaskReviewScheduler({
		jobQueue,
		workspaceDir: defaultWorkspaceDir,
	});
	taskReviewScheduler.start();

	const workspaceMemoryWorkers = createWorkspaceMemoryWorkers({
		jobQueue,
		workspaceDir: defaultWorkspaceDir,
		modelRegistry,
		authStorage,
		resolveBackgroundModel: async () => {
			const settings = await getSettings();
			return settings.backgroundAgentModel || undefined;
		},
		resolveBackgroundThinkingLevel: async () => {
			const settings = await getSettings();
			return settings.backgroundAgentThinkingLevel;
		},
	});
	workspaceMemoryWorkers.start();

	await listenHttpServer(httpServer, port);
	console.warn(`Pi server listening on http://127.0.0.1:${port}`);
}

type ListenError = Error & { code?: string; port?: number };

export const listenHttpServer = (
	server: Server,
	listenPort: number,
): Promise<void> =>
	new Promise((resolve, reject) => {
		const handleError = (error: ListenError) => {
			server.off("listening", handleListening);
			reject(error);
		};
		const handleListening = () => {
			server.off("error", handleError);
			resolve();
		};

		server.once("error", handleError);
		server.once("listening", handleListening);
		server.listen(listenPort);
	});

const logStartupError = (error: unknown) => {
	const listenError = error as ListenError;
	if (listenError?.code === "EADDRINUSE") {
		console.error(
			`Failed to start Pi server: port ${port} is already in use. Stop the existing server process or start this one with another PORT, for example PORT=3001 npm run dev.`,
		);
		return;
	}

	console.error("Failed to start Pi server", error);
}

const isMainModule =
	process.argv[1] &&
	realpathSync(fileURLToPath(import.meta.url)) ===
		realpathSync(path.resolve(process.argv[1]));

if (isMainModule) {
	startServer().catch((error) => {
		logStartupError(error);
		process.exit(1);
	});
}
