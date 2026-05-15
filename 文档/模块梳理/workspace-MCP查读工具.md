# workspace MCP 查读工具

> 状态：已实现后端只读入口与 runtime bundle 配置。
> 对应功能：Task 33

## 职责

workspace MCP 是给桌面本机项目 Agent 使用的服务器只读入口，用设备令牌读取当前服务器 `defaultWorkspaceDir` 对应工作空间的可见资产。当前产品是单用户服务器，权限语义等价于同账号工作空间全读，但代码边界以当前工作空间目录为准。

## API

- `POST /api/workspace/mcp`
  - JSON-RPC 2.0 over HTTP。
  - 认证：`Authorization: Bearer <deviceToken>` 或 `x-ridge-device-token`。
  - 支持 `initialize`、`tools/list`、`tools/call`。
- `GET /api/runtime/bundle`
  - 设备令牌认证。
  - 返回 `mcp.servers.ridge_workspace` 配置，包含 streamable HTTP URL、`Authorization` 与 `x-ridge-device-token` header 和工具名。
  - base URL 优先读取 `RIDGE_PUBLIC_BASE_URL`，其次 `RIDGE_SERVER_BASE_URL`；配置值必须是无 path/query/hash 的 origin；未配置时只允许本机 Host，避免用不受信任的 Host header 生成携带 token 的 MCP URL。
- `POST /api/devices/register`
  - 管理员 Cookie 认证后注册/轮换设备令牌。
  - 明文 token 只在注册响应返回，DB 只保存 `devices.token_hash`。

## Tools

| 工具 | 说明 |
|------|------|
| `rag_search` | 查询 `search_chunks`，返回片段、标题、路径、更新时间、来源类型、分数和行号。 |
| `graph_search` | 预留图谱查询工具；不伪造图谱数据。Task 28 图谱索引未就绪时返回空结果并标明 `graphAvailable`。 |
| `file_search` | 复用全局搜索的可见文件、记忆、Wiki、空间来源，不返回外部仓库文件内容。 |
| `read_workspace_file` | 读取工作空间可见文件和正式 `附件/`，文本返回 UTF-8，二进制返回 base64，单次最多 1 MiB。 |

## 路径边界

`read_workspace_file` 同时检查：

- 词法路径必须在当前 workspace 内。
- `realpath` 后仍必须在 workspace 内。
- 任一路径段以 `.` 开头即视为隐藏路径并拒绝。
- 因此 `.ridge/`、`.originals/`、会话临时上传、闪念临时附件、转换临时目录、越界 symlink 和外部仓库路径均不可读。
- `附件/` 是正式长期资产目录，不是隐藏目录，可读。

## 数据与迁移

- `devices.token_hash` 保存设备令牌 SHA-256 hash。
- migration v16 添加 `idx_devices_token_hash`。
- token 认证成功会更新 `devices.status = 'online'`、`last_seen_at` 和 `updated_at`。
- 远程/公网部署必须配置 origin 形式的 `RIDGE_PUBLIC_BASE_URL`，否则 runtime bundle 会拒绝非本机 Host。

## 文件关联

- `packages/server/src/devices.ts`
- `packages/server/src/routes/workspace-mcp.ts`
- `packages/server/src/routes/runtime-bundle.ts`
- `packages/protocol/src/index.ts`
- `packages/server/src/__tests__/workspace-mcp.test.ts`

## 测试

- `workspace-mcp.test.ts`
  - `POST /api/devices/register` 未登录 401，登录后注册成功，DB 只保存 token hash；
  - 未带设备 token 返回 401；
  - `tools/list` 只暴露四个只读工具；
  - `initialize`、未知 method、`x-ridge-device-token` 分支和空白 `Authorization` 回退；
  - `read_workspace_file` 可读可见文件和正式附件；
  - 隐藏目录、临时附件、`.originals`、越界 symlink、外部绝对路径均拒绝；
  - `rag_search` 与 `file_search` 返回标准片段结果；
  - 外部仓库文件内容不通过 MCP 泄露；
  - runtime bundle 含带双认证 header 的 MCP 配置，非本机 Host 未配置 public base URL 时拒绝，非法、带凭据或非 origin public base URL 返回 400。
- `ridge-db-migration.test.ts`
  - 新库/旧库修复均包含 `devices.token_hash` 和 `idx_devices_token_hash`。
