# 工作台左侧导航任务 04 页面验收报告

## 验收功能点
工作台左侧导航（固定入口、项目列表/会话列表、归档入口）

## 页面 URL
http://localhost:82/
（开发服务器实际运行在 http://localhost:5175/，由 `pnpm dev` 提供）

## 执行时间
2026-05-11 01:32:37 — 2026-05-11 01:40:00

## 使用技能
- web-automation-acceptance
- playwright-cli

## 浏览器操作摘要

### 1. 打开页面
```bash
npx playwright-cli open http://localhost:82/
```
页面初始跳转至 `http://localhost:82/login?redirect=/`，显示密码登录页面。

### 2. 登录
- 使用 `fill` + `type` 向密码输入框填入 `ridge-admin`
- 点击 `进入工作台` 按钮（ref=e12）
- 首次尝试因密码错误失败，修正后成功登录并跳转至工作台主页 `http://localhost:82/`

### 3. 左侧固定入口检查
- 确认 `任务`（ref=e32）、`终端`（ref=e43）、`归档`（ref=e122）均可见

### 4. 点击任务
```bash
npx playwright-cli click e32
```
- 左侧 `任务` 按钮变为 `[active]`
- 主区域顶部面包屑出现 `任务` 标签
- 主区域显示 `heading "任务" [level=2]` 及看板界面（待处理/进行中/阻塞/审核中/完成 均为 0）

### 5. 点击终端
```bash
npx playwright-cli click e43
```
- 面包屑新增 `终端` 标签
- 主区域显示终端提示符：`lixiang@lixiangdeMac-mini-3 ridge-workspace %`
- 终端输入框 `[active]`

### 6. 点击归档
```bash
npx playwright-cli click e122
```
- 左侧 `归档` 按钮变为 `[active]`
- 面包屑新增 `归档` 标签
- 主区域显示 `heading "归档" [level=2]`

### 7. 点击项目
```bash
npx playwright-cli click e66
```
- 项目 `AuroraPlatformWeb` 按钮变为 `[active]`
- 页面无异常，项目条目保持可见

## 关键 refs / locator
| 元素 | ref | Playwright locator |
|---|---|---|
| 任务按钮 | e32 | `getByRole('button', { name: '任务' })` |
| 终端按钮 | e43 | `getByRole('button', { name: '终端' })` |
| 归档按钮 | e122 | `locator('[data-test="workspace-archived-entry"]')` |
| 项目 AuroraPlatformWeb | e66 | `getByRole('button', { name: /AuroraPlatformWeb/ })` |

## 截图证据清单
1. `自动化测试/workspace-left-nav-task04-2026-05-11-013237/screenshots/01-initial.png` — 初始登录页
2. `自动化测试/workspace-left-nav-task04-2026-05-11-013237/screenshots/02-workspace-left-nav.png` — 登录后工作台左侧导航全貌
3. `自动化测试/workspace-left-nav-task04-2026-05-11-013237/screenshots/03-after-task-click.png` — 点击任务后主区域任务看板
4. `自动化测试/workspace-left-nav-task04-2026-05-11-013237/screenshots/04-after-terminal-click.png` — 点击终端后终端页面
5. `自动化测试/workspace-left-nav-task04-2026-05-11-013237/screenshots/05-after-archive-click.png` — 点击归档后归档页面
6. `自动化测试/workspace-left-nav-task04-2026-05-11-013237/screenshots/06-after-project-click.png` — 点击项目后项目激活状态

## Console 检查结果
共 7 条消息，其中 4 条 ERROR：
- 4 条 `401 (Unauthorized)` 来自 `/api/system/info`、`/api/providers`、`/api/sessions`、`/api/session-contexts`
- 1 条 VERBOSE 密码表单可访问性提示
- **结论**：401 为未登录状态下访问受保护 API 的正常行为；无运行时 JS 错误，console 无严重问题。

## Requests 结果
- 初始 4 条 GET 请求 401（未登录状态）
- POST `/api/auth/login` 200 成功
- GET `/api/projects` 200，返回项目列表
- GET `/api/projects/{id}/worktrees` 200
- POST `/api/terminals` 201（终端创建成功）

## e2e 文件
- 路径：`packages/web/e2e/workspace-left-nav-task04.spec.ts`
- 内容固化：登录 → 检查固定入口 → 点击任务 → 点击终端 → 点击归档 → 点击项目，共 5 个测试用例。

## e2e 运行
```bash
cd packages/web && npx playwright test e2e/workspace-left-nav-task04.spec.ts
```
结果：5 passed (18.8s)
- 固定入口包含任务、终端、归档 ✓
- 点击任务打开任务页面并显示任务看板 ✓
- 点击终端打开终端页面并显示终端提示符 ✓
- 点击归档打开归档页面 ✓
- 项目列表中可点击项目并激活 ✓

## 最终结论
**通过**

所有要求验收的路径均已在真实浏览器中跑通，截图、snapshot、console、requests 已保存，e2e 测试已生成并通过。
