// Session lifecycle management
// Extracted from index.ts for maintainability

import { type ServerResponse } from "node:http";
import path from "node:path";

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { Api, Model } from "@mariozechner/pi-ai";
import type { AgentSession } from "@mariozechner/pi-coding-agent";
import {
	AuthStorage,
	DefaultResourceLoader,
	ModelRegistry,
	SessionManager,
	type SettingsManager,
} from "@mariozechner/pi-coding-agent";

import {
	type AgentConfigInternal,
	deleteAgent,
	discoverAgents,
	getAgentByName,
	getAgentConfigSignature,
	normalizeThinkingLevel,
	saveAgent,
	THINKING_LEVELS,
} from "./agents.js";
import { buildResolvedAskResult, createAskExtension } from "./ask-extension.js";
import {
	compileAgentPermission,
	createPermissionGateExtension,
} from "./agent-permissions.js";
import { createSubagentToolExtension } from "./subagents.js";
import { type IndexedSessionContextSummary, type IndexedSessionLookup } from "./session-indexer.js";
import {
	getIndexedSessionLookup,
	getIndexedSessionContext,
} from "./session-indexer.js";
import {
	createPiAgentScopeSettingsManager,
	getPiAgentScopeAgentDir,
} from "./pi-resource-scope.js";
import type {
	AgentPermission,
	AskInteractiveRequest,
	AskQuestionAnswer,
	HttpError,
	LogicalPermissionKey,
	PendingAskRecord,
	PermissionDecisionAction,
	PermissionInteractiveRequest,
	PermissionRule,
	Project,
	SessionRecord,
	ThinkingLevel,
} from "./types/index.js";
import { normalizeString } from "./utils/strings.js";
import { toPosixPath } from "./utils/paths.js";
import type { ProjectContextInfo } from "./project-context.js";

