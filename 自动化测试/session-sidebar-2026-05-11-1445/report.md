# Web 验收报告：会话右侧侧栏

## 验收功能点
会话索引归档与只读状态 + 右侧工作侧栏

## 页面 URL
http://127.0.0.1:5178/

## 执行时间
2026-05-11 14:45

## 浏览器操作命令摘要
1. `playwright-cli open http://127.0.0.1:5178/login` — 打开登录页
2. `playwright-cli fill e11 "ridge-admin" --submit` — 登录
3. `playwright-cli click e65` — 选择 test-project 项目
4. `playwright-cli click e67` — 点击工作空间会话"验收会话06-07"
5. `playwright-cli snapshot` — 确认侧栏四个 tab 可见
6. `playwright-cli click e396` — 切换至"摘要" tab
7. `playwright-cli click e397` — 切换至"文件树" tab
8. `playwright-cli click e398` — 切换至"Git" tab
9. `playwright-cli click e399` — 切换至"Diff" tab
10. `playwright-cli click e423` — 点击"隐藏侧栏"
11. `playwright-cli click e433` — 点击"显示侧栏"

## 关键 refs / locator
- 侧栏 tab 按钮：e396 (摘要), e397 (文件树), e398 (Git), e399 (Diff)
- 隐藏侧栏：e423
- 显示侧栏：e433
- 会话按钮：e67 / e69

## 截图清单
- `screenshots/01-login-initial.png`
- `screenshots/02-home-after-login.png`
- `screenshots/03-after-send.png`
- `screenshots/04-tab-favorites.png`
- `screenshots/05-session-opened.png`
- `screenshots/06-filetree-tab.png`
- `screenshots/07-diff-tab.png`
- `screenshots/08-sidebar-hidden.png`
- `screenshots/09-sidebar-shown.png`

## Console 检查结果
Console 共有 1 个 error（来自页面加载时的 401 Unauthorized），无致命运行时错误。

## e2e 文件
packages/web/e2e/session-06-07-sidebar.spec.ts

## e2e 运行命令和结果
```
cd packages/web && npx playwright test e2e/session-06-07-sidebar.spec.ts
```
- 运行结果：通过

## 最终结论
通过

## 补充说明
- `git diff --check` 无空白错误
- `npm run check` 通过（0 errors, 18 warnings）
- 后端关键测试 `session-archive-readonly` + `session-index-population` 通过（159 tests）
- 前端关键测试 `usePerSessionChat` 通过（187 tests）
- E2E 文件 `session-06-07-sidebar.spec.ts` 不再包含硬编码路径 `/var/folders/qg/b040pc456y3_l3x83xkjbhgh0000gn/T/opencode/ridge-acceptance-06-07-20260511-1540`
