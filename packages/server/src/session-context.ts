// Session lifecycle context
// Auto-extracted from index.ts

export const closeClients = (record: SessionRecord): void => {
	for (const client of record.clients) {
		try {
			client.end();
		} catch {
			// noop
		}
	}
	record.clients.clear();
};

export const getInteractiveRequests = (
	record: SessionRecord,
): AskInteractiveRequest[] =>
	[...record.pendingAskRecords.values()].map((pendingAsk) => ({
		id: pendingAsk.id,
		toolCallId: pendingAsk.toolCallId,
		title: pendingAsk.title,
		message: pendingAsk.message,
		questions: pendingAsk.questions,
		createdAt: pendingAsk.createdAt,
	}));

export const getPermissionRequests = (
	record: SessionRecord,
): PermissionInteractiveRequest[] =>
	[...record.pendingPermissionRecords.values()].map((pendingRequest) => ({
		id: pendingRequest.id,
		toolCallId: pendingRequest.toolCallId,
		toolName: pendingRequest.toolName,
		permissionKey: pendingRequest.permissionKey,
		title: pendingRequest.title,
		message: pendingRequest.message,
		subject: pendingRequest.subject,
		suggestedPattern: pendingRequest.suggestedPattern,
		createdAt: pendingRequest.createdAt,
	}));

export const appendRuntimePermissionRule = (
	record: SessionRecord,
	permissionKey: LogicalPermissionKey,
	rule: PermissionRule,
): void => {
	record.runtimePermissionRules = {
		...record.runtimePermissionRules,
		[permissionKey]: [
			...(record.runtimePermissionRules[permissionKey] || []),
			rule,
		],
	};
};

export const requestPendingPermission = async (
	record: SessionRecord,
	request: PermissionInteractiveRequest,
): Promise<PermissionDecisionAction> =>
	await new Promise<PermissionDecisionAction>((resolve, reject) => {
		const pendingRequest: PendingPermissionRecord = {
			...request,
			resolve,
			reject,
		};
		record.pendingPermissionRecords.set(request.id, pendingRequest);
		void emitSessionSnapshot(record);
	});

export const emitSessionSnapshot = async (
	record: SessionRecord,
): Promise<void> => {
	const messagesPayload = toSessionMessagesPayload(record, {});
	emit(record, {
		type: "snapshot",
		sessionId: record.id,
		status: record.status,
		messages: messagesPayload.messages,
		historyMeta: messagesPayload.historyMeta,
		interactiveRequests: messagesPayload.interactiveRequests,
		permissionRequests: messagesPayload.permissionRequests,
	});
};

export const normalizeAskAnswers = (
	record: SessionRecord,
	askId: string,
	answers: AskQuestionAnswer[],
): AskQuestionAnswer[] => {
	const pendingAsk = record.pendingAskRecords.get(askId);
	if (!pendingAsk) {
		const error = new Error(`Ask 不存在: ${askId}`) as HttpError;
		error.statusCode = 404;
		throw error;
	}

	const providedAnswers = new Map<string, string[]>();
	for (const answer of answers) {
		const questionId = normalizeString(answer.questionId);
		const values = [
			...new Set(
				answer.values.map((value) => normalizeString(value)).filter(Boolean),
			),
		];
		if (!questionId || values.length === 0) {
			continue;
		}
		providedAnswers.set(questionId, values);
	}

	const normalizedAnswers: AskQuestionAnswer[] = [];
	for (const question of pendingAsk.questions) {
		const values = providedAnswers.get(question.id) || [];
		if (values.length === 0) {
			const error = new Error(`问题未回答: ${question.question}`) as HttpError;
			error.statusCode = 400;
			throw error;
		}

		if (!question.multiple && values.length > 1) {
			const error = new Error(
				`问题不允许多选: ${question.question}`,
			) as HttpError;
			error.statusCode = 400;
			throw error;
		}

		const optionLabels = new Set(
			(question.options || []).map((option) => option.label),
		);
		const normalizedValues = values.filter((value) => {
			if (optionLabels.size === 0) {
				return true;
			}
			if (optionLabels.has(value)) {
				return true;
			}
			return question.allowCustom === true;
		});

		if (normalizedValues.length === 0) {
			const error = new Error(
				`问题答案非法: ${question.question}`,
			) as HttpError;
			error.statusCode = 400;
			throw error;
		}

		normalizedAnswers.push({
			questionId: question.id,
			values: normalizedValues,
		});
	}

	return normalizedAnswers;
};

export const settlePendingAsk = async (
	record: SessionRecord,
	askId: string,
	answers: AskQuestionAnswer[],
	dismissed: boolean,
): Promise<void> => {
	const pendingAsk = record.pendingAskRecords.get(askId);
	if (!pendingAsk) {
		const error = new Error(`Ask 不存在: ${askId}`) as HttpError;
		error.statusCode = 404;
		throw error;
	}

	record.pendingAskRecords.delete(askId);
	await emitSessionSnapshot(record);
	pendingAsk.resolve(buildResolvedAskResult(pendingAsk, answers, dismissed));
};

export const cancelPendingAsks = (
	record: SessionRecord,
	reason: string,
): void => {
	const pendingAsks = [...record.pendingAskRecords.values()];
	record.pendingAskRecords.clear();
	for (const pendingAsk of pendingAsks) {
		pendingAsk.reject(new Error(reason));
	}
};

export const settlePendingPermission = async (
	record: SessionRecord,
	requestId: string,
	action: PermissionDecisionAction,
): Promise<void> => {
	const pendingRequest = record.pendingPermissionRecords.get(requestId);
	if (!pendingRequest) {
		const error = new Error(
			`Permission request 不存在: ${requestId}`,
		) as HttpError;
		error.statusCode = 404;
		throw error;
	}

	if (action === "always" && !pendingRequest.suggestedPattern) {
		const error = new Error(
			`Permission request 缺少 suggestedPattern: ${requestId}`,
		) as HttpError;
		error.statusCode = 400;
		throw error;
	}

	record.pendingPermissionRecords.delete(requestId);

	await emitSessionSnapshot(record);
	pendingRequest.resolve(action);
};

export const cancelPendingPermissions = (
	record: SessionRecord,
	reason: string,
): void => {
	const pendingRequests = [...record.pendingPermissionRecords.values()];
	record.pendingPermissionRecords.clear();
	for (const pendingRequest of pendingRequests) {
		pendingRequest.reject(new Error(reason));
	}
};

export const serializeProject = (project: Project): Project => ({
	...project,
	path: toPosixPath(path.resolve(project.path)),
});

export type RawMessageContent = string | Array<Record<string, unknown>>;

export const passthroughContent = (content: unknown): RawMessageContent => {
	if (typeof content === "string") {
		return content;
	}

	if (!Array.isArray(content)) {
		return [];
	}

	return content.map((item) =>
		item && typeof item === "object" ? (item as Record<string, unknown>) : {},
	);
};

export const serializeMessage = (
	message:
		| {
				role?: string;
				content?: unknown;
				timestamp?: number;
				toolCallId?: unknown;
				toolName?: unknown;
				details?: unknown;
				isError?: unknown;
		  }
		| undefined,
): SessionMessagesPayload["messages"][number] =>
	({
		role: (normalizeString(message?.role) ||
			"system") as SessionMessagesPayload["messages"][number]["role"],
		content: passthroughContent(message?.content),
		timestamp:
			typeof message?.timestamp === "number" ? message.timestamp : undefined,
		toolCallId: normalizeString(message?.toolCallId) || undefined,
		toolName: normalizeString(message?.toolName) || undefined,
		details: message?.details,
		isError: message?.isError === true ? true : undefined,
	}) as SessionMessagesPayload["messages"][number];

export const getAvailableModels = (): Model<Api>[] => {
	modelRegistry.refresh();
	return [...modelRegistry.getAvailable()];
};

export const findModel = (
	modelSpec: string | undefined | null,
): Model<Api> | null => {
	const normalized = normalizeString(modelSpec);
	if (!normalized) {
		return null;
	}

	return (
		getAvailableModels().find(
			(model) => `${model.provider}/${model.id}` === normalized,
		) || null
	);
};

export const formatModelSpec = (
	model: Model<Api> | null | undefined,
): string | undefined => {
	if (!model?.provider || !model?.id) {
		return undefined;
	}
	return `${model.provider}/${model.id}`;
};

export interface SourceInfoOut {
	path: string;
	source: string;
	scope: ResourceSourceInfo["scope"];
	origin: ResourceSourceInfo["origin"];
	baseDir?: string;
}

export const toSourceInfo = (
	sourceInfo: unknown,
): SourceInfoOut | undefined => {
	if (!sourceInfo || typeof sourceInfo !== "object") {
		return undefined;
	}
	const typed = sourceInfo as Record<string, unknown>;
	const scope = normalizeString(typed.scope);
	if (scope !== "user" && scope !== "project" && scope !== "temporary") {
		return undefined;
	}
	const origin = normalizeString(typed.origin);
	if (origin !== "package" && origin !== "top-level") {
		return undefined;
	}
	const result: SourceInfoOut = {
		path: toPosixPath(path.resolve(String(typed.path))),
		source: String(typed.source),
		scope,
		origin,
	};
	if (typed.baseDir) {
		result.baseDir = toPosixPath(path.resolve(String(typed.baseDir)));
	}
	return result;
};

export const listProviders = (): ProvidersResponse => {
	const grouped = new Map<string, ProviderInfo>();

	for (const model of getAvailableModels()) {
		if (!grouped.has(model.provider)) {
			grouped.set(model.provider, {
				id: model.provider,
				name: model.provider
					.split(/[-_/]+/)
					.filter(Boolean)
					.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
					.join(" "),
				models: {},
			});
		}

		grouped.get(model.provider)!.models[model.id] = {
			id: model.id,
			name: model.name || model.id,
			reasoning: model.reasoning === true,
		};
	}

	const firstAvailable = getAvailableModels()[0];

	return {
		providers: [...grouped.values()],
		default: {
			chat: firstAvailable
				? `${firstAvailable.provider}/${firstAvailable.id}`
				: undefined,
		},
	};
};

export const serializeAgentSource = (agent: AgentConfigInternal): string =>
	agent.sourceScope === "default"
		? agent.source
		: toPosixPath(path.resolve(agent.source));
export const createAgentSummary = (
	agent: AgentConfigInternal,
): AgentSummary => ({
	name: agent.name,
	description: agent.description,
	displayName: agent.displayName,
	mode: agent.mode,
	model: agent.model,
	thinking: agent.thinking,
	maxTurns: agent.maxTurns,
	graceTurns: agent.graceTurns,
	skills: agent.skills,
	inheritContext: agent.inheritContext,
	runInBackground: agent.runInBackground,
	enabled: agent.enabled !== false,
	permission: agent.permission as Record<string, unknown> | undefined,
	sourceScope: agent.sourceScope,
	source: serializeAgentSource(agent),
});

export const createAgentConfigResponse = (agent: AgentConfigInternal) => ({
	name: agent.name,
	description: agent.description,
	display_name: agent.displayName,
	mode: agent.mode,
	model: agent.model ?? null,
	thinking: agent.thinking ?? null,
	max_turns: agent.maxTurns ?? null,
	grace_turns: agent.graceTurns ?? null,
	skills: agent.skills ?? null,
	inherit_context: agent.inheritContext ?? null,
	run_in_background: agent.runInBackground ?? null,
	enabled: agent.enabled !== false,
	permission: agent.permission,
	prompt: agent.systemPrompt,
	scope: agent.sourceScope,
	source: serializeAgentSource(agent),
});

export const createSessionResourceLoader = (record: SessionRecord) =>
	new DefaultResourceLoader({
		cwd: record.cwd,
		agentDir: getPiAgentScopeAgentDir(),
		settingsManager: createPiAgentScopeSettingsManager(record.cwd),
		appendSystemPromptOverride: (base: string[]) => {
			const sections = [...base];
			const systemPrompt = normalizeString(
				record.selectedAgentConfig?.systemPrompt,
			);
			if (systemPrompt) {
				sections.push(systemPrompt);
			}
			return sections;
		},
		extensionFactories: [
			createPermissionGateExtension(() => record.selectedPermissionPolicy, {
				getRuntimeRules: () => record.runtimePermissionRules,
				onGrantAlways: (permissionKey, pattern) => {
					appendRuntimePermissionRule(record, permissionKey, {
						pattern,
						action: "allow",
					});
				},
				requestPermission: async (request) => {
					updateStatus(record, "streaming");
					return await requestPendingPermission(record, request);
				},
			}),
			createAskExtension(record, {
				onPendingAskChange: async (sessionRecord) => {
					updateStatus(sessionRecord, "streaming");
					await emitSessionSnapshot(sessionRecord);
				},
			}),
			createSubagentToolExtension(record, {
				authStorage,
				modelRegistry,
				resolveModel: findModel,
			}),
		],
	});

export const isEnabledAgent = (
	agent: AgentConfigInternal | null | undefined,
): boolean => Boolean(agent && agent.enabled !== false);
export const isPrimarySessionAgent = (
	agent: AgentConfigInternal | null | undefined,
): boolean => Boolean(isEnabledAgent(agent) && agent!.mode !== "task");
export const ensurePrimaryAgentOrThrow = (
	agentName: string | null | undefined,
	agent: AgentConfigInternal | null | undefined,
): AgentConfigInternal | null => {
	if (!agentName) {
		return null;
	}
	if (!agent) {
		const error = new Error(`Agent 不存在: ${agentName}`) as HttpError;
		error.statusCode = 404;
		throw error;
	}

	if (!isEnabledAgent(agent)) {
		const error = new Error(`Agent 已禁用: ${agentName}`) as HttpError;
		error.statusCode = 400;
		throw error;
	}
	if (!isPrimarySessionAgent(agent)) {
		const error = new Error(
			`Agent ${agentName} 仅允许 task 模式调用`,
		) as HttpError;
		error.statusCode = 400;
		throw error;
	}
	return agent;
};

export interface SessionSelectionInput {
	agentName?: string;
	model?: string;
	thinkingLevel?: ThinkingLevel | null;
}

export const applySessionAgentSelection = async (
	record: SessionRecord,
	selection: SessionSelectionInput,
): Promise<void> => {
	const selectedAgentName = normalizeString(selection.agentName) || "";
	const agents = await discoverAgents(record.cwd);
	const agent = selectedAgentName
		? ensurePrimaryAgentOrThrow(
				selectedAgentName,
				agents.find((item) => item.name === selectedAgentName),
			)
		: null;

	const nextSignature = getAgentConfigSignature(agent);
	const shouldReload = nextSignature !== record.selectedAgentSignature;

	record.selectedAgentName = agent?.name || undefined;
	record.selectedAgentConfig = agent || null;
	record.selectedAgentSignature = nextSignature;
	record.selectedPermissionPolicy = compileAgentPermission(
		record.cwd,
		agent?.permission as AgentPermission | undefined,
		record.defaultToolNames,
	);
	if (shouldReload || record.turnBudget.maxTurns !== agent?.maxTurns) {
		record.turnBudget = {
			maxTurns: agent?.maxTurns,
			usedTurns: 0,
			exhausted: false,
		};
	}

	if (shouldReload) {
		await record.resourceLoader.reload();
		await record.session.reload();
	}

	await record.session.setActiveToolsByName(
		record.selectedPermissionPolicy.activeToolNames,
	);

	const nextExplicitModel =
		selection.model !== undefined
			? normalizeString(selection.model) || undefined
			: record.explicitModelSpec;
	if (
		selection.model !== undefined &&
		nextExplicitModel &&
		!findModel(nextExplicitModel)
	) {
		const error = new Error(`模型不存在: ${nextExplicitModel}`) as HttpError;
		error.statusCode = 400;
		throw error;
	}
	record.explicitModelSpec = nextExplicitModel;

	const chosenModel =
		findModel(record.explicitModelSpec) ||
		findModel(agent?.model) ||
		record.session.model ||
		null;
	if (chosenModel) {
		await record.session.setModel(chosenModel);
	}
	record.resolvedModelSpec = formatModelSpec(
		record.session.model || chosenModel,
	);

	const nextExplicitThinking =
		selection.thinkingLevel !== undefined
			? normalizeThinkingLevel(selection.thinkingLevel)
			: record.explicitThinkingLevel;
	if (
		selection.thinkingLevel !== undefined &&
		selection.thinkingLevel !== null &&
		!nextExplicitThinking
	) {
		const error = new Error(
			`thinkingLevel 非法: ${selection.thinkingLevel}`,
		) as HttpError;
		error.statusCode = 400;
		throw error;
	}
	record.explicitThinkingLevel = nextExplicitThinking;

	const thinking =
		record.explicitThinkingLevel ||
		normalizeThinkingLevel(agent?.thinking) ||
		normalizeThinkingLevel(record.session.thinkingLevel);
	if (thinking) {
		await record.session.setThinkingLevel(thinking);
	}
	record.resolvedThinkingLevel =
		normalizeThinkingLevel(record.session.thinkingLevel) || thinking;
};

export const restoreSessionSelection = async (
	record: SessionRecord,
): Promise<void> => {
	const metadata = await sessionMetadataStore.getSessionMetadata(record.id);
	const selectedAgentName = normalizeString(metadata.agent);
	const explicitModelSpec = normalizeString(metadata.model) || undefined;
	const explicitThinkingLevel = normalizeThinkingLevel(metadata.thinkingLevel);

	record.explicitModelSpec = explicitModelSpec;
	record.explicitThinkingLevel = explicitThinkingLevel;

	try {
		await applySessionAgentSelection(record, {
			agentName: selectedAgentName,
			model: explicitModelSpec,
			thinkingLevel: explicitThinkingLevel,
		});
	} catch {
		record.explicitModelSpec = undefined;
		record.explicitThinkingLevel = undefined;
		await sessionMetadataStore.setSelection(record.id, {
			agent: undefined,
			model: undefined,
			thinkingLevel: undefined,
		});
	}
};

export const emit = (record: SessionRecord, payload: unknown): void => {
	const data = `data: ${JSON.stringify(payload)}\n\n`;
	for (const client of record.clients) {
		client.write(data);
	}
};

export const updateStatus = (
	record: SessionRecord,
	nextStatus: SessionRecord["status"],
): void => {
	const hasPendingInteractive =
		record.pendingAskRecords.size > 0 ||
		record.pendingPermissionRecords.size > 0;
	const resolvedStatus =
		nextStatus === "idle" && hasPendingInteractive ? "streaming" : nextStatus;
	record.status = resolvedStatus;
	record.updatedAt = Date.now();
	emit(record, { type: "status", status: resolvedStatus });
};

export const shouldForwardSessionEvent = (
	event: AgentSessionEvent,
): boolean => {
	if (
		(event.type === "message_start" || event.type === "message_end") &&
		event.message?.role === "user"
	) {
		return false;
	}

	return true;
};

export const bindSessionRuntime = (record: SessionRecord): (() => void) =>
	record.session.subscribe((event) => {
		if (shouldForwardSessionEvent(event)) {
			emit(record, event);
		}

		if (event.type === "message_end") {
			record.updatedAt = event.message?.timestamp ?? Date.now();
		}

		if (event.type !== "turn_end") {
			return;
		}

		updateStatus(record, "idle");
		void emitSessionSnapshot(record);
	});

export interface CreateActiveSessionRecordParams {
	stateRef?: Partial<SessionRecord>;
	session: AgentSession;
	settingsManager: SettingsManager;
	resourceLoader: DefaultResourceLoader;
	createdAt: number;
	updatedAt: number;
}

export const createActiveSessionRecord = ({
	stateRef,
	session,
	settingsManager,
	resourceLoader,
	createdAt,
	updatedAt,
}: CreateActiveSessionRecordParams): SessionRecord => {
	const record: SessionRecord = Object.assign(stateRef || {}, {
		id: session.sessionId,
		sessionFile: session.sessionFile,
		parentSessionPath: undefined as string | undefined,
		cwd: session.sessionManager.getCwd(),
		status: "idle" as const,
		createdAt,
		updatedAt,
		session,
		settingsManager,
		resourceLoader,
		unsubscribe: null as (() => void) | null,
		clients: new Set<ServerResponse>(),
		defaultToolNames: [...session.getActiveToolNames()],
		pendingAskRecords: stateRef?.pendingAskRecords || new Map(),
		pendingPermissionRecords: stateRef?.pendingPermissionRecords || new Map(),
		runtimePermissionRules: stateRef?.runtimePermissionRules || {},
		selectedAgentName: undefined as string | undefined,
		selectedAgentConfig: null as AgentConfigInternal | null,
		selectedAgentSignature: "",
		explicitModelSpec: undefined as string | undefined,
		explicitThinkingLevel: undefined as ThinkingLevel | undefined,
		resolvedModelSpec: formatModelSpec(session.model),
		resolvedThinkingLevel: normalizeThinkingLevel(session.thinkingLevel),
		selectedPermissionPolicy: null as ReturnType<
			typeof compileAgentPermission
		> | null,
		turnBudget: {
			maxTurns: undefined as number | undefined,
			usedTurns: 0,
			exhausted: false,
		},
	}) as SessionRecord;
	activeSessions.set(record.id, record);
	record.unsubscribe = bindSessionRuntime(record);
	return record;
};

export interface CreateSessionRecordParams {
	cwd: string;
	title?: string;
	model?: string;
	parentSessionPath?: string;
}

export const createSessionRecord = async ({
	cwd,
	title,
	model,
	parentSessionPath,
}: CreateSessionRecordParams): Promise<SessionRecord> => {
	const sessionManager = SessionManager.create(cwd);
	if (parentSessionPath) {
		sessionManager.newSession({ parentSession: parentSessionPath });
	}

	const settingsManager = createPiAgentScopeSettingsManager(cwd);
	const recordState: Partial<SessionRecord> = {
		cwd,
		settingsManager,
		pendingAskRecords: new Map(),
		pendingPermissionRecords: new Map(),
		runtimePermissionRules: {},
		selectedAgentConfig: null,
		selectedPermissionPolicy: null,
	};
	const resourceLoader = createSessionResourceLoader(
		recordState as SessionRecord,
	);
	await resourceLoader.reload();
	const { session } = await createAgentSession({
		cwd,
		authStorage,
		modelRegistry,
		sessionManager,
		settingsManager,
		resourceLoader,
	});

	const chosenModel = findModel(model || "");
	if (chosenModel) {
		await session.setModel(chosenModel);
	}

	if (normalizeString(title)) {
		session.setSessionName(normalizeString(title));
	}

	const now = Date.now();
	const record = createActiveSessionRecord({
		stateRef: recordState,
		session,
		settingsManager,
		resourceLoader,
		createdAt: now,
		updatedAt: now,
	});
	record.parentSessionPath = parentSessionPath;
	await persistSessionRecordMetadata(record);

	return record;
};

export const destroySessionRecord = (record: SessionRecord): void => {
	cancelPendingAsks(record, "Session closed");
	cancelPendingPermissions(record, "Session closed");
	record.unsubscribe?.();
	closeClients(record);
	activeSessions.delete(record.id);
	openingSessionRecords.delete(record.id);
};

export const persistSessionRecordMetadata = async (
	record: SessionRecord,
): Promise<void> => {
	if (!record.sessionFile) {
		return;
	}
	await sessionMetadataStore.upsertSession({
		id: record.id,
		title: normalizeString(record.session.sessionName) || "新会话",
		cwd: normalizeFsPath(record.cwd || defaultWorkspaceDir),
		sessionFile: path.resolve(record.sessionFile),
		parentSessionPath: record.parentSessionPath,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
		agent: record.selectedAgentName,
		model: record.explicitModelSpec,
		thinkingLevel: record.explicitThinkingLevel,
	});
};

export type ProjectContextInfo = Awaited<
	ReturnType<ReturnType<typeof createProjectContextResolver>["resolveContext"]>
>;

export interface ManagedProjectScope {
	project: Project;
	allowedRoots: string[];
	projectContext: ProjectContextInfo;
}

export const buildManagedProjectScopes = async (): Promise<
	ManagedProjectScope[]
> => {
	const state = await getProjects();
	const managedProjects = [
		createWorkspaceChatProject(workspaceChatConfig),
		...state.projects,
	];
	return Promise.all(
		managedProjects.map(async (project) => {
			const normalizedPath = normalizeFsPath(project.path);
			const projectContext =
				await projectContextResolver.resolveContext(normalizedPath);
			const declaredRoots = [
				normalizedPath,
				normalizeFsPath(projectContext.projectRoot),
			];

			for (const worktree of projectContext.worktrees) {
				declaredRoots.push(normalizeFsPath(worktree.path));
			}

			const allowedRoots = new Set<string>();
			for (const declaredRoot of declaredRoots) {
				allowedRoots.add(declaredRoot);
				allowedRoots.add(await resolveExistingRealPath(declaredRoot));
			}

			return {
				project: {
					...project,
					path: normalizedPath,
				},
				allowedRoots: [...allowedRoots],
				projectContext,
			};
		}),
	);
};

export const resolveManagedProjectScope = (
	candidatePath: string,
	scopes: ManagedProjectScope[],
): ManagedProjectScope | null => {
	let matchedScope: ManagedProjectScope | null = null;
	let matchedRootLength = -1;

	for (const scope of scopes) {
		for (const root of scope.allowedRoots) {
			if (!isPathInsideRoot(candidatePath, root)) {
				continue;
			}

			if (root.length > matchedRootLength) {
				matchedScope = scope;
				matchedRootLength = root.length;
			}
		}
	}

	return matchedScope;
};

export const ensureManagedProjectScope = async (
	candidatePath: string,
	scopes?: ManagedProjectScope[],
): Promise<ManagedProjectScope> => {
	const resolvedScopes = scopes ?? (await buildManagedProjectScopes());
	const scope = resolveManagedProjectScope(candidatePath, resolvedScopes);
	if (scope) {
		return scope;
	}

	const error = new Error(
		"Requested path is outside managed project scopes",
	) as HttpError;
	error.statusCode = 400;
	throw error;
};
