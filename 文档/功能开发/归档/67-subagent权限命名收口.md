# 67 subagent 权限命名收口

## 目标

把子代理主工具与权限键从 `task` 命名收口为 `subagent`，避免和任务/里程碑规划工具的 `task` 权限混用。

## 实现

- 子代理主工具注册名改为 `subagent`。
- 新增逻辑权限键 `subagent`，并同步协议类型与 runtime bundle schema。
- 7 个规划工具继续映射到 `task` 权限。
- `subagent: deny` 会同时移除 `subagent`、`steer_subagent`、`get_subagent_result`。
- `steer_subagent`、`get_subagent_result` 不单独映射权限键，不生成独立 permission request。

## 验收

- `packages/server/src/__tests__/planning-tools.test.ts` 覆盖规划工具与子代理权限边界。
- `packages/server/src/__tests__/subagents.test.ts` 覆盖子代理工具注册名。
- 根目录 `npm run check` 作为合并门禁。
