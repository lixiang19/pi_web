# 任务系统 SQLite 真源最小实现 Spec

> 对应任务：task #13 `任务系统：SQLite 真源最小实现`  
> 当前唯一 canonical 任务系统实现任务。旧 task #8/#9/#10 不再使用。

## 目标

将 `/api/workspace/tasks` 的底层任务存储切换为 workspace-local SQLite：`<workspace>/.ridge/ridge.db`。本阶段只做任务 DB 真源的最小闭环，不做 UI、AI 工具、RAG、旧 JSON 迁移或兼容。

## 范围

### 做

- 初始化 `<workspace>/.ridge/ridge.db`。
- 新增 `tasks` 与 `task_meta` 表。
- `/api/workspace/tasks` 的 GET/POST/PATCH/DELETE 直接读写 DB。
- 保持现有前端 API 响应形状，降低影响面。
- 测试覆盖 repository 和 API 行为。

### 不做

- 不读取 `.ridge/tasks.json`。
- 不写入 `.ridge/tasks.json`。
- 不迁移旧 JSON 数据。
- 不兼容旧 JSON 可见性。
- 不回退、不双写。
- 不改 UI。
- 不接 AI 工具 / `ai_operations`。
- 不做 RAG 投影。

## API 字段边界

本切片为了避免牵连前端，继续保持现有响应字段：

- `id/title/status/priority/dueDate/tags/createdAt/updatedAt`
- 可选：`kind/sessionId/source`
- `updatedAt` 继续作为列表级乐观锁版本

状态和日期暂保持现有 API 语义：

- `status`: `pending | in_progress | done`
- `dueDate`: `number | null`

后续如切换到 `todo/doing` 和 ISO 日期，单独开任务。

## 验收标准

1. 首次调用任务接口时自动创建 `<workspace>/.ridge/ridge.db`。
2. 创建任务写入 SQLite `tasks` 表，不创建 `.ridge/tasks.json`。
3. GET/POST/PATCH/DELETE 均读写 SQLite。
4. `expectedUpdatedAt` 不匹配时返回 409 语义错误，DB 不被修改。
5. 更新空 `sessionId` 会移除该字段语义。
6. 删除任务从 DB 删除；软删除后续在 AI/日志任务中另做。
7. workspace 之间任务互相隔离。
8. 已存在旧 `.ridge/tasks.json` 不会被读取或导入。
9. 损坏 DB 能通过 API 返回错误响应，不静默回退到 JSON。
