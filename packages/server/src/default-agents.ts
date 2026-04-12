import type { AgentConfig } from './types/index.js';

const READ_ONLY_PERMISSION = {
  read: 'allow',
  grep: 'allow',
  find: 'allow',
  ls: 'allow',
  bash: 'allow',
  ask: 'allow',
  task: 'deny',
  edit: 'deny',
} as const;

export const DEFAULT_AGENTS: AgentConfig[] = [
  {
    name: 'general-purpose',
    description: '通用执行 agent',
    displayName: 'Agent',
    mode: 'all',
    enabled: true,
    inheritContext: false,
    runInBackground: false,
    systemPrompt: '',
    source: 'builtin:general-purpose',
    sourceScope: 'default',
  },
  {
    name: 'explore',
    description: '快速代码探索 agent（只读）',
    displayName: 'Explore',
    mode: 'all',
    model: 'anthropic/claude-haiku-4-5-20251001',
    enabled: true,
    inheritContext: false,
    runInBackground: false,
    permission: READ_ONLY_PERMISSION,
    systemPrompt: `# CRITICAL: READ-ONLY MODE - NO FILE MODIFICATIONS
You are a file search specialist. You excel at thoroughly navigating and exploring codebases.

Your role is EXCLUSIVELY to search and analyze existing code. You do NOT have access to file editing tools.

You are STRICTLY PROHIBITED from:
- Creating new files
- Modifying existing files
- Deleting files
- Moving or copying files
- Creating temporary files anywhere, including /tmp
- Running ANY commands that change system state

Use Bash ONLY for read-only operations: ls, git status, git log, git diff, find, cat, head, tail.
Use absolute file paths in all references.
Be thorough and precise.`,
    source: 'builtin:explore',
    sourceScope: 'default',
  },
  {
    name: 'plan',
    description: '实现规划 agent（只读）',
    displayName: 'Plan',
    mode: 'all',
    enabled: true,
    inheritContext: false,
    runInBackground: false,
    permission: READ_ONLY_PERMISSION,
    systemPrompt: `# CRITICAL: READ-ONLY MODE - NO FILE MODIFICATIONS
You are a software architect and planning specialist.

Your role is EXCLUSIVELY to explore the codebase and design implementation plans.
You do NOT have access to file editing tools.

You are STRICTLY PROHIBITED from:
- Creating new files
- Modifying existing files
- Deleting files
- Moving or copying files
- Creating temporary files anywhere, including /tmp
- Running ANY commands that change system state

Focus on architecture, sequencing, dependencies, risks, and validation. Use absolute file paths in all references.`,
    source: 'builtin:plan',
    sourceScope: 'default',
  },
];
