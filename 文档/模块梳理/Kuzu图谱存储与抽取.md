# Kuzu 图谱存储与抽取模块契约

> 状态：**已实现后端基础链路**
> 对应功能：Task 28

## 1. 模块定位

图谱是 ridge 的结构化理解层，用于后续 AI 召回、规划和轻量邻接浏览。第一版只做存储、schema、抽取维护链路和自然语言纠错入口，不做巨大画布。

## 2. 存储位置

```txt
~/ridge-workspace/.ridge/graph.kuzu/
```

该目录由 workspace 初始化创建，并写入 `schema.cypher`。真实 Kuzu 数据库文件位于该目录内的 `database.kuzu`。

## 3. Kuzu schema

节点表：

- `Project`
- `File`
- `Task`
- `Person`
- `Org`
- `Concept`
- `Tech`
- `Source`
- `Decision`

所有节点表都有：

```txt
id STRING PRIMARY KEY
type STRING
name STRING
summary STRING
source_path STRING
evidence STRING
confidence DOUBLE
updated_at INT64
```

关系表：

```txt
EvidenceRelation
```

关系覆盖全部实体类型之间的 `FROM ... TO ...` 组合，字段为：

```txt
relation_id STRING
predicate STRING
evidence STRING
source_path STRING
confidence DOUBLE
updated_at INT64
```

关系必须保存短摘录证据和来源路径。

## 4. 抽取来源

graph agent 只接收标准化输入：

- `search_chunks` 中已索引的 Markdown 标准产物；
- `记忆/daily/**/*.md`；
- 已注册内部项目中的 Markdown 文档。

排除：

- 外部项目；
- `.ridge`；
- `.originals`；
- `.git`；
- `node_modules`；
- 非 Markdown 原始文件和图片/音频/PDF 原件。

直接读取 daily 或内部项目 Markdown 前必须校验 `realpath` 仍在 workspace 内；内部项目根目录如果是指向 workspace 外的符号链接，会被跳过。

## 5. 夜间链路

`rag-worker.ts` 的夜间入口顺序固定为：

1. `indexAllPending({ includeDeferred: true, event: "nightly" })`
2. `graphRunner.runNightlyOnce()`
3. `wikiRunner.runNightlyOnce()`
4. `indexAllPending({ event: "nightly" })`

因此 graph agent 读取的是夜间 RAG 后的标准产物视图，Wiki agent 再读取 graph 结果和当前 Wiki 文件维护少量入口页；Wiki 写入后本轮会立即补一次 non-deferred RAG 索引。

## 6. 自然语言纠错

入口：

```txt
POST /api/workspace/graph/corrections
Body: { "correction": "..." }
```

服务端把用户自然语言纠错作为 graph agent 输入，解析为同一套实体/关系 JSON 后写入 Kuzu。用户不直接编辑 Kuzu。

## 7. 备份与隐藏版本

- `GET /api/workspace/backup` 会生成服务器备份 ZIP，实际写入工作空间、`ridge.db` 和 `.ridge/graph.kuzu`。
- 服务器完整备份清单包含 `.ridge/graph.kuzu`，并由备份下载链路消费该清单。
- 备份排除 `.ridge/rag`、`.ridge/cache`、`.ridge/runtime`、`.ridge/fleeting-attachments`。
- 备份打包显式跳过符号链接，避免 workspace 内链接把外部文件纳入备份。
- 内置隐藏 Git exclude 包含 `.ridge`，因此图谱不进入隐藏版本管理。

## 8. 相关文件

- `packages/server/src/graph-store.ts`
- `packages/server/src/graph-agent.ts`
- `packages/server/src/routes/workspace-graph.ts`
- `packages/server/src/rag-worker.ts`
- `packages/server/src/workspace-backup.ts`
- `packages/server/src/iso-git-service.ts`

## 9. 测试

- `graph-store.test.ts`：Kuzu schema、证据关系、80 字证据截断、真实嵌入式 Kuzu 写入和纠错写入。
- `graph-agent.test.ts`：抽取来源边界、输出 schema 解析、维护 runner、内部项目根目录符号链接越界防护。
- `graph-worker.test.ts`：夜间 RAG 后触发 graph agent。
- `workspace-graph-api.test.ts`：纠错 API 认证、未初始化 503、成功调用 graph runner。
- `workspace-backup.test.ts`：备份清单和 ZIP 内容包含图谱、排除可重建缓存、符号链接不进入备份。
- `workspace-backup-api.test.ts`：备份下载 API 认证、ZIP 包含 `.ridge/graph.kuzu` 且排除 `.ridge/rag`。
- `iso-git-service.test.ts`：隐藏 Git 排除 `.ridge`。
- `workspace-chat.test.ts`：初始化创建 `.ridge/graph.kuzu/schema.cypher`。
