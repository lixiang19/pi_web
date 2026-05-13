# 任务18 Review Fixes 自动化验收报告

**验收时间：** 2026-05-13 01:43–01:47
**验收功能点：** task18-review-fixes
**页面 URL：** http://localhost:5175/
**使用 skills：** web-automation-acceptance, playwright-cli

## 1. 浏览器操作摘要

| 步骤 | 命令/操作 | 结果 |
|------|----------|------|
| 1 | `playwright-cli open http://localhost:5175/login` | 打开登录页 |
| 2 | `playwright-cli fill e11 "ridge-admin"` | 填写密码 |
| 3 | `playwright-cli press Enter` | 登录成功 |
| 4 | `playwright-cli click e28` | 进入文件页 |
| 5 | 通过 API 上传测试文件 | 文件上传成功 (201) |
| 6 | API PATCH 设置 `convert_failed` 状态 | 设置成功 |
| 7 | `playwright-cli reload` + 点击文件 | 失败状态可见 |
| 8 | `playwright-cli click e700` (重试处理) | 状态刷新为“待处理” |
| 9 | 验证 `Enter`/`Space` 键盘事件 | 文件预览打开 |
| 10 | API 验证 `\\` 路径 | 返回 400 + backslash 错误 |

## 2. 验收点覆盖

### ✅ 文件处理失败状态展示
- 上传文件后通过 API 设置为 `convert_failed` + error
- 刷新页面后 UI 正确显示：
  - 错误信息：`Unsupported format: this file type cannot be converted`
  - 状态标签：`转换失败`

### ✅ 失败原因可见
- snapshot 证据：`generic "Unsupported format: this file type cannot be converted" [ref=e699]`

### ✅ retry 按钮可见
- snapshot 证据：`button "重试处理" [ref=e700]`

### ✅ 点击 retry 不触发文件打开
- 点击 `重试处理` 后，页面仍停留在文件视图，未打开文件预览

### ✅ retry 后刷新状态
- 点击 retry 后，状态变为 `待处理`
- API 验证：`processingStatus: "pending"`，`processingError: undefined`

### ✅ 文件行可访问性
- Enter 和 Space 都能打开文件预览（已体现在 `task18-file-processing-status.spec.ts` 中）
- 实际浏览器验证：通过 focus + keydown Enter/Space 事件，文件预览 tab 出现

### ✅ e2e cleanup 使用真实创建文件 + query params DELETE
- `task18-review-fixes.spec.ts`：
  - `afterEach` 中通过 `fetch DELETE /api/files/entries?root=...&path=...` 删除文件
  - `expect(ok).toBe(true)` 断言清理成功，不残留
- 运行通过，无 409 冲突

### ✅ 含 `\` 路径被拒绝为 400
- API 测试：`/api/workspace/files/tree?path=/Users/lixiang/ridge-workspace\test`
- 返回：`400 Path contains backslash which is not allowed`

## 3. 截图证据

| 编号 | 文件名 | 说明 |
|------|--------|------|
| 01 | `01-login-page.png` | 登录页 |
| 02 | `02-home-after-login.png` | 登录后首页 |
| 03 | `03-files-page.png` | 文件页 |
| 04 | `04-files-with-uploaded.png` | 上传后文件列表 |
| 05 | `05-failed-state-visible.png` | `convert_failed` 失败状态可见 |
| 06 | `06-after-retry.png` | retry 后状态刷新为待处理 |
| 07 | `07-file-preview-opened.png` | 点击文件打开预览 |
| 08 | `08-enter-opens-file.png` | Enter 打开文件预览 |

## 4. Console 结果

- 登录页：4 errors（与本次验收无关的框架错误）
- 文件操作过程中：无新增严重错误
- 整体 console 无阻塞级错误

## 5. e2e 测试

### 已有测试
- **文件：** `packages/web/e2e/task18-file-processing-status.spec.ts`
- **结果：** 3 passed（完整路径失败重试、index_failed 失败重试、键盘 Enter/Space 打开文件）

### 新增测试
- **文件：** `packages/web/e2e/task18-review-fixes.spec.ts`
- **测试用例：**
  1. `cleanup uses real created files and query params DELETE` ✅
  2. `backslash path is rejected as 400` ✅
- **运行命令：** `cd packages/web && npx playwright test e2e/task18-file-processing-status.spec.ts e2e/task18-review-fixes.spec.ts`
- **运行结果：** 5 passed (15.8s)

## 6. 最终结论

**通过。**

- 文件处理失败状态展示完整
- 失败原因和 retry 按钮可见
- retry 后正确刷新为 `pending`
- 键盘 Enter/Space 可打开文件预览
- cleanup 使用真实创建文件 + query params DELETE，无残留
- `\` 路径被 API 正确拒绝为 400
- e2e 测试全部通过

无阻塞问题。
