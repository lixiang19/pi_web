import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  ExtensionAPI,
  ToolCallEvent as PiToolCallEvent,
} from '@mariozechner/pi-coding-agent';

import type {
  AgentPermission,
  CompiledPermissionPolicy,
  LogicalPermissionKey,
  PermissionAction,
  PermissionInteractiveRequest,
  PermissionRule,
} from './types/index.js';
import { toPosixPath } from './utils/paths.js';
import { normalizeString } from './utils/strings.js';

export interface GlobalPermissionConfig {
  default?: AgentPermission;
  defaults?: AgentPermission;
  locked?: AgentPermission;
}

type ToolCallEvent = PiToolCallEvent & { toolCallId?: string };

const PERMISSION_ACTIONS = new Set<PermissionAction>(['allow', 'ask', 'deny']);
const EXTERNAL_DIRECTORY_PERMISSION_KEY: LogicalPermissionKey = 'external_directory';
const SIMPLE_PERMISSION_KEYS = new Set<LogicalPermissionKey>([
  'read',
  'grep',
  'find',
  'ls',
  'bash',
  'ask',
  'task',
  'subagent',
]);
const CONFIG_PERMISSION_KEYS = new Set<LogicalPermissionKey>([
  ...SIMPLE_PERMISSION_KEYS,
  EXTERNAL_DIRECTORY_PERMISSION_KEY,
]);
const EDIT_PERMISSION_KEY: LogicalPermissionKey = 'edit';
const LEGACY_EDIT_TOOL_KEYS = new Set(['write']);
const MUTATION_TOOL_NAMES = new Set(['edit', 'write']);
const PATH_RULE_PERMISSION_KEYS = new Set<LogicalPermissionKey>([
  'read',
  'ls',
  EDIT_PERMISSION_KEY,
]);
const PATH_INPUT_KEYS = new Set([
  'path',
  'file',
  'directory',
  'cwd',
  'root',
  'target',
  'targetPath',
  'source',
  'sourcePath',
  'destination',
  'destinationPath',
  'dest',
  'from',
  'to',
]);
const SHELL_OPERATOR_TOKENS = new Set([
  '&&',
  '||',
  ';',
  '|',
  '>',
  '>>',
  '<',
  '2>',
  '2>>',
]);
const PLANNING_TOOL_NAMES = new Set([
  'create_task',
  'update_task',
  'create_milestone',
  'update_milestone',
  'move_task',
  'set_blocked',
  'set_reviewing',
]);
const SUBAGENT_TOOL_NAMES = new Set([
  'subagent',
  'steer_subagent',
  'get_subagent_result',
]);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizePermissionAction = (value: unknown): PermissionAction | null => {
  const normalized = normalizeString(value).toLowerCase();
  return PERMISSION_ACTIONS.has(normalized as PermissionAction)
    ? (normalized as PermissionAction)
    : null;
};

const expandHomePathStart = (value: string): string => {
  if (value === '~' || value === '$HOME') {
    return os.homedir();
  }
  if (value.startsWith('~/')) {
    return path.join(os.homedir(), value.slice(2));
  }
  if (value.startsWith('$HOME/')) {
    return path.join(os.homedir(), value.slice(6));
  }
  return value;
};

const normalizeExternalDirectoryPattern = (value: unknown): string | null => {
  const pattern = expandHomePathStart(normalizeString(value).replace(/\\/g, '/'));
  if (!pattern) {
    return null;
  }
  if (pattern === '*') {
    return pattern;
  }
  if (!path.isAbsolute(pattern)) {
    throw new Error(
      `External directory permission pattern must be absolute, home-relative, or "*": ${String(value)}`,
    );
  }
  return toPosixPath(path.resolve(pattern));
};

const normalizePathPermissionPattern = (value: unknown): string | null => {
  const pattern = normalizeString(value).replace(/\\/g, '/');
  if (!pattern) {
    return null;
  }

  const expanded = expandHomePathStart(pattern);
  if (path.isAbsolute(expanded)) {
    return toPosixPath(path.resolve(expanded));
  }

  if (path.posix.isAbsolute(expanded)) {
    return toPosixPath(path.resolve(expanded));
  }

  const segments = expanded.split('/').filter(Boolean);
  if (segments.includes('..')) {
    throw new Error(`Permission pattern cannot escape the workspace: ${String(value)}`);
  }

  return expanded;
};

const normalizeRulePattern = (
  value: unknown,
  key: string,
): string | null => {
  if (key === EXTERNAL_DIRECTORY_PERMISSION_KEY) {
    return normalizeExternalDirectoryPattern(value);
  }
  if (PATH_RULE_PERMISSION_KEYS.has(key as LogicalPermissionKey)) {
    return normalizePathPermissionPattern(value);
  }

  const pattern = normalizeString(value).replace(/\\/g, '/');
  if (!pattern) {
    return null;
  }

  if (path.posix.isAbsolute(pattern)) {
    throw new Error(`Permission pattern must be workspace-relative: ${String(value)}`);
  }

  const segments = pattern.split('/').filter(Boolean);
  if (segments.includes('..')) {
    throw new Error(`Permission pattern cannot escape the workspace: ${String(value)}`);
  }

  return pattern;
};

const normalizeRuleObject = (
  value: unknown,
  key: string,
): Record<string, PermissionAction> => {
  if (!isPlainObject(value)) {
    throw new Error(`Permission "${key}" must be an action or a rule object.`);
  }

  const normalized: Record<string, PermissionAction> = {};
  for (const [rawPattern, rawAction] of Object.entries(value)) {
    const pattern = normalizeRulePattern(rawPattern, key);
    const action = normalizePermissionAction(rawAction);
    if (!pattern || !action) {
      throw new Error(`Invalid permission rule for "${key}": ${rawPattern}`);
    }

    normalized[pattern] = action;
  }

  if (Object.keys(normalized).length === 0) {
    throw new Error(`Permission "${key}" must include at least one rule.`);
  }

  return normalized;
};

const normalizePermissionValue = (
  value: unknown,
  key: string,
): PermissionAction | Record<string, PermissionAction> => {
  const action = normalizePermissionAction(value);
  if (action) {
    return action;
  }

  return normalizeRuleObject(value, key);
};

const normalizeRuleEntries = (
  value: unknown,
  key: string,
): PermissionRule[] => {
  if (value === undefined) {
    return [];
  }

  const action = normalizePermissionAction(value);
  if (action) {
    return [{ pattern: '*', action }];
  }

  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => {
        if (!isPlainObject(item)) {
          throw new Error(`Permission "${key}" contains an invalid rule entry.`);
        }

        const pattern = normalizeRulePattern(item.pattern, key);
        const itemAction = normalizePermissionAction(item.action);
        if (!pattern || !itemAction) {
          throw new Error(`Permission "${key}" contains an invalid rule entry.`);
        }

        return {
          pattern,
          action: itemAction,
        } satisfies PermissionRule;
      });

    if (normalized.length === 0) {
      throw new Error(`Permission "${key}" must include at least one rule.`);
    }

    return normalized;
  }

  return Object.entries(normalizeRuleObject(value, key)).map(([pattern, ruleAction]) => ({
    pattern,
    action: ruleAction,
  }));
};

const escapeRegex = (value: string): string =>
  value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');

const isToolFullyDenied = (rules: PermissionRule[] | undefined): boolean =>
  Boolean(
    rules &&
      rules.length === 1 &&
      rules[0].pattern === '*' &&
      rules[0].action === 'deny',
  );

const appendPermissionRules = (
  target: Partial<Record<LogicalPermissionKey, PermissionRule[]>>,
  permission: AgentPermission | undefined,
): void => {
  if (!permission) {
    return;
  }

  for (const [permissionKey, rawValue] of Object.entries(permission)) {
    const key = permissionKey as LogicalPermissionKey;
    target[key] = [
      ...(target[key] || []),
      ...normalizeRuleEntries(rawValue, permissionKey),
    ];
  }
};

const assertLockedRulesDenyOnly = (
  lockedRulesByPermission: Partial<Record<LogicalPermissionKey, PermissionRule[]>>,
): void => {
  for (const [permissionKey, rules] of Object.entries(lockedRulesByPermission)) {
    for (const rule of rules || []) {
      if (rule.action !== 'deny') {
        throw new Error(
          `Locked permission "${permissionKey}" only supports deny rules.`,
        );
      }
    }
  }
};

const getStringField = (
  input: Record<string, unknown>,
  ...keys: string[]
): string => {
  for (const key of keys) {
    const value = normalizeString(input[key]);
    if (value) {
      return value;
    }
  }
  return '';
};

const getAskPromptSummary = (input: Record<string, unknown>): string => {
  const title = getStringField(input, 'title');
  if (title) {
    return title;
  }

  const message = getStringField(input, 'message');
  if (message) {
    return message;
  }

  const questions = Array.isArray(input.questions) ? input.questions : [];
  for (const question of questions) {
    if (!question || typeof question !== 'object') {
      continue;
    }

    const text = normalizeString((question as Record<string, unknown>).question);
    if (text) {
      return text;
    }
  }

  return '';
};

const normalizePermissionPath = (cwd: string, rawPath: string): string => {
  const normalizedPath = normalizeString(rawPath).replace(/\\/g, '/');
  const expandedPath = expandHomePathStart(normalizedPath);
  const relativePath = normalizePathRelativeToCwd(cwd, expandedPath);
  if (relativePath) {
    return relativePath;
  }
  if (path.isAbsolute(expandedPath)) {
    return toPosixPath(path.resolve(expandedPath));
  }
  return normalizedPath;
};

const deriveCommandPrefixPattern = (command: string): string | null => {
  const normalized = normalizeString(command);
  if (!normalized) {
    return null;
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return null;
  }

  if (parts.length === 1) {
    return parts[0];
  }

  return `${parts.slice(0, 2).join(' ')}*`;
};

export const normalizeAgentPermission = (
  value: unknown,
): AgentPermission | undefined => {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const normalized: AgentPermission = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = normalizeString(rawKey).toLowerCase();
    if (!key) {
      continue;
    }

    if (key === EDIT_PERMISSION_KEY || LEGACY_EDIT_TOOL_KEYS.has(key)) {
      normalized[EDIT_PERMISSION_KEY] = normalizePermissionValue(rawValue, EDIT_PERMISSION_KEY);
      continue;
    }

    if (!CONFIG_PERMISSION_KEYS.has(key as LogicalPermissionKey)) {
      throw new Error(`Unsupported permission key: ${rawKey}`);
    }

    normalized[key as Exclude<LogicalPermissionKey, 'edit'>] = normalizePermissionValue(rawValue, key);
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

export const normalizeGlobalPermissionConfig = (
  value: unknown,
): GlobalPermissionConfig | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isPlainObject(value)) {
    throw new Error('Global permissions config must be an object.');
  }

  const unsupportedKeys = Object.keys(value).filter(
    (key) => key !== 'default' && key !== 'defaults' && key !== 'locked',
  );
  if (unsupportedKeys.length > 0) {
    throw new Error(
      `Unsupported global permissions config key: ${unsupportedKeys[0]}`,
    );
  }

  const normalizedDefault = normalizeAgentPermission(
    value.default ?? value.defaults,
  );
  const normalizedLocked = normalizeAgentPermission(value.locked);

  if (!normalizedDefault && !normalizedLocked) {
    return undefined;
  }

  return {
    default: normalizedDefault,
    locked: normalizedLocked,
  };
};

export const loadGlobalPermissionConfig = async (
  agentDir: string,
): Promise<GlobalPermissionConfig | undefined> => {
  const configPath = path.join(agentDir, 'permissions.json');
  let content: string;
  try {
    content = await fs.readFile(configPath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }

  return normalizeGlobalPermissionConfig(JSON.parse(content));
};

export const normalizePathRelativeToCwd = (
  cwd: string,
  targetPath: string,
): string | null => {
  const normalizedTarget = normalizeString(targetPath);
  if (!normalizedTarget) {
    return null;
  }

  const absoluteCwd = path.resolve(cwd);
  const absoluteTarget = path.resolve(absoluteCwd, normalizedTarget);
  const relative = path.relative(absoluteCwd, absoluteTarget);
  const normalizedRelative = toPosixPath(relative);

  if (
    !normalizedRelative ||
    normalizedRelative === '.' ||
    normalizedRelative === '..' ||
    normalizedRelative.startsWith('../')
  ) {
    return null;
  }

  return normalizedRelative;
};

const isPathInsideCwd = (cwd: string, absoluteTarget: string): boolean => {
  const relative = path.relative(path.resolve(cwd), path.resolve(absoluteTarget));
  return Boolean(
    !relative ||
      relative === '.' ||
      (!relative.startsWith('..') && !path.isAbsolute(relative)),
  );
};

const isLikelyUrl = (value: string): boolean =>
  /^[a-z][a-z0-9+.-]*:\/\//i.test(value);

const stripShellQuotes = (value: string): string => {
  if (value.length < 2) {
    return value;
  }
  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }
  return value;
};

const normalizeExternalPathCandidate = (
  cwd: string,
  value: unknown,
): string | null => {
  const rawValue = stripShellQuotes(normalizeString(value).replace(/\\/g, '/'));
  if (!rawValue || rawValue === '-' || isLikelyUrl(rawValue)) {
    return null;
  }

  const expanded = expandHomePathStart(rawValue);
  const absoluteTarget = path.isAbsolute(expanded)
    ? path.resolve(expanded)
    : path.resolve(cwd, expanded);

  if (isPathInsideCwd(cwd, absoluteTarget)) {
    return null;
  }

  return toPosixPath(absoluteTarget);
};

const collectPathCandidates = (input: Record<string, unknown>): string[] => {
  const candidates: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    const normalizedKey = key.replace(/[_-]/g, '').toLowerCase();
    const isPathKey =
      PATH_INPUT_KEYS.has(key) ||
      normalizedKey.endsWith('path') ||
      normalizedKey.endsWith('paths') ||
      normalizedKey.endsWith('file') ||
      normalizedKey.endsWith('files') ||
      normalizedKey.endsWith('directory') ||
      normalizedKey.endsWith('directories');
    if (!isPathKey) {
      continue;
    }

    if (typeof value === 'string') {
      candidates.push(value);
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') {
          candidates.push(item);
        }
      }
    }
  }
  return candidates;
};

const tokenizeShellCommand = (command: string): string[] =>
  command.match(/(?:[^\s"'`]+|"[^"]*"|'[^']*')+/g) || [];

const collectBashPathCandidates = (input: Record<string, unknown>): string[] => {
  const command = getStringField(input, 'command');
  if (!command) {
    return [];
  }

  const candidates: string[] = [];
  for (const rawToken of tokenizeShellCommand(command)) {
    const token = stripShellQuotes(rawToken);
    if (
      !token ||
      token.startsWith('-') ||
      SHELL_OPERATOR_TOKENS.has(token) ||
      isLikelyUrl(token)
    ) {
      continue;
    }

    const assignmentIndex = token.indexOf('=');
    const pathLikeToken = assignmentIndex > 0
      ? token.slice(assignmentIndex + 1)
      : token;

    if (
      pathLikeToken.includes('/') ||
      pathLikeToken.startsWith('~') ||
      pathLikeToken.startsWith('$HOME')
    ) {
      candidates.push(pathLikeToken);
    }
  }
  return candidates;
};

const extractExternalDirectorySubject = (
  cwd: string,
  toolName: string,
  input: Record<string, unknown>,
): string | null => {
  const normalizedToolName = normalizeString(toolName).toLowerCase();
  const pathCandidates = normalizedToolName === 'bash'
    ? collectBashPathCandidates(input)
    : collectPathCandidates(input);

  for (const candidate of pathCandidates) {
    const externalPath = normalizeExternalPathCandidate(cwd, candidate);
    if (externalPath) {
      return externalPath;
    }
  }

  return null;
};

export const matchSimplePattern = (pattern: string, value: string): boolean => {
  const source = escapeRegex(pattern).replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${source}$`).test(value);
};

export const matchPermissionRule = (
  value: string,
  rules: PermissionRule[] | undefined,
): PermissionAction => {
  let action: PermissionAction = 'allow';
  for (const rule of rules || []) {
    if (matchSimplePattern(rule.pattern, value)) {
      action = rule.action;
    }
  }
  return action;
};

export const mapToolToLogicalPermission = (
  toolName: string,
): LogicalPermissionKey | null => {
  const normalized = normalizeString(toolName).toLowerCase();
  if (MUTATION_TOOL_NAMES.has(normalized)) {
    return EDIT_PERMISSION_KEY;
  }
  if (PLANNING_TOOL_NAMES.has(normalized)) {
    return 'task';
  }
  if (normalized === 'subagent') {
    return 'subagent';
  }
  return SIMPLE_PERMISSION_KEYS.has(normalized as LogicalPermissionKey)
    ? (normalized as LogicalPermissionKey)
    : null;
};

export const extractMutationPath = (
  toolName: string,
  input: unknown,
): string | null => {
  const normalized = normalizeString(toolName).toLowerCase();
  if (!MUTATION_TOOL_NAMES.has(normalized) || !isPlainObject(input)) {
    return null;
  }
  return typeof input.path === 'string' ? input.path : null;
};

export const extractPermissionSubject = (
  cwd: string,
  toolName: string,
  input: Record<string, unknown>,
): string | null => {
  const logicalPermission = mapToolToLogicalPermission(toolName);
  if (!logicalPermission) {
    return null;
  }

  if (PLANNING_TOOL_NAMES.has(toolName)) {
    return toolName;
  }

  switch (logicalPermission) {
    case 'bash':
      return getStringField(input, 'command') || '*';
    case 'grep':
      return getStringField(input, 'pattern') || '*';
    case 'find':
      return getStringField(input, 'pattern', 'glob', 'path') || '*';
    case 'ls': {
      const rawPath = getStringField(input, 'path');
      return rawPath ? normalizePermissionPath(cwd, rawPath) : '.';
    }
    case 'read': {
      const rawPath = getStringField(input, 'path');
      return rawPath ? normalizePermissionPath(cwd, rawPath) : '*';
    }
    case 'task':
    case 'subagent':
      return getStringField(input, 'agent') || '*';
    case 'ask':
      return getAskPromptSummary(input) || '*';
    case 'edit': {
      const rawPath = extractMutationPath(toolName, input);
      return rawPath ? normalizePermissionPath(cwd, rawPath) : '*';
    }
    default:
      return '*';
  }
};

export const derivePermissionPattern = (
  cwd: string,
  toolName: string,
  input: Record<string, unknown>,
): string | null => {
  const logicalPermission = mapToolToLogicalPermission(toolName);
  if (!logicalPermission) {
    return null;
  }

  if (PLANNING_TOOL_NAMES.has(toolName)) {
    return toolName;
  }

  switch (logicalPermission) {
    case 'bash':
      return deriveCommandPrefixPattern(getStringField(input, 'command'));
    case 'read':
    case 'ls':
    case 'edit': {
      const rawPath = logicalPermission === 'edit'
        ? extractMutationPath(toolName, input)
        : getStringField(input, 'path');
      return rawPath ? normalizePermissionPath(cwd, rawPath) : null;
    }
    case 'grep':
      return getStringField(input, 'pattern') || null;
    case 'find':
      return getStringField(input, 'pattern', 'glob', 'path') || null;
    case 'task':
    case 'subagent':
      return getStringField(input, 'agent') || null;
    case 'ask':
      return getAskPromptSummary(input) || null;
    default:
      return null;
  }
};

export const compileAgentPermission = (
  cwd: string,
  permission: AgentPermission | undefined,
  availableToolNames: string[] = [],
  globalPermission?: GlobalPermissionConfig,
): CompiledPermissionPolicy => {
  const normalizedGlobalPermission = normalizeGlobalPermissionConfig(
    globalPermission,
  );
  const normalizedPermission = normalizeAgentPermission(permission);
  const activeToolNames = [...availableToolNames];
  const rulesByPermission: Partial<Record<LogicalPermissionKey, PermissionRule[]>> = {};
  const lockedRulesByPermission: Partial<Record<LogicalPermissionKey, PermissionRule[]>> = {};

  appendPermissionRules(rulesByPermission, normalizedGlobalPermission?.default);
  appendPermissionRules(rulesByPermission, normalizedPermission);
  appendPermissionRules(lockedRulesByPermission, normalizedGlobalPermission?.locked);
  assertLockedRulesDenyOnly(lockedRulesByPermission);

  if (!rulesByPermission[EXTERNAL_DIRECTORY_PERMISSION_KEY]) {
    rulesByPermission[EXTERNAL_DIRECTORY_PERMISSION_KEY] = [
      { pattern: '*', action: 'ask' },
    ];
  }

  if (isToolFullyDenied(rulesByPermission[EDIT_PERMISSION_KEY])) {
    const blockedTools = new Set(['edit', 'write']);
    for (let index = activeToolNames.length - 1; index >= 0; index -= 1) {
      if (blockedTools.has(normalizeString(activeToolNames[index]).toLowerCase())) {
        activeToolNames.splice(index, 1);
      }
    }
  }

  for (const permissionKey of SIMPLE_PERMISSION_KEYS) {
    if (!isToolFullyDenied(rulesByPermission[permissionKey])) {
      continue;
    }

    for (let index = activeToolNames.length - 1; index >= 0; index -= 1) {
      const normalized = normalizeString(activeToolNames[index]).toLowerCase();
      if (normalized === permissionKey) {
        activeToolNames.splice(index, 1);
      }
    }
  }

  // Remove planning tools when task: deny
  if (isToolFullyDenied(rulesByPermission['task'])) {
    for (let index = activeToolNames.length - 1; index >= 0; index -= 1) {
      if (PLANNING_TOOL_NAMES.has(normalizeString(activeToolNames[index]).toLowerCase())) {
        activeToolNames.splice(index, 1);
      }
    }
  }

  if (isToolFullyDenied(rulesByPermission['subagent'])) {
    for (let index = activeToolNames.length - 1; index >= 0; index -= 1) {
      if (SUBAGENT_TOOL_NAMES.has(normalizeString(activeToolNames[index]).toLowerCase())) {
        activeToolNames.splice(index, 1);
      }
    }
  }

  if (isToolFullyDenied(lockedRulesByPermission[EDIT_PERMISSION_KEY])) {
    const blockedTools = new Set(['edit', 'write']);
    for (let index = activeToolNames.length - 1; index >= 0; index -= 1) {
      if (blockedTools.has(normalizeString(activeToolNames[index]).toLowerCase())) {
        activeToolNames.splice(index, 1);
      }
    }
  }

  for (const permissionKey of SIMPLE_PERMISSION_KEYS) {
    if (!isToolFullyDenied(lockedRulesByPermission[permissionKey])) {
      continue;
    }

    for (let index = activeToolNames.length - 1; index >= 0; index -= 1) {
      const normalized = normalizeString(activeToolNames[index]).toLowerCase();
      if (normalized === permissionKey) {
        activeToolNames.splice(index, 1);
      }
    }
  }

  if (isToolFullyDenied(lockedRulesByPermission['task'])) {
    for (let index = activeToolNames.length - 1; index >= 0; index -= 1) {
      if (PLANNING_TOOL_NAMES.has(normalizeString(activeToolNames[index]).toLowerCase())) {
        activeToolNames.splice(index, 1);
      }
    }
  }

  if (isToolFullyDenied(lockedRulesByPermission['subagent'])) {
    for (let index = activeToolNames.length - 1; index >= 0; index -= 1) {
      if (SUBAGENT_TOOL_NAMES.has(normalizeString(activeToolNames[index]).toLowerCase())) {
        activeToolNames.splice(index, 1);
      }
    }
  }

  return {
    raw: normalizedPermission || {},
    cwd,
    activeToolNames,
    rulesByPermission,
    lockedRulesByPermission,
  };
};

interface PermissionPolicyGetter {
  (): CompiledPermissionPolicy | null;
}

const resolvePolicy = (
  policyOrGetter:
    | CompiledPermissionPolicy
    | PermissionPolicyGetter
    | null
    | undefined,
): CompiledPermissionPolicy | null => {
  if (typeof policyOrGetter === 'function') {
    return policyOrGetter() || null;
  }
  return policyOrGetter || null;
};

interface PermissionGateRuntimeOptions {
  getRuntimeRules?: () => Partial<Record<LogicalPermissionKey, PermissionRule[]>>;
  onGrantAlways?: (permissionKey: LogicalPermissionKey, pattern: string) => void;
  requestPermission?: (
    request: PermissionInteractiveRequest,
  ) => Promise<'once' | 'always' | 'reject'>;
}

const buildPermissionBlockedReason = (
  permissionKey: LogicalPermissionKey,
  toolName: string,
  subject: string,
  rejectedByUser = false,
): string => {
  const prefix = rejectedByUser ? 'PERMISSION_REJECTED' : 'PERMISSION_DENIED';
  return `${prefix}:${permissionKey}:${toolName}:${subject || '*'}`;
};
export const buildPermissionRequest = (
  cwd: string,
  event: ToolCallEvent,
): PermissionInteractiveRequest | null => {
  const permissionKey = mapToolToLogicalPermission(event.toolName);
  if (!permissionKey) {
    return null;
  }
  const subject = extractPermissionSubject(cwd, event.toolName, event.input) || '*';
  const toolCallId = event.toolCallId || `${event.toolName}:${Date.now()}`;
  return {
    id: `${toolCallId}:permission`,
    toolCallId,
    toolName: event.toolName,
    permissionKey,
    title: '需要权限批准',
    message: `Agent 请求调用 ${event.toolName}。`,
    subject,
    suggestedPattern: derivePermissionPattern(cwd, event.toolName, event.input) || undefined,
    createdAt: Date.now(),
  };
};

const buildPermissionRequestForKey = (
  event: ToolCallEvent,
  permissionKey: LogicalPermissionKey,
  subject: string,
  suggestedPattern: string | undefined,
): PermissionInteractiveRequest => {
  const toolCallId = event.toolCallId || `${event.toolName}:${Date.now()}`;
  return {
    id: permissionKey === EXTERNAL_DIRECTORY_PERMISSION_KEY
      ? `${toolCallId}:external_directory:permission`
      : `${toolCallId}:permission`,
    toolCallId,
    toolName: event.toolName,
    permissionKey,
    title: '需要权限批准',
    message: `Agent 请求调用 ${event.toolName}。`,
    subject,
    suggestedPattern,
    createdAt: Date.now(),
  };
};

const resolvePermissionForToolCall = async (
  policy: CompiledPermissionPolicy,
  event: PiToolCallEvent,
  permissionKey: LogicalPermissionKey,
  subject: string,
  suggestedPattern: string | undefined,
  options: PermissionGateRuntimeOptions,
): Promise<{ block: boolean; reason: string } | undefined> => {
  const lockedRules = policy.lockedRulesByPermission[permissionKey] || [];
  const lockedAction = matchPermissionRule(subject, lockedRules);
  if (lockedAction === 'deny') {
    return {
      block: true,
      reason: buildPermissionBlockedReason(
        permissionKey,
        event.toolName,
        subject,
      ),
    };
  }

  const staticRules = policy.rulesByPermission[permissionKey] || [];
  const runtimeRules = options.getRuntimeRules?.()?.[permissionKey] || [];
  const action = matchPermissionRule(subject, [...staticRules, ...runtimeRules]);

  if (action === 'allow') {
    return undefined;
  }

  if (action === 'deny') {
    return {
      block: true,
      reason: buildPermissionBlockedReason(
        permissionKey,
        event.toolName,
        subject,
      ),
    };
  }

  if (!options.requestPermission) {
    return {
      block: true,
      reason: `PERMISSION_APPROVAL_REQUIRES_UI:${permissionKey}:${event.toolName}`,
    };
  }

  const request = buildPermissionRequestForKey(
    event,
    permissionKey,
    subject,
    suggestedPattern,
  );
  const decision = await options.requestPermission(request);
  if (decision === 'reject') {
    return {
      block: true,
      reason: buildPermissionBlockedReason(
        permissionKey,
        event.toolName,
        subject,
        true,
      ),
    };
  }

  if (decision === 'always') {
    if (!request.suggestedPattern) {
      return {
        block: true,
        reason: `PERMISSION_ALWAYS_PATTERN_UNAVAILABLE:${permissionKey}:${event.toolName}`,
      };
    }
    options.onGrantAlways?.(permissionKey, request.suggestedPattern);
  }

  return undefined;
};

export const createPermissionGateExtension = (
  policyOrGetter:
    | CompiledPermissionPolicy
    | PermissionPolicyGetter
    | null
    | undefined,
  options: PermissionGateRuntimeOptions = {},
) => (pi: ExtensionAPI): void => {
  pi.on('tool_call', async (event: PiToolCallEvent) => {
    const policy = resolvePolicy(policyOrGetter);
    if (!policy) {
      return undefined;
    }

    if (!isPlainObject(event.input)) {
      return undefined;
    }

    const externalDirectorySubject = extractExternalDirectorySubject(
      policy.cwd,
      event.toolName,
      event.input,
    );
    if (externalDirectorySubject) {
      const externalResult = await resolvePermissionForToolCall(
        policy,
        event,
        EXTERNAL_DIRECTORY_PERMISSION_KEY,
        externalDirectorySubject,
        externalDirectorySubject,
        options,
      );
      if (externalResult) {
        return externalResult;
      }
    }

    const logicalPermission = mapToolToLogicalPermission(event.toolName);
    if (!logicalPermission) {
      return undefined;
    }

    const subject = extractPermissionSubject(policy.cwd, event.toolName, event.input) || '*';
    return resolvePermissionForToolCall(
      policy,
      event,
      logicalPermission,
      subject,
      derivePermissionPattern(policy.cwd, event.toolName, event.input) || undefined,
      options,
    );
  });
};
