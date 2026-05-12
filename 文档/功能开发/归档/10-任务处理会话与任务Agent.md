# 10 任务处理会话与任务 Agent

## 目标

实现任务处理入口，强制使用任务 Agent，并保证任务与处理会话一对一。

## 范围

- 任务处理会话创建。
- 已有处理会话打开。
- 任务绑定项目时创建项目会话。
- 未绑定项目时创建工作空间会话。
- 任务 Agent 选择。
- 任务会话禁止分叉。

## 不做

- 不做多个处理会话。
- 不允许离线项目启动处理会话（有 deviceId 的离线项目）。
- 本地 server-folder 项目（无 deviceId）不受 isOnline=false 影响。

## 验收

- 一个任务最多一个处理会话。
- 再次点击只打开已有处理会话。
- 任务绑定离线项目时禁止启动或继续。
- 任务 Agent 不能完成任务。

## 关联设计

- `文档/项目设计/任务里程碑与处理会话.md`
- `文档/项目设计/Agent权限与规划工具.md`

## Spec 提取点

- 任务处理会话创建 API。
- Agent 强制选择规则。
- 分叉禁止规则。

## Spec 草案

### API

- `POST /api/workspace/tasks/:id/processing-session`
- `GET /api/workspace/tasks/:id/processing-session`

### 行为

- 任务无处理会话时创建。
- 任务已有处理会话时返回已有会话。
- 任务绑定项目时按项目设备运行：projectId 找不到报错；有 deviceId 且 isOnline===false 则 409/400 禁止；无 deviceId 的本地项目允许运行，cwd=project.path。
- 未绑定项目时按工作空间运行，cwd=defaultWorkspaceDir。
- 强制使用任务 Agent（内置 task-agent，mode: task，enabled: true）。
- 任务会话禁止通过 parentSessionId 分叉。
- 普通 PATCH `/api/workspace/tasks/:id` 不再允许直接修改 processingSessionId，只能通过 `setTaskProcessingSessionId` 内部函数更新。

### 测试

- 同一任务重复创建只得到同一会话。
- 绑定离线项目时创建失败。
- 创建会话记录 `processing_session_id`。
- 任务会话不允许分叉。
- 本地无 deviceId 项目不因 isOnline=false 被阻断。

## 实现完成

- 后端：新增 processing-session API、内置 task-agent、禁止分叉守卫、去除 PATCH 直接更新 processingSessionId。
- 前端：TaskView 详情增加处理会话按钮、useWorkspaceTasks 新增 openProcessingSession、WorkspacePage 监听 open-session 事件打开会话标签。
- 测试：后端 API/composable/component 全部覆盖。通过 `npm run check` 和 `pnpm test`。归档到 `文档/功能开发/归档/10-任务处理会话与任务Agent.md`。更新 `文档/模块梳理/任务处理会话与任务Agent.md`。更新 `文档/开发进展/index.html`。更新 `文档/记忆/MEMORY.md`。
