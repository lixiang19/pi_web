# 2026-05-09 ridge.db 任务表旧库迁移

- 日期：2026-05-09
- 状态：已完成
- 目标：修复旧版 `ridge.db` 缺少任务系统新列导致 server 启动失败。

## 现象

server 启动执行 `RIDGE_DB_BOOTSTRAP_SQL` 时崩溃：

- `SqliteError: no such column: workspace_path`
- `SqliteError: no such column: milestone_id`

调用链：

- `packages/server/src/index.ts`
- `initializeRidgeDb`
- `openDatabase`
- `db.exec(RIDGE_DB_BOOTSTRAP_SQL)`

## 根因假设

旧库已经有 `workspace_milestones` 或 `workspace_tasks` 表，但建表时间早于 `workspace_path` 与里程碑字段。SQLite 的 `CREATE TABLE IF NOT EXISTS` 不会修改既有表结构，后续 `CREATE INDEX ... ON workspace_milestones(workspace_path, ...)` 或 `CREATE INDEX ... ON workspace_tasks(milestone_id, ...)` 访问不存在列而失败。

## 验收

- 新增旧库升级测试，先复现失败。
- 在 DB 初始化链路补齐旧表字段，不在业务查询层兜底。
- `npm run check` 通过。

## 修复

- `openDatabase(workspaceDir)` 在执行 bootstrap 前先运行前置迁移。
- 对已存在的 `workspace_milestones` / `workspace_tasks` 检查当前任务系统 schema 需要的列。
- 缺列时用 `ALTER TABLE ... ADD COLUMN ... DEFAULT ...` 补齐。
- 初始化传入 workspace 时，将旧数据的空 `workspace_path` 更新为当前 workspace 绝对路径。
- 旧任务缺少 `milestone_id` 时，创建/复用系统“未归属”里程碑并回填旧任务归属。

## 验证结果

- `npm run test --workspace @pi/server -- ridge-db-migration.test.ts` 通过。
- `npm run test --workspace @pi/server -- ridge-db-migration.test.ts workspace-tasks.test.ts fleeting-api.test.ts auth.test.ts` 通过。
- `npm run check` 通过。
- `npm run test --workspace @pi/server` 在授权后仍有既有 `workspace-tasks-api.test.ts` 4 项失败，集中在 workspace-local task repository 旧接口预期，与本次全局 `ridge.db` 迁移路径无关。
