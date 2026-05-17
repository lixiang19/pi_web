# 内置 Pi 配置迁移

完成时间：2026-05-17

## 结果

- ridge 只内置一个默认基础 Agent：`packages/server/src/built-in-agents.ts` 中的 `builtin:assistant`。
- `packages/server/pi-default-config/agents/` 不再存放内置 Agent 文件，只保留给用户自定义 Agent。
- server 启动仍覆盖写入 `packages/server/pi-default-config/` 到 Pi 默认根 `~/.pi/agent`，但不删除目标侧已有 `sessions`、用户 `skills`、用户 `prompts`。
- 平台强绑定扩展仍保留在 server 源码：权限门禁、ask、subagent、规划工具。
- `settings.instructions` 不是当前 Pi SDK 支持的启动提示配置入口，已从内置 `settings.json` 移除；记忆注入继续由 `session-context.ts` 读取 `~/ridge-workspace/记忆/MEMORY.md` 实现。

## 验证

- `pnpm --filter @pi/server test -- src/__tests__/pi-default-config.test.ts`
- `pnpm --filter @pi/server test -- src/__tests__/workspace-memory.test.ts`
- `npm run build --workspace @pi/server`
- `npm run check`
