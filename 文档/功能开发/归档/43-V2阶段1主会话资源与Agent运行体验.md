# V2 阶段 1 主会话资源与 Agent 运行体验

## 目标

完成 V2 阶段 1：让当前工作空间主会话具备最终版 Agent 运行入口。

## 范围

- `WorkspaceChatTab` 接入 `useWorkbenchResourcePicker`。
- 主会话消费当前 `GET /api/resources` 真源。
- commands、prompts、skills 传入 `WorkbenchChatPanel` 和 `WorkbenchComposer`。
- prompt、skill、extension command 可写入当前 composer 草稿。
- 资源刷新携带当前 cwd 和 sessionId。
- 右侧摘要显示资源状态。

## 实现

- `packages/web/src/components/workspace/WorkspaceChatTab.vue`
  - 新增 resource picker 状态。
  - 移除主会话资源空数组传参。
  - 接入 `applyPrompt`、`injectSkill`、`injectCommand`、`toggleResourcePicker`。
  - 摘要增加资源数量 / 错误 / 空状态。
- `packages/web/src/components/workspace/__tests__/WorkspaceChatTab.test.ts`
  - 新增主会话 resource catalog 接入测试。
  - 覆盖 prompt / skill / command 注入后提交主会话草稿。
  - 覆盖 resource catalog 为空时不显示假资源入口、摘要显示无可用资源。
- `packages/web/src/composables/__tests__/usePerSessionChat.test.ts`
  - 覆盖注入后的主会话草稿作为 `sendMessage` payload 发送。
- `packages/web/src/components/workbench/SessionTabContent.vue`
  - 删除旧主会话 resource picker 双轨。
- `packages/web/src/components/workbench/SessionTabArea.vue`
  - 删除仅用于旧 `SessionTabContent` 的容器。
- `文档/模块梳理/AI对话主线闭环.md`
  - 补充当前主会话资源选择器契约。

## 验收

- 用户能在主工作空间会话使用 prompt / skill / command。
- resource picker 刷新使用当前 cwd 与 sessionId。
- 后端返回空资源时不伪装成可用资源，摘要显示无可用资源。
- 旧 `SessionTabContent` / `SessionTabArea` 已删除，不再保留主会话双轨。

## 验证

- `cd packages/web && pnpm test -- WorkspaceChatTab.test.ts usePerSessionChat.test.ts`
- `npm run check`
- `git diff --check`
