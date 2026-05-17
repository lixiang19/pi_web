# 任务处理会话与任务 Agent

## 职责

提供任务处理入口，保证一个任务最多一个处理会话，并承接 task review agent 对任务与里程碑的回顾建议入口。当前不再提供内置 `task-agent` 配置，此文档记录的是历史任务处理会话边界，后续需要按新的默认 Agent 模型重做。

## 入口

- `packages/server/src/routes/workspace-tasks.ts` — 任务处理会话路由（`POST/GET /:taskId/processing-session`）
- `packages/server/src/routes/workspace-tasks.ts` — 任务回顾手动触发路由（`POST /review`）
- `packages/server/src/task-review.ts` — task review 扫描、建议生成、队列 worker 与定期 scheduler
- `packages/server/src/task-system.ts` — `setTaskProcessingSessionId` 内部函数
- `packages/server/src/session-indexer.ts` — `upsertTaskSessionIndexRecord` 写入任务处理会话索引
- `packages/server/src/task-session-boundary.ts` — task processing session 的 Agent 选择边界
- `packages/server/src/index.ts` — 分叉守卫（`POST /api/sessions`）与 PATCH/messages 的 task-agent 边界
- `packages/web/src/composables/useWorkspaceTasks.ts` — `openProcessingSession` 方法
- `packages/web/src/components/workspace/TaskView.vue` — 任务详情处理会话按钮
- `packages/web/src/components/workspace/TaskView.vue` — 任务回顾触发按钮与任务/里程碑详情关联建议
- `packages/web/src/pages/WorkspacePage.vue` — 监听 `open-session` 打开会话标签
- `packages/mobile/src/lib/tasks/mobile-task-api-client.ts` — Android token 调用任务状态轻操作和处理会话入口
- `packages/mobile/src/features/tasks/TasksPage.vue` — Android 任务详情「开始处理/继续处理」按钮，成功后跳转 `/chat?sessionId=<id>`
- `packages/mobile/src/features/chat/ChatPage.vue` — 识别 query 中的 `sessionId` 并加载对应任务处理会话消息

## 数据模型

### `workspace_tasks`

- `processing_session_id TEXT` — 绑定处理会话 ID，一任务最多一个

### `session_index`

- 任务处理会话必须写入一条完整索引记录：`session_type='task'`、`context_type='project'`、`task_id=<task_id>`、`run_location='server'`。
- `workspace_path` 使用处理会话实际 cwd：未绑定项目为默认工作空间，绑定项目为项目路径。
- `project_id` 由会话 cwd 通过项目上下文解析得到；无法解析时保持 `NULL`，但 `task_id` 必须写入。

### `agents`

- 当前无内置 `task-agent` 配置；历史 task-agent 边界代码仍存在，后续需要按新的默认 Agent 模型重做
- `POST /api/agents` 已过滤 mode !== 'task'，task-only agent 不暴露给普通会话选择

## API 变更

### 创建/获取处理会话

```
POST /api/workspace/tasks/:taskId/processing-session
GET  /api/workspace/tasks/:taskId/processing-session
```

`POST` 行为：
- 任务无 processing_session_id 时创建新会话。
- 已有 processing_session_id 时返回 `{ sessionId, created: false }`。
- 绑定项目时：找不到 projectId → 404；有 deviceId 且 isOnline=false → 409；无 deviceId 的本地项目允许运行。
- 未绑定项目时：cwd = defaultWorkspaceDir。
- 会话强制选择 `task-agent`。
- 创建成功后写入 `workspace_tasks.processing_session_id`。
- 创建成功后调用 `upsertTaskSessionIndexRecord`，用 `INSERT ... ON CONFLICT(session_id) DO UPDATE` 补齐/修正 `session_index`，避免只更新已有索引导致任务会话在列表、搜索或回顾链路中缺少 `session_type/task_id`。
- Android 设备可用有效 Bearer token 调用 `POST/GET /api/workspace/tasks/:taskId/processing-session`，但不能通过 `/api/sessions` 自行创建 task-only 会话。

`GET` 行为：
- 返回 `{ sessionId }`；无会话时 404。

### 禁止分叉

```
POST /api/sessions
{ parentSessionId: ... }
```

- 若 `parentSessionId` 出现在 `workspace_tasks.processing_session_id` 中，返回 409「任务处理会话不允许分叉」。

### 会话 Agent 边界

```
PATCH /api/sessions/:sessionId
POST  /api/sessions/:sessionId/messages
```

- 当 `sessionId` 命中 `workspace_tasks.processing_session_id`，或 `session_index.session_type='task'` / `session_index.task_id IS NOT NULL` 时，视为任务处理会话。
- 任务处理会话只允许 `task-agent`。请求显式传入普通 Agent 时返回 400「任务处理会话只能使用 task-agent，不能切换到普通 Agent」。
- 该边界必须在加载/恢复本地 Pi runtime 之前执行；拒绝普通 Agent 不依赖模型配置、API key 或真实 session 文件。
- 任务处理会话省略 `agent` 但修改 `model/thinkingLevel` 时，服务端仍强制套用 `task-agent`。

### PATCH 任务限制

```
PATCH /api/workspace/tasks/:taskId
```

- `updateTaskSchema` 已移除 `processingSessionId` 字段，禁止通过普通 PATCH 修改。
- 内部使用 `setTaskProcessingSessionId` 更新。
- Android 设备 token 只能 PATCH `{ status, actor: "user" }`；标题、优先级、项目绑定、里程碑、blockedReason、sortOrder 等字段均由服务端前置守卫拒绝。

### 任务回顾

```
POST /api/workspace/tasks/review
```

- 入队 `task.review` 后台任务，返回 `{ job }`。
- 队列未初始化时返回 503。
- worker 扫描任务、里程碑、任务绑定处理会话、最新未归档处理会话索引和最近 daily，只生成 `notification_events`，不直接修改任务或里程碑。
- 长期无进展检测优先使用 `workspace_tasks.processing_session_id` 绑定的 `sessions` 记录；任务没有绑定处理会话时，才读取未归档 `session_index` 记录。
- 建议 payload 同时包含展示字段和通知中心可执行的 `payload.suggestion`；用户接受后才调用任务/里程碑写入逻辑。

## 前端变更

- `useWorkspaceTasks` 新增 `openProcessingSession(taskId)`：成功时更新本地 `task.processingSessionId`。
- `TaskView.vue` 任务详情底部按钮：有 `processingSessionId` 时显示「继续处理」，否则显示「开始处理」；完成状态禁用；点击调用 `openProcessingSession` 并 emit `openSession(sessionId)`。
- `TaskView.vue` 顶部提供「任务回顾」按钮，触发 `POST /api/workspace/tasks/review`。
- `TaskView.vue` 触发任务回顾后短周期自动刷新建议列表，覆盖后台 worker 异步写入。
- `TaskView.vue` 在任务/里程碑详情内展示关联 `task_review.suggestion`，支持接受/拒绝；接受后刷新任务列表与建议列表，并重建当前详情对象引用。
- `TaskView.vue` 建议动作成功后发出 `notificationsUpdated`，由 `WorkspacePage` 刷新左侧通知计数。
- `WorkspacePage.vue` 监听 `@open-session="handleOpenSession($event)"`。
- Android `TasksPage.vue` 复用同一处理会话 API，按钮文案同样区分「开始处理/继续处理」，完成状态禁用；成功后进入移动端轻对话页并携带 `sessionId` query。

## 边界

- `processingSessionId` 只能通过 `POST /api/workspace/tasks/:id/processing-session` 创建/查询，不能直接 PATCH。
- 有 deviceId 且离线的项目禁止启动处理会话；本地 server-folder 项目（无 deviceId）不受 `isOnline=false` 影响。
- 普通 `/api/agents` 返回列表过滤掉 `mode === 'task'` 的 agent，避免普通会话误选。
- 普通会话不能选择 `task-agent`；任务处理会话不能切换到普通 Agent。
- Android token 的任务权限是读与轻操作：允许任务列表/详情、项目摘要 GET、任务状态 PATCH、处理会话 GET/POST；不允许删除任务、编辑任务字段、创建任务、修改项目或绕过 task-agent。
- task review agent 只生成建议通知；正式对象变更只能通过用户接受通知建议进入既有任务系统状态机。
- 任务回顾建议的重复控制以同一 workspace 队列活跃任务去重，以及同一对象同一 suggestionType 未处理通知去重为边界。
- `workspace_tasks.processing_session_id` 是任务处理会话的优先真源；`session_index.session_type/task_id` 是会话列表、搜索、回顾兜底和路由层早期识别的索引投影，不能替代任务绑定真源。
- 接受建议时通知中心在事务内 claim 非终态通知后才执行 `payload.suggestion`，重复接受不会重复创建任务或里程碑。

## 测试覆盖

- 后端：`workspace-tasks.test.ts` / `workspace-tasks-api.test.ts`
  - 重复创建只返回同一会话
  - 创建后 GET 可查到 sessionId
  - 绑定离线设备项目 409
  - 本地无 deviceId 项目允许运行
  - 找不到 projectId 404
  - 无项目 cwd=defaultWorkspaceDir
  - 强制选择 task-agent
  - 禁止分叉任务处理会话
  - PATCH 任务处理会话切换普通 Agent 返回 400
  - messages 对任务处理会话显式使用普通 Agent 返回 400
  - 允许分叉普通会话
- 前端：`useWorkspaceTasks.test.ts` / `TaskView.test.ts`
  - openProcessingSession 成功更新本地 processingSessionId
  - 失败不更新且展示错误
  - TaskView 点击 emit openSession
  - 已有 session 显示「继续处理」
  - 失败不 emit openSession
  - 任务页触发 task review
  - 任务详情展示关联回顾建议并执行建议动作
- 移动端：`task54-mobile-tasks.test.ts` / `mobile-task-api-client.test.ts` / `mobile-task-store.test.ts` / `TasksPage.test.ts` / `ChatPage.test.ts`
  - Android token 可读取现有任务和项目摘要
  - Android token 只允许状态轻操作，非法状态机流转由服务端拒绝
  - 移动端状态更新失败回滚本地任务
  - Android token 可继续已有处理会话
  - 任务页打开处理会话后跳转移动端对话页
- 后端：`task-review.test.ts`
  - 扫描任务、里程碑、任务绑定处理会话、处理会话索引和最近 daily 生成建议
  - 建议不会直接修改任务
  - 接受建议后正式任务变更
  - 手动触发入队，worker 写通知
  - 真实处理会话链路（`POST /processing-session` + `workspace_tasks.processing_session_id` + `sessions`）可触发长期无进展建议
  - 多条处理会话索引只使用最新未归档记录，且不会覆盖已绑定 processing session 的任务
  - 重复接受同一个创建建议不会重复写正式任务

## 模块关系

```
TaskView.vue
  → useWorkspaceTasks.openProcessingSession
    → startTaskProcessingSession(taskId)
      → /api/workspace/tasks/:id/processing-session
        → workspace-tasks.ts router (createSessionRecord + setTaskProcessingSessionId)
  → emit openSession → WorkspacePage.vue handleOpenSession

TaskView.vue
  → requestTaskReview()
    → POST /api/workspace/tasks/review
      → enqueueTaskReviewJob(task.review)
        → createTaskReviewWorkers.processReviewJob()
          → task-review.ts runTaskReview()
            → notification_events task_review.suggestion
  → useNotifications.runAction(accept_suggestion)
    → notifications.ts applySuggestion()
      → task-system.ts updateTaskInDb/updateMilestoneInDb/createTaskInDb/createMilestoneInDb
```
