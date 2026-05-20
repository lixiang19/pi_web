# 68 内置闪念 Agent 真实处理

## 目标

把旧的“闪念分析建议 JSON”改为不可见内置 `fleeting-agent` 的真实处理链路。闪念进入后台后由 Agent 自己探索、读写、创建任务/里程碑，并通过完成工具回写处理结果。

## 实现

- 新增内置 `fleeting-agent`，配置 `visible:false`、`permission.ask: deny`、`permission.subagent: deny`。
- Agent 可见性进入协议、agent frontmatter/API 保存、agent 摘要、普通会话选择和 subagent 目标校验。
- `/api/agents` 只返回 enabled、visible 且非内部保留名的主会话 Agent。
- `fleeting.analyze` worker 改为创建内存 `AgentSession`，不持久化内部会话记录。
- 内部会话注入与普通会话同源的工作空间记忆/Wiki 上下文。
- worker 注册统一 `complete_internal_task` 工具，Agent 必须通过该工具汇报 `completed/failed` 和 summary。
- `completed` 会把闪念标为 `status='processed'`、`analysis_status='processed'`。
- Agent 主动 `failed` 会记录 `analysis_status='failed'` 和 `last_error`，job 完成不重试。
- Agent 异常或未调用完成工具时沿用后台 job 重试/最终失败路径。

## 验收

- `cd packages/server && pnpm test -- fleeting-analysis`
- `cd packages/server && pnpm test -- pi-default-config`
- `cd packages/server && pnpm test -- subagents`
- `cd packages/server && pnpm test -- planning-tools`
- `npm run check`
