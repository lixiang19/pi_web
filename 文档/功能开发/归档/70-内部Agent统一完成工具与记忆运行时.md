# 70 内部 Agent 统一完成工具与记忆运行时

## 目标

把内部 Agent 的完成汇报收敛为一个通用工具，并把 summary/memory 的运行方式调整为当前设计：summary 只做基础模型摘要，memory 作为真实不可见 Agent 维护记忆文件。

## 实现

- 新增 `complete_internal_task`，参数收敛为 `status`、`summary`、`error?`。
- `fleeting-agent` 改用 `complete_internal_task` 汇报 `completed/failed`，worker 负责把 `completed` 映射为闪念 `processed` 状态。
- 新增不可见内置 `memory-agent`，普通 `/api/agents` 不返回，普通 Agent 不能通过 `subagent` 调用。
- `memory-agent` 权限固定收窄：`ask/subagent/bash: deny`，编辑只允许 `记忆/MEMORY.md` 与 `记忆/scenarios/*`。
- `summary.daily` 改为调用基础 `@mariozechner/pi-ai complete()`，输出 Markdown 正文并直接追加到 daily。
- `memory.maintain` 改为启动真实内存 `AgentSession`，由 Agent 自己读写 L2/L3 记忆文件并通过统一完成工具结束。

## 验收

- `cd packages/server && pnpm test -- workspace-memory`
- `cd packages/server && pnpm test -- fleeting-analysis`
- `cd packages/server && pnpm test -- pi-default-config`
- `cd packages/server && pnpm test -- subagents`
- `cd packages/server && pnpm test -- planning-tools`
- `npm run check`
