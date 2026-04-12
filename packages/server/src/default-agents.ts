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
];
