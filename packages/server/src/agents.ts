import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { getAgentDir, parseFrontmatter } from '@mariozechner/pi-coding-agent';
import { normalizeAgentPermission } from './agent-permissions.js';
import { DEFAULT_AGENTS } from './default-agents.js';
import type {
  AgentMode,
  AgentScope,
  AgentSourceScope,
  AgentPermission,
  ThinkingLevel,
  HttpError,
} from './types/index.js';
import { normalizeString } from './utils/strings.js';

export const AGENT_MODES: AgentMode[] = ['primary', 'task', 'all'];
export const THINKING_LEVELS: ThinkingLevel[] = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
];

const AGENT_NAME_PATTERN = /^[a-z0-9-]+$/;
const SUPPORTED_FRONTMATTER_FIELDS = new Set([
  'name',
  'description',
  'display_name',
  'mode',
  'model',
  'thinking',
  'max_turns',
  'grace_turns',
  'skills',
  'inherit_context',
  'run_in_background',
  'enabled',
  'permission',
]);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const createAgentError = (code: string, message: string, statusCode = 400): HttpError => {
  const error = new Error(message) as HttpError;
  error.code = code;
  error.statusCode = statusCode;
  return error;
};

const normalizeBoolean = (value: unknown, fallback = true): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }

    if (normalized === 'false') {
      return false;
    }
  }

  return fallback;
};

const normalizeInteger = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isInteger(parsed) && parsed >= 1) {
      return parsed;
    }
  }

  return undefined;
};

const normalizeNonNegativeInteger = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isInteger(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return undefined;
};

const normalizeOptionalBoolean = (value: unknown, key: string): boolean | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }

  throw createAgentError(
    'INVALID_AGENT_BOOLEAN',
    `agent 的 ${key} 配置必须是 boolean: ${String(value)}`,
  );
};

const normalizeStringList = (value: unknown, key: string): string[] | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (Array.isArray(value)) {
    const normalized = value.map((item) => normalizeString(item)).filter(Boolean);
    if (normalized.length === 0) {
      throw createAgentError('INVALID_AGENT_LIST', `agent 的 ${key} 不能为空列表`);
    }
    return normalized;
  }

  if (typeof value === 'string') {
    const normalized = value.split(',').map((item) => item.trim()).filter(Boolean);
    if (normalized.length === 0) {
      throw createAgentError('INVALID_AGENT_LIST', `agent 的 ${key} 不能为空列表`);
    }
    return normalized;
  }

  throw createAgentError('INVALID_AGENT_LIST', `agent 的 ${key} 必须是字符串或字符串数组`);
};


export const normalizeThinkingLevel = (value: unknown): ThinkingLevel | undefined => {
  const normalized = normalizeString(value).toLowerCase();
  return THINKING_LEVELS.includes(normalized as ThinkingLevel) ? (normalized as ThinkingLevel) : undefined;
};

const normalizeMode = (value: unknown): AgentMode | undefined => {
  const normalized = normalizeString(value).toLowerCase();
  return AGENT_MODES.includes(normalized as AgentMode) ? (normalized as AgentMode) : undefined;
};

const normalizeAgentName = (value: unknown): string => {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized || !AGENT_NAME_PATTERN.test(normalized)) {
    throw createAgentError(
      'INVALID_AGENT_NAME',
      'Agent 名称只允许小写字母、数字和中划线',
    );
  }

  return normalized;
};

const ensureSupportedFields = (frontmatter: Record<string, unknown>): void => {
  for (const key of Object.keys(frontmatter)) {
    if (!SUPPORTED_FRONTMATTER_FIELDS.has(key)) {
      throw createAgentError(
        'UNKNOWN_AGENT_FIELD',
        `不支持的 agent 字段: ${key}`,
      );
    }
  }
};

const isDirectory = async (targetPath: string): Promise<boolean> => {
  try {
    const stats = await fs.stat(targetPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
};

const getUserAgentsDir = (): string => path.join(getAgentDir(), 'agents');

const findNearestProjectAgentsDir = async (cwd: string): Promise<string | null> => {
  let currentDir = path.resolve(cwd);

  while (true) {
    const candidate = path.join(currentDir, '.pi', 'agents');
    if (await isDirectory(candidate)) {
      return candidate;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
};

const resolveProjectAgentsDirForWrite = async (cwd: string): Promise<string> => {
  const nearest = await findNearestProjectAgentsDir(cwd);
  if (nearest) {
    return nearest;
  }

  return path.join(path.resolve(cwd), '.pi', 'agents');
};

interface ParsedAgent {
  name: string;
  description: string;
  displayName?: string;
  mode: AgentMode;
  model?: string;
  thinking?: ThinkingLevel;
  maxTurns?: number;
  graceTurns?: number;
  skills?: string[];
  inheritContext?: boolean;
  runInBackground?: boolean;
  enabled: boolean;
  permission?: AgentPermission;
  systemPrompt: string;
  source: string;
  sourceScope: AgentSourceScope;
}

const parseAgentFile = (rawContent: string, filePath: string, sourceScope: AgentScope): ParsedAgent => {
  let parsed: { frontmatter?: Record<string, unknown>; body?: string };
  try {
    parsed = parseFrontmatter(rawContent);
  } catch (error) {
    throw createAgentError(
      'INVALID_AGENT_FRONTMATTER',
      (error as Error)?.message || `无法解析 ${filePath}`,
    );
  }

  const frontmatter =
    parsed?.frontmatter && typeof parsed.frontmatter === 'object'
      ? parsed.frontmatter
      : {};
  const systemPrompt =
    typeof parsed?.body === 'string' ? parsed.body.trim() : rawContent.trim();

  ensureSupportedFields(frontmatter);

  const fileStem = path.basename(filePath, '.md');
  const resolvedName = normalizeAgentName(frontmatter.name || fileStem);
  if (
    normalizeString(frontmatter.name) &&
    resolvedName !== normalizeAgentName(fileStem)
  ) {
    throw createAgentError(
      'INVALID_AGENT_NAME',
      `agent 文件名与 frontmatter.name 不一致: ${filePath}`,
    );
  }

  const mode = normalizeMode(frontmatter.mode) || 'all';
  const description = normalizeString(frontmatter.description);
  const displayName = normalizeString(frontmatter.display_name) || undefined;
  const model = normalizeString(frontmatter.model) || undefined;
  const thinking =
    frontmatter.thinking === undefined
      ? undefined
      : normalizeThinkingLevel(frontmatter.thinking);
  if (frontmatter.thinking !== undefined && !thinking) {
    throw createAgentError(
      'INVALID_AGENT_THINKING',
      `agent 的 thinking 配置非法: ${filePath}`,
    );
  }

  const maxTurns =
    frontmatter.max_turns === undefined
      ? undefined
      : normalizeInteger(frontmatter.max_turns);
  if (frontmatter.max_turns !== undefined && maxTurns === undefined) {
    throw createAgentError(
      'INVALID_AGENT_MAX_TURNS',
      `agent 的 max_turns 必须是大于等于 1 的整数: ${filePath}`,
    );
  }

  const graceTurns =
    frontmatter.grace_turns === undefined
      ? undefined
      : normalizeNonNegativeInteger(frontmatter.grace_turns);
  if (frontmatter.grace_turns !== undefined && graceTurns === undefined) {
    throw createAgentError(
      'INVALID_AGENT_GRACE_TURNS',
      `agent 的 grace_turns 必须是大于等于 0 的整数: ${filePath}`,
    );
  }

  const skills = normalizeStringList(frontmatter.skills, 'skills');
  const inheritContext = normalizeOptionalBoolean(frontmatter.inherit_context, 'inherit_context');
  const runInBackground = normalizeOptionalBoolean(
    frontmatter.run_in_background,
    'run_in_background',
  );
  const enabled = normalizeBoolean(frontmatter.enabled, true);

  let permission: AgentPermission | undefined;
  try {
    permission = normalizeAgentPermission(frontmatter.permission);
  } catch (error) {
    throw createAgentError(
      'INVALID_AGENT_PERMISSION_SCHEMA',
      (error as Error)?.message || `agent 的 permission 配置非法: ${filePath}`,
    );
  }

  return {
    name: resolvedName,
    description,
    displayName,
    mode,
    model,
    thinking,
    maxTurns,
    graceTurns,
    skills,
    inheritContext,
    runInBackground,
    enabled,
    permission,
    systemPrompt,
    source: filePath,
    sourceScope,
  };
};

const loadAgentsFromDir = async (dirPath: string, sourceScope: AgentScope): Promise<ParsedAgent[]> => {
  const agents: ParsedAgent[] = [];

  let files: Dirent[] = [];
  try {
    files = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`读取 agent 目录失败 ${dirPath}:`, error);
    }
    return agents;
  }

  for (const entry of files) {
    if (!entry.name.endsWith('.md')) {
      continue;
    }

    if (!entry.isFile() && !entry.isSymbolicLink()) {
      continue;
    }

    const filePath = path.join(dirPath, entry.name);
    try {
      const rawContent = await fs.readFile(filePath, 'utf8');
      const agent = parseAgentFile(rawContent, filePath, sourceScope);
      agents.push(agent);
    } catch (error) {
      console.warn(`加载 agent 失败 ${filePath}:`, (error as Error)?.message || error);
    }
  }

  return agents;
};

const mergeAgents = (
  defaultAgents: ParsedAgent[],
  userAgents: ParsedAgent[],
  projectAgents: ParsedAgent[],
): ParsedAgent[] => {
  const merged = new Map<string, ParsedAgent>();
  for (const agent of defaultAgents) {
    merged.set(agent.name, agent);
  }

  for (const agent of userAgents) {
    merged.set(agent.name, agent);
  }

  for (const agent of projectAgents) {
    merged.set(agent.name, agent);
  }

  return Array.from(merged.values()).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
};

export const getAgentConfigSignature = (agent: ParsedAgent | null | undefined): string => {
  if (!agent) {
    return '';
  }

  return JSON.stringify({
    name: agent.name,
    mode: agent.mode,
    source: agent.source,
    sourceScope: agent.sourceScope,
    description: agent.description || '',
    displayName: agent.displayName || '',
    systemPrompt: agent.systemPrompt || '',
    model: agent.model || '',
    thinking: agent.thinking || '',
    maxTurns: agent.maxTurns || 0,
    graceTurns: agent.graceTurns ?? null,
    skills: agent.skills || [],
    inheritContext: agent.inheritContext ?? null,
    runInBackground: agent.runInBackground ?? null,
    permission: agent.permission || {},
    enabled: agent.enabled !== false,
  });
};

export async function discoverAgents(cwd: string): Promise<ParsedAgent[]> {
  const normalizedCwd = normalizeString(cwd) || process.cwd();
  const userAgentsDir = getUserAgentsDir();
  const projectAgentsDir = await findNearestProjectAgentsDir(normalizedCwd);

  const [userAgents, projectAgents] = await Promise.all([
    loadAgentsFromDir(userAgentsDir, 'user'),
    projectAgentsDir
      ? loadAgentsFromDir(projectAgentsDir, 'project')
      : Promise.resolve([]),
  ]);

  return mergeAgents(DEFAULT_AGENTS as ParsedAgent[], userAgents, projectAgents);
}

export async function getAgentByName(
  cwd: string,
  name: string,
  scope: AgentScope | undefined,
): Promise<ParsedAgent | null> {
  const normalizedName = normalizeAgentName(name);
  const normalizedCwd = normalizeString(cwd) || process.cwd();

  try {
    if (scope === 'user') {
      const filePath = path.join(getUserAgentsDir(), `${normalizedName}.md`);
      const rawContent = await fs.readFile(filePath, 'utf8');
      return parseAgentFile(rawContent, filePath, 'user');
    }

    if (scope === 'project') {
      const dirPath = await resolveProjectAgentsDirForWrite(normalizedCwd);
      const filePath = path.join(dirPath, `${normalizedName}.md`);
      const rawContent = await fs.readFile(filePath, 'utf8');
      return parseAgentFile(rawContent, filePath, 'project');
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    throw error;
  }

  const agents = await discoverAgents(normalizedCwd);
  return agents.find((agent) => agent.name === normalizedName) ?? null;
}

const quoteYamlString = (value: string): string => JSON.stringify(String(value));

const serializeStringList = (value: string | string[] | null | undefined): string | undefined => {
  if (typeof value === 'string') {
    return value.trim() || undefined;
  }

  if (!value || value.length === 0) {
    return undefined;
  }
  return value.join(',');
};

const pushYamlValue = (
  lines: string[],
  key: string,
  value: unknown,
  indent = 0,
): void => {
  const prefix = '  '.repeat(indent);
  if (value === undefined) {
    return;
  }

  if (typeof value === 'string') {
    lines.push(`${prefix}${key}: ${quoteYamlString(value)}`);
    return;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    lines.push(`${prefix}${key}: ${String(value)}`);
    return;
  }

  if (isPlainObject(value)) {
    lines.push(`${prefix}${key}:`);
    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      pushYamlValue(lines, nestedKey, nestedValue, indent + 1);
    }
  }
};

export interface AgentPayload {
  name: string;
  description: string;
  display_name?: string | null;
  mode: AgentMode;
  model: string | null;
  thinking: ThinkingLevel | null;
  max_turns: number | null;
  grace_turns: number | null;
  skills: string[] | string | null;
  inherit_context: boolean | null;
  run_in_background: boolean | null;
  enabled: boolean;
  permission?: AgentPermission;
  prompt: string;
  scope: AgentScope;
}

const serializeAgentFile = (config: AgentPayload): string => {
  const lines: string[] = ['---'];
  pushYamlValue(lines, 'name', config.name);
  pushYamlValue(lines, 'description', config.description);
  pushYamlValue(lines, 'display_name', config.display_name);
  pushYamlValue(lines, 'mode', config.mode);
  pushYamlValue(lines, 'model', config.model ?? undefined);
  pushYamlValue(lines, 'thinking', config.thinking);
  pushYamlValue(lines, 'max_turns', config.max_turns);
  pushYamlValue(lines, 'grace_turns', config.grace_turns);
  pushYamlValue(lines, 'skills', serializeStringList(config.skills));
  pushYamlValue(lines, 'inherit_context', config.inherit_context ?? undefined);
  pushYamlValue(lines, 'run_in_background', config.run_in_background ?? undefined);
  pushYamlValue(lines, 'enabled', config.enabled);
  pushYamlValue(lines, 'permission', config.permission);
  lines.push('---');
  lines.push('');
  lines.push(config.prompt.trim());
  lines.push('');
  return lines.join('\n');
};

export interface SaveAgentOptions {
  allowCreate: boolean;
  requireScope: boolean;
}

const normalizeAgentPayload = (
  name: string,
  payload: Partial<AgentPayload>,
  options: { requireScope?: boolean; existing?: ParsedAgent | null } = {},
): AgentPayload => {
  if (!isPlainObject(payload)) {
    throw createAgentError('INVALID_AGENT_FRONTMATTER', 'agent 配置必须是对象');
  }

  const topLevelKeys = new Set([
    'name',
    'description',
    'display_name',
    'mode',
    'model',
    'thinking',
    'max_turns',
    'grace_turns',
    'skills',
    'inherit_context',
    'run_in_background',
    'enabled',
    'permission',
    'prompt',
    'scope',
  ]);

  for (const key of Object.keys(payload)) {
    if (!topLevelKeys.has(key)) {
      throw createAgentError(
        'UNKNOWN_AGENT_FIELD',
        `不支持的 agent 配置字段: ${key}`,
      );
    }
  }

  const normalizedName = normalizeAgentName(payload.name || name);
  if (payload.name && normalizedName !== normalizeAgentName(name)) {
    throw createAgentError(
      'INVALID_AGENT_NAME',
      '请求体中的 name 必须与路径参数一致',
    );
  }

  const description = normalizeString(
    payload.description ?? options.existing?.description,
  );
  if (!description) {
    throw createAgentError('AGENT_DESCRIPTION_REQUIRED', 'agent 描述不能为空');
  }

  const prompt = normalizeString(payload.prompt ?? options.existing?.systemPrompt);
  if (!prompt) {
    throw createAgentError('AGENT_PROMPT_REQUIRED', 'agent prompt 不能为空');
  }

  const mode =
    payload.mode === undefined
      ? options.existing?.mode || 'all'
      : normalizeMode(payload.mode);
  if (!mode) {
    throw createAgentError(
      'INVALID_AGENT_MODE',
      'agent mode 只允许 primary、task、all',
    );
  }

  const thinking =
    payload.thinking === undefined
      ? options.existing?.thinking
      : payload.thinking === null
        ? undefined
        : normalizeThinkingLevel(payload.thinking);
  if (
    payload.thinking !== undefined &&
    payload.thinking !== null &&
    !thinking
  ) {
    throw createAgentError('INVALID_AGENT_THINKING', 'agent thinking 配置非法');
  }

  const maxTurns =
    payload.max_turns === undefined
      ? options.existing?.maxTurns
      : normalizeInteger(payload.max_turns);
  if (payload.max_turns !== undefined && maxTurns === undefined) {
    throw createAgentError(
      'INVALID_AGENT_MAX_TURNS',
      'agent max_turns 必须是大于等于 1 的整数',
    );
  }

  const graceTurns =
    payload.grace_turns === undefined
      ? options.existing?.graceTurns
      : payload.grace_turns === null
        ? undefined
        : normalizeNonNegativeInteger(payload.grace_turns);
  if (
    payload.grace_turns !== undefined &&
    payload.grace_turns !== null &&
    graceTurns === undefined
  ) {
    throw createAgentError(
      'INVALID_AGENT_GRACE_TURNS',
      'agent grace_turns 必须是大于等于 0 的整数',
    );
  }

  const skills =
    payload.skills === undefined
      ? options.existing?.skills
      : payload.skills === null
        ? undefined
        : normalizeStringList(payload.skills, 'skills');

  const inheritContext =
    payload.inherit_context === undefined
      ? options.existing?.inheritContext
      : payload.inherit_context === null
        ? undefined
        : normalizeOptionalBoolean(payload.inherit_context, 'inherit_context');

  const runInBackground =
    payload.run_in_background === undefined
      ? options.existing?.runInBackground
      : payload.run_in_background === null
        ? undefined
        : normalizeOptionalBoolean(
            payload.run_in_background,
            'run_in_background',
          );

  const enabled =
    payload.enabled === undefined
      ? (options.existing?.enabled ?? true)
      : normalizeBoolean(payload.enabled, true);

  let permission: AgentPermission | undefined;
  try {
    permission =
      payload.permission === undefined
        ? options.existing?.permission
        : normalizeAgentPermission(payload.permission);
  } catch (error) {
    throw createAgentError(
      'INVALID_AGENT_PERMISSION_SCHEMA',
      (error as Error)?.message || 'agent permission 配置非法',
    );
  }

  const scope = payload.scope ?? options.existing?.sourceScope;
  if (options.requireScope && scope !== 'user' && scope !== 'project') {
    throw createAgentError(
      'AGENT_SCOPE_REQUIRED',
      '创建 agent 时必须指定 scope',
    );
  }

  return {
    name: normalizedName,
    description,
    display_name:
      normalizeString(payload.display_name ?? options.existing?.displayName) ||
      undefined,
    mode,
    model: normalizeString(payload.model ?? options.existing?.model) || null,
    thinking: thinking ?? null,
    max_turns: maxTurns ?? null,
    grace_turns: graceTurns ?? null,
    skills: skills ?? null,
    inherit_context: inheritContext ?? null,
    run_in_background: runInBackground ?? null,
    enabled,
    permission,
    prompt,
    scope: scope as AgentScope,
  };
};

const resolveScopeDir = async (cwd: string, scope: AgentScope): Promise<string> => {
  if (scope === 'user') {
    return getUserAgentsDir();
  }

  if (scope === 'project') {
    return resolveProjectAgentsDirForWrite(cwd);
  }

  throw createAgentError(
    'AGENT_SCOPE_REQUIRED',
    'scope 必须是 user 或 project',
  );
};

export async function saveAgent(
  cwd: string,
  name: string,
  payload: Partial<AgentPayload>,
  options: SaveAgentOptions,
): Promise<ParsedAgent> {
  const existing = options.allowCreate
    ? null
    : await getAgentByName(cwd, name, payload.scope).catch(() => null);
  if (options.allowCreate !== true && !existing) {
    throw createAgentError('AGENT_NOT_FOUND', `agent 不存在: ${name}`, 404);
  }

  const normalized = normalizeAgentPayload(name, payload, {
    requireScope: options.requireScope === true,
    existing,
  });
  const scopeDir = await resolveScopeDir(cwd, normalized.scope);
  const filePath = path.join(scopeDir, `${normalized.name}.md`);

  if (options.allowCreate === true) {
    try {
      await fs.stat(filePath);
      throw createAgentError(
        'AGENT_NAME_CONFLICT',
        `agent 已存在: ${normalized.name}`,
        409,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException | HttpError).code === 'AGENT_NAME_CONFLICT') {
        throw error;
      }
      // ENOENT is expected
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  await fs.mkdir(scopeDir, { recursive: true });
  await fs.writeFile(filePath, serializeAgentFile(normalized), 'utf8');

  return getAgentByName(cwd, normalized.name, normalized.scope) as Promise<ParsedAgent>;
}

export async function deleteAgent(cwd: string, name: string, scope: AgentScope): Promise<string> {
  const normalizedName = normalizeAgentName(name);
  const scopeDir = await resolveScopeDir(cwd, scope);
  const filePath = path.join(scopeDir, `${normalizedName}.md`);
  await fs.rm(filePath, { force: true });
  return filePath;
}

// Re-export for type compatibility
export type { ParsedAgent as AgentConfigInternal };
