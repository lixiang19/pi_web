import path from 'node:path';
import type {
  PiExtensionAPI,
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


type ToolCallEvent = PiToolCallEvent & { toolCallId?: string };

const PERMISSION_ACTIONS = new Set<PermissionAction>(['allow', 'ask', 'deny']);
const SIMPLE_PERMISSION_KEYS = new Set<LogicalPermissionKey>([
  'read',
  'grep',
  'find',
  'ls',
  'bash',
  'ask',
  'task',
]);
const EDIT_PERMISSION_KEY: LogicalPermissionKey = 'edit';
const LEGACY_EDIT_TOOL_KEYS = new Set(['write']);
const MUTATION_TOOL_NAMES = new Set(['edit', 'write']);

const normalizeString = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizePermissionAction = (value: unknown): PermissionAction | null => {
  const normalized = normalizeString(value).toLowerCase();
  return PERMISSION_ACTIONS.has(normalized as PermissionAction)
    ? (normalized as PermissionAction)
    : null;
};

const normalizeRulePattern = (value: unknown): string | null => {
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
    const pattern = normalizeRulePattern(rawPattern);
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

        const pattern = normalizeRulePattern(item.pattern);
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

const toPosixPath = (value: string): string => value.split(path.sep).join('/');

const escapeRegex = (value: string): string =>
  value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');

const isToolFullyDenied = (rules: PermissionRule[] | undefined): boolean =>
  Boolean(
    rules &&
      rules.length === 1 &&
      rules[0].pattern === '*' &&
      rules[0].action === 'deny',
  );

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

const normalizePermissionPath = (cwd: string, rawPath: string): string =>
  normalizePathRelativeToCwd(cwd, rawPath) || normalizeString(rawPath);

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

    if (!SIMPLE_PERMISSION_KEYS.has(key as LogicalPermissionKey)) {
      throw new Error(`Unsupported permission key: ${rawKey}`);
    }

    normalized[key as Exclude<LogicalPermissionKey, 'edit'>] = normalizePermissionValue(rawValue, key);
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
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

  switch (logicalPermission) {
    case 'bash':
      return deriveCommandPrefixPattern(getStringField(input, 'command'));
    case 'read':
    case 'ls':
    case 'edit': {
      const rawPath = logicalPermission === 'edit'
        ? extractMutationPath(toolName, input)
        : getStringField(input, 'path');
      return rawPath ? normalizePathRelativeToCwd(cwd, rawPath) : null;
    }
    case 'grep':
      return getStringField(input, 'pattern') || null;
    case 'find':
      return getStringField(input, 'pattern', 'glob', 'path') || null;
    case 'task':
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
): CompiledPermissionPolicy => {
  const normalizedPermission = normalizeAgentPermission(permission) || {};
  const activeToolNames = [...availableToolNames];
  const rulesByPermission: Partial<Record<LogicalPermissionKey, PermissionRule[]>> = {};

  for (const [permissionKey, rawValue] of Object.entries(normalizedPermission)) {
    rulesByPermission[permissionKey as LogicalPermissionKey] = normalizeRuleEntries(
      rawValue,
      permissionKey,
    );
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
      if (normalizeString(activeToolNames[index]).toLowerCase() === permissionKey) {
        activeToolNames.splice(index, 1);
      }
    }
  }

  return {
    raw: normalizedPermission,
    cwd,
    activeToolNames,
    rulesByPermission,
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

export const createPermissionGateExtension = (
  policyOrGetter:
    | CompiledPermissionPolicy
    | PermissionPolicyGetter
    | null
    | undefined,
  options: PermissionGateRuntimeOptions = {},
) => (pi: PiExtensionAPI): void => {
  pi.on('tool_call', async (event) => {
    const policy = resolvePolicy(policyOrGetter);
    if (!policy) {
      return undefined;
    }

    const logicalPermission = mapToolToLogicalPermission(event.toolName);
    if (!logicalPermission) {
      return undefined;
    }

    const subject = extractPermissionSubject(policy.cwd, event.toolName, event.input) || '*';
    const staticRules = policy.rulesByPermission[logicalPermission] || [];
    const runtimeRules = options.getRuntimeRules?.()?.[logicalPermission] || [];
    const action = matchPermissionRule(subject, [...staticRules, ...runtimeRules]);

    if (action === 'allow') {
      return undefined;
    }

    if (action === 'deny') {
      return {
        block: true,
        reason: buildPermissionBlockedReason(
          logicalPermission,
          event.toolName,
          subject,
        ),
      };
    }

    if (!options.requestPermission) {
      return {
        block: true,
        reason: `PERMISSION_APPROVAL_REQUIRES_UI:${logicalPermission}:${event.toolName}`,
      };
    }

    const request = buildPermissionRequest(policy.cwd, event);
    if (!request) {
      return {
        block: true,
        reason: `PERMISSION_REQUEST_BUILD_FAILED:${logicalPermission}:${event.toolName}`,
      };
    }

    const decision = await options.requestPermission(request);
    if (decision === 'reject') {
      return {
        block: true,
        reason: buildPermissionBlockedReason(
          logicalPermission,
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
          reason: `PERMISSION_ALWAYS_PATTERN_UNAVAILABLE:${logicalPermission}:${event.toolName}`,
        };
      }
      options.onGrantAlways?.(logicalPermission, request.suggestedPattern);
    }

    return undefined;
  });
};
