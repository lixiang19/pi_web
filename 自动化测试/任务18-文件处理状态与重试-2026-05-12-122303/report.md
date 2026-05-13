# 任务18 — 文件处理状态展示与失败重试 — 自动化验收报告

- **验收功能点**：文件处理状态生命周期展示、失败原因可见性、失败文件重试按钮交互、重试后状态刷新
- **页面地址**：http://localhost:5175/
- **执行时间**：2026-05-12 12:23–12:25
- **验收方式**：Playwright 真实浏览器操作 + 后端 API 状态准备

## 浏览器操作摘要

| 步骤 | 命令/操作 | 结果 |
|------|----------|------|
| 1 | `playwright-cli open http://localhost:5175/` | 打开登录页 |
| 2 | `playwright-cli fill e11 "ridge-admin" --submit` | 登录成功，进入主页 |
| 3 | `playwright-cli click e36`（文件按钮） | 导航到文件页 |
| 4 | 浏览器内执行 `fetch('/api/files/upload', ...)` | 上传测试文件，返回 201 |
| 5 | 浏览器内执行 `fetch('/api/workspace/files/tree?path=...)` | 验证 `processingStatus: "pending"` |
| 6 | PATCH `/api/workspace/files/status` → `converting` | 200 OK |
| 7 | PATCH `/api/workspace/files/status` → `convert_failed` + error | 200 OK |
| 8 | 刷新页面，点击文件按钮 | 文件页显示错误信息和重试按钮 |
| 9 | 点击重试按钮 | 不触发文件打开，状态刷新为 "待处理" |
| 10 | PATCH → `converting` → `converted` → `index_failed` + error | 验证 index_failed 状态展示和重试 |

## Snapshot/refs 证据

- **文件页初始状态**：`e27`（文件按钮）、`e36`（文件页激活）
- **失败文件行**：包含 `processingStatus="convert_failed"`、错误文本 `Unsupported format: this file type cannot be converted`、重试按钮 `title="重试处理"`
- **重试后**：错误文本消失，状态变为 `pending`（"待处理"）
- **index_failed 状态**：错误文本 `Index engine unavailable: Elasticsearch connection timeout`、状态徽章 "索引失败"、重试按钮可见

## 截图证据

| 序号 | 路径 | 说明 |
|------|------|------|
| 01 | `screenshots/01-files-page-initial.png` | 文件页初始状态 |
| 02 | `screenshots/02-failed-file-with-retry-button.png` | convert_failed 状态：错误原因可见 + 重试按钮 |
| 03 | `screenshots/03-after-retry-pending-status.png` | 点击重试后状态刷新为 "待处理" |
| 04 | `screenshots/04-converted-status.png` | converted 状态徽章展示 |
| 05 | `screenshots/05-index-failed-with-error.png` | index_failed 状态：错误原因 + 重试按钮 |
| 06 | `screenshots/06-second-retry-back-to-pending.png` | 第二次重试后回到 pending |

## Console 结果

- 存在 1 个非阻塞错误：`Failed to load resource: 500 Internal Server Error` 来自日记读取 API（`/api/notes/content?path=日记/...`），与任务18无关。
- 文件处理相关操作无 console 错误。

## e2e 文件

- **路径**：`packages/web/e2e/task18-file-processing-status.spec.ts`
- **测试数**：2 个 test case
  1. 完整路径：文件上传→转换失败→失败原因可见→重试按钮可见且点击不触发文件打开→重试后刷新为待处理
  2. index_failed 失败原因可见且可重试

## e2e 运行

```bash
cd packages/web && npx playwright test e2e/task18-file-processing-status.spec.ts --workers=1
```

**结果**：✅ 2 passed (2 tests, 1 worker)

（注：Playwright 通过 `playwright.config.ts` 中 `webServer` 配置自动管理前端 dev server；后端服务已在端口 3000 由 `tsx watch` 提供。）

## 验收结论

- **文件处理状态展示**：✅ 通过。pending、converting、converted、convert_failed、index_failed 五种状态徽章均能在文件列表正确展示。
- **失败原因可见**：✅ 通过。convert_failed 和 index_failed 均显示对应的 `processingError` 文本。
- **重试按钮可见**：✅ 通过。失败文件行出现 `title="重试处理"` 的按钮，成功状态不出现。
- **点击不触发文件打开**：✅ 通过。点击重试按钮后页面保持在文件视图，未导航到文件预览/编辑器。
- **重试后刷新状态**：✅ 通过。点击后自动刷新当前目录，状态从失败回到 `pending`，错误文本消失。
- **API 状态流转**：✅ 通过。状态机强制流转校验生效（pending→converting→convert_failed 合法；直接 pending→convert_failed 返回 400）。

**最终结论：通过**
