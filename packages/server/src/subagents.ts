import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { Type } from '@sinclair/typebox';
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type ModelInfo,
  type PiExtensionAPI,
} from '@mariozechner/pi-coding-agent';

import { compileAgentPermission, createPermissionGateExtension } from './agent-permissions.js';
import {
  createResourceDiscoverySettingsManager,
  isPiResourceIsolationEnabled,
} from './pi-resource-scope.js';
import { discoverAgents, normalizeThinkingLevel, type AgentConfigInternal } from './agents.js';
import type { HttpError, SessionRecord, ThinkingLevel } from './types/index.js';

// ============================================================
// Types
// ============================================================

interface ParentModelResolver {
  (spec: string | undefined | null): ModelInfo | null;
}

interface ChildSessionEntry {
  sessionId: string;
  sessionFile: string;
  parentSessionId: string;
  agentName: string;
  prompt: string;
  status: 'running' | 'completed' | 'error';
  result?: string;
  error?: string;
  session?: AgentSession;
  promise?: Promise<void>;
}

export interface SubagentExtensionOptions {
  authStorage: unknown;
  modelRegistry: unknown;
  resolveModel: ParentModelResolver;
}

// ============================================================
// Module-level registry — in-memory only, no persistence
// ============================================================

const childRegistry = new Map<string, ChildSessionEntry>();

// ============================================================
// Helpers
// ============================================================

const createHttpError = (message: string, statusCode = 400): HttpError => {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  return error;
};

const normalizeStr = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const toMessageText = (content: unknown): string => {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return '';
      }
      const typed = item as Record<string, unknown>;
      if (typed.type === 'text') {
        return typeof typed.text === 'string' ? typed.text : '';
      }
      if (typed.type === 'thinking') {
        return typeof typed.thinking === 'string' ? typed.thinking : '';
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
};

const buildInheritedContextBlock = (record: SessionRecord): string => {
  const sourceMessages = record.session.messages.slice(-12);
  if (sourceMessages.length === 0) {
    return '';
  }

  const lines = sourceMessages
    .map((message) => {
      const role = normalizeStr(message.role).toLowerCase();
      const text = toMessageText(message.content).trim();
      if (!text) {
        return '';
      }
      if (role === 'user') {
        return `[User]\n${text}`;
      }
      if (role === 'assistant') {
        return `[Assistant]\n${text}`;
      }
      if (role === 'toolresult' || role === 'tool') {
        return `[Tool]\n${text}`;
      }
      return '';
    })
    .filter(Boolean);

  if (lines.length === 0) {
    return '';
  }

  return [
    '## Parent Conversation Context',
    'Below is recent parent conversation context. Use it only when relevant to the assigned task.',
    lines.join('\n\n'),
  ].join('\n\n');
};

const findNearestProjectSkillsDir = async (cwd: string): Promise<string | null> => {
  let currentDir = path.resolve(cwd);
  while (true) {
    const candidate = path.join(currentDir, '.pi', 'skills');
    try {
      const stats = await fs.stat(candidate);
      if (stats.isDirectory()) {
        return candidate;
      }
    } catch {
      // noop
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
  }
};

const loadSkillBlocks = async (cwd: string, names: string[] | undefined): Promise<string[]> => {
  if (!names || names.length === 0) {
    return [];
  }

  const projectDir = await findNearestProjectSkillsDir(cwd);
  const globalDir = path.join(os.homedir(), '.pi', 'skills');
  const searchDirs = [
    projectDir,
    isPiResourceIsolationEnabled() ? null : globalDir,
  ].filter((dir): dir is string => Boolean(dir));
  const blocks: string[] = [];

  for (const rawName of names) {
    const name = normalizeStr(rawName);
    if (!name) {
      continue;
    }

    const candidates = [name, `${name}.md`, `${name}.txt`];
    let loaded: string | null = null;
    for (const dir of searchDirs) {
      for (const candidate of candidates) {
        const filePath = path.join(dir, candidate);
        try {
          const content = await fs.readFile(filePath, 'utf8');
          loaded = `## Preloaded Skill: ${name}\n${content.trim()}`;
          break;
        } catch {
          // noop
        }
      }
      if (loaded) {
        break;
      }
    }

    if (loaded) {
      blocks.push(loaded);
    }
  }

  return blocks;
};

const buildSubagentSystemPrompt = async (
  agent: AgentConfigInternal,
  parentRecord: SessionRecord,
  inheritContext: boolean,
): Promise<string> => {
  const skillBlocks = await loadSkillBlocks(parentRecord.cwd, agent.skills);
  const sections = [
    'You are an internal subagent running inside Pi Web.',
    `Agent name: ${agent.displayName || agent.name}`,
    agent.systemPrompt.trim(),
  ].filter(Boolean);

  if (inheritContext) {
    const contextBlock = buildInheritedContextBlock(parentRecord);
    if (contextBlock) {
      sections.push(contextBlock);
    }
  }

  if (skillBlocks.length > 0) {
    sections.push(skillBlocks.join('\n\n'));
  }

  return sections.join('\n\n');
};

const getLastAssistantText = (session: AgentSession): string => {
  for (let index = session.messages.length - 1; index >= 0; index -= 1) {
    const message = session.messages[index];
    if (message.role !== 'assistant') {
      continue;
    }
    const text = toMessageText(message.content).trim();
    if (text) {
      return text;
    }
  }
  return '';
};

// ============================================================
// Tool schemas
// ============================================================

const TaskToolSchema = Type.Object({
  agent: Type.String({ description: '子代理 agent 名称' }),
  prompt: Type.String({ description: '交给子代理的任务' }),
  run_in_background: Type.Optional(
    Type.Boolean({ description: '后台执行，工具立即返回 sessionId' }),
  ),
  inherit_context: Type.Optional(Type.Boolean({ description: '继承父会话上下文' })),
  model: Type.Optional(Type.String({ description: '模型覆盖' })),
  thinking: Type.Optional(
    Type.Union([
      Type.Literal('off'),
      Type.Literal('minimal'),
      Type.Literal('low'),
      Type.Literal('medium'),
      Type.Literal('high'),
      Type.Literal('xhigh'),
    ]),
  ),
  max_turns: Type.Optional(Type.Number({ minimum: 1, description: '最大轮次' })),
});

const SteerSubagentSchema = Type.Object({
  session_id: Type.String({ description: '子代理会话 ID' }),
  message: Type.String({ description: '转向消息，会在当前工具执行完毕后注入' }),
});

const GetSubagentResultSchema = Type.Object({
  session_id: Type.String({ description: '子代理会话 ID' }),
});

// ============================================================
// Child session runner
// ============================================================

const runChildSession = async (
  entry: ChildSessionEntry,
  parentRecord: SessionRecord,
  agent: AgentConfigInternal,
  sessionManager: SessionManager,
  runOptions: {
    authStorage: unknown;
    modelRegistry: unknown;
    resolveModel: ParentModelResolver;
    inheritContext: boolean;
    model?: string;
    thinkingLevel?: ThinkingLevel | null;
    maxTurns?: number | null;
  },
): Promise<void> => {
  const settingsManager = SettingsManager.create(parentRecord.cwd);
  const resourceSettingsManager = createResourceDiscoverySettingsManager(parentRecord.cwd);
  let permissionPolicy: ReturnType<typeof compileAgentPermission> | null = null;

  const childSystemPrompt = await buildSubagentSystemPrompt(
    agent,
    parentRecord,
    runOptions.inheritContext,
  );

  const resourceLoader = new DefaultResourceLoader({
    cwd: parentRecord.cwd,
    settingsManager: resourceSettingsManager,
    appendSystemPromptOverride: (base: string[]) => [...base, childSystemPrompt],
    extensionFactories: [createPermissionGateExtension(() => permissionPolicy)],
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd: parentRecord.cwd,
    authStorage: runOptions.authStorage as never,
    modelRegistry: runOptions.modelRegistry as never,
    sessionManager,
    settingsManager,
    resourceLoader,
  });

  entry.session = session;
  // Update from session in case createAgentSession adjusted the path
  entry.sessionFile = session.sessionFile || entry.sessionFile;

  const model = runOptions.resolveModel(runOptions.model ?? agent.model);
  if (model) {
    await session.setModel(model);
  }

  const thinking =
    runOptions.thinkingLevel !== undefined
      ? normalizeThinkingLevel(runOptions.thinkingLevel)
      : normalizeThinkingLevel(agent.thinking);
  if (thinking) {
    await session.setThinkingLevel(thinking);
  }

  permissionPolicy = compileAgentPermission(
    parentRecord.cwd,
    agent.permission,
    session.getActiveToolNames(),
  );
  await session.setActiveToolsByName(permissionPolicy.activeToolNames);

  const maxTurns = runOptions.maxTurns ?? agent.maxTurns;
  let turnCount = 0;

  const unsubscribe = session.subscribe((event) => {
    if (event.type === 'turn_end') {
      turnCount += 1;
      if (maxTurns && turnCount >= maxTurns) {
        void session.abort();
      }
    }
  });

  try {
    await session.prompt(entry.prompt, { source: 'interactive' });
    entry.status = 'completed';
    entry.result = getLastAssistantText(session) || '子代理已完成，但没有输出文本。';
  } catch (error) {
    entry.status = 'error';
    entry.error = error instanceof Error ? error.message : String(error);
  } finally {
    unsubscribe();
  }
};

// ============================================================
// Tool extension factory — exported, used in createSessionResourceLoader
// ============================================================

export const createSubagentToolExtension = (
  parentRecord: SessionRecord,
  extOptions: SubagentExtensionOptions,
) =>
  (pi: PiExtensionAPI): void => {
    // ---- task ----
    pi.registerTool({
      name: 'task',
      label: 'Task',
      description:
        'Launch a subagent as a real persistent child session. ' +
        'Returns { sessionId, sessionFile, status, result?, error? }. ' +
        'Use run_in_background=true to return immediately with sessionId.',
      parameters: TaskToolSchema,
      async execute(_toolCallId, params: Record<string, unknown>) {
        const agentName = normalizeStr(params.agent);
        if (!agentName) {
          throw createHttpError('缺少 agent 参数');
        }
        const prompt = normalizeStr(params.prompt);
        if (!prompt) {
          throw createHttpError('缺少 prompt 参数');
        }

        const agents = await discoverAgents(parentRecord.cwd);
        const agent = agents.find((item) => item.name === agentName);
        if (!agent || agent.enabled === false) {
          throw createHttpError(`子代理不存在或已禁用: ${agentName}`, 404);
        }
        if (agent.mode === 'primary') {
          throw createHttpError(`Agent ${agentName} 仅允许主会话使用`);
        }

        const runInBackground =
          (Object.prototype.hasOwnProperty.call(params, 'run_in_background')
            ? params.run_in_background === true
            : null) ??
          agent.runInBackground ??
          false;

        const inheritContext =
          (Object.prototype.hasOwnProperty.call(params, 'inherit_context')
            ? params.inherit_context === true
            : null) ??
          agent.inheritContext ??
          false;

        const maxTurns =
          typeof params.max_turns === 'number' && Number.isInteger(params.max_turns)
            ? params.max_turns
            : undefined;

        // Pre-create the session manager so we have a stable sessionId before the async run
        const sessionManager = SessionManager.create(parentRecord.cwd);
        sessionManager.newSession({ parentSession: parentRecord.sessionFile });
        const sessionId = sessionManager.getSessionId();
        const sessionFile = sessionManager.getSessionFile();

        const entry: ChildSessionEntry = {
          sessionId,
          sessionFile,
          parentSessionId: parentRecord.id,
          agentName: agent.name,
          prompt,
          status: 'running',
        };
        childRegistry.set(sessionId, entry);

        const promise = runChildSession(entry, parentRecord, agent, sessionManager, {
          authStorage: extOptions.authStorage,
          modelRegistry: extOptions.modelRegistry,
          resolveModel: extOptions.resolveModel,
          inheritContext,
          model: normalizeStr(params.model) || undefined,
          thinkingLevel: normalizeThinkingLevel(params.thinking) as ThinkingLevel | undefined,
          maxTurns,
        }).catch((error: unknown) => {
          if (entry.status === 'running') {
            entry.status = 'error';
            entry.error = error instanceof Error ? error.message : String(error);
          }
        });
        entry.promise = promise;

        if (!runInBackground) {
          await promise;
        }

        const details = {
          sessionId: entry.sessionId,
          sessionFile: entry.sessionFile,
          status: entry.status,
          result: entry.result,
          error: entry.error,
        };

        const text = runInBackground
          ? `子代理已后台启动，会话 ID：${sessionId}`
          : entry.status === 'completed'
            ? entry.result || '子代理已完成。'
            : `子代理失败：${entry.error || '未知错误'}`;

        return {
          content: [{ type: 'text' as const, text }],
          details,
        };
      },
    });

    // ---- steer_subagent ----
    pi.registerTool({
      name: 'steer_subagent',
      label: 'Steer Subagent',
      description:
        'Send a steering message to a running subagent session. ' +
        'The message interrupts after the current tool execution.',
      parameters: SteerSubagentSchema,
      async execute(_toolCallId, params: Record<string, unknown>) {
        const sessionId = normalizeStr(params.session_id);
        if (!sessionId) {
          throw createHttpError('缺少 session_id');
        }
        const message = normalizeStr(params.message);
        if (!message) {
          throw createHttpError('缺少 message');
        }

        const entry = childRegistry.get(sessionId);
        if (!entry) {
          throw createHttpError(`子代理会话不存在: ${sessionId}`, 404);
        }
        if (entry.parentSessionId !== parentRecord.id) {
          throw createHttpError(`无权操作此子代理会话: ${sessionId}`, 403);
        }
        if (entry.status !== 'running' || !entry.session) {
          throw createHttpError(`子代理当前不在运行态，无法 steer: ${sessionId}`);
        }

        const steerable = entry.session as AgentSession & {
          steer?: (text: string) => Promise<void>;
        };
        if (typeof steerable.steer === 'function') {
          await steerable.steer(message);
        } else {
          await entry.session.prompt(message, { streamingBehavior: 'steer' });
        }

        const details = { sessionId, status: 'running' as const, ok: true };
        return {
          content: [{ type: 'text' as const, text: '已向子代理发送转向消息' }],
          details,
        };
      },
    });

    // ---- get_subagent_result ----
    pi.registerTool({
      name: 'get_subagent_result',
      label: 'Get Subagent Result',
      description: 'Check status and retrieve result from a background subagent session.',
      parameters: GetSubagentResultSchema,
      async execute(_toolCallId, params: Record<string, unknown>) {
        const sessionId = normalizeStr(params.session_id);
        if (!sessionId) {
          throw createHttpError('缺少 session_id');
        }

        const entry = childRegistry.get(sessionId);
        if (!entry) {
          throw createHttpError(`子代理会话不存在: ${sessionId}`, 404);
        }
        if (entry.parentSessionId !== parentRecord.id) {
          throw createHttpError(`无权访问此子代理会话: ${sessionId}`, 403);
        }

        const details = {
          sessionId: entry.sessionId,
          sessionFile: entry.sessionFile,
          status: entry.status,
          result: entry.result,
          error: entry.error,
        };

        let text: string;
        if (entry.status === 'running') {
          text = `子代理正在运行中，会话 ID：${sessionId}`;
        } else if (entry.status === 'completed') {
          text = entry.result || '子代理已完成，无输出。';
        } else {
          text = `子代理失败：${entry.error || '未知错误'}`;
        }

        return {
          content: [{ type: 'text' as const, text }],
          details,
        };
      },
    });
  };
