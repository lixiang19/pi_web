import {
	type NextFunction,
	type Request,
	type Response,
	Router,
} from "express";

export interface CoreDeps {
	app: unknown;
	defaultWorkspaceDir: string;
	resolveDiscoveryCwd: (value: unknown) => string;
	listProviders: () => unknown;
	discoverAgents: (
		cwd: string,
	) => Promise<
		Array<{ enabled?: boolean; mode: string; [key: string]: unknown }>
	>;
	createAgentSummary: (agent: unknown) => unknown;
	createAgentConfigResponse: (agent: unknown) => unknown;
	getAgentByName: (
		cwd: string,
		name: string,
		scope?: string,
	) => Promise<unknown>;
	saveAgent: (
		cwd: string,
		name: string,
		payload: unknown,
		opts: unknown,
	) => Promise<unknown>;
	deleteAgent: (cwd: string, name: string, scope: string) => Promise<string>;
	getAutomationStore: () => {
		listRules: () => unknown[];
		createRule: (data: unknown) => unknown;
		updateRule: (id: string, data: unknown) => unknown | null;
		getRule: (id: string) => unknown | null;
		removeRule: (id: string) => unknown | null;
	};
	automationScheduler: { reschedule: () => void } | null;
	dispatchAutomationRule: (rule: unknown) => Promise<{ sessionId: string }>;
	ensureManagedProjectScope: (path: string) => Promise<unknown>;
	ensureSessionRecord: (sessionId: string) => Promise<unknown>;
	buildResourceCatalog: (session: unknown, resourceLoader: unknown) => unknown;
	createTransientCatalogSession: (
		cwd: string,
	) => Promise<{ session: unknown; resourceLoader: unknown }>;
	fileManager: {
		resolveManagedFileLocation: (
			opts: unknown,
		) => Promise<{ rootPath: string; targetPath: string }>;
		listDirectoryEntries: (
			dir: string,
			root: string,
		) => Promise<Array<{ kind: string; path: string; [key: string]: unknown }>>;
	};
	normalizeString: (value: unknown) => string;
	toPosixPath: (p: string) => string;
	agentScopeQuerySchema: { parse: (data: unknown) => unknown };
	agentUpsertSchema: { parse: (data: unknown) => unknown };
	automationRuleInputSchema: { parse: (data: unknown) => unknown };
	automationRulePatchSchema: { parse: (data: unknown) => unknown };
	automationToggleSchema: { parse: (data: unknown) => unknown };
	resourceCatalogQuerySchema: { parse: (data: unknown) => unknown };
	fileTreeQuerySchema: { parse: (data: unknown) => unknown };
}

export function createCoreRouter(deps: CoreDeps) {
	const router = Router();

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
	});

	return router;
}
