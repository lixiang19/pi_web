# ridge.db 任务表旧库迁移 Spec

## 背景

旧版 `~/.pi/ridge.db` 可能已经存在 `workspace_milestones` / `workspace_tasks` 表，但表结构早于多工作空间隔离和里程碑设计，缺少 `workspace_path`、`milestone_id` 等当前 bootstrap 索引依赖列。当前启动时直接执行 bootstrap SQL，`CREATE TABLE IF NOT EXISTS` 不会补齐旧表列，随后创建依赖新列的索引会触发 `SqliteError: no such column: ...`。

## 目标

服务端启动时必须能安全打开这类旧库，补齐任务系统当前 schema 所需列，并继续执行现有 bootstrap。

## 输入

- 一个已存在的 `ridge.db`。
- `workspace_milestones` 表存在但缺少 `workspace_path`。
- `workspace_tasks` 表存在但缺少 `workspace_path` / `milestone_id`。
- 初始化时传入当前 `workspaceDir`。

## 输出

- 初始化不抛出 `no such column: workspace_path` 或 `no such column: milestone_id`。
- 两张旧表都补齐当前任务系统 bootstrap 依赖列。
- 旧数据的空 `workspace_path` 被写入当前 workspace 绝对路径。
- 缺少 `milestone_id` 的旧任务被归入系统“未归属”里程碑。
- 现有 bootstrap 索引创建成功。

## 边界

- 新库不受影响。
- 表不存在时不执行补列。
- 已有列时不重复迁移。
