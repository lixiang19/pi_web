import type { AgentConfig } from './types/index.js';
export const DEFAULT_AGENTS: AgentConfig[] = [
  {
    name: 'assistant',
    description: '通用助手 agent',
    displayName: 'Assistant',
    mode: 'all',
    enabled: true,
    inheritContext: false,
    runInBackground: false,
    systemPrompt: '',
    source: 'builtin:assistant',
    sourceScope: 'default',
  },
  {
    name: 'task-agent',
    description: '任务处理 agent，用于任务规划和执行',
    displayName: 'Task Agent',
    mode: 'task',
    enabled: true,
    inheritContext: false,
    runInBackground: false,
    systemPrompt: '你是任务处理 Agent，专门负责帮助用户处理任务。你可以创建和更新任务、里程碑，但不能将任务或里程碑标记为完成。完成操作必须由用户人工确认。',
    source: 'builtin:task-agent',
    sourceScope: 'default',
  },
];
