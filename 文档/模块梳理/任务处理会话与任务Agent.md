# 任务处理会话与任务 Agent

## 职责

提供任务处理入口，保证一个任务最多一个处理会话，并强制使用 mode=task 的任务 Agent。

## 入口

- `packages/server/src/routes/workspace-tasks.ts` — 任务处理会话路由（`POST/GET /:taskId/processing-session`）
- `packages/server/src/task-system.ts` — `setTaskProcessingSessionId` 内部函数
- `packages/server/src/default-agents.ts` — 内置 `task-agent`（mode: task, enabled: true）
- `packages/server/src/index.ts` — 分叉守卫（`POST /api/sessions`）
- `packages/web/src/composables/useWorkspaceTasks.ts` — `openProcessingSession` 方法
- `packages/web/src/components/workspace/TaskView.vue` — 任务详情处理会话按钮
- `packages/web/src/pages/WorkspacePage.vue` — 监听 `open-session` 打开会话标签

## 数据模型

### `workspace_tasks`

- `processing_session_id TEXT` — 绑定处理会话 ID，一任务最多一个

### `agents`

- 内置 `task-agent`（mode: 'task', enabled: true）
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

`GET` 行为：
- 返回 `{ sessionId }`；无会话时 404。

### 禁止分叉

```
POST /api/sessions
{ parentSessionId: ... }
```

- 若 `parentSessionId` 出现在 `workspace_tasks.processing_session_id` 中，返回 409「任务处理会话不允许分叉」。

### PATCH 任务限制

```
PATCH /api/workspace/tasks/:taskId
```

- `updateTaskSchema` 已移除 `processingSessionId` 字段，禁止通过普通 PATCH 修改。
- 内部使用 `setTaskProcessingSessionId` 更新。

## 前端变更

- `useWorkspaceTasks` 新增 `openProcessingSession(taskId)`：成功时更新本地 `task.processingSessionId`。
- `TaskView.vue` 任务详情底部按钮：有 `processingSessionId` 时显示「继续处理」，否则显示「开始处理」；完成状态禁用；点击调用 `openProcessingSession` 并 emit `openSession(sessionId)`。
- `WorkspacePage.vue` 监听 `@open-session="handleOpenSession($event)"`。

## 边界

- `processingSessionId` 只能通过 `POST /api/workspace/tasks/:id/processing-session` 创建/查询，不能直接 PATCH。
- 有 deviceId 且离线的项目禁止启动处理会话；本地 server-folder 项目（无 deviceId）不受 `isOnline=false` 影响。
- 普通 `/api/agents` 返回列表过滤掉 `mode === 'task'` 的 agent，避免普通会话误选。

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
  - 允许分叉普通会话
- 前端：`useWorkspaceTasks.test.ts` / `TaskView.test.ts`
  - openProcessingSession 成功更新本地 processingSessionId
  - 失败不更新且展示错误
  - TaskView 点击 emit openSession
  - 已有 session 显示「继续处理」
  - 失败不 emit openSession

## 模块关系

```
TaskView.vue
  → useWorkspaceTasks.openProcessingSession
    → startTaskProcessingSession(taskId)
      → /api/workspace/tasks/:id/processing-session
        → workspace-tasks.ts router (createSessionRecord + setTaskProcessingSessionId)
  → emit openSession → WorkspacePage.vue handleOpenSession
```