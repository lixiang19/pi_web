# 验收报告：07 会话界面与右侧工作侧栏

## 验收信息

- **验收功能点**：会话界面与右侧工作侧栏
- **页面 URL**：http://127.0.0.1:5175/
- **执行时间**：2026-05-12 09:30:00
- **测试浏览器**：Chrome (Headless)

## 使用的 playwright-cli 命令摘要

1. `playwright-cli open http://127.0.0.1:5175/ --browser=chrome`
2. `playwright-cli fill e11 "ridge-admin" --submit` — 登录
3. `playwright-cli snapshot` — 多次获取页面状态
4. `playwright-cli click e78` — 点击"验收测试会话"
5. `playwright-cli click e80` — 点击"你好"会话（已有消息的会话）
6. `playwright-cli screenshot` — 保存探索截图
7. `playwright-cli console` — 检查控制台
8. `playwright-cli requests` — 检查网络请求

## 真实操作步骤

1. 打开 http://127.0.0.1:5175/，页面重定向到登录页
2. 输入密码 ridge-admin 并提交，成功进入工作空间
3. 在工作空间左侧边栏看到"工作空间会话"列表
4. 点击"验收测试会话"打开一个新建的空会话
5. 点击"你好"打开一个已有消息的会话（包含 user + assistant 消息）
6. 观察会话主界面：包含消息流区域和 composer 输入区
7. 检查消息操作按钮：发现 assistant 消息有"复制"按钮
8. 检查 user 消息：未发现编辑入口
9. 检查 assistant 消息：未发现重试入口
10. 检查右侧工作侧栏：当前只显示聊天面板，无 Summary/File tree/Git/Diff 侧栏
11. 检查控制台：存在 API 400/500 错误

## 关键 refs / locator

- `e11` — 密码输入框
- `e78` — "验收测试会话"按钮
- `e80` — "你好"会话按钮
- `e312` — assistant 消息上的"复制"按钮
- `e317` — composer 输入框

## 截图清单

| 序号 | 文件名 | 说明 |
|------|--------|------|
| 01 | `screenshots/01-login-page.png` | 登录页面 |
| 02 | `screenshots/02-home-after-type.png` | 首页输入后 |
| 03 | `screenshots/03-session-opened.png` | 打开会话后 |
| 04 | `screenshots/04-existing-session.png` | 已有消息会话 |
| 05 | `screenshots/05-chat-with-messages.png` | 聊天消息区域 |
| 06 | `screenshots/06-chat-full-view.png` | 完整聊天视图 |

## snapshot 清单

| 序号 | 文件名 | 说明 |
|------|--------|------|
| 01 | `snapshots/01-login-page.yml` | 登录页 snapshot |
| 03 | `snapshots/03-session-opened.yml` | 会话打开 snapshot |
| 04 | `snapshots/04-existing-session.yml` | 已有消息会话 snapshot |

## Console 检查结果

- **登录前**：4 条 401 Unauthorized（预期行为，未登录时 API 拒绝）
- **登录后**：存在 API 错误
  - `500` `/api/notes/content?path=日记/2026/05/2026-05-12.md`
  - `400` `/api/workspace/recent-files?root=/Users/lixiang/ridge-workspace&limit=8`
  - `400` `/api/workspace/recent-files?root=/Users/lixiang/ridge-workspace&limit=20`
  - `400` `/api/files/tree?path=/Users/lixiang/ridge-workspace&root=/Users/lixiang/ridge-workspace`
- **阻塞 JS error**：未发现阻塞性 JavaScript 运行时错误

## 验收点逐项结果

| # | 验收点 | 结果 | 证据 |
|---|--------|------|------|
| 1 | 登录后能打开一个普通会话标签 | ✅ 通过 | 点击"你好"会话成功打开 |
| 2 | 会话主界面有消息流区域和 composer 输入区 | ✅ 通过 | snapshot e315 显示消息流，e317 为 composer |
| 3 | 消息展示：已有会话的 user message 能显示 | ✅ 通过 | 截图显示 user bubble "你好" |
| 4 | 复制消息：assistant 最终消息有"复制"按钮 | ✅ 通过 | ref e312 "复制"按钮可见 |
| 5 | 编辑旧用户消息：检查编辑入口 | ❌ 失败 | 未在 user message bubble 上发现编辑按钮/入口 |
| 6 | 重试 AI 回复：检查重试入口 | ❌ 失败 | 未在 assistant message 上发现重试按钮/入口 |
| 7 | 分叉新会话规则：编辑/重试是否能创建新 session/index | ❌ 失败 | 由于编辑/重试入口不存在，无法验证分叉行为 |
| 8 | 任务会话禁止分叉 | ⚠️ 不可验证 | 环境无任务处理会话数据，无法验证 |
| 9 | 右侧工作侧栏：验证 Summary、File tree、Git、Diff 或设计要求侧栏 | ❌ 失败 | 当前仅显示聊天面板，无右侧侧栏 |
| 10 | 文件树/Git/Diff 来源 | ❌ 失败 | 右侧侧栏未在会话标签内显示 |
| 11 | 控制台无阻塞 JS error | ✅ 通过 | 有 API 400/500 但无阻塞 JS 错误 |

## 失败项详细说明

### 5. 编辑旧用户消息 — 失败
- **位置**：user message bubble（class="user-bubble"）
- **证据**：ChatMessageItem.vue 源码中没有编辑按钮的实现；snapshot 中 user bubble 内无按钮
- **结论**：当前未实现用户消息编辑功能

### 6. 重试 AI 回复 — 失败
- **位置**：assistant message 区域
- **证据**：ChatMessageItem.vue 中只有"复制"按钮，无重试按钮；snapshot 中 assistant 消息区域只有 ref e312 "复制"
- **结论**：当前未实现 AI 回复重试功能

### 7. 分叉新会话规则 — 失败
- **原因**：编辑/重试入口不存在，因此无法触发分叉行为进行验证
- **结论**：依赖项（5、6）未实现，本项不可验证

### 9. 右侧工作侧栏 — 失败
- **位置**：会话标签内主区域右侧
- **证据**：
  - 当前 WorkspacePage.vue 使用 WorkspaceChatTab.vue 渲染会话
  - SessionTabContent.vue（含右侧 ProjectFilePanel + WorkbenchOperationPanel）存在但未被接入
  - snapshot 中 main 区域只有消息流 + composer，无右侧 aside 面板
  - 截图显示全宽聊天界面，无右侧边栏
- **结论**：右侧工作侧栏（Summary/File tree/Git/Diff）当前未在会话界面中显示

### 10. 文件树/Git/Diff 来源 — 失败
- **原因**：右侧侧栏不存在，无法验证其内容来源
- **结论**：未实现

## e2e 文件

- **路径**：`packages/web/e2e/session-interface-sidebar.spec.ts`
- **说明**：固化真实验收路径，明确断言当前缺失项

## e2e 运行结果

```bash
cd packages/web && npx playwright test e2e/session-interface-sidebar.spec.ts
```

运行结果（2026-05-12 07:40 UTC）:

```
Running 6 tests using 1 worker
  ✓  1 登录后打开已有消息的会话，验证消息流和 composer (5.6s)
  ✓  2 assistant 最终消息存在复制按钮 (5.6s)
  ✓  3 user message 上不存在编辑入口 — 标记当前缺失 (5.6s)
  ✓  4 assistant message 上不存在重试入口 — 标记当前缺失 (7.3s)
  ✓  5 会话标签内不存在右侧工作侧栏 — 标记当前缺失 (5.8s)
  ✓  6 控制台无阻塞性 JS 错误 (5.7s)

  6 passed (36.2s)
```

所有测试均已通过。测试明确标记了当前缺失的功能（编辑入口、重试入口、右侧工作侧栏），并验证了已存在的功能（消息流、composer、复制按钮）和无阻塞 JS 错误。

**不通过**

以下功能点当前未实现或验证失败：
1. 编辑旧用户消息入口缺失
2. 重试 AI 回复入口缺失
3. 右侧工作侧栏（Summary / File tree / Git / Diff）未在会话标签内显示
4. 分叉新会话规则无法验证（依赖编辑/重试入口）

已验证通过项：
- 登录后打开会话标签 ✅
- 消息流区域 + composer 输入区 ✅
- user / assistant 消息展示 ✅
- assistant 消息"复制"按钮 ✅
- 控制台无阻塞 JS error ✅
