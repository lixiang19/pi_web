# 33 workspace MCP 查读工具

## 状态

已实现并归档。

## 目标

实现服务器 workspace MCP，供桌面本机项目 Agent 查读云端工作空间。

## 范围

- `rag_search`。
- `graph_search`。
- `file_search`。
- `read_workspace_file`。
- 设备令牌认证。
- 当前单用户服务器工作空间全读，代码边界以当前 `defaultWorkspaceDir` 为准。
- MCP 配置进入 runtime bundle。

## 不做

- MCP 不允许写。
- 不读取隐藏目录。
- 不读取临时附件。
- 不读取会话临时上传。

## 实现

- `POST /api/workspace/mcp`
  - JSON-RPC 2.0 HTTP endpoint。
  - 支持 `initialize`、`tools/list`、`tools/call`。
  - 设备令牌通过 `Authorization: Bearer <token>` 或 `x-ridge-device-token` 认证。
- `rag_search(query, limit)`
  - 读取真实 `search_chunks`。
  - 返回 `snippet`、`title`、`path`、`updatedAt`、`sourceType`、`score`、标题路径和行号。
- `file_search(query, limit, dir)`
  - 复用全局搜索的 visible file / memory / wiki / space 数据源。
  - 不返回外部仓库文件内容。
- `read_workspace_file(path)`
  - 读取工作空间可见文件与正式 `附件/`。
  - 文本返回 UTF-8，二进制返回 base64。
  - 同时校验词法路径和 realpath，拒绝隐藏路径段、越界 symlink、外部绝对路径、`.ridge/`、`.originals/`、闪念临时附件和会话临时上传。
- `graph_search(query, limit)`
  - 暴露只读工具契约，不伪造图谱数据。
  - Task 28 图谱索引未就绪时返回空结果并标明 `graphAvailable`。
- runtime bundle
  - `GET /api/runtime/bundle` 使用设备 token 认证。
  - 返回 `mcp.servers.ridge_workspace`，包含 streamable HTTP URL、`Authorization` 与 `x-ridge-device-token` 认证 header 和四个工具名。
  - URL base 优先使用 `RIDGE_PUBLIC_BASE_URL`，其次 `RIDGE_SERVER_BASE_URL`；配置值必须是无 path/query/hash 的 origin；未配置时只允许本机 Host，避免不可信 Host header 生成携带 token 的远端 URL。
- 设备注册
  - `POST /api/devices/register` 在管理员 Cookie 认证后注册/轮换设备 token。
  - DB 只保存 `devices.token_hash`。

## 数据变更

- migration v16：`devices.token_hash` + `idx_devices_token_hash`。
- 项目当前无历史用户兼容要求；旧明文设备 token 不迁移，重新注册设备后获得新 token。
- 协议层新增 `RidgeRuntimeBundle` / `RuntimeMcpServerConfig`。

## 验收

- `read_workspace_file` 可读取普通可见文件和正式附件。
- 检索结果返回片段、标题、路径、更新时间、来源类型和相关分数。
- 外部项目文件不通过 workspace MCP 暴露。
- MCP 工具列表没有写入/删除/更新类工具。
- MCP 不写用户真实 `~/.pi` 或外部项目 `.pi`；设备 token 只写 `~/.pi/ridge.db` 的 hash。

## 测试

- `pnpm --dir packages/server test -- workspace-mcp.test.ts`
  - 10 passed。
- `pnpm --dir packages/server test -- ridge-db-migration.test.ts`
  - 3 passed，覆盖 `devices.token_hash` 与 `idx_devices_token_hash` 的新库/旧库修复。

## 关联设计

- `文档/项目设计/记忆Wiki图谱与工作空间MCP.md`
- `文档/模块梳理/workspace-MCP查读工具.md`
- `文档/模块梳理/数据库与迁移.md`
