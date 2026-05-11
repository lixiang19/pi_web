# 任务 05 会话附件后端 + 前端全链路 — 自动化验收报告

- **验收时间**：2026-05-11 02:48
- **验收对象**：http://127.0.0.1:5175/（工作空间主页 + 后端 API）
- **使用 skills**：web-automation-acceptance, playwright-cli
- **产物目录**：`自动化测试/session-attachments-2026-05-11-0248/`

## 1. 命令门禁

| 命令 | 结果 |
|------|------|
| `cd packages/server && pnpm test` | ✅ 通过（19 files, 126 tests） |
| `cd packages/web && pnpm test -- --run` | ✅ 通过（30 files, 166 tests） |
| 根目录 `npm run check` | ✅ 通过（ESLint 0 error + vue-tsc 通过） |

## 2. 后端 API/存储 验证

### `session_attachments` migration version=6
- ✅ 确认 `RIDGE_DB_SCHEMA_VERSION = 6`
- ✅ migrations.ts 中 version 6 包含 `session_attachments` 表创建 SQL

### `POST /api/sessions/:id/attachments` 不存在 session 拒绝
- ✅ e2e 测试验证 `POST /api/sessions/non-existent-session/attachments` 返回 **404**
- ✅ 单元测试 `session-messages-attachments.test.ts` 同样验证 404 且不写 DB

### 上传附件落盘 + 写 DB
- ✅ e2e 测试通过：创建真实 session → 上传 `api-test.txt` → 返回 201，响应包含 `id`
- ✅ 单元测试确认文件写入 `~/.pi/session-attachments/<sessionId>/`
- ✅ 单元测试确认 DB 写入 `session_attachments` 表，字段完整

### API 响应不泄露 `storedPath`
- ✅ e2e 断言 `att` 不包含 `storedPath` 和 `stored_path`
- ✅ 单元测试 `session-messages-attachments.test.ts` 同样断言不包含 `storedPath`

### 附件上下文构建
- ✅ 单元测试 `buildAttachmentContext`：文本附件包含内容，二进制附件包含引用信息
- ✅ `buildAttachmentContext` 不泄露 `stored_path`
- ✅ `validateAttachmentIds` 拒绝非本 session 附件

## 3. 前端链路 验证

### HomePage 选择附件后 UI 显示待附加
- ✅ e2e 测试：`home-attachment-btn` 点击 → filechooser → 选择文件 → `home-pending-attachment` 可见
- ✅ 截图 `03-attachment-uploaded.png` 为证

### 首发链路
- ✅ 前端组件测试覆盖：`HomePage.test.ts` 验证 submit payload 含 `attachments` 字段
- ✅ `WorkspacePage.test.ts` 验证 `handleHomeSubmit` 有附件时：
  - 调用 `createSession`
  - 成功后调用 `uploadSessionAttachments`
  - 再 `replaceTab` 并携带 `initialAttachmentIds`
- ✅ `usePerSessionChat.ts` 中 `submit(attachmentIds)` 将 `attachmentIds` 传入 `sendMessage`

### 上传失败不 replaceTab
- ✅ `WorkspacePage.test.ts` 验证：附件上传失败时 `mockReplaceTab` **未被调用**
- ✅ 输入和附件保留（HomePage 不清空 draft）
- ✅ `homeSubmittingTabIds` 控制发送按钮恢复可用

### 临时模型/Agent/思考不写全局设置
- ✅ `handleHomeSubmit` 源码中无 `setDefaultModel/setDefaultAgent/setDefaultThinkingLevel` 调用
- ✅ 组件测试确认 `createSession` payload 含模型/Agent/思考但不触发全局设置写入

## 4. Web 真实验收（playwright-cli）

### 浏览器操作摘要
1. 打开 `http://127.0.0.1:5175/login`，登录（密码 ridge-admin）
2. 进入主页 `http://127.0.0.1:5175/`
3. 点击 `home-attachment-btn`，触发文件选择器
4. 选择 `/tmp/test-attachment.txt`
5. 验证 `home-pending-attachment` 出现，文本为 `test-attachment.txt`
6. 输入文本 `测试会话附件端到端验证`
7. 截图记录（见 screenshots/ 目录）

### 截图证据
- `screenshots/01-login.png`：登录页
- `screenshots/02-home.png`：主页初始
- `screenshots/03-attachment-uploaded.png`：附件选择后 UI 显示待附加
- `screenshots/04-before-send.png`：输入文本后发送前
- `screenshots/05-after-send.png`：点击发送后状态

### Console 结果
- 有 4 个 401 Unauthorized（登录前的 API 请求，正常）
- 无严重 JS 错误
- 无阻塞页面功能的 console error

### Snapshot 证据
- `snapshots/01-login.yaml`：登录页状态
- `snapshots/02-home.yaml`：主页状态（附件已选择）

## 5. e2e 测试

- **e2e 文件**：`packages/web/e2e/session-attachments.spec.ts`
- **运行命令**：`cd packages/web && npx playwright test e2e/session-attachments.spec.ts --reporter=line`
- **运行结果**：**4 passed**

测试覆盖：
1. 主页附件按钮 → 文件选择 → UI 显示待附加文件
2. 输入文本 + 附件 → 发送按钮可用，前端状态正确
3. 后端 API：上传文件后落盘并返回附件 id，响应不泄露 storedPath
4. 后端 API：上传到不存在 session 返回 404

## 6. 最终结论

**通过 ✅**

所有命令门禁通过，后端 API 和存储验证通过，前端链路组件测试覆盖充分，Web 真实验收完成并固化为 e2e Playwright 测试，e2e 运行全部通过。
