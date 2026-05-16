# 53 Android 轻对话

## 目标

实现 Android 端普通 AI 对话能力，覆盖新建会话、发送消息、附件、流式回复和取消生成。

## 范围

- 新建普通 server 会话。
- 查看基础会话历史列表。
- 继续已有普通会话。
- 发送文本消息。
- 发送图片或录音附件。
- 订阅 SSE 流式回复。
- 取消当前生成。
- 发送失败时保留输入和附件草稿。

## 不做

- 不创建 desktop 会话。
- 不创建 task-only agent 会话。
- 不提供多标签工作台。
- 不提供 prompt、skill、extension command 资源面板。
- 不提供复杂 ask/permission 管理面板；第一版只做必要展示和明确不可处理提示。

## 实现结论

- 服务端复用现有 `/api/sessions` 主线，不新增移动端会话模型。
- Android 移动端以设备 `Bearer` token 访问 `/api/sessions*`；无效 token 返回 401。
- Android token 创建普通会话时，服务端强制使用默认工作空间、`run_location='server'` 和普通 `workspace` session。
- Android 创建会话拒绝 `cwd`、`parentSessionId`、`projectId`、`taskId`、`runLocation/run_location`、`deviceId` 和 `task-agent`。
- 移动端轻对话实现位于 `packages/mobile/src/lib/chat/` 和 `packages/mobile/src/features/chat/ChatPage.vue`。
- 附件沿用任务 52 的移动端附件草稿结构，发送前转回 `File` 并上传到现有会话附件接口。
- SSE 使用 `/api/sessions/:sessionId/events?token=<android-token>`，因为原生 `EventSource` 不能设置 Authorization header。
- 发送失败或 SSE error 会保留 composer 文本和附件；最终 assistant 消息到达后清空本次待发送草稿。

## 验收证据

- `cd packages/server && pnpm test -- task53-mobile-chat.test.ts`
- `cd packages/mobile && pnpm test -- src/features/chat/__tests__/ChatPage.test.ts src/lib/chat`
- 后续全量验收以最终任务输出为准。

## 真机边界

真机捕捉、对话、任务三条主路径的完整闭环归任务 55；当前任务完成 WebView/dev-server 代码路径、服务端契约和组件行为验证。
