# Exa 网页内容工具

## 职责

Exa 网页内容工具负责把公开网页 URL 的正文提取交给 Exa 官方 Contents API，再把标题、URL、发布时间和正文返回给 Pi Agent。它用于 URL 闪念、网页剪藏和资料沉淀，不依赖 Pi MCP 版 Exa。

## 入口

- `packages/server/src/exa-tools.ts`
  - `createExaToolExecutors()`：可单测执行器。
  - `createExaToolsExtension()`：注册 Pi 工具 `exa_get_contents`。
- `packages/server/src/session-context.ts`
  - 普通 Pi 会话注册 Exa 工具。
- `packages/server/src/fleeting-analysis.ts`
  - 内部 `fleeting-agent` 注册 Exa 工具，并在 prompt 中要求 URL 闪念优先调用 `exa_get_contents`。
- `packages/server/src/agent-permissions.ts`
  - `exa_get_contents` 映射为 `read` 权限，subject/pattern 来自 `url`。

## 配置

- 只读取环境变量，可写入仓库根目录 `.env`。
- `EXA_API_KEY`：必填 API Key。
- `EXA_BASE_URL`：可选，默认 `https://api.exa.ai`。
- 由 `packages/server/src/env.ts` 在 server 启动时加载 `.env` / `.env.local`。

## 工具

| 工具名 | 功能 | 输入边界 | 输出 |
|--------|------|----------|------|
| `exa_get_contents` | 调用 `POST /contents` 提取公开网页正文 | `url` 支持 HTTP/HTTPS，拒绝 localhost、私网和非网页 scheme | Markdown 文本 + `url/title/text/publishedDate/author` details |

## 闪念 URL 流程

1. URL 进入 `fleeting_notes.content`。
2. `fleeting.analyze` worker 启动不可见 `fleeting-agent`。
3. prompt 明确要求发现 URL 时先调用 `exa_get_contents`。
4. Agent 用返回正文生成剪藏或资料 Markdown，YAML 记录 `url/title/captured_at`。
5. 完成后调用 `complete_internal_task`，summary 写入 `fleeting_notes.recommendation_text`。

## 测试

- `packages/server/src/__tests__/exa-tools.test.ts`
  - 调用 Exa 官方 Contents API 的请求体与 header。
  - 缺 API key 明确失败。
  - 非公开 URL 在调用 Exa 前拒绝。
  - 权限映射为 `read`，`read: deny` 移除工具。
