import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { Type } from '@sinclair/typebox';
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  type AgentSession,
  type ExtensionAPI,
} from '@mariozechner/pi-coding-agent';
import type { Api, Message, Model } from '@mariozechner/pi-ai';

import { compileAgentPermission, createPermissionGateExtension } from './agent-permissions.js';
import {
  createPiAgentScopeSettingsManager,
  getPiAgentScopeAgentDir,
  isPiResourceIsolationEnabled,
} from './pi-resource-scope.js';
import { discoverAgents, normalizeThinkingLevel, type AgentConfigInternal } from './agents.js';
import type { HttpError, SessionRecord, ThinkingLevel } from './types/index.js';

// ============================================================
// Types
// ============================================================

interface ParentModelResolver {
  (spec: string | undefined | null): Model<Api> | null;
}

type ChildSessionStatus = 'queued' | 'running' | 'completed' | 'steered' | 'error';

interface ChildSessionEntry {
  sessionId: string;
  sessionFile: string | undefined;
  parentSessionId: string;
  agentName: string;
  prompt: string;
  status: ChildSessionStatus;
  result?: string;
  error?: string;
  session?: AgentSession;
  promise?: Promise<void>;
}

interface QueuedChildRun {
  entry: ChildSessionEntry;
  execute: () => Promise<void>;
  resolve: () => void;
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
const runningChildSessions = new Set<string>();
const queuedChildRuns: QueuedChildRun[] = [];

const DEFAULT_MAX_CONCURRENT_CHILD_SESSIONS = 4;
const DEFAULT_GRACE_TURNS = 3;
const INHERITED_CONTEXT_MESSAGE_LIMIT = 12;

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

const isConversationMessage = (message: unknown): message is Message => {
  if (!message || typeof message !== 'object') {
    return false;
  }
  const role = (message as { role?: unknown }).role;
  return role === 'user' || role === 'assistant' || role === 'toolResult';
};

const cloneMessage = (message: Message): Message =>
  JSON.parse(JSON.stringify(message)) as Message;

const selectInheritedMessages = (record: SessionRecord): Message[] => {
  const messages = record.session.messages
    .slice(-INHERITED_CONTEXT_MESSAGE_LIMIT)
    .filter(isConversationMessage)
    .map(cloneMessage);

  while (messages[0]?.role === 'toolResult') {
    messages.shift();
  }

  return messages;
};

const appendInheritedMessages = (
  sessionManager: SessionManager,
  parentRecord: SessionRecord,
  inheritContext: boolean,
): void => {
  if (!inheritContext) {
    return;
  }

  for (const message of selectInheritedMessages(parentRecord)) {
    sessionManager.appendMessage(message);
  }
};

const parsePositiveEnvInteger = (value: string | undefined): number | null => {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
};

const getMaxConcurrentChildSessions = (): number =>
  parsePositiveEnvInteger(process.env.RIDGE_SUBAGENT_MAX_CONCURRENT) ??
  DEFAULT_MAX_CONCURRENT_CHILD_SESSIONS;

const pumpQueuedChildRuns = (): void => {
  const maxConcurrent = getMaxConcurrentChildSessions();
  while (runningChildSessions.size < maxConcurrent) {
    const next = queuedChildRuns.shift();
    if (!next) {
      return;
    }

    runningChildSessions.add(next.entry.sessionId);
    next.entry.status = 'running';
    void next
      .execute()
      .catch((error: unknown) => {
        if (next.entry.status === 'running') {
          next.entry.status = 'error';
          next.entry.error = error instanceof Error ? error.message : String(error);
        }
      })
      .finally(() => {
        runningChildSessions.delete(next.entry.sessionId);
        next.resolve();
        pumpQueuedChildRuns();
      });
  }
};

const scheduleChildRun = (
  entry: ChildSessionEntry,
  execute: () => Promise<void>,
): Promise<void> => {
  const promise = new Promise<void>((resolve) => {
    queuedChildRuns.push({ entry, execute, resolve });
  });
  entry.status = 'queued';
  entry.promise = promise;
  pumpQueuedChildRuns();
  return promise;
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
): Promise<string> => {
  const skillBlocks = await loadSkillBlocks(parentRecord.cwd, agent.skills);
  const sections = [
    'You are an internal subagent running inside Pi Web.',
    `Agent name: ${agent.displayName || agent.name}`,
    agent.systemPrompt.trim(),
  ].filter(Boolean);

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
  agent: Type.Optional(Type.String({ description: '子代理 agent 名称' })),
  prompt: Type.String({ description: '交给子代理的任务' }),
  resume: Type.Optional(Type.String({ description: '恢复已有子代理会话 ID' })),
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

const sendSteerMessage = async (session: AgentSession, message: string): Promise<void> => {
  const steerable = session as AgentSession & {
    steer?: (text: string) => Promise<void>;
  };
  if (typeof steerable.steer === 'function') {
    await steerable.steer(message);
    return;
  }
  await session.prompt(message, { streamingBehavior: 'steer' });
};

const runPromptWithTurnBudget = async (
  entry: ChildSessionEntry,
  session: AgentSession,
  prompt: string,
  maxTurns: number | undefined,
  graceTurns: number,
): Promise<void> => {
  let turnCount = 0;
  let steered = false;
  let graceTurnsUsed = 0;
  let forcedAbortByTurnBudget = false;

  const unsubscribe = session.subscribe((event) => {
    if (event.type !== 'turn_end' || !maxTurns) {
      return;
    }

    turnCount += 1;
    if (turnCount < maxTurns) {
      return;
    }

    if (!steered) {
      steered = true;
      void sendSteerMessage(
        session,
        '已达到子代理 max_turns，请立即收尾，给出当前结果。',
      );
      if (graceTurns === 0) {
        forcedAbortByTurnBudget = true;
        void session.abort();
      }
      return;
    }

    graceTurnsUsed += 1;
    if (graceTurnsUsed >= graceTurns) {
      forcedAbortByTurnBudget = true;
      void session.abort();
    }
  });

  try {
    await session.prompt(prompt, { source: 'interactive' });
    entry.status = forcedAbortByTurnBudget ? 'steered' : 'completed';
    entry.result =
      getLastAssistantText(session) ||
      (forcedAbortByTurnBudget
        ? '子代理已达到 max_turns 宽限上限并停止。'
        : '子代理已完成，但没有输出文本。');
  } catch (error) {
    if (forcedAbortByTurnBudget) {
      entry.status = 'steered';
      entry.result = getLastAssistantText(session) || '子代理已达到 max_turns 宽限上限并停止。';
      entry.error = undefined;
      return;
    }
    entry.status = 'error';
    entry.error = error instanceof Error ? error.message : String(error);
  } finally {
    unsubscribe();
  }
};

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
  const settingsManager = createPiAgentScopeSettingsManager(parentRecord.cwd);
  let permissionPolicy: ReturnType<typeof compileAgentPermission> | null = null;

  const childSystemPrompt = await buildSubagentSystemPrompt(agent, parentRecord);

  const resourceLoader = new DefaultResourceLoader({
    cwd: parentRecord.cwd,
    agentDir: getPiAgentScopeAgentDir(),
    settingsManager,
    appendSystemPromptOverride: (base: string[]) => [...base, childSystemPrompt],
    extensionFactories: [createPermissionGateExtension(() => permissionPolicy)],
  });
  await resourceLoader.reload();

  appendInheritedMessages(sessionManager, parentRecord, runOptions.inheritContext);

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
  const graceTurns = agent.graceTurns ?? DEFAULT_GRACE_TURNS;
  await runPromptWithTurnBudget(entry, session, entry.prompt, maxTurns, graceTurns);
};

// ============================================================
// Tool extension factory — exported, used in createSessionResourceLoader
// ============================================================

export const createSubagentToolExtension = (
  parentRecord: SessionRecord,
  extOptions: SubagentExtensionOptions,
) =>
  (pi: ExtensionAPI): void => {
    // ---- task ----
    pi.registerTool({
      name: 'task',
      label: 'Task',
      description:
        'Launch a subagent as a real persistent child session. ' +
        'Returns { sessionId, sessionFile, status, result?, error? }. ' +
        'Use run_in_background=true to return immediately with sessionId.',
      parameters: TaskToolSchema,
      async execute(_toolCallId: string, params: Record<string, unknown>) {
        const prompt = normalizeStr(params.prompt);
        if (!prompt) {
          throw createHttpError('缺少 prompt 参数');
        }

        const resumeSessionId = normalizeStr(params.resume);
        const requestedAgentName = normalizeStr(params.agent);
        let agentName = requestedAgentName;
        let existingEntry: ChildSessionEntry | null = null;

        if (resumeSessionId) {
          const entry = childRegistry.get(resumeSessionId);
          if (!entry) {
            throw createHttpError(`子代理会话不存在: ${resumeSessionId}`, 404);
          }
          if (entry.parentSessionId !== parentRecord.id) {
            throw createHttpError(`无权恢复此子代理会话: ${resumeSessionId}`, 403);
          }
          if (entry.status === 'running' || entry.status === 'queued') {
            throw createHttpError(`子代理当前未结束，无法 resume: ${resumeSessionId}`);
          }
          if (entry.status !== 'completed' && entry.status !== 'steered') {
            throw createHttpError(`子代理当前状态不可 resume: ${resumeSessionId}`);
          }
          if (!entry.session) {
            throw createHttpError(`子代理运行时不存在，无法 resume: ${resumeSessionId}`);
          }
          if (requestedAgentName && requestedAgentName !== entry.agentName) {
            throw createHttpError(`resume 指定的 agent 与原子代理不一致: ${entry.agentName}`);
          }
          agentName = entry.agentName;
          existingEntry = entry;
        }

        if (!agentName) {
          throw createHttpError('缺少 agent 参数');
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

        if (existingEntry) {
          const resumedSession = existingEntry.session;
          if (!resumedSession) {
            throw createHttpError(`子代理运行时不存在，无法 resume: ${resumeSessionId}`);
          }
          existingEntry.prompt = prompt;
          existingEntry.result = undefined;
          existingEntry.error = undefined;

          const promise = scheduleChildRun(existingEntry, () =>
            runPromptWithTurnBudget(
              existingEntry,
              resumedSession,
              prompt,
              maxTurns ?? agent.maxTurns,
              agent.graceTurns ?? DEFAULT_GRACE_TURNS,
            ),
          );

          if (!runInBackground) {
            await promise;
          }

          const details = {
            sessionId: existingEntry.sessionId,
            sessionFile: existingEntry.sessionFile,
            status: existingEntry.status,
            result: existingEntry.result,
            error: existingEntry.error,
          };

          const text = runInBackground
            ? existingEntry.status === 'queued'
              ? `子代理已进入后台队列，会话 ID：${resumeSessionId}`
              : `子代理已后台恢复，会话 ID：${resumeSessionId}`
            : existingEntry.status === 'completed' || existingEntry.status === 'steered'
              ? existingEntry.result || '子代理已完成。'
              : `子代理失败：${existingEntry.error || '未知错误'}`;

          return {
            content: [{ type: 'text' as const, text }],
            details,
          };
        }

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
          status: 'queued',
        };
        childRegistry.set(sessionId, entry);

        const promise = scheduleChildRun(entry, () =>
          runChildSession(entry, parentRecord, agent, sessionManager, {
            authStorage: extOptions.authStorage,
            modelRegistry: extOptions.modelRegistry,
            resolveModel: extOptions.resolveModel,
            inheritContext,
            model: normalizeStr(params.model) || undefined,
            thinkingLevel: normalizeThinkingLevel(params.thinking) as ThinkingLevel | undefined,
            maxTurns,
          }),
        );

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
          ? entry.status === 'queued'
            ? `子代理已进入后台队列，会话 ID：${sessionId}`
            : `子代理已后台启动，会话 ID：${sessionId}`
          : entry.status === 'completed' || entry.status === 'steered'
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
      async execute(_toolCallId: string, params: Record<string, unknown>) {
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

        await sendSteerMessage(entry.session, message);

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
      async execute(_toolCallId: string, params: Record<string, unknown>) {
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
        if (entry.status === 'queued') {
          text = `子代理正在排队中，会话 ID：${sessionId}`;
        } else if (entry.status === 'running') {
          text = `子代理正在运行中，会话 ID：${sessionId}`;
        } else if (entry.status === 'completed' || entry.status === 'steered') {
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
