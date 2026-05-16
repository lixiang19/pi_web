# 54 Android 任务查看与轻操作

## 目标

实现 Android 端任务查看和少量用户态状态操作，方便移动端跟进任务进度。

## 范围

- 加载任务列表。
- 按状态分组显示：待办、进行中、审核中、已完成。
- 查看任务详情。
- 修改任务状态。
- 打开或继续任务处理会话入口。
- 展示基础项目信息和处理会话状态。
- 状态更新失败时本地回滚。

## 不做

- 不做看板拖拽。
- 不做里程碑管理。
- 不做项目绑定编辑。
- 不做批量操作。
- 不做任务回顾配置。
- 不允许 Agent 直接完成任务。

## 依赖

- 任务 50 Android 移动端工程骨架。
- 任务 51 Android 设备注册与服务连接。
- 任务 53 Android 轻对话。
- `文档/模块梳理/任务处理会话与任务Agent.md`

## TDD 与验证

先写测试：

- 移动端任务列表读取现有任务 API。
- 状态分组只使用服务端返回的任务状态。
- 用户修改状态遵守任务状态机。
- 更新失败时本地回滚。
- 打开处理会话调用 `POST /api/workspace/tasks/:taskId/processing-session`。
- 任务处理会话仍强制 task-agent。

再实现：

- 任务列表和详情 UI。
- 任务状态更新 API client。
- 处理会话入口和跳转到移动端对话页。

## 验收标准

- 真机可查看任务列表。
- 真机可打开任务详情。
- 真机可修改任务状态。
- 非法状态流转被服务端拒绝，移动端展示错误并回滚。
- 真机可打开或继续任务处理会话。
- 修改 `.ts` / `.vue` / `.js` 后根目录 `npm run check` 通过。

## 实现记录

- 服务端允许有效 Android 设备 `Bearer` token 访问受限工作区任务入口：`GET /api/workspace/tasks`、`GET /api/workspace/tasks/:taskId`、`PATCH /api/workspace/tasks/:taskId`、`GET/POST /api/workspace/tasks/:taskId/processing-session`。
- Android token 访问任务 PATCH 时只允许 `{ status, actor: "user" }`，其他字段、删除任务、创建/修改项目均返回 403。
- Android token 只允许 `GET /api/workspace/projects` 读取项目摘要，用于移动端展示任务所属项目，不允许项目绑定编辑。
- 移动端新增 `mobile-task-api-client.ts`、`mobile-task-store.ts` 和 `TasksPage.vue` 真实任务页，按待办、进行中、审核中、已完成展示；`blocked` 保持服务端原状态并归入进行中组展示。
- 移动端状态操作遵守服务端状态机；失败时 store 回滚本地乐观更新并展示错误。
- 任务处理会话按钮调用 `POST /api/workspace/tasks/:taskId/processing-session`，成功后跳转 `/chat?sessionId=<id>`；轻对话页启动时会选择 query 中的会话并加载消息。

## 验收证据

- `task54-mobile-tasks.test.ts`
- `mobile-task-api-client.test.ts`
- `mobile-task-store.test.ts`
- `TasksPage.test.ts`
- `ChatPage.test.ts`
