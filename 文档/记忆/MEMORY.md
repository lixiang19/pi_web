# Pi Web 项目记忆

> 只记决策和教训，代码/文档能查到的不记。控制在 10-15 条以内。

## 架构决策
- [Pi SDK] 只能用 SDK 模式，禁止 RPC（官方限制，无替代方案）
- [数据存储] 统一用服务端 JSON 文件存储（~/.ridge/），不混用 localStorage（架构简单统一）
- [前后端分离] server 负责 runtime + 权限 + 持久化，web 只做投影消费，禁止在 Web 层伪造会话语义
- [输入安全] 所有服务端写入必须白名单校验，防止原型污染（__proto__ 注入）
- [目录边界] 工作区文件树与 Home 目录项目选择必须拆成两个接口，不能共用一套 root 校验（安全语义不同）

## 规范与教训
- [主题规范] 禁止硬编码颜色值，必须用 shadcn 主题变量（暗色模式会失效）
- [主题链路] Tailwind 语义主题类必须在构建期通过 theme contract 暴露，运行时只负责注入真实 CSS 变量
- [边框治理] Tailwind 裸 `border-*` 在未显式指定颜色时会回退到 `currentColor`，在 ridge 主题中必须改用语义化 surface 分层，不能依赖细线分隔
- [主题边界] `style.css` 是唯一的 Tailwind 构建期基础入口；主题文件（如 `ridge.css`、`default.css`）只能保存运行时 token，禁止再塞 `@import "tailwindcss"`、`@custom-variant`、`@layer base` 这类构建期指令
- [透明度] 用 `/95`、`/80`、`/20` 后缀，不用 `bg-white/[0.x]` 语法
- [双Agent检查] 检查阶段两个 agent 必须互不可见结果，避免自查盲区
- [P0修复] 审查发现的严重问题（安全/命名冲突）必须立即修复，不拖到下次迭代

## 功能实现经验
- [主题持久化] 主题名和明暗模式都必须进入服务端 settings 模型，不能只放 composable 临时状态
- [拖放实现] 原生 HTML5 Drag and Drop API 足够满足简单拖放需求，无需引入第三方库
- [防抖模式] 使用 dragCounter 计数器解决 dragenter/dragleave 闪烁问题
- [数据格式] 拖放数据同时存储 text/plain（路径）和 application/json（完整对象），预留扩展空间
- [消息协议边界] 对话区不要在 server/web 两端自造 `ChatMessage/contentBlocks` 投影协议；一旦后端改写 message/content、前端再二次累积 block，message 边界就会被破坏，折叠层级必然混乱
- [事件命名] Vue defineEmits 中带有冒号的事件名必须用引号包裹（"update:modelValue"）
- [类型校验] 即使 TypeScript 编译通过，也要验证运行时数据字段（如 AgentSummary 实际无 id 字段）
- [共享列表状态] 同一份项目列表如果会被侧栏、空态、弹窗同时消费，composable 必须提升为模块级共享状态并做请求去重，否则不同区域会出现数据不同步

- [ask 交互] 阻塞式 ask 不能伪装成普通消息，必须建模为“挂起中的 tool + 独立 interactiveRequests”，否则恢复执行、重连快照和消息回放会乱
- [server 类型补洞] 当 workspace 没有完整第三方类型包时，可在 `packages/server/src/types/` 放最小 shim 保住 server `tsc --noEmit`，但 shim 只补边界，不扩散到业务层