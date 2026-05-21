# 76 Exa 官方 API 网页内容工具

## 背景

Python Converter 的 URL 转 Markdown 对 JS-heavy、反爬和动态页面不稳定；Pi MCP 版 Exa 依赖 Pi MCP 支持，闪念后台链路里不够可靠。URL 闪念需要一个 ridge 自己注册、可测试、可权限裁剪的 Exa 官方 API 工具。

## 实现

- 删除 `convert_url_to_markdown`：
  - `packages/server/src/conversion-tools.ts` 只保留 `convert_file_to_markdown`。
  - `packages/server/src/agent-permissions.ts` 不再把旧 URL converter 当作工具。
- 新增 `exa_get_contents`：
  - `packages/server/src/exa-tools.ts` 调用 `POST https://api.exa.ai/contents`。
  - header 使用 `x-api-key`。
  - body 使用 `{ urls: [url], text: true }`。
  - 配置读取 `.env` / 环境变量 `EXA_API_KEY`；`EXA_BASE_URL` 可覆盖默认 base URL。
  - 拒绝非 HTTP/HTTPS、localhost 和私网 URL。
- 注册范围：
  - 普通会话 `createSessionResourceLoader` 注册 `createExaToolsExtension()`。
  - `fleeting-agent` 注册 `createExaToolsExtension()`。
  - 闪念 prompt 要求 URL 闪念优先调用 `exa_get_contents` 后沉淀。

## 验收

- `pnpm --dir packages/server exec vitest run src/__tests__/conversion-tools.test.ts src/__tests__/exa-tools.test.ts`
- `pnpm --dir packages/server exec vitest run src/__tests__/fleeting-analysis.test.ts`
- `npm run check`
