# 01 ridge DB 基础表与迁移框架

## 目标

建立 `~/.pi/ridge.db` 的基础表和迁移能力，作为 ridge 产品层结构化真源。

## 范围

- 初始化 `~/.pi/ridge.db`。
- 建立迁移版本表。
- 建立核心表：`devices`、`projects`、`session_index`、`workspace_tasks`、`workspace_milestones`、`fleeting_notes`、`automations`、`automation_runs`、`background_jobs`、`search_index_status`、`notification_events`、`app_settings`。
- 迁移必须能修复旧库缺列。

## 不做

- 不写完整业务 API。
- 不写 RAG/Kuzu 存储。
- 不复制 Pi 原始会话正文。

## 验收

- 空库启动可创建所有表。
- 旧库缺表或缺列可迁移。
- `CREATE TABLE IF NOT EXISTS` 不能作为唯一迁移策略。
- Pi 原始会话正文不进入 `ridge.db`。

## 关联设计

- `文档/项目设计/数据库与持久化.md`
- `文档/项目设计/开发计划与里程碑.md`

## Spec 提取点

- 每张表的字段、索引和约束。
- 迁移版本机制。
- 旧库兼容修复规则。

## Spec 草案

### 输入

- 服务器启动事件。
- `~/.pi/ridge.db` 路径。
- 当前应用 schema version。

### 行为

- 数据库不存在时创建。
- 数据库存在时读取迁移版本。
- 按版本顺序执行迁移。
- 对旧表执行 `PRAGMA table_info` 检查并补齐缺列。
- 所有迁移必须事务化。

### 输出

- 可用的 `ridge.db`。
- 当前 schema version。

### 测试

- 空库创建所有核心表。
- 缺列旧库启动后补齐。
- 迁移失败回滚。
- Pi 原始消息正文不会写入 `ridge.db`。
