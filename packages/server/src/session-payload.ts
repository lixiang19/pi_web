// Session payload builders and utilities
// Auto-extracted from index.ts

export const fileManager = createFileManager({
	defaultWorkspaceDir,
	ensureManagedProjectScope: async (candidatePath) => {
		await ensureManagedProjectScope(candidatePath);
	},
});

export const getAutomationStore = (): AutomationStore => {
	if (!automationStore) {
		const error = new Error("自动化服务尚未初始化") as HttpError;
		error.statusCode = 503;
		throw error;
	}

	return automationStore;
};

export const dispatchAutomationRule = async (
	rule: AutomationRule,
): Promise<{ sessionId: string }> => {
	await ensureManagedProjectScope(rule.cwd);
	const record = await createSessionRecord({
		cwd: rule.cwd,
		title: rule.name,
		model: rule.model,
	});
	await applySessionAgentSelection(record, {
		agentName: rule.agent,
		model: rule.model,
		thinkingLevel: rule.thinkingLevel,
	});
	await persistSessionRecordMetadata(record);
	await upsertIndexedSessionRecord(record, {
		projectContextResolver,
		workspaceChatConfig,
	});

	updateStatus(record, "streaming");
	void record.session
		.prompt(rule.prompt, { source: "interactive" })
		.catch((error: unknown) => {
			record.status = "error";
			emit(record, {
				type: "error",
				error: error instanceof Error ? error.message : String(error),
			});
		});

	return { sessionId: record.id };
};

export const resolveTerminalCwd = async (value: unknown): Promise<string> => {
	const candidatePath = normalizeOptionalFsPath(value) || defaultWorkspaceDir;
	const resolvedCandidatePath = await resolveExistingRealPath(candidatePath);
	const stats = await fs.stat(resolvedCandidatePath).catch(() => null);

	if (!stats?.isDirectory()) {
		const error = new Error(
			"Terminal cwd must be an existing directory",
		) as HttpError;
		error.statusCode = 400;
		throw error;
	}

	const resolvedDefaultWorkspaceDir =
		await resolveExistingRealPath(defaultWorkspaceDir);
	if (!isPathInsideRoot(resolvedCandidatePath, resolvedDefaultWorkspaceDir)) {
		await ensureManagedProjectScope(resolvedCandidatePath);
	}

	return resolvedCandidatePath;
};

export const terminalManager = createTerminalManager({
	defaultCwd: defaultWorkspaceDir,
	resolveCwd: resolveTerminalCwd,
});

export interface ToSessionSnapshotOptions {
	rounds?: number;
}

export const getUserMessageIndexes = (messages: AgentMessage[]): number[] => {
	const indexes: number[] = [];
	for (const [index, message] of messages.entries()) {
		if (message && message.role === "user") {
			indexes.push(index);
		}
	}
	return indexes;
};

export const buildSessionMessagesPayload = (
	sessionId: string,
	allMessages: AgentMessage[],
	options: ToSessionSnapshotOptions = {},
	interactiveRequests: AskInteractiveRequest[] = [],
	permissionRequests: PermissionInteractiveRequest[] = [],
): SessionMessagesPayload => {
	const userMessageIndexes = getUserMessageIndexes(allMessages);
	const totalRounds = userMessageIndexes.length;
	const requestedRounds = Number.isInteger(options.rounds)
		? Math.max(1, options.rounds!)
		: DEFAULT_SESSION_ROUND_WINDOW;
	let visibleMessages = allMessages;
	let loadedRounds = totalRounds;
	let hasMoreAbove = false;
	if (totalRounds > 0) {
		const startRoundIndex = Math.max(0, totalRounds - requestedRounds);
		const startMessageIndex =
			startRoundIndex === 0 ? 0 : userMessageIndexes[startRoundIndex]!;
		visibleMessages = allMessages.slice(startMessageIndex);
		loadedRounds = totalRounds - startRoundIndex;
		hasMoreAbove = startRoundIndex > 0;
	}
	return {
		sessionId,
		messages: visibleMessages.map((message) => serializeMessage(message)),
		historyMeta: {
			loadedRounds,
			totalRounds,
			hasMoreAbove,
			roundWindow: Math.max(requestedRounds, loadedRounds || requestedRounds),
		},
		interactiveRequests,
		permissionRequests,
	};
};

export const getRequestedRoundCount = (
	options: ToSessionSnapshotOptions = {},
) =>
	Number.isInteger(options.rounds)
		? Math.max(1, options.rounds!)
		: DEFAULT_SESSION_ROUND_WINDOW;

export const parseStoredSessionMessageLine = (
	line: string,
): AgentMessage | null => {
	const trimmedLine = line.trim();
	if (!trimmedLine) {
		return null;
	}

	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(trimmedLine) as Record<string, unknown>;
	} catch {
		return null;
	}

	if (parsed.type !== "message") {
		return null;
	}

	const message = parsed.message;
	return message && typeof message === "object"
		? (message as AgentMessage)
		: null;
};

export const buildSessionSummaryFromIndex = (
	record: SessionRecord,
	lookup: IndexedSessionLookup,
	context: IndexedSessionContextSummary | null,
): SessionSummary => ({
	id: record.id,
	title:
		normalizeString(record.session.sessionName) || lookup.title || "新会话",
	cwd: record.cwd,
	status: record.status,
	createdAt: lookup.createdAt,
	updatedAt: Math.max(lookup.updatedAt, record.updatedAt),
	archived: lookup.archived,
	agent: record.selectedAgentName,
	model: record.explicitModelSpec,
	thinkingLevel: record.explicitThinkingLevel,
	resolvedModel: record.resolvedModelSpec,
	resolvedThinkingLevel: record.resolvedThinkingLevel,
	sessionFile: toPosixPath(record.sessionFile || ""),
	parentSessionId: lookup.parentSessionId,
	contextId: lookup.contextId,
	projectId: context?.projectId || "",
	projectRoot: context?.projectRoot || "",
	projectLabel: context?.projectLabel || "",
	isGit: context?.isGit || false,
	branch: context?.branch,
	worktreeRoot: context?.worktreeRoot || "",
	worktreeLabel: context?.worktreeLabel || "",
});

export const resolveSessionSummary = async (
	record: SessionRecord,
): Promise<SessionSummary> => {
	const lookup = await getIndexedSessionLookup(record.id);
	if (lookup) {
		const context = lookup.contextId
			? await getIndexedSessionContext(lookup.contextId)
			: null;
		return buildSessionSummaryFromIndex(record, lookup, context);
	}

	const fallbackProjectScope = await ensureManagedProjectScope(record.cwd);
	const fallbackProjectContext = await projectContextResolver.resolveContext(
		record.cwd,
	);
	return {
		id: record.id,
		title: normalizeString(record.session.sessionName) || "新会话",
		cwd: record.cwd,
		status: record.status,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
		archived: false,
		agent: record.selectedAgentName,
		model: record.explicitModelSpec,
		thinkingLevel: record.explicitThinkingLevel,
		resolvedModel: record.resolvedModelSpec,
		resolvedThinkingLevel: record.resolvedThinkingLevel,
		sessionFile: toPosixPath(record.sessionFile || ""),
		parentSessionId: undefined,
		contextId: undefined,
		projectId: fallbackProjectScope.project.id,
		projectRoot: toPosixPath(path.resolve(fallbackProjectScope.project.path)),
		projectLabel: fallbackProjectScope.project.name,
		isGit: fallbackProjectContext.isGit,
		branch: fallbackProjectContext.branch,
		worktreeRoot: toPosixPath(fallbackProjectContext.worktreeRoot),
		worktreeLabel: fallbackProjectContext.worktreeLabel,
	};
};
export const toSessionMessagesPayload = (
	record: SessionRecord,
	options: ToSessionSnapshotOptions = {},
): SessionMessagesPayload => {
	return buildSessionMessagesPayload(
		record.id,
		record.session.messages,
		options,
		getInteractiveRequests(record),
		getPermissionRequests(record),
	);
};

export const readAllStoredSessionMessages = async (
	sessionFile: string,
): Promise<AgentMessage[]> => {
	const content = await fs.readFile(sessionFile, "utf8");
	const messages: AgentMessage[] = [];
	for (const line of content.split(/\r?\n/)) {
		const message = parseStoredSessionMessageLine(line);
		if (message) {
			messages.push(message);
		}
	}
	return messages;
};

export const readStoredSessionMessagesTail = async (
	sessionFile: string,
	requestedRounds: number,
): Promise<AgentMessage[]> => {
	const handle = await fs.open(sessionFile, "r");
	const collectedMessages: AgentMessage[] = [];
	let position = 0;
	let remainder = Buffer.alloc(0);
	let foundUserRounds = 0;

	try {
		const stats = await handle.stat();
		position = stats.size;

		while (position > 0 && foundUserRounds < requestedRounds) {
			const chunkSize = Math.min(64 * 1024, position);
			position -= chunkSize;

			const buffer = Buffer.allocUnsafe(chunkSize);
			const { bytesRead } = await handle.read(buffer, 0, chunkSize, position);
			const combined = remainder.length
				? Buffer.concat([buffer.subarray(0, bytesRead), remainder])
				: buffer.subarray(0, bytesRead);
			let lineEnd = combined.length;

			for (let index = combined.length - 1; index >= 0; index -= 1) {
				if (combined[index] !== 0x0a) {
					continue;
				}

				const message = parseStoredSessionMessageLine(
					combined
						.subarray(index + 1, lineEnd)
						.toString("utf8")
						.replace(/\r$/, ""),
				);
				lineEnd = index;
				if (!message) {
					continue;
				}

				collectedMessages.push(message);
				if (message.role === "user") {
					foundUserRounds += 1;
					if (foundUserRounds >= requestedRounds) {
						return collectedMessages.reverse();
					}
				}
			}

			if (position > 0) {
				remainder = combined.subarray(0, lineEnd);
				continue;
			}

			const message = parseStoredSessionMessageLine(
				combined.subarray(0, lineEnd).toString("utf8").replace(/\r$/, ""),
			);
			if (message) {
				collectedMessages.push(message);
			}
		}

		return collectedMessages.reverse();
	} finally {
		await handle.close();
	}
};

export const buildStoredSessionMessagesPayload = (
	sessionId: string,
	messages: AgentMessage[],
	totalRounds: number,
	requestedRounds: number,
): SessionMessagesPayload => {
	const loadedRounds =
		totalRounds > 0 ? Math.min(totalRounds, requestedRounds) : 0;

	return {
		sessionId,
		messages: messages.map((message) => serializeMessage(message)),
		historyMeta: {
			loadedRounds,
			totalRounds,
			hasMoreAbove: totalRounds > requestedRounds,
			roundWindow: Math.max(requestedRounds, loadedRounds || requestedRounds),
		},
		interactiveRequests: [],
		permissionRequests: [],
	};
};

export const getIndexedSessionLookupOrThrow = async (
	sessionId: string,
): Promise<IndexedSessionLookup> => {
	const lookup = await getIndexedSessionLookup(sessionId);
	if (lookup) {
		return lookup;
	}

	const error = new Error("Session not found") as HttpError;
	error.statusCode = 404;
	throw error;
};

export const getStoredSessionMessagesPayload = async (
	sessionId: string,
	options: ToSessionSnapshotOptions = {},
): Promise<SessionMessagesPayload> => {
	const lookup = await getIndexedSessionLookupOrThrow(sessionId);
	const requestedRounds = getRequestedRoundCount(options);
	const messages =
		lookup.userRoundCount > 0 && lookup.userRoundCount > requestedRounds
			? await readStoredSessionMessagesTail(lookup.sessionFile, requestedRounds)
			: await readAllStoredSessionMessages(lookup.sessionFile);

	return buildStoredSessionMessagesPayload(
		sessionId,
		messages,
		lookup.userRoundCount,
		requestedRounds,
	);
};

export const toSessionRuntimePayload = (
	record: SessionRecord,
): SessionRuntimePayload => ({
	sessionId: record.id,
	agent: record.selectedAgentName,
	model: record.explicitModelSpec || formatModelSpec(record.session.model),
	thinkingLevel:
		record.explicitThinkingLevel ||
		normalizeThinkingLevel(record.session.thinkingLevel),
	resolvedModel:
		record.resolvedModelSpec || formatModelSpec(record.session.model),
	resolvedThinkingLevel:
		record.resolvedThinkingLevel ||
		normalizeThinkingLevel(record.session.thinkingLevel),
});

export const getStoredSessionRuntimePayload = async (
	sessionId: string,
): Promise<SessionRuntimePayload> => {
	const lookup = await getIndexedSessionLookupOrThrow(sessionId);
	const thinkingLevel =
		normalizeThinkingLevel(lookup.explicitThinkingLevel) ||
		normalizeThinkingLevel(lookup.lastThinkingLevel);
	const model = lookup.explicitModel || lookup.lastModel;

	return {
		sessionId,
		agent: lookup.agent,
		model,
		thinkingLevel,
		resolvedModel: lookup.lastModel || model,
		resolvedThinkingLevel:
			normalizeThinkingLevel(lookup.lastThinkingLevel) || thinkingLevel,
	};
};
export const toSessionSnapshot = async (
	record: SessionRecord,
	options: ToSessionSnapshotOptions = {},
): Promise<SessionSnapshot> => {
	const summary = await resolveSessionSummary(record);
	const messagesPayload = toSessionMessagesPayload(record, options);

	return {
		...summary,
		messages: messagesPayload.messages,
		historyMeta: messagesPayload.historyMeta,
		interactiveRequests: messagesPayload.interactiveRequests,
		permissionRequests: messagesPayload.permissionRequests,
	};
};

export const buildResourceCatalog = (
	session: AgentSession,
	resourceLoader: DefaultResourceLoader,
): ResourceCatalogResponse => {
	const { prompts, diagnostics: promptDiagnostics } =
		resourceLoader.getPrompts();
	const { skills, diagnostics: skillDiagnostics } = resourceLoader.getSkills();
	const commands = session.extensionRunner?.getRegisteredCommands() ?? [];

	return {
		prompts: prompts.map((prompt) => ({
			name: prompt.name,
			description: prompt.description,
			content: prompt.content,
			sourceInfo: toSourceInfo(prompt.sourceInfo),
		})),
		skills: skills.map((skill) => ({
			name: skill.name,
			description: skill.description,
			invocation: `/skill:${skill.name}`,
			disableModelInvocation: skill.disableModelInvocation === true,
			sourceInfo: toSourceInfo(skill.sourceInfo),
		})),
		commands: commands.map((command) => ({
			name: command.invocationName || command.name,
			description: command.description,
			source: "extension",
			sourceInfo: toSourceInfo(command.sourceInfo),
		})),
		diagnostics: {
			prompts: promptDiagnostics.map((diagnostic) => diagnostic.message),
			skills: skillDiagnostics.map((diagnostic) => diagnostic.message),
			commands: [],
		},
	};
};

export const createTransientCatalogSession = async (cwd: string) => {
	const settingsManager = createPiAgentScopeSettingsManager(cwd);
	const agentDir = getPiAgentScopeAgentDir();
	const resourceLoader = new DefaultResourceLoader({
		cwd,
		agentDir,
		settingsManager,
	});
	await resourceLoader.reload();

	const { session } = await createAgentSession({
		cwd,
		authStorage,
		modelRegistry,
		settingsManager,
		resourceLoader,
		sessionManager: SessionManager.inMemory(cwd),
	});

	return {
		session,
		resourceLoader,
	};
};

export const ensureSessionRecord = async (
	sessionId: string,
): Promise<SessionRecord> => {
	const existing = activeSessions.get(sessionId);
	if (existing) {
		return existing;
	}

	const opening = openingSessionRecords.get(sessionId);
	if (opening) {
		return opening;
	}

	const pendingRecord = (async (): Promise<SessionRecord> => {
		const lookup = await getIndexedSessionLookupOrThrow(sessionId);
		const sessionManager = SessionManager.open(lookup.sessionFile);
		const settingsManager = createPiAgentScopeSettingsManager(lookup.cwd);
		const recordState: Partial<SessionRecord> = {
			cwd: lookup.cwd,
			pendingAskRecords: new Map(),
			pendingPermissionRecords: new Map(),
			runtimePermissionRules: {},
			settingsManager,
			selectedAgentConfig: null,
			selectedPermissionPolicy: null,
		};
		const resourceLoader = createSessionResourceLoader(
			recordState as SessionRecord,
		);
		await resourceLoader.reload();
		const { session } = await createAgentSession({
			cwd: lookup.cwd,
			authStorage,
			modelRegistry,
			sessionManager,
			settingsManager,
			resourceLoader,
		});

		const record = createActiveSessionRecord({
			stateRef: recordState,
			session,
			settingsManager,
			resourceLoader,
			createdAt: lookup.createdAt,
			updatedAt: lookup.updatedAt,
		});
		await restoreSessionSelection(record);
		return record;
	})().finally(() => {
		if (openingSessionRecords.get(sessionId) === pendingRecord) {
			openingSessionRecords.delete(sessionId);
		}
	});

	openingSessionRecords.set(sessionId, pendingRecord);
	return pendingRecord;
};
