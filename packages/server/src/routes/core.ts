import fs from "node:fs/promises";
import path from "node:path";
import type {
	AgentSession,
	DefaultResourceLoader,
} from "@mariozechner/pi-coding-agent";
import type { AutomationRule, AutomationRuleInput } from "@pi/protocol";
import express, {
	type NextFunction,
	type Request,
	type Response,
} from "express";
import { z } from "zod";
import type {
	AgentConfigInternal,
	AgentPayload,
	SaveAgentOptions,
} from "../agents.js";
import type { AutomationStore } from "../automations.js";
import { createFileManager } from "../file-manager.js";
import type {
	AgentScope,
	AgentSummary,
	FileTreeEntry,
	HttpError,
	ResourceCatalogResponse,
	SessionRecord,
} from "../types/index.js";

export interface CoreDeps {
	app?: unknown;
	defaultWorkspaceDir: string;
	resolveDiscoveryCwd: (value: unknown) => string;
	listProviders: () => unknown;
	discoverAgents: (cwd: string) => Promise<AgentConfigInternal[]>;
	createAgentSummary: (agent: AgentConfigInternal) => AgentSummary;
	createAgentConfigResponse: (
		agent: AgentConfigInternal,
	) => Record<string, unknown>;
	getAgentByName: (
		cwd: string,
		name: string,
		scope?: AgentScope,
	) => Promise<AgentConfigInternal | null>;
	saveAgent: (
		cwd: string,
		name: string,
		payload: Partial<AgentPayload>,
		opts: SaveAgentOptions,
	) => Promise<AgentConfigInternal>;
	deleteAgent: (
		cwd: string,
		name: string,
		scope: AgentScope,
	) => Promise<string>;
	getAutomationStore: () => AutomationStore;
	automationScheduler: { reschedule: () => void } | null;
	dispatchAutomationRule: (
		rule: AutomationRule,
	) => Promise<{ sessionId: string }>;
	ensureManagedProjectScope: (path: string) => Promise<unknown>;
	ensureSessionRecord: (sessionId: string) => Promise<SessionRecord>;
	buildResourceCatalog: (
		session: AgentSession,
		resourceLoader: DefaultResourceLoader,
	) => ResourceCatalogResponse;
	createTransientCatalogSession: (cwd: string) => Promise<{
		session: AgentSession;
		resourceLoader: DefaultResourceLoader;
	}>;
	fileManager: ReturnType<typeof createFileManager>;
	normalizeString: (value: unknown) => string;
	toPosixPath: (p: string) => string;
	agentScopeQuerySchema: {
		parse: (data: unknown) => { scope?: AgentScope; cwd?: string };
	};
	agentUpsertSchema: { parse: (data: unknown) => Partial<AgentPayload> };
	automationRuleInputSchema: { parse: (data: unknown) => AutomationRuleInput };
	automationRulePatchSchema: {
		parse: (data: unknown) => Partial<AutomationRuleInput>;
	};
	automationToggleSchema: { parse: (data: unknown) => { enabled: boolean } };
	resourceCatalogQuerySchema: {
		parse: (data: unknown) => { cwd?: string; sessionId?: string };
	};
	fileTreeQuerySchema: {
		parse: (data: unknown) => { root?: string; path?: string };
	};
}

export function createCoreRouter(deps: CoreDeps) {
	const router = express.Router();

	const {
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
		fileManager,
		normalizeString,
		toPosixPath,
		agentScopeQuerySchema,
		agentUpsertSchema,
		automationRuleInputSchema,
		automationRulePatchSchema,
		automationToggleSchema,
		resourceCatalogQuerySchema,
		fileTreeQuerySchema,
	} = deps;
	router.get("/api/providers", (_req: Request, res: Response) => {
		res.json(listProviders());
	});

	router.get(
		"/api/agents",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const cwd = resolveDiscoveryCwd(req.query?.cwd);
				const agents = await discoverAgents(cwd);
				res.json(
					agents
						.filter((agent) => agent.enabled !== false && agent.mode !== "task")
						.map(createAgentSummary),
				);
			} catch (error) {
				next(error);
			}
		},
	);

	router.get(
		"/api/automations",
		(_req: Request, res: Response, next: NextFunction) => {
			try {
				res.json({ rules: getAutomationStore().listRules() });
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/api/automations",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const payload = automationRuleInputSchema.parse(req.body ?? {});
				await ensureManagedProjectScope(payload.cwd);
				const rule = getAutomationStore().createRule({
					...payload,
					agent: payload.agent || undefined,
					model: payload.model || undefined,
					thinkingLevel: payload.thinkingLevel || undefined,
				});
				automationScheduler?.reschedule();
				res.status(201).json(rule);
			} catch (error) {
				next(error);
			}
		},
	);

	router.patch(
		"/api/automations/:automationId",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const payload = automationRulePatchSchema.parse(req.body ?? {});
				if (payload.cwd) {
					await ensureManagedProjectScope(payload.cwd);
				}
				const rule = getAutomationStore().updateRule(
					String(req.params.automationId),
					{
						...payload,
						agent: payload.agent === "" ? null : payload.agent,
						model: payload.model === "" ? null : payload.model,
						thinkingLevel: payload.thinkingLevel,
					},
				);
				if (!rule) {
					const error = new Error("自动化规则不存在") as HttpError;
					error.statusCode = 404;
					throw error;
				}

				automationScheduler?.reschedule();
				res.json(rule);
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/api/automations/:automationId/toggle",
		(req: Request, res: Response, next: NextFunction) => {
			try {
				const payload = automationToggleSchema.parse(req.body ?? {});
				const rule = getAutomationStore().updateRule(
					String(req.params.automationId),
					{
						enabled: payload.enabled,
					},
				);
				if (!rule) {
					const error = new Error("自动化规则不存在") as HttpError;
					error.statusCode = 404;
					throw error;
				}

				automationScheduler?.reschedule();
				res.json(rule);
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/api/automations/:automationId/run",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const rule = getAutomationStore().getRule(
					String(req.params.automationId),
				);
				if (!rule) {
					const error = new Error("自动化规则不存在") as HttpError;
					error.statusCode = 404;
					throw error;
				}

				res.json(await dispatchAutomationRule(rule));
			} catch (error) {
				next(error);
			}
		},
	);

	router.delete(
		"/api/automations/:automationId",
		(req: Request, res: Response, next: NextFunction) => {
			try {
				const removed = getAutomationStore().removeRule(
					String(req.params.automationId),
				);
				if (!removed) {
					const error = new Error("自动化规则不存在") as HttpError;
					error.statusCode = 404;
					throw error;
				}

				automationScheduler?.reschedule();
				res.json({ ok: true });
			} catch (error) {
				next(error);
			}
		},
	);

	router.get(
		"/api/resources",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const query = resourceCatalogQuerySchema.parse(req.query ?? {});

				if (query.sessionId) {
					const record = await ensureSessionRecord(query.sessionId);
					res.json(buildResourceCatalog(record.session, record.resourceLoader));
					return;
				}

				const cwd = resolveDiscoveryCwd(query.cwd);
				const transient = await createTransientCatalogSession(cwd);

				try {
					res.json(
						buildResourceCatalog(transient.session, transient.resourceLoader),
					);
				} finally {
					transient.session.dispose();
				}
			} catch (error) {
				next(error);
			}
		},
	);

	router.get(
		"/api/config/agents/:name",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const query = agentScopeQuerySchema.parse(req.query ?? {});
				const cwd = normalizeString(query.cwd) || defaultWorkspaceDir;
				const agentName = String(req.params.name);
				const agent = await getAgentByName(cwd, agentName, query.scope);
				if (!agent) {
					const error = new Error(`Agent 不存在: ${agentName}`) as HttpError;
					error.statusCode = 404;
					throw error;
				}

				res.json(createAgentConfigResponse(agent));
			} catch (error) {
				next(error);
			}
		},
	);

	router.post(
		"/api/config/agents/:name",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const payload = agentUpsertSchema.parse(req.body ?? {});
				const cwd = normalizeString(req.query?.cwd) || defaultWorkspaceDir;
				const agentName = String(req.params.name);
				const agent = await saveAgent(cwd, agentName, payload, {
					allowCreate: true,
					requireScope: true,
				});

				res.status(201).json(createAgentConfigResponse(agent));
			} catch (error) {
				next(error);
			}
		},
	);

	router.put(
		"/api/config/agents/:name",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const payload = agentUpsertSchema.parse(req.body ?? {});
				const cwd = normalizeString(req.query?.cwd) || defaultWorkspaceDir;
				const agentName = String(req.params.name);
				const agent = await saveAgent(cwd, agentName, payload, {
					allowCreate: false,
					requireScope: false,
				});

				res.json(createAgentConfigResponse(agent));
			} catch (error) {
				next(error);
			}
		},
	);

	router.delete(
		"/api/config/agents/:name",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const query = agentScopeQuerySchema.parse(req.query ?? {});
				if (!query.scope) {
					const error = new Error(
						"删除 agent 时必须显式指定 scope",
					) as HttpError;
					error.statusCode = 400;
					throw error;
				}

				const cwd = normalizeString(query.cwd) || defaultWorkspaceDir;
				const agentName = String(req.params.name);
				const filePath = await deleteAgent(cwd, agentName, query.scope);
				res.json({ ok: true, filePath: toPosixPath(path.resolve(filePath)) });
			} catch (error) {
				next(error);
			}
		},
	);

	router.get(
		"/api/files/tree",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const query = fileTreeQuerySchema.parse(req.query ?? {});
				const { rootPath, targetPath } =
					await fileManager.resolveManagedFileLocation({
						root: query.root,
						path: query.path,
						fallbackToRoot: true,
					});

				const stats = await fs.stat(targetPath);
				if (!stats.isDirectory()) {
					const error = new Error(
						"Requested path is not a directory",
					) as HttpError;
					error.statusCode = 400;
					throw error;
				}

				const entries = await fileManager.listDirectoryEntries(
					targetPath,
					rootPath,
				);

				res.json({
					root: toPosixPath(rootPath),
					directory: toPosixPath(targetPath),
					entries,
				});
			} catch (error) {
				next(error);
			}
		},
	);

	router.get(
		"/api/workspace/recent-files",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const root =
					typeof req.query.root === "string"
						? req.query.root
						: defaultWorkspaceDir;
				const limit = Math.min(Number(req.query.limit) || 20, 50);

				const collectFiles = async (
					dir: string,
				): Promise<
					Array<{
						name: string;
						path: string;
						relativePath: string;
						modifiedAt: number;
						extension: string;
						size: number | null;
					}>
				> => {
					const entries = await fileManager.listDirectoryEntries(dir, root);
					const files: Array<{
						name: string;
						path: string;
						relativePath: string;
						modifiedAt: number;
						extension: string;
						size: number | null;
					}> = [];
					for (const entry of entries) {
						if (entry.kind === "file") {
							files.push(entry);
						} else if (entry.kind === "directory") {
							const childFiles = await collectFiles(entry.path);
							files.push(...childFiles);
						}
					}
					return files;
				};

				const allFiles = await collectFiles(root);
				allFiles.sort((a, b) => b.modifiedAt - a.modifiedAt);

				res.json({ files: allFiles.slice(0, limit) });
			} catch (error) {
				next(error);
			}
		},
	);

	router.get(
		"/api/files/search",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const searchQuerySchema = z.object({
					root: z.string().optional(),
					path: z.string().optional(),
					q: z.string().min(1).max(200),
					limit: z.coerce.number().int().min(1).max(100).optional(),
				});
				const parsed = searchQuerySchema.parse(req.query ?? {});
				const searchQueryStr = parsed.q;
				const limit = parsed.limit ?? 50;

				const { rootPath } = await fileManager.resolveManagedFileLocation({
					root: parsed.root,
					fallbackToRoot: true,
				});

				const results: FileTreeEntry[] = [];
				const queryLower = searchQueryStr.toLowerCase();

				const searchDir = async (dir: string, depth: number): Promise<void> => {
					if (results.length >= limit || depth > 10) return;
					const entries = await fileManager.listDirectoryEntries(dir, rootPath);
					for (const entry of entries) {
						if (results.length >= limit) return;
						if (entry.name.toLowerCase().includes(queryLower)) {
							results.push(entry);
						}
						if (entry.kind === "directory") {
							await searchDir(entry.path, depth + 1);
						}
					}
				};

				await searchDir(rootPath, 0);
				res.json({ entries: results });
			} catch (error) {
				next(error);
			}
		},
	);

	return router;
}
