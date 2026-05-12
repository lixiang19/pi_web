# 06 会话索引归档与只读状态 — 验收报告

## 验收概况
- **验收对象**：http://127.0.0.1:5175/（ridge Web 工作台）
- **验收时间**：2026-05-11
- **使用 skills**：web-automation-acceptance、playwright-cli
- **产物目录**：自动化测试/会话索引归档只读-2026-05-11-192251/

## 操作摘要
1. 打开页面 http://127.0.0.1:5175/，跳转登录页
2. 输入密码 `ridge-admin` 登录
3. 登录后工作台可见，左侧底部“归档”入口（data-test="workspace-archived-entry"）可见
4. 点击“归档”入口，右侧打开“归档”标签页，显示标题“归档”
5. 使用真实 API 创建测试会话：`POST /api/sessions`（cwd=/Users/lixiang/Documents/myCode/openchamber），sessionId=019e16c7-88c8-755c-b81a-9c5279fb65d8
6. 验证归档前：`/api/sessions` 返回 archived=false
7. 调用归档 API：`POST /api/sessions/:id/archive` {archived:true}，返回 ok=true
8. 验证归档后：`/api/sessions` 返回 archived=true
9. 对归档会话发送消息：`POST /api/sessions/:id/messages` {prompt:"test"}，返回 403，错误文本包含“归档会话不可发送消息”
10. 点击同一个未归档会话两次，右侧只保留一个该会话标签（去重生效）
11. 检查 console：存在已知非阻塞错误（recent-files 400、notes 500、files/tree 400），无阻塞功能的新 JS error
12. 数据库 schema 验证：session_index 表与 sessions 表均无消息正文列；Pi 原始消息正文存储在 `.pi/agent/sessions/` 的 jsonl 文件中，不写入 ridge.db

## 验证结果逐项

| 序号 | 验收重点 | 结果 | 证据 |
|------|---------|------|------|
| 1 | 登录后工作台可见，归档入口可见，点击后打开归档标签 | ✅ 通过 | snapshot 显示归档按钮可见；点击后 heading"归档"出现；screenshots/03-archive-tab-opened.png |
| 2 | 使用真实 API 创建/定位可归档会话 | ✅ 通过 | API 创建 sessionId=019e16c7-88c8-755c-b81a-9c5279fb65d8 |
| 3 | 归档前 /api/sessions 返回 archived=false，普通列表可见 | ✅ 通过 | API 响应 archived=false；e2e 断言通过 |
| 4 | 归档后 /api/sessions 返回 archived=true；普通列表/侧栏过滤 | ⚠️ 部分通过 | API 返回 archived=true 正确；但后端 `listIndexedSessions` 未排除 archived=true 的会话，仍返回在列表中。前端 `sortedWorkspaceSessions` computed 已过滤 `session.archived === false`，侧栏不显示。前后端过滤不一致，后端应同步排除归档会话。 |
| 5 | 归档会话发送消息返回 403 | ✅ 通过 | API 返回 403，错误文本“归档会话不可发送消息” |
| 6 | 同一个会话点击两次只保留一个标签 | ✅ 通过 | playwright 真实点击验证，第二次点击后 tab 数量不变；WorkspacePage.vue 中 `handleOpenProjectSession` / `handleOpenSession` 均有去重逻辑 |
| 7 | 消息正文不进入 ridge.db | ✅ 通过 | `session_index` 和 `sessions` 表 schema 无消息正文列；Pi 原始消息存在 `~/.pi/agent/sessions/` jsonl 文件中 |
| 8 | 桌面设备离线时不打开其项目历史 | ❓ 不可验证 | 当前环境无桌面设备/离线项目数据，无法构造测试条件 |
| 9 | 控制台无阻塞 JS error | ✅ 通过 | 存在已知非阻塞 HTTP error（recent-files 400、notes 500、files/tree 400），无阻塞功能的新 JS error |

## 发现的问题
1. **后端 API 过滤不一致**：`GET /api/sessions` 返回的列表中仍包含 archived=true 的会话（如测试会话归档后仍出现在 API 响应中），但前端 `sortedWorkspaceSessions` 已正确过滤。后端 `listIndexedSessions` 应从 SQL 层面排除 archived=1 的会话，或至少提供查询参数过滤。
2. **e2e 稳定性**：`data-test` 属性在 Playwright `getByTestId` 中无法直接匹配（可能因实现方式差异），改用 CSS locator `[data-test="..."]` 后通过。

## e2e 文件
- **路径**：packages/web/e2e/session-archive.spec.ts
- **覆盖**：归档入口可见与点击、API 创建/归档/403 验证、会话标签去重、console error 检查
- **运行命令**：`cd packages/web && npx playwright test e2e/session-archive.spec.ts`
- **运行结果**：4 passed (9.2s)

## Console 结果
- 登录前 401：预期行为
- 页面加载后存在已知的非阻塞 HTTP error（recent-files 400、notes 500、files/tree 400），与归档功能无关
- 无新的阻塞功能 JS error

## 无法验证项及原因
- **桌面设备离线时不打开其项目历史**：当前运行环境为单一服务器实例，无桌面设备注册，也无离线桌面项目数据。无法构造客观测试条件。如未来引入桌面设备同步功能，需补充此项验收。

## 最终结论
**部分通过**。核心归档功能（归档 API、归档后 403、前端过滤、标签去重、消息正文不存 DB）均已验证通过。发现一个问题：后端 `/api/sessions` 未从 SQL 层面排除已归档会话，前后端过滤不一致，建议后端同步修复。
