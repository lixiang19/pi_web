# 工作台 Shell 与标签系统验收报告

## 验收功能点
工作台 Shell 与标签系统真实使用验收

## 页面 URL
http://127.0.0.1:5175/

## 执行时间
2026-05-11 19:11:38 - 19:13:00

## 使用的 playwright-cli 命令摘要
- `playwright-cli open http://127.0.0.1:5175/`
- `playwright-cli snapshot`（多次，获取页面状态与元素 refs）
- `playwright-cli fill e11 "ridge-admin" --submit`
- `playwright-cli click e31`（任务按钮，两次）
- `playwright-cli click e42`（终端按钮，三次）
- `playwright-cli click e134`（主页标签关闭按钮）
- `playwright-cli screenshot --filename=...`（8 张截图）
- `playwright-cli --raw snapshot > ...`（6 份 snapshot YAML）
- `playwright-cli console`（两次，记录 console 日志）
- `playwright-cli requests`（两次，记录关闭主页前后网络请求）

## 真实操作步骤与验证结果

### 1. 登录后工作台 Shell 可见
- 操作：打开页面，填写密码 ridge-admin，按 Enter 登录
- 结果：成功跳转到工作台，左侧导航区（complementary）与右侧主区域（main）均可见
- 证据：screenshots/02-workspace-initial.png、snapshots/01-workspace-initial.yml

### 2. 左侧固定入口包含要求的条目，且不包含主页
- 左侧按钮依次出现（snapshot 确认）：闪念(e16)、搜索(e21)、通知(e26)、任务(e31)、文件(e36)、终端(e42)、自动化(e47)、Skill(e52)、设置(e56)
- 主页标签仅出现在右侧顶部标签栏（main > generic > generic[ref=e131]），未出现在左侧固定入口
- 结果：通过
- 证据：snapshots/01-workspace-initial.yml

### 3. 点击“任务”打开右侧工作台标签；重复点击只保留一个任务标签并激活它
- 第一次点击任务(e31)：右侧标签栏出现“任务”标签（e194），内容区显示任务看板（heading "任务" [level=2]）
- 第二次点击任务(e31)：右侧标签栏仍只有一个“任务”标签，任务按钮显示 [active]
- 结果：通过
- 证据：screenshots/03-after-click-task.png、04-after-click-task-again.png、snapshots/02-after-click-task.yml

### 4. 连续点击“终端”至少 3 次，生成多个终端标签/实例
- 第一次点击终端：标签栏出现“终端”（e249）
- 第二次点击终端：标签栏出现第二个“终端”（e301）
- 第三次点击终端：标签栏出现第三个“终端”（e353）
- 网络请求记录到 3 次 POST /api/terminals => [201] Created（请求编号 256、262、267）
- 结果：通过，终端为多例标签
- 证据：screenshots/05~07、snapshots/03~05、requests/01-before-close-home.txt

### 5. 关闭空“主页”标签，不应创建会话
- 操作前主页标签存在（e131），操作后主页标签消失
- 关闭主页前后网络请求列表对比：关闭后没有新增 POST /api/sessions 或类似创建会话的请求
- 结果：通过，空主页关闭未产生会话
- 证据：screenshots/08-after-close-home.png、snapshots/06-after-close-home.yml、requests/01/02

### 6. 控制台不能有阻塞功能的 JS error
- 全部 console 输出仅包含登录前的 4 条 401 Unauthorized（system/info、providers、sessions、session-contexts），属于预期行为
- 无 pageerror、无未捕获异常、无阻塞性 JS 错误
- 结果：通过
- 证据：console.log

## 截图清单
- screenshots/01-login-page.png — 登录页初始
- screenshots/02-workspace-initial.png — 工作台初始
- screenshots/03-after-click-task.png — 第一次点击任务
- screenshots/04-after-click-task-again.png — 重复点击任务
- screenshots/05-after-terminal-1.png — 第一次点击终端
- screenshots/06-after-terminal-2.png — 第二次点击终端
- screenshots/07-after-terminal-3.png — 第三次点击终端
- screenshots/08-after-close-home.png — 关闭主页后

## e2e 文件路径
packages/web/e2e/workspace-shell-tabs.spec.ts

## e2e 运行命令和结果
```bash
cd packages/web && npx playwright test e2e/workspace-shell-tabs.spec.ts --reporter=line
```
结果：5 passed (25.8s)

## 最终结论
通过
