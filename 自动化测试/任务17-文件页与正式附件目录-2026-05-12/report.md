# 任务17 - 文件页与正式附件目录 自动化验收报告

## 验收功能点
文件页与正式附件目录展示、目录导航、文件打开/预览、.ridge 隐藏、处理状态徽章展示。

## 页面 URL
http://localhost:5175/

## 执行时间
2026-05-12 17:48 - 18:10

## 使用的 playwright-cli 命令摘要
- `playwright-cli open http://localhost:5175` — 打开应用
- `playwright-cli fill / click / press Enter` — 登录
- `playwright-cli click "getByRole('button', { name: '文件', exact: true })"` — 打开文件页
- `playwright-cli click "getByRole('main').getByRole('button', { name: '附件' })"` — 导航进入附件目录
- `playwright-cli screenshot` — 截图记录
- `playwright-cli snapshot --boxes` — 获取页面快照
- `playwright-cli eval "async () => { ...fetch(...) }"` — 直接验证 API 边界

## 真实操作步骤
1. 登录 → 进入工作台主页
2. 点击侧边栏「文件」按钮 → 打开文件页（FilesView）
3. 验证工作空间根目录展示（笔记、附件、记忆等八个预制目录可见）
4. 点击「附件」目录 → 进入正式附件目录
5. 验证附件目录内文件列表（test-attachment*.txt 等）
6. 点击返回按钮 → 回到工作空间根目录
7. 点击文件 → 触发文件打开/预览事件（页面未崩溃）
8. 通过浏览器 fetch 直接验证 `.ridge` 文件读取 API 返回 400
9. 验证处理状态徽章（已转换）正确显示在附件文件上

## 关键 refs / locator
- 文件按钮: `getByRole('button', { name: '文件', exact: true })`
- 附件目录: `getByRole('main').getByRole('button', { name: '附件' })`
- 文件行: `[data-test='file-row']`
- 面包屑: `[data-test='breadcrumb']`

## 截图清单
- `screenshots/01-initial-workspace.png` — 初始工作台页面
- `screenshots/02-files-view-empty.png` — 早期空文件夹状态（因 symlink-outside 导致 API 400，已排查移除）
- `screenshots/03-files-view-loaded.png` — 文件页加载成功，展示工作空间目录
- `screenshots/04-attachments-directory.png` — 进入附件目录
- `screenshots/05-attachments-files-list.png` — 附件目录内文件列表
- `screenshots/06-attachments-with-status-badge.png` — 文件显示「已转换」状态徽章
- `screenshots/07-file-preview.png` — 点击文件后页面状态

## Console 检查结果
- 初始阶段有 401 Unauthorized 错误（认证会话跨服务切换导致，排查后恢复正常）
- 核心验证完成后剩余 2 个 errors：
  - `/api/notes/content?path=日记/2026/05/2026-05-12.md` → 500（与任务17无关的日常笔记加载错误）
  - `.ridge` 文件访问 → 400（预期内的拒绝响应，触发于 API 直接验证）
- **无任务17相关致命 console error**

## API 边界验证
- `GET /api/workspace/files/tree` → 返回工作空间目录，不含 `.ridge`
- `GET /api/workspace/files/read?path=.ridge/...` → 400 Bad Request，符合规格
- `GET /api/workspace/files/read?path=附件/test-attachment.txt` → 正常预览

## e2e 文件
`packages/web/e2e/task-17-files-attachments.spec.ts`

## e2e 运行命令和结果
```bash
cd packages/web && pnpm test:e2e -- task-17-files-attachments.spec.ts
```

结果：6 passed (12.8s)
- 文件入口可打开真实文件页并展示工作空间目录 ✅
- 正式附件目录可见且可导航 ✅
- .ridge 不可见且不可访问 ✅
- 目录可导航（前进后退） ✅
- 文件可打开/预览 ✅
- 处理状态徽章展示不破坏页面 ✅

## 阻塞项
**无阻塞项。**

## 最终结论
**通过。**

任务17实现的文件页与正式附件目录功能在真实浏览器操作中验证通过：
1. 文件入口（侧边栏「文件」按钮）可正常打开文件页
2. 正式附件目录「附件」在工作空间根目录可见，点击进入后文件列表正常渲染
3. `.ridge` 系统目录不在文件树中展示，且直接 API 访问返回 400
4. 目录导航（进入/返回）正常
5. 文件点击可触发打开/预览事件，页面无崩溃
6. 处理状态徽章（如「已转换」）正确显示且不破坏页面布局
7. 前后端对应测试均已通过（`workspace-files-api.test.ts` 11/11 通过，`FilesView.test.ts` 全部通过，e2e 6/6 通过）
