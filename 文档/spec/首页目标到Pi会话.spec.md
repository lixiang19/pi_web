# 首页目标到 Pi 会话 Spec

> 任务：task #2 Phase 1: 首页目标到 Pi 会话 spec/红测/实现  
> 日期：2026-05-01  
> 产品依据：`文档/功能开发/2026-05-01_pi_web_MVP产品稿v0.2.md`

## 目标

在 `DashboardView` 中提供唯一的 Phase 1 目标入口，让用户输入一个目标后，系统创建可追踪的 goal task，创建并打开带当前 `workspaceDir` 的 Pi session，自动发送第一条包含目标文本的 prompt，并在刷新后可从最近目标回到同一个 session。

## 范围

### 本阶段做

- 只改 `DashboardView` 作为目标输入入口。
- `Goal` 复用现有 Task，新增可选字段：
  - `kind?: "goal" | "task"`
  - `sessionId?: string`
  - `source?: "dashboard"`
- 创建 session 时使用当前 `workspaceDir`。
- session 标题和第一条 prompt 包含用户输入的目标文本。
- goal task 持久化 `sessionId`，刷新后仍可回找。
- 点击 goal 只打开已有 `sessionId`；失效时给出可见提示，不自动新建覆盖。
- 未带 `kind/sessionId/source` 的旧 task 按普通任务处理，无需迁移。

### 本阶段不做

- 不改 `HomePage` 搜索框。
- 不重构主页 / 分屏整体结构。
- 不做 `needs_review`、待我确认或验收状态机。
- 不做 Artifact 建模或结果沉淀。
- 不新增 Goal 表、Goal markdown 文件、Project/Run/Job 抽象。
- 不重写聊天 UI，优先复用现有 session 组件。

## 用户故事与验收

### Story 1：从 Dashboard 创建目标

作为个人用户，我可以在 `DashboardView` 输入一个非空目标，并创建协作目标。

验收：
- 空输入不创建 task、不创建 session。
- 非空目标提交后，创建一条 Task：`kind="goal"`、`source="dashboard"`、`title` 等于目标文本。
- 未带 `kind` 的旧 task 不进入最近目标列表。

### Story 2：创建并关联 Pi session

作为个人用户，我提交目标后会进入一个围绕该目标的 Pi 会话，而不是空会话。

验收：
- 创建 session 的 `cwd` 等于当前 `workspaceDir`，不使用虚假默认 cwd。
- session `title` 包含目标文本。
- 自动发送第一条 prompt，prompt 内容包含目标文本。
- 创建成功后，把返回的 `sessionId` 写回 goal task。

### Story 3：刷新后回找同一目标和会话

作为个人用户，我刷新或重新进入后，仍能看到最近目标并回到同一个 session。

验收：
- 重新加载任务后，`kind="goal"` 且有 `sessionId` 的记录仍展示在最近目标。
- 点击 goal 使用已有 `sessionId` 打开 session。
- 不创建新的 session，不覆盖原 `sessionId`。

### Story 4：session 失效降级

作为个人用户，如果目标关联的 session 已不存在，我能得到明确反馈，而不是被静默带到新会话。

验收：
- 点击失效 `sessionId` 的 goal 时显示可见错误提示。
- 不自动新建 session。
- 不覆盖 goal task 原有 `sessionId`。

## 测试计划

### Server / API

- `POST /api/workspace/tasks` 支持持久化 `kind/sessionId/source` 可选字段。
- `PATCH /api/workspace/tasks/:taskId` 支持更新 `sessionId/kind/source`。
- 旧 task fixture 未带新字段时仍按原结构返回。

### Web / Component

- `DashboardView` 空目标提交不发出创建事件。
- `DashboardView` 非空目标提交发出目标文本，并展示 `kind="goal"` 的最近目标。
- `DashboardView` 不把未带 `kind` 的普通 task 显示为最近目标。
- 点击带 `sessionId` 的最近目标发出打开 session 事件。

### Web / Integration 接线

- `WorkspacePage` 收到目标后依次创建 goal task、创建 session、发送首条 prompt、写回 `sessionId`、打开 session 标签。
- 打开已有 goal session 前先校验 session 存在；失效时 toast 提示，不新建覆盖。
