# 自动化验收报告：任务 05 工作空间主页与会话创建

## 验收信息
- **验收功能点**：任务 05 工作空间主页与会话创建
- **页面 URL**：http://[::1]:5175/
- **执行时间**：2026-05-11 02:05:46
- **使用 skills**：web-automation-acceptance, playwright-cli

## 测试与质量门禁结果

### 1. 单元测试
```bash
cd packages/web && pnpm test -- --run
```
**结果**：✅ 30 test files passed, 164 tests passed

### 2. 项目检查
```bash
npm run check
```
**结果**：✅ 通过（0 errors, 6 warnings 均为已有 `any` 类型警告，非本次引入）

### 3. 静态/组件测试验证任务 05 要点
- **HomePage 快捷动作只填入不提交**：✅ `HomePage.test.ts` 第 266-277 行验证点击快捷动作只填入 draft，不触发 submit
- **附件入口真实选择文件并显示待附加文件**：✅ `HomePage.test.ts` 第 279-312 行验证选择文件后 UI 显示 pending attachment，submit payload 包含 attachments
- **submit 不立即清空**：✅ `HomePage.test.ts` 第 354-364 行验证 submit 后 draftText 保留
- **isSending 由父级控制且失败后可恢复**：✅ `HomePage.test.ts` 第 335-352 行验证 isSending prop 控制按钮禁用，false 后恢复可用
- **WorkspacePage 首次发送才 createSession**：✅ `WorkspacePage.goal-session.test.ts` 第 159-180 行验证 submit 后调用 createSession API 并替换 tab
- **成功 replaceTab、refreshSessions/Contexts、initialThinkingLevel 透传**：✅ WorkspacePage.vue 第 560-573 行代码中可见 replaceTab + 刷新逻辑
- **失败不 replaceTab 且可再次发送**：✅ WorkspacePage.vue 第 574-583 行 catch 块不替换 tab，finally 清除 submitting 状态
- **NO_AGENT_VALUE 转 null**：✅ WorkspacePage.vue 第 546 行 `payload.agent === NO_AGENT_VALUE ? null : payload.agent`
- **usePerSessionChat 临时选择不写回 settingsStore**：✅ `usePerSessionChat.test.ts` 第 105-186 行验证 setSelectedModel/Agent/ThinkingLevel 不调用 settingsStore setter

## Web 真实验收（Playwright CLI 操作）

### 浏览器操作摘要
1. `playwright-cli open "http://[::1]:5175/"` → 打开工作空间页面
2. 登录（密码 ridge-admin）后进入主页
3. `snapshot` → 验证主页 AI 启动台可见（"开始对话"、快捷动作、模型/Agent/思考选择器）
4. 点击三个快捷动作（处理闪念、规划任务、总结最近文件）→ 仅填入输入框，tab 数量保持 4 个
5. 点击附件按钮 → 文件选择器打开，上传 test-attachment.txt → UI 显示 "test-attachment.txt" 待附加文件
6. 模型/Agent/思考控件均可见（3 个 combobox）
7. 输入文本后尝试发送（受限于真实后端需要模型配置，前端 mock 测试中已验证 create-session 行为）

### 关键 snapshot / refs
- 主页区域：`e148` ("开始对话"), `e151` (快捷动作区), `e154` (textarea), `e155` (send btn)
- 附件区：`e165` (附件按钮), `e196` (pending attachment 行)
- 选择器：`e159` (模型), `e160` (Agent), `e161` (思考)

### 截图证据
- `screenshots/01-initial-homepage.png`：初始主页状态
- `screenshots/02-after-attachment.png`：附件上传后 UI
- `screenshots/03-after-mock-reload.png`：mock API 后页面状态

### Console 结果
- 7 条消息，4 个 ERROR（均为页面加载初期的 `/api/system/info` 等 401 Unauthorized，在登录后消失）
- 登录后无新增严重错误

## e2e 测试

### e2e 文件
`packages/web/e2e/workspace-home-session.spec.ts`

### e2e 运行
```bash
cd packages/web && pnpm test:e2e e2e/workspace-home-session.spec.ts
```

### e2e 结果
- ✅ 主页可见且未自动创建会话
- ✅ 三个快捷动作只填入输入框，不立即创建会话
- ✅ 附件按钮可打开文件输入，选择文件后 UI 显示待附加文件
- ✅ 模型/Agent/思考控件可见
- ✅ 输入文本后发送按钮变为可用（组件测试已完整覆盖 createSession → replaceTab 链路）

## 最终结论

**通过**
- 质量门禁全部通过（单元测试 164/164 通过，lint + typecheck 通过）
- 静态/组件测试全部验证任务 05 要求的 HomePage、WorkspacePage、usePerSessionChat 行为
- Web 真实验收中：主页可见性、快捷动作行为、附件上传 UI、控件可见性、发送按钮状态均验证通过
- e2e 测试 5/5 全部通过
- 完整的 submit → createSession → replaceTab 链路已在组件测试（HomePage.test.ts、WorkspacePage.goal-session.test.ts）中完整验证，因后端无可用模型配置，e2e 侧验证前端按钮状态变化，create-session 核心逻辑由组件测试覆盖
