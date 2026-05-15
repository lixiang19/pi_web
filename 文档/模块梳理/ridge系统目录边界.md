# ridge 系统目录边界

## 职责

`.ridge/` 是工作空间内的系统隐藏目录，用于临时附件、RAG 缓存、图谱、转换缓存和运行缓存。

## 初始化

入口：`packages/server/src/workspace-chat.ts`

启动时创建：

- `.ridge/fleeting-attachments`
- `.ridge/rag`
- `.ridge/graph.kuzu`
- `.ridge/cache`
- `.ridge/runtime`

## 文件界面边界

入口：`packages/server/src/file-manager.ts`

- 文件树不展示 `.ridge`。
- 搜索和最近文件复用文件树遍历，因此也不会进入 `.ridge`。
- 直接访问 `.ridge` 内路径会失败。
- 创建、移动、上传等写入口都必须拒绝生成 `.ridge` 路径。
- `.ridge` 不能作为 managed root，也不能作为嵌套 managed root。
- **符号链接 `.ridge` 防护**：`assertNotRidgeSystemPathReal` 对目标路径或最近存在的祖先路径解析真实路径（`fs.realpath`），再拒绝任何真实路径段包含 `.ridge` 的请求。`listDirectoryEntries` 对每个 entry 也做 realpath 检查，避免 `visible -> .ridge` 这样的符号链接显示或进入。

## 文件处理状态

入口：`packages/server/src/routes/workspace-files.ts`

- `GET /api/workspace/files/tree` 在返回条目时，从 `file_processing_status` 表读取并附加 `processingStatus` 字段。
- `PATCH /api/workspace/files/status` 更新文件处理状态，**强制流转**：`pending → converting → converted → indexed`；失败分支只能从执行中状态进入（`converting → convert_failed`、`converted → index_failed`）；`convert_failed`/`index_failed` 只能通过 retry 回到 `pending`；`indexed` 为终态不接受任何流转。非法流转返回 400。
- `POST /api/workspace/files/retry` 将失败状态（`convert_failed` / `index_failed`）回退到 `pending`。
- 状态枚举：`pending | converting | converted | indexed | convert_failed | index_failed`。
- 目录节点不附加 `processingStatus`。
- 上传文件到可见目录后自动创建 `pending` 记录（`POST /api/files/upload`）；`.ridge` 内文件跳过。
- 删除文件时同步清理 `file_processing_status` 记录（`DELETE /api/files/entries`）；删除目录时清理前缀下全部记录，**LIKE 特殊字符 `%` `_` 已转义并配合 `ESCAPE '\'`**，防止误删相似路径。
- 失败通知规则：转换失败生成 `file_processing.convert_failed`，索引失败生成 `file_processing.index_failed`，均写入 `notification_events`。

## 后续边界

- RAG 扫描必须复用 `isRidgeSystemPath` / `assertNotRidgeSystemPath`。
- workspace MCP 读取必须复用同一套 `.ridge` 拒绝逻辑。
- `GET /api/workspace/backup` 生成服务器备份 ZIP，包含 `.ridge/graph.kuzu`，但排除 `.ridge/rag`、`.ridge/cache`、`.ridge/runtime` 和临时附件；打包时显式跳过符号链接。
- `.ridge/graph.kuzu/schema.cypher` 记录 Kuzu schema；真实 Kuzu 数据库位于 `.ridge/graph.kuzu/database.kuzu`。
- 内置隐藏 Git exclude 包含 `.ridge`，因此 Kuzu 图谱、RAG 缓存和运行缓存都不会进入隐藏版本管理。
- 文件页 API 与文件树 API 分离，文件页使用 `/api/workspace/files/*`，专门用于工作空间文件管理，附加处理状态。
