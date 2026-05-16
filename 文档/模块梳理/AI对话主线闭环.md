# AI 对话主线闭环

## 职责

把工作空间主页首发、会话恢复、消息发送、SSE 订阅、交互阻塞、附件上下文、历史分页和归档只读收束成一条真实 Pi session 主线。

## 入口

- `packages/server/src/index.ts`
  - `POST /api/sessions`
  - `GET /api/sessions/:sessionId/messages`
- `POST /api/sessions/:sessionId/messages`
- `GET /api/sessions/:sessionId/events`
- `POST /api/sessions/:sessionId/cancel`
  - `POST /api/sessions/:sessionId/ask/:requestId`
  - `POST /api/sessions/:sessionId/permissions/:requestId`
- `packages/web/src/composables/usePerSessionChat.ts`
- `packages/web/src/composables/useWorkbenchResourcePicker.ts`
- `packages/web/src/components/workbench/chat/WorkbenchChatPanel.vue`
- `packages/web/src/components/workbench/chat/WorkbenchComposer.vue`
- `packages/web/src/components/workbench/chat/WorkbenchMessageStream.vue`
- `packages/web/src/components/workspace/WorkspaceChatTab.vue`

## API 契约

- `GET /api/sessions/:sessionId/messages` 只读取消息快照；非活跃会话读取 Pi session 文件，不隐式打开完整 runtime。
- `GET /api/sessions/:sessionId/events` 是唯一 SSE 订阅入口。
- `POST /api/sessions/:sessionId/cancel` 是取消当前运行的唯一入口。
- `POST /api/sessions/:sessionId/ask/:requestId` 提交或 dismiss ask。
- `POST /api/sessions/:sessionId/permissions/:requestId` 提交 permission 决策。
- `POST /api/sessions/:sessionId/archive` 同时更新 `sessions.archived` 与 `session_index.archived`；纯 desktop 会话只存在于 `session_index` 时也必须可归档。
- 归档只读边界覆盖 `messages/ask/permissions/cancel`；归档会话返回 403，不依赖前端隐藏。
- Android 轻对话复用现有 `/api/sessions` 主线：移动端以 Android 设备 `Bearer` token 访问 `/api/sessions*`；无 token 的 Web/桌面 Cookie 鉴权保持原逻辑，有无效 Bearer token 时返回 401。
- Android token 创建普通会话时服务端强制使用默认工作空间、`run_location='server'` 和普通 `workspace` session；移动端不得传 `cwd`、`parentSessionId`、`projectId`、`taskId`、`runLocation/run_location`、`deviceId` 或 `task-agent`。
- Android SSE 使用 `GET /api/sessions/:sessionId/events?token=<android-token>`，因为原生 `EventSource` 不能设置 Authorization header；消息发送、附件上传和取消仍使用 Bearer header。
- desktop 会话在 `session_index.run_location = 'desktop'` 时，`events/messages/cancel/ask/permissions` 都必须先走桌面 WebSocket 转发，不读取本地 Pi session 文件。
- task processing session 通过 `workspace_tasks.processing_session_id` 和 `session_index.session_type/task_id` 识别；`PATCH /api/sessions/:sessionId` 与 `POST /api/sessions/:sessionId/messages` 对显式普通 Agent 返回 400，只允许 `task-agent`。
- task processing session 的 Agent 边界必须早于本地 Pi runtime 加载/恢复执行，避免普通 Agent 请求先触发模型/API key 选择或 session 文件读取。

## 前端状态边界

- `pending/localId` 只存在于 `UiConversationMessage` 包装层，不写入 Pi message 协议。
- 前端发送前乐观展示 user 消息；服务端 SSE 过滤 Pi SDK 的 user `message_start/message_end`，避免重复。
- `usePerSessionChat` 从 `activeSession` 或缓存 snapshot 的 `archived` 派生 `isReadonlySession`，同步到 `composer.isDisabled`。
- 只读会话保留输入草稿，显示「归档会话只读，不能继续发送」，不调用发送 API。
- 未配置可用模型时，`submit()` 返回明确错误「当前没有可用模型，无法发送」，并保留输入草稿。
- `WorkspaceChatTab` 是当前工作空间主会话入口，接入 `useWorkbenchResourcePicker`，把 `GET /api/resources` 的 commands、prompts、skills 传给 `WorkbenchChatPanel`；旧 `SessionTabContent` / `SessionTabArea` 已删除，不保留 resource picker 双轨。
- 资源刷新使用当前 `fileTreeRoot` 和 `sessionId`，保证 prompt / skill / extension command 按当前 cwd 与会话上下文解析。
- 右侧摘要显示资源注入状态：命令、Prompt、Skill 数量；资源加载失败时显示错误；无资源时显示真实空状态。

## 事件与消息展示

- SSE 首包发送 `snapshot`，包含当前消息窗口、历史轮次元数据、ask 请求和 permission 请求。
- `message_start/message_end/status/error/snapshot` 统一进入 `applyStreamSnapshotEvent` 或本地消息合并逻辑。
- `WorkbenchMessageStream` 按 user 轮次组织 UI：用户消息、过程消息、最终 assistant 消息。
- thinking、tool call、tool result 作为过程消息进入 `ProcessMessagesFold`，保留 `toolCallId/toolName/details/isError`。
- ask 以 `AskCard` 显示，permission 以 `PermissionRequestCard` 显示，提交后会话状态回到 streaming。

## 测试覆盖

- `packages/web/src/composables/__tests__/usePerSessionChat.test.ts`
  - 临时模型/Agent/thinking 不写全局设置。
  - 订阅使用 `/events`。
  - 归档会话只读、草稿不丢、不调用发送 API。
- `packages/web/src/components/workbench/chat/__tests__/WorkbenchComposer.test.ts`
  - 只读输入禁用、发送按钮禁用、只读原因可见。
  - 发送错误可见且不清空草稿。
- `packages/server/src/__tests__/security-guards.test.ts`
  - 归档会话发送 403。
  - `/events`、`/cancel`、`/ask/:id`、`/permissions/:id` 进入会话处理器。
  - desktop 会话的 ask、permission、cancel 转发到桌面运行时。
  - 纯 desktop 会话归档写入 `session_index`，归档后 messages、ask、permission、cancel 都返回 403 且不转发。
- `packages/server/src/__tests__/workspace-tasks.test.ts`
  - PATCH 任务处理会话显式切换普通 Agent 返回 400。
  - messages 对任务处理会话显式使用普通 Agent 返回 400。
- `packages/web/src/components/workspace/__tests__/WorkspaceChatTab.test.ts`
  - 首页 `initialPrompt/model/agent/thinking/attachmentIds` 注入 composer 后自动提交。
  - 主工作区会话把 resource catalog 传给 composer，资源面板按当前 cwd/session 刷新，prompt/skill/command 可写入草稿并可提交。
  - resource catalog 为空时传入空列表，摘要显示「无可用资源」，不显示假资源入口。
- `packages/web/src/composables/__tests__/usePerSessionChat.test.ts`
  - prompt/skill/command 注入后的主会话草稿通过 `sendMessage` 发送为真实 payload。
- `packages/server/src/__tests__/task53-mobile-chat.test.ts`
  - Android token 创建普通 server 会话、拒绝移动端指定 cwd/分叉/task-only agent、错误 Bearer token 不创建会话、移动端 token 可调用 messages/cancel。
