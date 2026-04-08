declare module '@mariozechner/pi-coding-agent' {
  // ===== Auth & Models =====
  export interface ModelInfo {
    provider: string;
    id: string;
    name: string;
    reasoning?: boolean;
  }

  export class AuthStorage {
    static create(): AuthStorage;
  }

  export class ModelRegistry {
    static create(authStorage: AuthStorage): ModelRegistry;
    refresh(): void;
    getAvailable(): ModelInfo[];
  }

  // ===== Session Management =====
  export interface SessionInfo {
    id: string;
    name: string;
    cwd: string;
    path: string;
    created: Date;
    modified: Date;
    firstMessage?: unknown;
    parentSessionPath?: string;
  }

  export class SessionManager {
    static create(cwd: string): SessionManager;
    static open(sessionFile: string): SessionManager;
    static listAll(): Promise<SessionInfo[]>;
    static inMemory(cwd: string): SessionManager;

    getCwd(): string;
    newSession(options?: { parentSession?: string }): void;
    flushed?: boolean;
    _rewriteFile?(): void;
  }

  // ===== Settings =====
  export class SettingsManager {
    static create(cwd: string): SettingsManager;
  }

  // ===== Resource Loading =====
  export interface PromptInfo {
    name: string;
    description: string;
    content: string;
    sourceInfo?: SourceInfo;
  }

  export interface SkillInfo {
    name: string;
    description: string;
    disableModelInvocation?: boolean;
    sourceInfo?: SourceInfo;
  }

  export interface CommandInfo {
    name: string;
    description: string;
    invocationName?: string;
    sourceInfo?: SourceInfo;
  }

  export interface DiagnosticInfo {
    message: string;
  }

  export interface ResourceCatalog {
    prompts: PromptInfo[];
    skills: SkillInfo[];
    commands: CommandInfo[];
    diagnostics: {
      prompts: DiagnosticInfo[];
      skills: DiagnosticInfo[];
      commands: DiagnosticInfo[];
    };
  }

  export interface SourceInfo {
    path: string;
    source: string;
    scope: string;
    origin?: string;
    baseDir?: string;
  }

  export interface ResourceLoaderOptions {
    cwd: string;
    settingsManager: SettingsManager;
    appendSystemPromptOverride?: (base: string[]) => string[];
    extensionFactories?: Array<(pi: PiExtensionAPI) => void>;
  }

  export class DefaultResourceLoader {
    constructor(options: ResourceLoaderOptions);
    reload(): Promise<void>;
    getPrompts(): { prompts: PromptInfo[]; diagnostics: DiagnosticInfo[] };
    getSkills(): { skills: SkillInfo[]; diagnostics: DiagnosticInfo[] };
  }

  // ===== Pi Extension API =====
  export interface ToolCallEvent {
    toolName: string;
    input: Record<string, unknown>;
  }

  export interface ToolCallResult {
    block?: boolean;
    reason?: string;
  }

  export interface PiExtensionAPI {
    on(event: 'tool_call', handler: (event: ToolCallEvent) => Promise<ToolCallResult | undefined>): void;
  }

  // ===== Session & Messaging =====
  export type MessageRole = 'system' | 'user' | 'assistant' | 'tool' | 'toolResult';

  export interface MessageContent {
    type: 'text' | 'thinking' | 'toolCall' | 'toolResult' | string;
    text?: string;
    thinking?: string;
    id?: string;
    name?: string;
    arguments?: Record<string, unknown>;
    result?: unknown;
  }

  export interface SessionMessage {
    role: MessageRole;
    content: string | MessageContent[];
    timestamp?: number;
  }

  export interface AssistantMessageEvent {
    type: string;
    delta: string | null;
  }

  export interface SessionEvent {
    type: 'turn_start' | 'agent_start' | 'message_start' | 'message_update' | 'message_end' | 'agent_end' | 'turn_end';
    message?: SessionMessage;
    assistantMessageEvent?: AssistantMessageEvent;
  }

  export type SessionEventHandler = (event: SessionEvent) => void;
  export type Unsubscribe = () => void;

  export interface AgentSession {
    sessionId: string;
    sessionFile: string;
    sessionManager: SessionManager;
    model: ModelInfo | null;
    thinkingLevel: string | null;
    messages: SessionMessage[];
    sessionName: string;
    extensionRunner?: {
      getRegisteredCommands(): CommandInfo[];
    };

    subscribe(handler: SessionEventHandler): Unsubscribe;
    prompt(prompt: string, options?: { source?: string }): Promise<void>;
    abort(): Promise<void>;
    setModel(model: ModelInfo): Promise<void>;
    setThinkingLevel(level: string): Promise<void>;
    setSessionName(name: string): void;
    reload(): Promise<void>;
    getActiveToolNames(): string[];
    setActiveToolsByName(toolNames: string[]): Promise<void>;
    dispose(): void;
  }

  export interface CreateAgentSessionOptions {
    cwd: string;
    authStorage: AuthStorage;
    modelRegistry: ModelRegistry;
    sessionManager: SessionManager;
    settingsManager: SettingsManager;
    resourceLoader: DefaultResourceLoader;
  }

  export interface CreateAgentSessionResult {
    session: AgentSession;
  }

  export function createAgentSession(
    options: CreateAgentSessionOptions
  ): Promise<CreateAgentSessionResult>;

  // ===== Utilities =====
  export interface FrontmatterResult {
    frontmatter: Record<string, unknown>;
    body: string;
  }

  export function parseFrontmatter(content: string): FrontmatterResult;
  export function getAgentDir(): string;
}
