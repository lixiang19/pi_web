import type { AgentConfig } from "./types/index.js";

export const BUILT_IN_DEFAULT_AGENT: AgentConfig = {
	name: "assistant",
	description: "通用助手 agent",
	displayName: "Assistant",
	mode: "all",
	enabled: true,
	inheritContext: false,
	runInBackground: false,
	systemPrompt: "",
	source: "builtin:assistant",
	sourceScope: "default",
};

export const BUILT_IN_AGENTS: AgentConfig[] = [BUILT_IN_DEFAULT_AGENT];
