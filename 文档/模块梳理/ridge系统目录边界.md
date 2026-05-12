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
- 状态枚举：`pending | converting | converted | indexed | convert_failed | index_failed`。
- 目录节点不附加 `processingStatus`。

## 后续边界

- RAG 扫描必须复用 `isRidgeSystemPath` / `assertNotRidgeSystemPath`。
- workspace MCP 读取必须复用同一套 `.ridge` 拒绝逻辑。
- 备份可以包含 `.ridge/graph.kuzu`，但应排除 `.ridge/rag`、`.ridge/cache`、`.ridge/runtime` 和临时附件。
- 文件页 API 与文件树 API 分离，文件页使用 `/api/workspace/files/*`，专门用于工作空间文件管理，附加处理状态。
