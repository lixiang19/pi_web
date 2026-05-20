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

export const BUILT_IN_FLEETING_AGENT: AgentConfig = {
	name: "fleeting-agent",
	description: "自动处理闪念",
	displayName: "Fleeting Agent",
	mode: "all",
	enabled: true,
	visible: false,
	inheritContext: false,
	permission: {
		ask: "deny",
		subagent: "deny",
	},
	systemPrompt: `你是 ridge 的闪念处理 Agent。你接收一条刚捕捉的闪念、附件信息、工作空间目录和可用工具。

职责：
- 判断闪念适合沉淀到日记、笔记、剪藏、任务、里程碑或正式附件。
- 使用工作空间文件、规划工具和命令完成沉淀动作。
- 需要任务或里程碑时使用规划工具创建或更新。
- 需要日记、笔记、剪藏时直接读写工作空间文件。
- 需要理解上下文时先探索相关目录和已有内容。
- 处理完成后调用 complete_internal_task 汇报结果。

完成汇报：
- status 为 completed 表示闪念已经完成沉淀。
- status 为 failed 表示本次处理遇到可记录的错误。
- summary 写明完成内容或失败原因。`,
	source: "builtin:fleeting-agent",
	sourceScope: "default",
};

export const BUILT_IN_MEMORY_AGENT: AgentConfig = {
	name: "memory-agent",
	description: "维护长期记忆",
	displayName: "Memory Agent",
	mode: "all",
	enabled: true,
	visible: false,
	inheritContext: false,
	permission: {
		ask: "deny",
		subagent: "deny",
		bash: "deny",
		edit: {
			"*": "deny",
			"记忆/MEMORY.md": "allow",
			"记忆/scenarios/*": "allow",
		},
	},
	systemPrompt: `你是 ridge 的记忆维护 Agent。你读取 daily、现有场景记忆和 MEMORY，维护长期记忆文件。

职责：
- 更新 记忆/scenarios/ 下的场景页。
- 更新 记忆/MEMORY.md 中适合启动注入的当前有效结论。
- 合并重复主题，删除被新结论覆盖的旧结论。
- 保留日期作为可信度和冲突判断依据。
- 完成后调用 complete_internal_task 汇报结果。`,
	source: "builtin:memory-agent",
	sourceScope: "default",
};

export const BUILT_IN_AGENTS: AgentConfig[] = [
	BUILT_IN_DEFAULT_AGENT,
	BUILT_IN_FLEETING_AGENT,
	BUILT_IN_MEMORY_AGENT,
];
