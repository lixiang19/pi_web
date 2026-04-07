import fs from "node:fs/promises";
import path from "node:path";

import { getAgentDir, parseFrontmatter } from "@mariozechner/pi-coding-agent";

import { normalizeAgentPermission } from "./agent-permissions.js";

export const AGENT_MODES = ["primary", "task", "all"];
export const THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
];

const AGENT_NAME_PATTERN = /^[a-z0-9-]+$/;
const SUPPORTED_FRONTMATTER_FIELDS = new Set([
  "name",
  "description",
  "display_name",
  "mode",
  "model",
  "thinking",
  "steps",
  "enabled",
  "permission",
]);

const normalizeString = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const createAgentError = (code, message, statusCode = 400) => {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
};

const normalizeBoolean = (value, fallback = true) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }

    if (normalized === "false") {
      return false;
    }
  }

  return fallback;
};

const normalizeInteger = (value) => {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isInteger(parsed) && parsed >= 1) {
      return parsed;
    }
  }

  return undefined;
};

export const normalizeThinkingLevel = (value) => {
  const normalized = normalizeString(value).toLowerCase();
  return THINKING_LEVELS.includes(normalized) ? normalized : undefined;
};

const normalizeMode = (value) => {
  const normalized = normalizeString(value).toLowerCase();
  return AGENT_MODES.includes(normalized) ? normalized : undefined;
};

const normalizeAgentName = (value) => {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized || !AGENT_NAME_PATTERN.test(normalized)) {
    throw createAgentError(
      "INVALID_AGENT_NAME",
      "Agent 名称只允许小写字母、数字和中划线",
    );
  }

  return normalized;
};

const ensureSupportedFields = (frontmatter) => {
  for (const key of Object.keys(frontmatter)) {
    if (!SUPPORTED_FRONTMATTER_FIELDS.has(key)) {
      throw createAgentError(
        "UNKNOWN_AGENT_FIELD",
        `不支持的 agent 字段: ${key}`,
      );
    }
  }
};

const isDirectory = async (targetPath) => {
  try {
    const stats = await fs.stat(targetPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
};

const getUserAgentsDir = () => path.join(getAgentDir(), "agents");

const findNearestProjectAgentsDir = async (cwd) => {
  let currentDir = path.resolve(cwd);

  while (true) {
    const candidate = path.join(currentDir, ".pi", "agents");
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

const resolveProjectAgentsDirForWrite = async (cwd) => {
  const nearest = await findNearestProjectAgentsDir(cwd);
  if (nearest) {
    return nearest;
  }

  return path.join(path.resolve(cwd), ".pi", "agents");
};

const parseAgentFile = (rawContent, filePath, sourceScope) => {
  let parsed;
  try {
    parsed = parseFrontmatter(rawContent);
  } catch (error) {
    throw createAgentError(
      "INVALID_AGENT_FRONTMATTER",
      error?.message || `无法解析 ${filePath}`,
    );
  }

  const frontmatter =
    parsed?.frontmatter && typeof parsed.frontmatter === "object"
      ? parsed.frontmatter
      : {};
  const systemPrompt =
    typeof parsed?.body === "string" ? parsed.body.trim() : rawContent.trim();

  ensureSupportedFields(frontmatter);

  const fileStem = path.basename(filePath, ".md");
  const resolvedName = normalizeAgentName(frontmatter.name || fileStem);
  if (
    normalizeString(frontmatter.name) &&
    resolvedName !== normalizeAgentName(fileStem)
  ) {
    throw createAgentError(
      "INVALID_AGENT_NAME",
      `agent 文件名与 frontmatter.name 不一致: ${filePath}`,
    );
  }

  const mode = normalizeMode(frontmatter.mode) || "all";
  const description = normalizeString(frontmatter.description);
  const displayName = normalizeString(frontmatter.display_name) || undefined;
  const model = normalizeString(frontmatter.model) || undefined;
  const thinking =
    frontmatter.thinking === undefined
      ? undefined
      : normalizeThinkingLevel(frontmatter.thinking);
  if (frontmatter.thinking !== undefined && !thinking) {
    throw createAgentError(
      "INVALID_AGENT_THINKING",
      `agent 的 thinking 配置非法: ${filePath}`,
    );
  }

  const steps =
    frontmatter.steps === undefined
      ? undefined
      : normalizeInteger(frontmatter.steps);
  if (frontmatter.steps !== undefined && steps === undefined) {
    throw createAgentError(
      "INVALID_AGENT_STEPS",
      `agent 的 steps 必须是大于等于 1 的整数: ${filePath}`,
    );
  }

  const enabled = normalizeBoolean(frontmatter.enabled, true);

  let permission;
  try {
    permission = normalizeAgentPermission(frontmatter.permission);
  } catch (error) {
    throw createAgentError(
      "INVALID_AGENT_PERMISSION_SCHEMA",
      error?.message || `agent 的 permission 配置非法: ${filePath}`,
    );
  }

  return {
    name: resolvedName,
    description,
    displayName,
    mode,
    model,
    thinking,
    steps,
    enabled,
    permission,
    systemPrompt,
    source: filePath,
    sourceScope,
  };
};

const loadAgentsFromDir = async (dirPath, sourceScope) => {
  const agents = [];

  let files = [];
  try {
    files = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn(`读取 agent 目录失败 ${dirPath}:`, error);
    }
    return agents;
  }

  for (const entry of files) {
    if (!entry.name.endsWith(".md")) {
      continue;
    }

    if (!entry.isFile() && !entry.isSymbolicLink()) {
      continue;
    }

    const filePath = path.join(dirPath, entry.name);
    try {
      const rawContent = await fs.readFile(filePath, "utf8");
      const agent = parseAgentFile(rawContent, filePath, sourceScope);
      if (agent.enabled === false) {
        continue;
      }

      agents.push(agent);
    } catch (error) {
      console.warn(`加载 agent 失败 ${filePath}:`, error?.message || error);
    }
  }

  return agents;
};

const mergeAgents = (userAgents, projectAgents) => {
  const merged = new Map();
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

export const getAgentConfigSignature = (agent) => {
  if (!agent) {
    return "";
  }

  return JSON.stringify({
    name: agent.name,
    mode: agent.mode,
    source: agent.source,
    sourceScope: agent.sourceScope,
    description: agent.description || "",
    displayName: agent.displayName || "",
    systemPrompt: agent.systemPrompt || "",
    model: agent.model || "",
    thinking: agent.thinking || "",
    steps: agent.steps || 0,
    permission: agent.permission || {},
    enabled: agent.enabled !== false,
  });
};

export async function discoverAgents(cwd) {
  const normalizedCwd = normalizeString(cwd) || process.cwd();
  const userAgentsDir = getUserAgentsDir();
  const projectAgentsDir = await findNearestProjectAgentsDir(normalizedCwd);

  const [userAgents, projectAgents] = await Promise.all([
    loadAgentsFromDir(userAgentsDir, "user"),
    projectAgentsDir
      ? loadAgentsFromDir(projectAgentsDir, "project")
      : Promise.resolve([]),
  ]);

  return mergeAgents(userAgents, projectAgents);
}

export async function getAgentByName(cwd, name, scope) {
  const normalizedName = normalizeAgentName(name);
  const normalizedCwd = normalizeString(cwd) || process.cwd();

  try {
    if (scope === "user") {
      const filePath = path.join(getUserAgentsDir(), `${normalizedName}.md`);
      const rawContent = await fs.readFile(filePath, "utf8");
      return parseAgentFile(rawContent, filePath, "user");
    }

    if (scope === "project") {
      const dirPath = await resolveProjectAgentsDirForWrite(normalizedCwd);
      const filePath = path.join(dirPath, `${normalizedName}.md`);
      const rawContent = await fs.readFile(filePath, "utf8");
      return parseAgentFile(rawContent, filePath, "project");
    }
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }

    throw error;
  }

  const agents = await discoverAgents(normalizedCwd);
  return agents.find((agent) => agent.name === normalizedName) ?? null;
}

const quoteYamlString = (value) => JSON.stringify(String(value));

const pushYamlValue = (lines, key, value, indent = 0) => {
  const prefix = "  ".repeat(indent);
  if (value === undefined) {
    return;
  }

  if (typeof value === "string") {
    lines.push(`${prefix}${key}: ${quoteYamlString(value)}`);
    return;
  }

  if (typeof value === "number" || typeof value === "boolean") {
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

const serializeAgentFile = (config) => {
  const lines = ["---"];
  pushYamlValue(lines, "name", config.name);
  pushYamlValue(lines, "description", config.description);
  pushYamlValue(lines, "display_name", config.display_name);
  pushYamlValue(lines, "mode", config.mode);
  pushYamlValue(lines, "model", config.model ?? undefined);
  pushYamlValue(lines, "thinking", config.thinking);
  pushYamlValue(lines, "steps", config.steps);
  pushYamlValue(lines, "enabled", config.enabled);
  pushYamlValue(lines, "permission", config.permission);
  lines.push("---");
  lines.push("");
  lines.push(config.prompt.trim());
  lines.push("");
  return lines.join("\n");
};

const normalizeAgentPayload = (
  name,
  payload,
  { requireScope = false, existing = null } = {},
) => {
  if (!isPlainObject(payload)) {
    throw createAgentError("INVALID_AGENT_FRONTMATTER", "agent 配置必须是对象");
  }

  const topLevelKeys = new Set([
    "name",
    "description",
    "display_name",
    "mode",
    "model",
    "thinking",
    "steps",
    "enabled",
    "permission",
    "prompt",
    "scope",
  ]);

  for (const key of Object.keys(payload)) {
    if (!topLevelKeys.has(key)) {
      throw createAgentError(
        "UNKNOWN_AGENT_FIELD",
        `不支持的 agent 配置字段: ${key}`,
      );
    }
  }

  const normalizedName = normalizeAgentName(payload.name || name);
  if (payload.name && normalizedName !== normalizeAgentName(name)) {
    throw createAgentError(
      "INVALID_AGENT_NAME",
      "请求体中的 name 必须与路径参数一致",
    );
  }

  const description = normalizeString(
    payload.description ?? existing?.description,
  );
  if (!description) {
    throw createAgentError("AGENT_DESCRIPTION_REQUIRED", "agent 描述不能为空");
  }

  const prompt = normalizeString(payload.prompt ?? existing?.systemPrompt);
  if (!prompt) {
    throw createAgentError("AGENT_PROMPT_REQUIRED", "agent prompt 不能为空");
  }

  const mode =
    payload.mode === undefined
      ? existing?.mode || "all"
      : normalizeMode(payload.mode);
  if (!mode) {
    throw createAgentError(
      "INVALID_AGENT_MODE",
      "agent mode 只允许 primary、task、all",
    );
  }

  const thinking =
    payload.thinking === undefined
      ? existing?.thinking
      : payload.thinking === null
        ? undefined
        : normalizeThinkingLevel(payload.thinking);
  if (
    payload.thinking !== undefined &&
    payload.thinking !== null &&
    !thinking
  ) {
    throw createAgentError("INVALID_AGENT_THINKING", "agent thinking 配置非法");
  }

  const steps =
    payload.steps === undefined
      ? existing?.steps
      : normalizeInteger(payload.steps);
  if (payload.steps !== undefined && steps === undefined) {
    throw createAgentError(
      "INVALID_AGENT_STEPS",
      "agent steps 必须是大于等于 1 的整数",
    );
  }

  const enabled =
    payload.enabled === undefined
      ? (existing?.enabled ?? true)
      : normalizeBoolean(payload.enabled, true);

  let permission;
  try {
    permission =
      payload.permission === undefined
        ? existing?.permission
        : normalizeAgentPermission(payload.permission);
  } catch (error) {
    throw createAgentError(
      "INVALID_AGENT_PERMISSION_SCHEMA",
      error?.message || "agent permission 配置非法",
    );
  }

  const scope = payload.scope ?? existing?.sourceScope;
  if (requireScope && scope !== "user" && scope !== "project") {
    throw createAgentError(
      "AGENT_SCOPE_REQUIRED",
      "创建 agent 时必须指定 scope",
    );
  }

  const normalized = {
    name: normalizedName,
    description,
    display_name:
      normalizeString(payload.display_name ?? existing?.displayName) ||
      undefined,
    mode,
    model: normalizeString(payload.model ?? existing?.model) || null,
    thinking,
    steps,
    enabled,
    permission,
    prompt,
    scope,
  };

  return normalized;
};

const resolveScopeDir = async (cwd, scope) => {
  if (scope === "user") {
    return getUserAgentsDir();
  }

  if (scope === "project") {
    return resolveProjectAgentsDirForWrite(cwd);
  }

  throw createAgentError(
    "AGENT_SCOPE_REQUIRED",
    "scope 必须是 user 或 project",
  );
};

export async function saveAgent(cwd, name, payload, options = {}) {
  const existing = options.allowCreate
    ? null
    : await getAgentByName(cwd, name, payload.scope).catch(() => null);
  if (options.allowCreate !== true && !existing) {
    throw createAgentError("AGENT_NOT_FOUND", `agent 不存在: ${name}`, 404);
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
        "AGENT_NAME_CONFLICT",
        `agent 已存在: ${normalized.name}`,
        409,
      );
    } catch (error) {
      if (error?.code !== "ENOENT") {
        if (error?.code === "AGENT_NAME_CONFLICT") {
          throw error;
        }
      }
    }
  }

  await fs.mkdir(scopeDir, { recursive: true });
  await fs.writeFile(filePath, serializeAgentFile(normalized), "utf8");

  return getAgentByName(cwd, normalized.name, normalized.scope);
}

export async function deleteAgent(cwd, name, scope) {
  const normalizedName = normalizeAgentName(name);
  const scopeDir = await resolveScopeDir(cwd, scope);
  const filePath = path.join(scopeDir, `${normalizedName}.md`);
  await fs.rm(filePath, { force: true });
  return filePath;
}
