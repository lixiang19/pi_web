# Pi Web 项目记忆

> 只记决策和教训，代码/文档能查到的不记。控制在 10-15 条以内。

## 架构决策
- [Pi SDK] 只能用 SDK 模式，禁止 RPC（官方限制，无替代方案）
- [数据存储] 统一用服务端 JSON 文件存储（~/.ridge/），不混用 localStorage（架构简单统一）
- [前后端分离] server 负责 runtime + 权限 + 持久化，web 只做投影消费，禁止在 Web 层伪造会话语义
- [Agent注册表] agent 系统不能只依赖磁盘发现，必须先有内置默认 agent，再让 project/user 配置覆盖；否则 schema 一收紧，功能会出现“系统支持但列表为空”的假故障
- [输入安全] 所有服务端写入必须白名单校验，防止原型污染（__proto__ 注入）
- [目录边界] 工作区文件树与 Home 目录项目选择必须拆成两个接口，不能共用一套 root 校验（安全语义不同）
- [Pi资源隔离] 临时禁全局 prompts/skills/extensions/themes/AGENTS 时，不能只换 `SettingsManager(agentDir)`；`DefaultResourceLoader` 也必须显式传同一个隔离 `agentDir`，否则会回落 `getAgentDir()` 继续扫 `~/.pi/agent`。auth/models/sessions 可继续走全局。
- [项目真源] 已添加项目必须是真源；会话列表、文件树、worktree 归属都从项目列表收敛，禁止再从 session 或 server 启动目录反推项目边界

## 规范与教训
- [主题规范] 禁止硬编码颜色值，必须用 shadcn 主题变量（暗色模式会失效）
- [主题链路] Tailwind 语义主题类必须在构建期通过 theme contract 暴露，运行时只负责注入真实 CSS 变量
- [边框治理] Tailwind 裸 `border-*` 在未显式指定颜色时会回退到 `currentColor`，在 ridge 主题中必须改用语义化 surface 分层，不能依赖细线分隔
- [主题边界] `style.css` 是唯一的 Tailwind 构建期基础入口；主题文件（如 `ridge.css`、`default.css`）只能保存运行时 token，禁止再塞 `@import "tailwindcss"`、`@custom-variant`、`@layer base` 这类构建期指令
- [surface 语义] `ridge-panel-header` 只给头部/标题栏表面，不能复用到底部输入区；底部 composer 属于对话主背景，错用 header surface 会造成中间区与底板背景分裂
- [透明度] 用 `/95`、`/80`、`/20` 后缀，不用 `bg-white/[0.x]` 语法
- [双Agent检查] 检查阶段两个 agent 必须互不可见结果，避免自查盲区
- [P0修复] 审查发现的严重问题（安全/命名冲突）必须立即修复，不拖到下次迭代

## 功能实现经验
- [长路径展示] 弹窗里的路径、命令等长字符串不能和主操作按钮挤在同一行；应独立成可换行信息块，否则会在 dialog/grid 容器里撑坏最小宽度并裁剪操作区
- [主题持久化] 主题名和明暗模式都必须进入服务端 settings 模型，不能只放 composable 临时状态
- [拖放实现] 原生 HTML5 Drag and Drop API 足够满足简单拖放需求，无需引入第三方库
- [防抖模式] 使用 dragCounter 计数器解决 dragenter/dragleave 闪烁问题
- [数据格式] 拖放数据同时存储 text/plain（路径）和 application/json（完整对象），预留扩展空间
- [消息协议边界] 对话区不要在 server/web 两端自造 `ChatMessage/contentBlocks` 投影协议；一旦后端改写 message/content、前端再二次累积 block，message 边界就会被破坏，折叠层级必然混乱
- [事件命名] Vue defineEmits 中带有冒号的事件名必须用引号包裹（"update:modelValue"）
- [类型校验] 即使 TypeScript 编译通过，也要验证运行时数据字段（如 AgentSummary 实际无 id 字段）
- [共享列表状态] 同一份项目列表如果会被侧栏、空态、弹窗同时消费，composable 必须提升为模块级共享状态并做请求去重，否则不同区域会出现数据不同步
- [草稿标签] 多标签工作台不能把“打开标签”和“创建服务端 session”合并；新建会话必须先落在前端草稿标签，cwd 继承链至少保持 payload -> 当前活动标签 -> workspaceDir
- [Composable契约] 组合层 composable 如果只依赖少数字段，就声明最小状态接口；不要把整个 composable ReturnType 暴露给调用方，更不要用 Ref<object> 去伪装对象属性是 Ref 的契约
- [会话真源] 工作台会话显示状态只能有一个真源；组件 props、tab 状态、聊天实例三处同时持有会话身份时，草稿转正式会话一定会失真
- [LRU 生命周期] LRU 池模型下，SSE 是否保持连接取决于“会话是否还在池里”，不能再取决于“当前是否可见”
- [草稿语义] 如果产品要求“新建草稿独立存在、切换即丢失”，就必须在创建草稿时主动清空 `null draft`，否则旧草稿会通过共享状态偷偷恢复

- [ask 交互] 阻塞式 ask 要拆成两条线：pending 阶段走 `interactiveRequests` 底部表单，历史阶段回到普通工具消息；两者不能混成一种投影
- [permission 审批] 运行时权限审批不是 ask 工具，也不是新工具消息；它是 tool_call 前拦截层。pending 走独立 `permissionRequests` 卡片，历史不单独落 UI，避免把审批语义伪装成工具协议
- [server 类型补洞] 当 workspace 没有完整第三方类型包时，可在 `packages/server/src/types/` 放最小 shim 保住 server `tsc --noEmit`，但 shim 只补边界，不扩散到业务层
- [消息桥接] Web 想做真实工具回放，server 绝不能把 Pi `toolResult` 压扁成只剩 `role/content/timestamp`；`toolCallId/toolName/details/isError` 缺一个，关联、摘要、专属渲染都会废
- [会话流桥接] 恢复会话能显示但发送后消息不刷新，优先检查 server 是否真正绑定了 `AgentSession.subscribe()`；如果 SSE 只发 `status` 不发 runtime message 事件，前端恢复链路会正常，发送链路一定失效
- [乐观消息去重] Pi SDK 会给 user message 也发 `message_start/message_end`，Web 端已有乐观用户消息时，server SSE 桥接必须过滤这两类 user 事件，否则每次发送都会重复一条 user 消息
- [Git能力探测] Git 面板显隐不能靠 `getGitStatus()` 报错倒推；要单独提供轻量 `isGitRepository` 探测链路，把“能力判断”和“状态读取”拆开
- [消息可见性] 多轮会话的历史折叠必须是显式 UI 状态，不能把“最后一轮切片显示”藏在渲染默认值里；否则用户继续输入会误以为旧消息被删，但底层 session/jsonl 其实完整
- [历史分页] 会话历史分页单位必须是 user 轮次，不是消息条数；工具消息/thinking/toolResult 会放大消息数，若按条数截窗，UI 与用户心智必然错位
- [导航去重] 会话侧栏不要再维护“最近访问”这类二次导航；标签页已承担最近工作集语义，侧栏应只保留稳定信息架构（项目/搜索），否则状态重复、localStorage 重复、认知也重复
- [TS 检测边界] Web 端如果明确不改 shadcn/reka 生成包装层，就不要继续用 `exactOptionalPropertyTypes` 把第三方可选 props 透传问题算成项目故障；应在 `tsconfig.app.json` 收紧真实适用的门禁，同时把业务层事件载荷、Ref 透传、索引签名访问等类型错误逐个修正，保证 `check` 与 `build` 同标准
- [索引主键一致性] session 上下文里的 `projectId` 必须直接复用 `projects.id`；一旦混入路径型标识，左栏项目归组会立刻失真
- [会话选择持久化] `agent/model/thinkingLevel` 必须共用同一条持久化链；只保存 agent 会让刷新恢复与运行时实际选择脱节
- [消息接口边界] 读取历史消息不能隐式打开完整 runtime；活跃会话读内存，非活跃会话直读 session 文件，并给会话打开流程做并发去重
- [项目归属匹配] 嵌套项目或父子 worktree 场景下，session 归属必须按最长根路径匹配，不能按项目添加顺序取首个命中
- [拆分后禁止回退聚合] 既然 `messages` 已独立，历史扩窗、ask 失败回填、permission 失败回填这类动作就只能调消息接口；一旦回退到 `getSession` 之类的聚合调用，接口拆分收益会被自己抵消
- [上下文字典同步] 新会话如果会产生新的 `contextId`，`sessions` 和 `session-contexts` 必须同步刷新，否则左栏会出现摘要已更新、上下文字典滞后的错位
- [写路径禁止全量重建] create/update/archive/delete 这类单会话写操作只能做局部索引更新；全量 session catalog refresh 只允许出现在启动建索引和 project scope 变化场景
- [前端单一快照装配] usePiChat 与 usePiChatCore 不允许再各自维护 snapshot/hydrate/patch 逻辑；会话快照协议的装配必须集中在共享模块中统一演进
- [工作台会话新基线] 工作台现已彻底删除 `usePiChat.ts` 与 `useWorkbenchPage.ts`；统一改为 `usePiChatCore + usePerSessionChat + useSessionLruPool`，详情页也只能走单会话链路，禁止再回到聚合式旧状态层。
- [路由与会话边界] 路由只负责表达当前功能域，不能直接托管会话实例生命周期；会话这种高频活状态必须继续由 `useSessionLruPool` 托管，必要时通过 `KeepAlive` 保活 `/chat` 页面，而不是把单会话路由化后交给 URL 驱动。
- [UI消息包装边界] `pending/localId` 这类前端乐观态字段只能放在 `UiConversationMessage` 包装层；协议层 `PiMessage/SessionSnapshot` 必须保持 Pi 原始结构，不能再回退到自造 `ChatMessage/contentBlocks`
- [索引字段最小化] 会话目录索引只保留有明确消费方的字段；没有 UI 或接口消费的 `last_message_preview`、`message_count` 这类字段应直接删除，不能先入库再等以后再说
- [SSE 零写库] 发送消息前和 `turn_end` 都不能顺手写 SQLite；SSE 链路只负责内存态和 session 文件，目录索引由启动重建和显式用户动作维护
- [运行时态不入目录索引] 列表 `status` 这类运行时字段只允许由内存 active session 覆盖，不应作为数据库持久化列存在
- [SQLite 字面量] 写 SQLite 语句时，字符串字面量必须用单引号；`""` 在 SQLite 中会按标识符解析，像 `context_id != ""` 这种写法会在启动建索引时直接触发 `no such column: ""`
- [原生依赖安装契约] 仓库使用 `pnpm 10` 时，`better-sqlite3` 这类原生包不能只写进 dependencies；必须在根 `package.json` 的 `pnpm.onlyBuiltDependencies` 中显式放行，否则 install 后会出现“包存在但 `.node` 绑定缺失”，server 在 `new Database()` 时直接失败
