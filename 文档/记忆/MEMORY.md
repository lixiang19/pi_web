# Pi Web 项目记忆

> 只记决策和教训，代码/文档能查到的不记。控制在 10-15 条以内。

## 架构决策

- [Pi SDK] 只能用 SDK 模式，禁止 RPC（官方限制，无替代方案）
- [数据存储] 统一用服务端 JSON 文件存储（~/.ridge/），不混用 localStorage（架构简单统一）
- [前后端分离] server 负责 runtime + 权限 + 持久化，web 只做投影消费，禁止在 Web 层伪造会话语义
- [Agent注册表] agent 系统不能只依赖磁盘发现，必须先有内置默认 agent，再让 project/user 配置覆盖；否则 schema 一收紧，功能会出现“系统支持但列表为空”的假故障
- [输入安全] 所有服务端写入必须白名单校验，防止原型污染（**proto** 注入）
- [目录边界] 工作区文件树与 Home 目录项目选择必须拆成两个接口，不能共用一套 root 校验（安全语义不同）
- [Pi资源隔离] 临时禁全局 prompts/skills/extensions/themes/AGENTS 时，不能只换 `SettingsManager(agentDir)`；`DefaultResourceLoader` 也必须显式传同一个隔离 `agentDir`，否则会回落 `getAgentDir()` 继续扫 `~/.pi/agent`。auth/models/sessions 可继续走全局。
- [项目真源] 已添加项目必须是真源；会话列表、文件树、worktree 归属都从项目列表收敛，禁止再从 session 或 server 启动目录反推项目边界
- [系统聊天项目] 工作区 `chat` 是独立系统项目：它要进入会话归属与新聊天默认落点，但不能混入 `/api/projects` 的用户项目列表
- [工作区默认目录] 运行时工作区绝不能默认回落到仓库根或 npm 启动目录；默认工作空间是 `~/ridge-workspace`，当前路径记录在 `~/.pi/ridge.db`
- [配置存储] `ridge-settings.json` 已退役；设置、项目、收藏、当前工作空间路径等 ridge 运行状态统一落到 `~/.pi/ridge.db`
- [chat 初始化契约] `<workspace>/chat` 只允许是目录；已存在但不是目录时必须直接失败，不能吞掉错误继续复制
- [单用户认证] VPS 个人部署采用固定密码登录，登录成功后使用服务端内存 Session 和 `ridge_session` HttpOnly Cookie；除 `/api/auth/session|login|logout` 外，其余 `/api/*` 和终端 WebSocket 都必须鉴权。当前固定密码写在服务端，仓库或镜像泄露即视为密码泄露。
- [重型转换服务边界] 文档/PDF/Word/音频/图片等重型解析与转换长期由独立 Python 通用转化服务承载（基于 MarkItDown/Whisper/OCR 等），ridge Node 后端只做 workspace 安全校验、`file_processing_status` 状态机、`background_jobs` 队列调度、产物落盘（`.md/.assets/.metadata.json/.originals`）；Node 不自研 PDF/Word 解析栈、不内嵌模型推理。Python 服务按 `文档/功能开发/40-Python通用转化服务API契约.md` 接口独立开发，多 client/多 project 可用，不属于 ridge 专属。

## 规范与教训

- [ridge.db 迁移] `CREATE TABLE IF NOT EXISTS` 只能建新表，不能补旧表列；新增索引依赖新列前，必须在 bootstrap 前用 `PRAGMA table_info` 检查旧表并显式 `ALTER TABLE`。涉及模型关系的新列还要迁移旧数据归属，比如旧任务缺 `milestone_id` 时要回填到“未归属”，不能只补空列。
- [主题规范] 禁止硬编码颜色值，必须用 shadcn 主题变量（暗色模式会失效）
- [shadcn上下文] `TooltipProvider` 应在 App 根入口统一提供，不能依赖具体路由布局补上下文；否则非工作台路由或全局浮层使用 Tooltip 会运行时报错。
- [主题链路] Tailwind 语义主题类必须在构建期通过 theme contract 暴露，运行时只负责注入真实 CSS 变量
- [边框治理] Tailwind 裸 `border-*` 在未显式指定颜色时会回退到 `currentColor`，在 ridge 主题中必须改用语义化 surface 分层，不能依赖细线分隔
- [主题边界] `style.css` 是唯一的 Tailwind 构建期基础入口；主题文件（如 `ridge.css`、`default.css`）只能保存运行时 token，禁止再塞 `@import "tailwindcss"`、`@custom-variant`、`@layer base` 这类构建期指令
- [surface 语义] `ridge-panel-header` 只给头部/标题栏表面，不能复用到底部输入区；底部 composer 属于对话主背景，错用 header surface 会造成中间区与底板背景分裂
- [透明度] 用 `/95`、`/80`、`/20` 后缀，不用 `bg-white/[0.x]` 语法
- [双Agent检查] 检查阶段两个 agent 必须互不可见结果，避免自查盲区
- [P0修复] 审查发现的严重问题（安全/命名冲突）必须立即修复，不拖到下次迭代
- [状态矩阵同步] 文档状态矩阵必须与代码真源同步；巡查发现脱节时立即修正，不能持续用 `-` 掩盖已实现代码
- [废弃字段清理] 废弃字段（如 `session_index.readonly`、`automations`、`automation_runs`）应立即从 schema/migration/bootstrap/test 全链路移除；项目无用户时不需要兼容/迁移旧数据

## 功能实现经验

- [长路径展示] 弹窗里的路径、命令等长字符串不能和主操作按钮挤在同一行；应独立成可换行信息块，否则会在 dialog/grid 容器里撑坏最小宽度并裁剪操作区
- [首页大屏布局] 工作空间首页不能把核心内容锁在窄 `max-w-lg/2xl` 且居中堆叠；AI 输入框可独占上半屏居中并保留上方留白，信息卡下移；模型/Agent/思考级别应作为 composer 工具栏默认可见。
- [根高度链] 工作空间这种满屏应用根容器不要只用 `h-full` 依赖父级高度；页面根应使用视口高度（如 `h-screen`），同时 `html/body/#app` 保持 `height: 100%`。
- [主题持久化] 主题名和明暗模式都必须进入服务端 settings 模型，不能只放 composable 临时状态
- [拖放实现] 原生 HTML5 Drag and Drop API 足够满足简单拖放需求，无需引入第三方库
- [防抖模式] 使用 dragCounter 计数器解决 dragenter/dragleave 闪烁问题
- [数据格式] 拖放数据同时存储 text/plain（路径）和 application/json（完整对象），预留扩展空间
- [消息协议边界] 对话区不要在 server/web 两端自造 `ChatMessage/contentBlocks` 投影协议；一旦后端改写 message/content、前端再二次累积 block，message 边界就会被破坏，折叠层级必然混乱
- [事件命名] Vue defineEmits 中带有冒号的事件名必须用引号包裹（"update:modelValue"）
- [类型校验] 即使 TypeScript 编译通过，也要验证运行时数据字段（如 AgentSummary 实际无 id 字段）
- [共享列表状态] 同一份项目列表如果会被侧栏、空态、弹窗同时消费，composable 必须提升为模块级共享状态并做请求去重，否则不同区域会出现数据不同步
- [任务store共享] useWorkspaceTasks 必须通过 provide/inject 在 WorkspacePage 层级共享，不能让 DashboardView 和 TaskView 各自实例化；WorkspacePage 自身要直接复用 provideWorkspaceTasks 返回值，不能在同一 setup 内靠 inject 读回自己刚 provide 的值
- [任务系统基准] 任务系统以 `任务系统PRD-v0.1.md` 为准，旧 `.ridge/tasks.json` 和 checkbox 聚合属于废弃原型；新实现必须走 `~/.pi/ridge.db` 的任务/里程碑表，不迁移旧 JSON 数据
- [乐观更新] 任务 toggle/create/delete 应先本地更新状态、失败再回滚，避免每次操作后 await load() 全量重新加载的延迟感
- [规划工具权限] 多个工具应共享同一个逻辑权限键（如 7 个规划工具全部映射到 `task`），而不是每个工具一个键。`compileAgentPermission` 移除工具时不能只按 `normalizeString === permissionKey`，要单独遍历 `PLANNING_TOOL_NAMES`，否则 deny 不会生效。`extractPermissionSubject` 和 `derivePermissionPattern` 对规划工具返回工具名本身，让 `task: ask` 的 permission request 能精确归类到 `task`。子代理 `task` 工具与规划工具共享同一个逻辑权限键，这是设计意图。
- [Checkbox ID] checkbox 任务 ID 不能含数组下标（顺序变化会致 key 失效），只能用 (sourcePath, lineNumber) 组合
- [Checkbox toggle] 文件行号定位 toggle 必须带 expectedText 校验，防止文件被编辑后行号偏移改错行
- [草稿标签] 多标签工作台不能把“打开标签”和“创建服务端 session”合并；新建会话必须先落在前端草稿标签，cwd 继承链至少保持 payload -> 当前活动标签 -> workspaceDir
- [Composable契约] 组合层 composable 如果只依赖少数字段，就声明最小状态接口；不要把整个 composable ReturnType 暴露给调用方，更不要用 Ref<object> 去伪装对象属性是 Ref 的契约
- [会话真源] 工作台会话显示状态只能有一个真源；组件 props、tab 状态、聊天实例三处同时持有会话身份时，草稿转正式会话一定会失真
- [目标到会话] Phase 1 目标入口只在 DashboardView；Goal 复用 Task，可选 `kind/sessionId/source` 关联 Pi session，旧 task 无需迁移；session 失效只能提示，不能静默新建覆盖。
- [笔记可靠性] markdown 编辑器保存失败必须保留当前输入并给出可见重试；关闭 `unsaved/saving/error` 文件标签先阻止并提示，不能静默丢内容。
- [LRU 生命周期] LRU 池模型下，SSE 是否保持连接取决于“会话是否还在池里”，不能再取决于“当前是否可见”
- [LRU布局] 草稿会话和正式会话池必须共享同一个会话舞台；隐藏实例只能在舞台内 `v-show`，外层不能作为多个 `flex-1` 兄弟节点参与布局
- [草稿语义] 如果产品要求“新建草稿独立存在、切换即丢失”，就必须在创建草稿时主动清空 `null draft`，否则旧草稿会通过共享状态偷偷恢复

- [ask 交互] 阻塞式 ask 要拆成两条线：pending 阶段走 `interactiveRequests` 底部表单，历史阶段回到普通工具消息；两者不能混成一种投影
- [permission 审批] 运行时权限审批不是 ask 工具，也不是新工具消息；它是 tool_call 前拦截层。pending 走独立 `permissionRequests` 卡片，历史不单独落 UI，避免把审批语义伪装成工具协议
- [server 类型补洞] 当 workspace 没有完整第三方类型包时，可在 `packages/server/src/types/` 放最小 shim 保住 server `tsc --noEmit`，但 shim 只补边界，不扩散到业务层
- [server 路由类型] 拆分 Express 路由时，Deps 接口不能用 `unknown` 接收真实服务函数；要导入领域类型、schema 输出类型和服务 ReturnType，否则 strictFunctionTypes 会让注入点和路由内部同时失去类型检查。
- [侧边栏临时隐藏] 隐藏一级导航入口时优先改 `workbenchPrimaryNavItems`，保留真实路由和页面文件，除非明确要求删除能力
- [消息桥接] Web 想做真实工具回放，server 绝不能把 Pi `toolResult` 压扁成只剩 `role/content/timestamp`；`toolCallId/toolName/details/isError` 缺一个，关联、摘要、专属渲染都会废
- [会话流桥接] 恢复会话能显示但发送后消息不刷新，优先检查 server 是否真正绑定了 `AgentSession.subscribe()`；如果 SSE 只发 `status` 不发 runtime message 事件，前端恢复链路会正常，发送链路一定失效
- [乐观消息去重] Pi SDK 会给 user message 也发 `message_start/message_end`，Web 端已有乐观用户消息时，server SSE 桥接必须过滤这两类 user 事件，否则每次发送都会重复一条 user 消息
- [Git能力探测] Git 面板显隐不能靠 `getGitStatus()` 报错倒推；要单独提供轻量 `isGitRepository` 探测链路，把“能力判断”和“状态读取”拆开
- [消息可见性] 多轮会话的历史折叠必须是显式 UI 状态，不能把“最后一轮切片显示”藏在渲染默认值里；否则用户继续输入会误以为旧消息被删，但底层 session/jsonl 其实完整
- [历史分页] 会话历史分页单位必须是 user 轮次，不是消息条数；工具消息/thinking/toolResult 会放大消息数，若按条数截窗，UI 与用户心智必然错位
- [导航去重] 会话侧栏不要再维护“最近访问”这类二次导航；标签页已承担最近工作集语义，侧栏应只保留稳定信息架构（项目/搜索），否则状态重复、localStorage 重复、认知也重复
- [搜索入口] 左侧"搜索"只负责进入独立搜索页；真实搜索输入与结果必须放主内容区，侧栏搜索框只是本地过滤器（两者全存在会造成职责混淆，侧栏过滤器应删除统一入口）
- [术语边界] 用户可见文案不要把会话列表记录说成“会话摘要”；内部类型可以存在，但产品语义只能说“会话/会话列表数据”
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
- [工作空间唯一主界面] 工作空间（`/`）已成为唯一根路由和主界面。旧的 `chat/terminal/automations/settings/search/spaces/datasets` 独立页面路由已全部删除，终端/自动化/设置改为工作空间标签页打开。旧的 `useWorkbenchPrimaryNavigation` composable 和 `WorkbenchSidebar` 侧边栏已删除，旧聊天/项目入口已从导航中移除。顶部系统菜单行承载终端/自动化/设置等入口。AI 会话后续从工作空间主页标签启动。
- [UI消息包装边界] `pending/localId` 这类前端乐观态字段只能放在 `UiConversationMessage` 包装层；协议层 `PiMessage/SessionSnapshot` 必须保持 Pi 原始结构，不能再回退到自造 `ChatMessage/contentBlocks`
- [索引字段最小化] 会话目录索引只保留有明确消费方的字段；没有 UI 或接口消费的 `last_message_preview`、`message_count` 这类字段应直接删除，不能先入库再等以后再说
- [SSE 零写库] 发送消息前和 `turn_end` 都不能顺手写 SQLite；SSE 链路只负责内存态和 session 文件，目录索引由启动重建和显式用户动作维护
- [运行时态不入目录索引] 列表 `status` 这类运行时字段只允许由内存 active session 覆盖，不应作为数据库持久化列存在
- [闪念路由边界] 闪念路由必须在主 app 中以真实 DB 和 workspaceDir 挂载；隐式建表必须收敛到版本化迁移，避免测试通过但生产 404。
- [自动化初始化] `automationStore` 不能先捕获 null 再注入；用 lazy getter（`getAutomationStore()`）保证首次调用时已初始化，避免 503。
- [文件创建安全] `/api/files/create` 必须先做 lexical + realpath + `.ridge` 边界校验再 `mkdir`；复用 `file-manager.ts` 的 `ensureWithinRoot` / `assertNotRidgeSystemPath`，禁止路由层自行 `path.resolve` + `fs.mkdir`。
- [归档只读真源] 归档后发送消息必须在 `POST /api/sessions/:id/messages` 层拦截（403），不能只隐藏列表；`session_index.readonly` 若未业务消费应在文档中明确标注未落地。
- [附件失败回滚] 首页附件上传失败时，必须调用 `deleteSession` 清理刚创建的会话，避免无首条消息的孤儿会话。
- [密码配置化] 生产环境必须读取 `RIDGE_ADMIN_PASSWORD`；非 production/test 允许默认 `ridge-admin`；缺少密码时应明确拒绝启动。
- [DB migration 原子性] 新列不能同时在 migration SQL 和 repair columns 中 `ALTER TABLE ADD`，否则旧库会 duplicate column；应只在 bootstrap/migration 建表时带全列，repair columns 负责补缺失列，顺序是：bookkeeping → repair → apply migrations → repair again → version write。
- [项目绑定] 任务/里程碑的 `project_id` 通过 migration 版本 7 引入；repair columns 自动补旧表列；创建任务时未传 projectId 应继承里程碑 projectId。
- [前端类型同步] 新增 DB 列后，前端 `WorkspaceTask` / `WorkspaceMilestone` 接口必须同步更新，否则 `vue-tsc` 会在测试和组件中报 missing property。
- [前端类型收敛] 当后端 enum（如 priority `normal/important/urgent`）与前端遗留类型（含 `low/medium/high`）不一致时，必须同步清理前端类型声明和所有引用该类型的测试/组件/composable；只改后端 schema 不改前端类型会在运行时/类型检查时留下隐患。
- [原生依赖安装契约] 仓库使用 `pnpm 10` 时，`better-sqlite3`、`node-pty` 这类原生包不能只写进 dependencies；必须在根 `package.json` 的 `pnpm.onlyBuiltDependencies` 中显式放行，否则 install 后会出现“包存在但 `.node` 绑定缺失”，server 在运行原生模块时直接失败
- [包管理器一致性] 既然仓库已经锁定 `pnpm` 并依赖 `pnpm.onlyBuiltDependencies` 管原生包，README/开发文档里的安装命令也必须统一写成 `pnpm install`；继续写 `npm install` 会把“依赖声明正确但本地缺包/缺绑定”的问题伪装成代码故障。
- [Vitest DB隔离] server 测试隔离目录不能用 `process.pid + Date.now()` 拼接；同 fork/同毫秒会碰撞并引发 SQLite `database is locked`。必须用 `mkdtempSync` 创建唯一 HOME/DB，并在 `resetRidgeDb()` 里关闭旧连接后再清空单例。
- [终端重启竞态] PTY restart 不能让旧进程的 `onData/onExit` 继续写回共享 record；事件处理必须校验“当前活跃 PTY 实例”，否则旧进程退出会把新终端覆盖成 exited
- [终端开发代理] 终端页面如果只有光标、没有 prompt 和输入回显，优先检查 WebSocket 是否真的附着到 PTY；Vite `/api` 代理必须显式 `ws: true`，否则 REST 正常但 `/api/terminals/:id/stream` 不通
- [终端视口承载] `@wterm/dom` 会把 `.wterm` 类加到传入的 host 元素本身；不要让该元素依赖 Tailwind `absolute` 定位撑满高度，因为库样式会设置 `position: relative`
- [文件预览边界] 文件预览 root 校验必须同时覆盖 lexical path、realpath 和 session indexer allowedRoots；只做字符串前缀判断会被 symlink root 绕过
- [HTML 预览隔离] HTML 文件预览不能只靠 iframe sandbox；还必须补 CSP 和禁点击交互，否则仍会保留外链跳转与资源访问面
- [Markdown 预览安全] Markdown 渲染不能只禁 link/image trust；raw HTML 也必须改成文本输出，否则会绕过默认渲染链直接进入页面
- [文件页复用边界] 一级文件页要复用 `useWorkbenchFilePreview` 与 `/api/files/*` 契约；只通过可配置 UI 关闭会话专属动作，不能另起一套预览/保存链路
- [自动化边界] 自动化首版就是“定时创建普通会话并发送消息”；不要把它做成任务中心、运行记录中心、工作流编排器或审批中心，结果入口天然是普通会话列表
- [子代理上下文] task 子代理继承上下文时必须写入 child `SessionManager` 的真实消息历史；不要再把父会话压成 system prompt 文本块，否则 toolResult/assistant 结构会丢失，resume 与真实回放也会错位
- [笔记页边界] Obsidian 感的首要来源是 vault 侧栏、编辑外壳和 Milkdown 局部主题分层；不要为了视觉相似把双链/标签/图谱混入基础笔记 API。
- [文件管理写边界] 文件页新建、移动、上传、删除必须复用服务端统一 root/realpath 校验；删除走系统回收区也必须先校验工作区边界，不能直接把用户传入路径交给 trash。
- [标签页 HTML 嵌套] 标签栏外层如果是 button，内层关闭按钮不能再用 button；改用 div + cursor-pointer 替代外层交互容器
- [自动保存 debounce] 自动保存用 2s setTimeout debounce，切换/关闭标签时 flushAutoSave 清除定时器并立即保存；保存失败保持 dirty 标记
- [笔记页边界] 笔记 API 的 rename/delete 独立新增路由（PATCH /api/notes/rename, DELETE /api/notes），不复用通用文件管理 /api/files/entries 边界
- [Tauri弹窗禁用] 浏览器原生 `prompt()/confirm()/alert()` 在 Tauri Webview 中不可用或行为不可靠；所有用户输入和确认必须用 Vue 组件化对话框（如 shadcn Dialog），文件管理页已有 `FileEntryDialog` 可复用
- [统一组件优先] 工作空间和会话页的重复功能必须统一为 `components/common/` 下的通用组件；`TabBar` 统一标签栏（替代 NoteTabBar），`FileTreePanel` + `useFileTreeData` 统一文件树渲染和数据逻辑（替代 WorkspaceFileTree 内联实现）。NoteVaultSidebar 因笔记专属交互（搜索/筛选/CRUD）保持独立
- [工作空间替代笔记] `/notes` 已被 `/workspace` 完全替代，NotePage+NoteVault+NoteTabContent+NoteStatusBar+NoteNameDialog+NoteTabBar 全部删除。Milkdown 编辑器保留移至 `components/workspace/`
- [工作空间标签页模型] 视图标签页（仪表盘/待办/日历/收件箱）和文件标签页(.md/.canvas/.base/其他)合并到一个 TabBar；activeId 统一管理切换
- [文件内容分发] WorkspaceContentArea 根据 tab.previewKind 分发：markdown→WorkspaceMarkdownEditor, unsupported→OpenWithDefaultApp, 其他→WorkbenchReadonlyFilePreview
- [编辑器保存状态] WorkspaceMarkdownEditor 自管 saveStatus，通过 @update:save-status 事件上报到 WorkspacePage 的 saveStatusMap，TabBar 的 tabBarItems computed 读取 map 值反映圆点状态
- [路径规范] 工作空间内部统一用绝对路径（workspaceDir 为前缀），只在调后端 API 时转为相对路径（strip workspaceDir 前缀）。CalendarView/DashboardView emit 的 open-file 路径必须也是绝对路径
- [createNote 必须支持路径] 后端 createNote API 必须增强支持指定子目录路径，否则日记（日记/YYYY/MM/）、闪念（收件箱/）都无法正确创建
- [闪念队列边界] 闪念 PRD 语义是 DB 临时队列，不是 `收件箱/*.md` 文件列表；处理成功即删除原闪念，日记/剪藏必须由目标系统确认成功后再清队列，任务未接入时只能提示且保留闪念
- [闪念刷新链路] 全局闪念入口保存后必须广播前端事件或走实时通道通知收件箱 store；否则 DB 已写入但当前页面 badge/list 不会更新。后台分析建议完成前 store 需要轮询或 SSE 刷新。
- [checkbox 回写] checkbox 来源的待办任务切换完成状态不能只更新 DB；必须回写 .md 文件对应行的 `- [ ]` ↔ `- [x]`，否则刷新后状态丢失
- [首页选择器异步默认值] 首页这类长驻标签页不要只在 setup 时拷贝异步 props；模型/Agent/thinking 默认值从 core/settings 异步到达后，需要在“不覆盖用户有效选择”的前提下同步本地选择状态
- [反思先行] 每个里程碑完成后必须做功能反思，确认每个子功能真的可端到端跑通，而非"调 API 了就当完成"。见 `文档/功能开发/2026-04-28_工作空间功能反思.md`

## 2026-05-13 任务 39 内部项目/外部仓库语义改造

### 改造要点

- **协议层**：`ProjectItem.source` → `ProjectItem.externalOrigin` (`'github' | 'folder' | null`)；`ProjectItem.projectType` 扩展为 `'internal' | 'external' | 'workspace'`。
- **后端 DB**：`projects.source` → `external_origin` (TEXT, nullable)；新增 migration v11；`createWorkspaceChatProject` 改为 `projectType: 'workspace'`、`externalOrigin: null`。
- **后端防线**：`POST /api/sessions` 在 `ensureManagedProjectScope` 之前增加内部项目路径直接拦截（400）；`buildManagedProjectScopes` 过滤 `projectType !== 'internal'`，确保内部项目不在 managed scope 内。
- **前端**：`SessionProjectView.origin` → `externalOrigin`；侧边栏标签改为「工作空间/外部仓库/项目」；`handleOpenProjectHome` 对内部项目使用 `workspaceDir` 作为 cwd。
- **任务处理会话**：`workspace-tasks.ts` 绑定内部项目时保持 `cwd = defaultWorkspaceDir`，绑定外部仓库时 `cwd = project.path`。
- **旧值迁移**：`externalOrigin` 映射增加防御性 cast，非法旧值（如 `'internal'`）映射为 `null`。
- **测试覆盖**：新增 `workspace-projects-scope.test.ts` 5 项测试（内部项目被拒、外部仓库允许、任务绑定内部项目、任务绑定外部仓库、旧值映射）；`vitest.config.ts` `testTimeout` 提升到 10000ms。

### 关键经验

- **重命名列迁移**：SQLite `ALTER TABLE RENAME COLUMN` 不能在有缺列修复的旧库上直接执行；必须在 `runPreBootstrapMigrations` 中先检测旧列名存在性并改名，migration SQL 只做 no-op bookkeeping。
- **类型全链路同步**：协议类型改名后，后端 DB 映射、存储层读写、API 序列化、前端 sidebar/composable/页面文案/测试数据必须全部同步。
- **projectType 语义扩展**：`workspace` 类型专门标记虚拟工作空间项目，`internal`（组织对象，不作为 pi cwd）和 `external`（外部仓库，可作为 pi cwd）形成清晰语义边界。
- **运行模型防线需双重**：仅靠 `buildManagedProjectScopes` 过滤不够（测试中发现 scope cache 可能未失效），`POST /api/sessions` 入口必须显式检查内部项目路径并返回明确错误。
- **旧值清理要彻底**：DB rename + update 后，前端/后端/协议类型所有 cast 必须防御性处理，非法旧值统一映射为 `null`。
- **测试超时策略**：涉及 `createSessionRecord` 真实调用的测试因模型初始化慢，单独运行通过但并行超时；提升 `testTimeout` 到 10s 是稳定方案，不是掩盖问题。

### 测试覆盖

- 后端 `ridge-db-migration.test.ts`：列改名后 bootstrap 和 repair 均含 `external_origin`。
- 后端 `workspace-projects-scope.test.ts` 5 项：内部项目被拒、外部仓库允许、任务绑定内部项目、任务绑定外部仓库、旧值映射。
- 后端全部 296 项测试通过（含 `session-indexer.test.ts` 2 项新增）。
   - 前端全部 253 项测试通过。
   - `npm run check`（lint + typecheck）通过，19 warnings 均为历史 `any`。
   - **最终验证**：`WorkspacePage.test.ts` 最后一处 `source: "server-folder"` 已替换为 `externalOrigin: "folder"`，`npm run check` 确认无新增错误。

### 审查后修复（round 3）

- **测试拆分与强断言**：
  - `workspace-projects-scope.test.ts` 拆为两个 describe 块：400 拦截走真实 app（无需真实模型），任务处理会话 cwd 断言走 mock router（强断言 `createSessionRecord` 被传入 `{ cwd: WORKSPACE }` 或 `{ cwd: repoDir }`）。
  - 移除所有 `if (status === 500)` 弱断言；外部仓库会话断言 `201 && cwd === repoDir`。
- **Vitest 配置**：`poolOptions` → 顶层 `execArgv`（Vitest 4 废弃 `poolOptions`）。
- **session-indexer 单测**：新增 `session-indexer.test.ts` 验证内部项目路径 fallback 到 workspace-chat scope、外部仓库有自己的 scope。
- **文档同步**：`项目创建注册与归档删除.md`、`项目管理与会话任务.md`、`开发计划与里程碑.md` 统一替换"外部项目"→"外部仓库"、"服务器文件夹"→"外部仓库（服务器文件夹）"；`工作台Shell与标签系统.md` 明确内部项目/外部仓库 cwd 区别。

### 审查后修复（round 4）

- **测试稳定性根治（auth 401 + 全局状态污染）**：
  - 根因：Vitest `pool: "forks"` 默认多 worker 并行，全局 `authRuntime` 单例被跨进程 reset；`workspace-tasks.test.ts` 等用 `api = request.agent(app)` 复用同一 agent 导致 cookie 失效；`fleeting-api.test.ts` 等使用独立 express app 但共享全局 `getRidgeDb()` 单例和文件系统状态。
  - 修复三层：
    1. `vitest.config.ts` 启用 `maxWorkers: 1`、`minWorkers: 1`、`fileParallelism: false`，强制所有测试文件在单一 fork 进程内顺序执行，彻底消除跨 worker 全局状态竞争。
    2. `vitest-setup.ts` 移除 `authRuntime.resetForTests()` 调用（避免跨文件竞争）。
    3. 每个测试文件在独立进程中运行（`run-isolated.mjs`），彻底隔离全局状态。
- **真正 session-indexer 覆盖**：重写 `session-indexer.test.ts`，mock `SessionManager.listAll` 并通过 `refreshSessionCatalog` + `listIndexedSessionContexts()` 断言：内部项目不产生独立 context、外部仓库产生 projectId 匹配 context。
- **MEMORY 数字修正**：按实际全量结果更新（server 296 / web 253）。
- **文档残留旧语义**：
  - `30-项目注册与内部外部项目.md`：顶部加历史归档声明，标注旧术语体系；内文"服务器文件夹"→"外部仓库（服务器文件夹）"。
  - `全局搜索.md`："外部项目"→"外部仓库"（3 处）。
- **task 39 归档修正**：去掉"全量通过"过早断言，改为分轮修复记录，最终按实际复跑结果记录。

### 当前测试状态

- 后端：`npx vitest run` 296 passed（含 `session-indexer.test.ts` 2 项新增）。
- 前端：`pnpm test` 253 passed。
- `npm run check`：通过，0 errors，19 warnings 为历史 `any`。

---

### 实现要点

- **内置任务 Agent**：`default-agents.ts` 新增 `task-agent`（mode: 'task', enabled: true），供任务处理会话强制选择。
- **任务处理会话 API**：`POST /api/workspace/tasks/:taskId/processing-session` 创建/返回已有会话；`GET` 查询。
- **一任务一会话**：`workspace_tasks.processing_session_id` 通过 `setTaskProcessingSessionId` 内部写入；普通 PATCH 已移除该字段，禁止直接修改。
- **项目绑定逻辑**：有 projectId 时查找项目 → 找不到 404；有 deviceId 且 isOnline=false → 409；无 deviceId 的本地项目允许运行（isOnline 不阻断）。
- **未绑定项目**：cwd = defaultWorkspaceDir。
- **强制 Agent**：会话创建后强制调用 `applySessionAgentSelection(record, { agentName: 'task-agent' })`。
- **禁止分叉**：`POST /api/sessions` 带 parentSessionId 时，先查 workspace_tasks 看是否属于任务处理会话，若是则 409。
- **前端**：TaskView 详情增加「开始处理/继续处理」按钮，调用 `openProcessingSession` → 成功后 `emit('openSession', sessionId)` → WorkspacePage 监听打开会话标签。

### 测试覆盖

- 后端 `workspace-tasks.test.ts` / `workspace-tasks-api.test.ts`：重复创建只返回同一会话、离线设备项目 409、本地无 deviceId 项目允许运行、强制选择 task-agent、禁止分叉任务处理会话、允许分叉普通会话。
- 前端 `TaskView.test.ts`：点击处理会话按钮 emit openSession、已有 session 显示继续处理、失败不 emit。
- 前端 `useWorkspaceTasks.test.ts`：openProcessingSession 成功更新本地 processingSessionId、失败不更新且 toast 报错。

### 教训

- **会话创建需要完整依赖注入**：`createWorkspaceTasksRouter` 不能直接 import `createSessionRecord`（会产生循环依赖和 Pi SDK 初始化时序问题），必须通过 `deps` 参数注入。
- **禁止直接 PATCH 更新 processingSessionId**：updateTaskSchema 中移除该字段，内部提供 `setTaskProcessingSessionId` 专用函数，否则任意客户端 PATCH 即可破坏一任务一会话边界。
- **分叉守卫要在 parentSession 查找前执行**：如果先查 `getIndexedSessionLookupOrThrow`，fake sessionId 不存在时会先 404，守卫逻辑就失效了。
- **mock 类型安全**：前端测试 mock `openProcessingSession` 返回值需加 `as Promise<Record<string, unknown>>`，否则 TypeScript 在 `mockImplementationOnce` 中改返回 `{ success: false, error: '...' }` 会报缺少 sessionId/created 字段。
- **先写测试再实现**：测试先定义了「重复创建只返回同一会话」「离线项目 409」「本地项目允许」等边界，代码实现时自然按这些验收标准编写。

## 2026-05-11 任务 09 任务列表详情与状态流转

### 实现要点

- 服务端：状态流转校验 `assertStatusAllowed` 已覆盖任务和里程碑；Agent 不能完成；系统里程碑不能完成。
- 前端 `TaskView`：看板/列表/日历/里程碑四视图均可打开详情；详情可编辑标题、完成标准、优先级、状态、里程碑、项目、截止日期、阻塞原因；删除走确认弹窗。
- 看板拖拽只允许合法状态流转，非法拖拽不调用更新；拖拽时写入 `sortOrder`。
- 项目筛选 UI 包含全部/无项目/具体项目，联动 `projectFilter` 触发重新加载。
- 新任务默认 `projectId: undefined` 让后端继承里程碑；用户可选 `null` 无项目或具体项目覆盖。

### 关键修复

- **详情状态同步**：`saveSelectedTask` 和 `saveSelectedMilestone` 成功后必须将 `selectedTask`/`selectedMilestone` 替换为后端返回结果，否则用户保存 reviewing→completed 后详情状态仍停留在 reviewing，无法继续操作。
- **错误不吞并返回结果**：`useWorkspaceTasks.ts` 中 `addTask/addMilestone/updateTask/updateMilestone/removeTask/removeMilestone` 全部改为返回 `{ success, task?/milestone?/error }`，调用方可判断成功/失败；失败时 toast 报错并回滚本地状态。
- **失败不清空表单**：`handleAddTask` 和 `handleAddMilestone` 仅在 `result.success` 时清空表单字段，避免用户因网络/API 错误丢失已填写内容。

### 测试覆盖

- 后端 `workspace-tasks.test.ts` 新增：里程碑完成流转、更新里程碑后任务继承、阻塞原因/截止日期/排序字段完整、删除仍有任务的里程碑 409。
- 前端 `TaskView.test.ts` 新增：非法拖拽不调用更新、成功创建清空表单、列表/日历/里程碑视图可打开详情。
- 前端 `useWorkspaceTasks.test.ts` 新增：updateTask 成功更新本地并返回结果、失败回滚、addTask 失败返回错误、removeTask 失败恢复列表。

### 教训

- **composable 不能吞错误**：返回 void 会让调用方完全无法判断操作是否成功，导致表单清空、状态同步等边界全部失控。必须返回显式结果对象。
- **详情状态要有单一真源**：`selectedTask` 不能只靠打开时复制一次字段；保存后必须替换为后端返回的完整对象，否则后续操作会基于旧状态判断。
- **mock 状态突变需谨慎**：vitest 中 `vi.mock` 是模块级缓存，`mockImplementationOnce` 在多测试文件并行时行为不可靠；应优先用 `mockImplementation` + `beforeEach` 重置，或在单个测试内通过模块重新 mock 隔离。
- **先写测试再改代码**：补测试时发现 `saveSelectedTask` 未同步返回结果、composable 吞错误等问题，比上线后用户反馈更早暴露。

### 成功点

- 根因是 session-payload.ts 的 fileManager 在模块加载时创建（deps 未初始化）+ session-context.ts 缺失 5 个 import，导致运行时 ReferenceError
- 使用懒初始化函数 getFileManager() 模式解决模块级常量依赖注入时序问题
- deps 回调注入方式解决循环依赖（session-context ↔ session-payload）
- shadcn-vue ContextMenu/AlertDialog 已在 InboxView 中有参考实现，复用到 FileTreePanel 很顺畅
- 文件类型图标提取为公共 composable，FileTreePanel 和 DashboardView 共用

### 改进点

- esbuild/tsx 不做类型检查，模块拆分时遗漏 import 只在运行时暴露，应增加 tsc --noEmit CI 检查
- 后端 API 安全校验不统一（notes.ts 和 file-manager.ts 各自实现 ensureWithinRoot），应统一
- fileManager 懒初始化模式应考虑重置场景（如 workspaceDir 变化时）

### 阻塞点

- core.ts 使用 fs.stat/path.resolve 但未 import（与 session-context 同源问题：从 index.ts 拆出时未携带 import）
- index.ts 大量预存未使用 import，eslint 报错但属于历史代码

## 2026-05-11 任务 05 工作空间主页与会话创建

### 实现要点

- 主页初始不绑定 Pi 会话；提交后才调用 `createSessionApi`。
- 提交非空文本才创建会话，payload 包含 cwd、首句标题、model、agent(null when NO_AGENT_VALUE)、thinkingLevel。
- 创建成功后原地 replaceTab(home → chat)，并携带 initialPrompt / initialModel / initialAgent / initialThinkingLevel。
- 成功后立即 `core.refreshSessions()` + `core.refreshSessionContexts()`，使左侧工作空间会话列表出现新会话并保持当前 tab 选中。
- 失败时不 replaceTab，主页输入保留，发送按钮恢复可用，toast.error 显示错误。
- 临时模型/思考强度/Agent 只更新当前 composer 和会话元数据，不写回 `useSettingsStore` 全局默认；`usePerSessionChat` 的 setter 已删除 `settingsStore.setDefaultModel/Agent/ThinkingLevel` 调用。
- 快捷动作（处理闪念、规划任务、总结最近文件）点击只填入输入框，不直接发送。
- 附件入口第一版提供真实文件选择，显示“待随首条消息附加”的 UI 状态；暂不调用上传 API（后端消息协议待支持）。
- `HomePage` 内部提交后不再立即清空 `draftText`，失败保留输入；发送中通过 `isSending` 禁用按钮。

### 阻塞修复：失败时发送按钮恢复可用

- 原实现 `HomePage.vue` 使用内部 `isSending` ref，在 `handleSubmit()` 后置 true，但父级 `WorkspacePage.handleHomeSubmit()` 失败时没有任何机制把 `isSending` 重置。
- 修复方案：
  - `HomePage` 改为接收 prop `isSending?: boolean`，内部不再维护不可恢复的 ref；按钮禁用和提交拦截全部基于 prop。
  - `WorkspacePage` 维护 `homeSubmittingTabIds: Set<string>` ref，传给对应 HomePage `isSending` prop。
  - `handleHomeSubmit` 在 finally 块中从 Set 移除 tabId；失败时 HomePage 自动恢复可发送。
- 测试覆盖：
  - HomePage：`isSending=true` 禁用按钮，`isSending=false` 恢复可用，submit 不立即清空 draft。
  - WorkspacePage：失败后 `mockReplaceTab` 未被调用，再次提交可成功创建会话。

### 测试覆盖

- HomePage：快捷动作只填入不提交；附件入口选择文件后显示待附加文件；提交 payload 完整；发送中时禁用；不因 submit 立即清空 draft。
- WorkspacePage：打开主页不 createSession；submit 成功 payload 正确、refreshSessions/Contexts 被调用、replaceTab 参数含 initialThinkingLevel；失败不 replaceTab 且 HomePage 保留输入/错误提示；NO_AGENT_VALUE 转 null。
- usePerSessionChat：临时 setter 不调用 settingsStore 全局默认。

### 教训

- 先写测试确认失败再实现代码，能在需求边界处提前发现遗漏（如 `initialThinkingLevel` 未透传、NO_AGENT_VALUE 被当成真实 agent 导致 send 失败）。
- `usePerSessionChat` 的 setter 写回全局默认是之前遗留的副作用；本任务范围内明确删除，避免“临时选择污染全局设置”。
- HomePage 的 `draftText` 在 submit 后不能立即清空，因为 handleHomeSubmit 是 async，失败时用户需要看到原文。
- **父组件异步操作失败时必须提供可靠的状态复位机制**：HomePage 内部 `isSending` ref 在失败场景下会变成死锁（永远 true），导致按钮永久禁用。推荐把发送中状态提升为父组件维护的 `tabId → boolean` 映射，并通过 props 下发；父组件在 finally 中清除，保证无论成功/失败都能复位。
- 文件附件在测试里要用 `Object.defineProperty(inputEl, "files", { value: [file] })` 才能让 change 事件拿到 files，直接 trigger 传参会被忽略。

## 2026-05-12 任务 14 桌面采集入口

### 实现要点

- **Tauri 桥接模式**：前端通过 `isTauri()` 运行时检测区分桌面/Web 环境；桌面端直接调用 Tauri `invoke`，Web 端回退到浏览器 API。
- **浏览器网址采集**：System Events 检测前台应用 → AppleScript 针对性查询浏览器 → base64 编码各字段 → tab 分隔 → Rust 解码。完全无损传输（支持逗号、tab、换行）。
- **选区采集**：sentinel 标记模式（`pbcopy` 写入唯一标记 → `Cmd+C` → `pbpaste` 读取 → 若仍是标记则判定无选区）。比"比较新旧剪贴板"更可靠（不会因旧剪贴板恰好等于选区而误判）。
- **剪贴板采集**：`pbpaste` 替代 AppleScript `get the clipboard`，更干净无 stderr 污染。
- **截图**：`screencapture -i -s -x -o`（区域）、`-i -w`（窗口）、`-x -o`（全屏）。返回 `Vec<u8>` 直接传前端，不落地持久化。
- **前端无回退**：Tauri 下失败时 toast 明确错误，不会偷偷回退到 webview 数据（如 `window.location.href`）。

### 关键修复

- **base64 编码协议**：最初用 `, ` 分隔 AppleScript 输出，网页标题含逗号会被拆坏；后改为 tab 分隔，但 title 含 tab 仍有问题；最终每个字段单独 base64 后用 tab 分隔，实现完全无损。
- **metadata 保存**：最初 `document.title` 保存的是 ridge webview 标题而非浏览器页面标题；修复后通过 `nativeTitle` / `nativeSelectedText` ref 保存 AppleScript 返回的真实数据。
- **剪贴板恢复验证**：选区采集恢复旧剪贴板后再次读取验证，失败时向用户报告警告（不静默忽略）。
- **screencapture 参数**：最初误用 `-f` 标志（格式参数），实际应为路径直接作为末位参数。

### 测试覆盖

- Rust：`parse_browser_url_output`（含逗号/tab/空值/缺失 URL）、`shell_escape`（单引号/多引号）、`generate_sentinel`（唯一性）、`screencapture_binary_exists_and_runnable`（真实执行截图验证 PNG 魔数）。共 11 项。
- Web：`desktop-bridge.test.ts` 25 项（7 个桥接函数的 Web/Tauri/成功/失败/空值边界）；`FleetingCaptureButton.test.ts` 11 项（含 5 个 Tauri 集成测试，验证 metadata 包含原生 title/selectedText）。

### 教训

- **AppleScript 输出必须用无损协议**：逗号和 tab 分隔都不够，base64 编码是唯一可靠方式。
- **Tauri 下禁止回退到 webview 数据**：`window.location.href`、`window.getSelection()`、`navigator.clipboard` 在桌面端采集时会返回错误对象，必须显式失败。
- **剪贴板操作必须验证恢复**：修改系统剪贴板后必须确认恢复成功，否则用户数据会被破坏。
- **先写测试再实现**：浏览器 URL 解析、sentinel 唯一性、screencapture 真实执行等测试提前定义了验收标准，避免"调通 API 就当完成"。
- **Rust 侧提取纯函数并测**：`parse_browser_url_output`、`shell_escape`、`generate_sentinel` 提取为独立函数后，Rust 测试可覆盖核心逻辑，不依赖 AppleScript 实际执行。

1) **任务系统真源**：当前真源是 `~/.pi/ridge.db` 的 `workspace_tasks` / `workspace_milestones`，不是 `<workspace>/.ridge/ridge.db` 的 `tasks`；旧 2026-05-01 "task #13 任务 SQLite 真源最小实现" 说法已废弃，功能编号 13 现在是闪念临时附件生命周期。
2) **闪念正式处理**：`routes/fleeting.ts` 中 `process/journal` 和 `process/clip` 已实现（写入日记/剪藏并删除闪念）；`process/task` 仅返回 202 且保留闪念；`process/milestone` 与 `process/attachment` 未实现。
3) **闪念临时附件**：`.ridge/fleeting-attachments` 目录模板已在 `workspace-chat.ts` 就位，但附件上传 API、DB 引用字段、清理/迁移逻辑均未闭环；会话附件 `session_attachments` 是另一套独立体系。
4) **任务15 fleeting agent 分析建议**：已实现后台 AI 分析系统。审查发现 6 个阻断问题并全部修复。
   - **问题1（路由时序）**：`createFleetingRouter()` 在 `index.ts` 模块加载时执行，`getAnalysisRunner()` 返回 `undefined` 后被永久缓存为 `undefined`，导致所有 `POST /api/fleeting` 都不会触发分析。**修复**：移除 `const analysisRunner = getAnalysisRunner?.()` 提前解构，改为每次请求时实时调用 `getAnalysisRunner?.()?.run(id)`。
   - **问题2（worker ReferenceError）**：`createFleetingAnalysisWorker` 解构漏了 `modelSpec`，运行时调用 `runAnalysis({..., modelSpec})` 触发 `ReferenceError`。**修复**：恢复 `modelSpec` 解构。
   - **问题3（全局队列污染）**：`claimNext()` 无 `job_type` 过滤，fleeting worker 会抢到 memory/summary/automation 等 job 并直接 `fail`。**修复**：扩展 `claimNext(workerId, jobType?)` SQL 增加 `AND job_type = ?`，worker 调用 `claimNext("fleeting-worker", "fleeting.analyze")`。
   - **问题4（失败状态缺失）**：worker 失败时始终把 note 写回 `unanalyzed`，没有任何路径进入 `failed`；`toPublicNote` 也不返回 `lastError`/`retryCount`。**修复**：根据 `remainingAttempts` 区分 `unanalyzed`（可重试）和 `failed`（最终失败）；`toPublicNote` 新增这两个字段。
   - **问题5（附件时序）**：前端 `handleCapture` 先 `captureNote()`（此时后端触发分析），再 `uploadAttachments()`，导致 AI 分析时附件尚未上传。**修复**：附件上传成功后显式调用 `retryAnalysis(note.id)` 重新入队分析。
   - **问题6（测试未覆盖核心链路）**：测试没有 mock `createAgentSession`，没有验证 `getAnalysisRunner` 延迟获取，没有覆盖 worker 真实执行和失败状态。**修复**：重写测试，mock `@mariozechner/pi-coding-agent` 和 `fleeting-attachments.js`；新增 9 项测试覆盖 worker 成功/失败重试/最终失败/非 fleeting job 隔离/路由延迟获取/列表返回失败字段。
   - 后端：`fleeting-analysis.ts` 包含 runner（入队）和 worker（轮询执行），使用 `background_jobs` 队列，`fleeting.analyze` job type。
   - LLM 调用：通过 `createAgentSession` + `SessionManager.inMemory()` 创建轻量无工具 session，解析 JSON 输出。
   - API：新增 `GET /suggestions`、`GET /:noteId/analysis`、`POST /:noteId/analyze`。
   - 前端：`InboxView` 展示 `failed` 状态错误信息，提供"重新分析"按钮；`useInbox` 提供 `retryAnalysis()`。
   - 防重复：`background_jobs` 的 `UNIQUE INDEX` 保证同一闪念不会同时有多个 pending/running job。
   - 测试：后端 9 项测试覆盖入队、幂等、跳过、worker 成功/失败重试/最终失败/非 fleeting job 隔离、路由延迟获取、列表返回失败字段。

## 2026-05-12 任务 17 文件页与正式附件目录

### 实现要点

- **文件树 API**：`GET /api/workspace/files/tree?path=<dir>` 返回工作空间可见目录；`GET /api/workspace/files/read?path=<file>` 返回文件预览；两者均复用 `fileManager.resolveManagedFileLocation` 做 root/realpath/`.ridge` 边界校验。
- **状态展示**：后端路由查询 `file_processing_status` 表，按 `workspace_path` 匹配后把 `status` 注入 `entries[*].processingStatus`；目录节点无此字段。
- **隐藏 `.ridge`**：文件树不展示 `.ridge` 目录；读取 `.ridge` 内文件会被 `assertNotRidgeSystemPath` 拦截返回 400。
- **前端**：`FilesView.vue` 渲染文件树，文件节点展示 `processingStatus` 状态徽章（Badge 组件，shadcn-vue）。

### 测试覆盖

- 后端 `workspace-files-api.test.ts`：文件树返回带 `processingStatus` 的条目、目录节点无状态、正式附件可读取、临时附件（`.ridge`）读取 400、文件树不包含 `.ridge`。
- 前端 `FilesView.test.ts`：渲染目录和文件、隐藏 `.ridge`、面包屑展示、点击目录导航、点击文件打开预览、状态徽章展示（含附件子目录场景）。
- 前端 `useWorkspaceFiles.test.ts`：`navigateBack` 根边界、父目录导航、`load` 更新 entries/workspaceRoot/currentPath。

### 教训

- **API 签名只做需要的参数**：`getWorkspaceFilesTree`/`getWorkspaceFilesRead` 最初带了误导性的 `root` 参数但请求体并未使用；应删除未使用参数，否则 ESLint 门禁直接失败。
- **Deps 接口最小化**：`createWorkspaceFilesRouter(deps)` 最初包含 `fileContentQuerySchema`（复制自旧文件预览路由），但 workspace-files 路由并未消费；Deps 接口应只声明真实消费项，避免死代码和类型噪声。
- **DB 状态表与 RAG 索引不能混为一谈**：`file_processing_status` 就位只是“状态记录”，不等于“可被引用/可进入 RAG”。归档文档必须明确区分「本任务做了什么」和「后续任务（22-24）才做 RAG 入队/索引/检索」。
- **schema version 必须与代码一致**：文档 `数据库与迁移.md` 写 `7` 但代码已 `10`，且 `file_processing_status`、`fleeting_attachments` 等表未列入核心表清单；模块梳理文档必须随代码同步更新。
- **废弃 composable 立即删除**：`useFilesView.ts` 被 `useWorkspaceFiles.ts` 取代后未删除，会被后续开发者误引用；替换完成后立即清理旧文件。
- **enum 类型不能只靠 TypeScript**：`file_processing_status.status` 在前端协议层定义为 `FileProcessingStatus` 并在后端 DB 增加 `CHECK` 约束，防止非法状态字符串进入系统。路由层做运行时校验再注入响应体。

## 2026-05-12 任务 18 文件处理状态与临时文件边界

### 实现要点

- **状态机 API**：`PATCH /api/workspace/files/status` 更新文件处理状态（`pending | converting | converted | indexed | convert_failed | index_failed`），写入 `file_processing_status` 表，转换/索引失败时自动生成 `notification_events`。
- **状态流转校验**：强制 `pending → converting → converted → indexed`，失败分支只能从执行中状态进入（`converting → convert_failed`、`converted → index_failed`）；`convert_failed`/`index_failed` 只能通过 `POST /retry` 回到 `pending`，`PATCH /status` 对失败状态直接设置 `pending` 返回 400；`indexed` 为终态不接受任何流转；非合法流转返回 400。
- **时间戳保留**：`converted_at` 仅在首次进入 `converted` 时写入且后续保留；`indexed_at` 仅在进入 `indexed` 时写入且保留；已有 timestamp 不会因后续状态更新被覆盖为 `null`。
- **失败必填错误**：`convert_failed` / `index_failed` 必须携带 `error` 字段，否则返回 400；通知事件 body 直接使用该错误原因，不兜底 `"Unknown error"`。
- **原子事务**：状态更新和通知写入包裹在 `db.transaction()` 中，同成同败。
- **重试 API**：`POST /api/workspace/files/retry` 将 `convert_failed` / `index_failed` 回退到 `pending`，清除 `error` 字段；非失败状态拒绝重试；路径通过 `fileManager.resolveManagedFileLocation` 校验，拒绝 `.ridge`/外部路径/符号链接逃逸。
- **上传自动注册**：`POST /api/files/upload` 上传文件到可见目录后自动在 `file_processing_status` 插入 `pending` 记录；`.ridge` 内文件跳过注册。
- **删除同步清理**：`DELETE /api/files/entries` 删除文件时同步删除对应的 `file_processing_status` 记录；删除目录时清理该目录前缀下全部状态记录。
- **目录删除 LIKE 安全**：前缀匹配时转义 `%` 和 `_`（SQL LIKE 通配符），使用 `ESCAPE '\'` 语法，防止路径含特殊字符时误删无关记录。
- **前端交互安全**：文件行改用 `<div>` 而非 `<button>` 包裹，避免嵌套 button；重试按钮用 `@click.stop` 阻止冒泡。

### 测试覆盖

- 后端 `file-processing-status.test.ts`（18 项）：
  - 真实 `POST /api/files/upload` 后 DB 有 `pending` 记录
  - `.ridge` 文件不创建处理记录（通过 tree API 拒绝 + DB 验证）
  - `PATCH /status` 合法流转 `pending → converting → converted → indexed`，`converted_at` 和 `indexed_at` 均保留
- 非法流转（`pending → indexed`）返回 400
  - `indexed` 终态拒绝 `converting/converted/convert_failed/index_failed`
  - `convert_failed` 拒绝任何 PATCH 流转（只能通过 `POST /retry` 回 `pending`）
  - `index_failed` 拒绝任何 PATCH 流转（只能通过 `POST /retry` 回 `pending`）
- 转换失败不带 `error` 返回 400
  - 更新不存在的记录返回 404
  - 转换失败保留原文件 + 错误原因 + 生成通知（原子事务验证）
  - 索引失败保留转换产物 + 错误原因 + 生成通知
  - `POST /retry` 将失败状态重置为 `pending`
  - 重试拒绝 `.ridge` 路径（返回 400）
  - 删除文件同步删除处理记录（真实 `DELETE /api/files/entries`）
  - 删除目录同步清理目录前缀下全部状态记录（LIKE 特殊字符已转义）
  - 删除 `safe_dir` 不误删 `safeXdir`（下划线 LIKE 转义验证）
  - 删除 `percent%dir` 不误删 `percentXdir`（百分号 LIKE 转义验证）
  - 非法状态值返回 400
  - 非失败文件重试返回 400
  - 文件树正确返回 `processingStatus` 和 `processingError`
- 前端 `FilesView.test.ts`：失败文件展示重试按钮，点击后 emits `retry` 事件；非失败文件无重试按钮。
- 前端 `useWorkspaceFiles.test.ts`：`retry()` 调用 API 并刷新目录，失败时写入 `error`。

### 教训

- **测试必须走真实 API**：不能为省事直接 `INSERT` DB；`supertest` 上传用 `.attach("files", buffer, filename)` 即可，不需要引入 `form-data` 包。
- **测试间隔离**：`afterAll` 清理 `file_processing_status` 时不能只按 `workspace_path` 删（会误伤并行测试），应按 `file_path LIKE testRoot%` 精准清理。
- **通知生成要原子**：状态更新和通知写入必须在同一 `db.transaction()` 中完成，否则通知可能丢失。
- **时间戳不可覆盖**：状态更新 SQL 应读取当前 `converted_at`/`indexed_at`，仅在首次进入对应状态时写入，后续流转保留已有值。
- **前端 retry 不阻塞导航**：重试按钮用 `@click.stop` 阻止冒泡，文件行外层用 `<div>` 避免嵌套 button 的 HTML 结构风险。
- **状态变体映射要完整**：`statusVariantMap` 必须覆盖所有 6 种状态，缺失会导致 Badge 回退到 `secondary` 且用户无法区分。
- **目录删除 LIKE 必须转义**：前缀匹配清理子文件时，路径中的 `%` 和 `_` 是 SQL LIKE 通配符，必须用 `ESCAPE '\'` 配合转义，否则 `safe_dir/` 会匹配 `safeXdir/`、`safe%dir/` 等无关路径。
- **协议类型先行**：新增 `processingError` 字段需先在 `@pi/protocol` 的 `FileTreeEntry` 声明，再在前端使用；否则 `vue-tsc` 门禁直接失败。
- **重试路径必须校验**：`retry` 不能直接信任请求中的 `path`，必须通过 `fileManager.resolveManagedFileLocation` 做 root/`.ridge`/realpath 边界校验。

## 2026-05-13 任务 19 PDF Word 标准化转换（历史归档 — JS 自研栈已废弃）

> **⚠️ 本任务全部实现已在任务 41 迁移至 Python 通用转化服务。旧 `file-converter.ts`、`pdfnano`、`mammoth`、`turndown`、`@pdf2md` 等纯 JS 转换栈已彻底废弃，禁止作为当前实现指导。**
> 原始审查记录（Round 1–5 的 JS 栈修复细节）已作为历史档案移除，不再占用主记忆。

### 当前架构（任务 41 之后）

- **唯一转换路径**：ridge Node 后端 → HTTP 调用独立 Python 通用转化服务（MarkItDown/Whisper/OCR 等），按 `40-Python通用转化服务API契约.md` 消费。Node 不自研 PDF/Word 解析、不内嵌模型推理。
- **产物结构**：`<name>.md` + `<name>.assets/` + `<name>.metadata.json` + `.originals/<original>`，产物与原文件在同一语义目录。
- **原文件归档**：转换成功后 `fs.rename` 原文件到同目录 `.originals/`；失败时通过 `writeArtifactsToWorkspace` 的 staging + rollback 恢复旧产物和原文件。
- **编辑守卫**：`POST /api/workspace/files/convert` 检测 `.md` 内容 hash（存储于 `metadata.json._ridge.mdHash`），hash 变更则拒绝覆盖；`force=true` 可强制覆盖。
- **状态机联动**：`file.convert` 后台任务由 `file-conversion-worker.ts` 轮询 `background_jobs` 队列；worker 提交到 Python 服务后补偿轮询直到终态。开始转换时 `pending → converting`，成功 `→ converted`，失败 `→ convert_failed` 并写 `error` + 生成 `notification_events`。
- **手动重转换 API**：`POST /api/workspace/files/convert` 重置 `file_processing_status` 为 `pending` 并重新入队 `file.convert`，由 Python 服务 worker 执行转换。
- **metadata 内容**：Python 服务返回的 metadata 全部透传，Node 侧只追加 `_ridge` 字段（`sourcePath`、`workspacePath`、`archivedAt`、`archivedTo`、`mdHash`）。

### 测试覆盖（任务 41 之后）

- `file-conversion-worker.test.ts`（6 项）：worker 成功/失败路径、无 status 记录跳过、非 `pending` 状态 worker 不覆盖终态、幂等、retry 去重。
- `conversion-comprehensive.test.ts`（14 项）：worker 前置检查失败（缺失源文件/不支持类型）写 `convert_failed` + notification、transient retry 耗尽后进入 `convert_failed`、staging + rollback 保护旧产物（metadata JSON.parse 失败、源文件缺失均回滚）、already-archived source、downloadArtifact timeout、downloadArtifacts artifactId fallback 真实 HTTP 超限拒绝、callbackBaseUrl 未配置时 worker 不传 callbackUrl、worker 路径安全（越界拒绝）、artifact symlink 父目录越界防护、旧 assets 清理（新无 assets 时）、.originals 完整 worker 成功链路、无 status 记录时不写通知。
- `file-upload-convert-trigger.test.ts`（3 项）：disabled 时真实 upload API 不入队、disabled 时 manual convert API 返回 503 且不改状态、disabled 时 retry API 返回 503 且不改状态。
- `manual-convert-api.test.ts`（5 项）：pending 文件 enqueue、converted 文件编辑守卫拒绝/force 允许、404 缺失记录、.originals/ 来源 enqueue、双缺失 graceful note。
- `file-conversion-e2e.test.ts`（4 项）：PDF/DOCX `.md` 继承 converted 状态、手动 convert enqueue、retry 清理旧 job。
- `file-processing-status.test.ts`（24 项）：状态生命周期、非法转换拒绝、删除同步、LIKE 转义、PATCH path 同步。

### 教训

- **产物原子写入**：`writeArtifactsToWorkspace` 必须先备份旧产物 → 写新产物到 tmp → 检查源文件 → 归档源文件 → 原子移动；任何步骤失败必须 rollback 恢复旧产物和源文件，禁止半提交。Stage 1 备份失败本身也要回滚（恢复已备份的旧产物）。
- **状态机终态不可覆盖**：worker 遇到 `convert_failed` / `index_failed` 时只能 fail background job，不得 UPDATE `file_processing_status` 的 status/error。
- **failConversion 区分上下文**：`failConversion()` 必须先检查 `file_processing_status` 记录存在性；无记录时只 fail background job，不写 `notification_events` 文件通知。
- **路径安全逐级 realpath**：`assertWorkspaceSafe` 对不存在路径逐级向上 `fs.realpath` 已存在父目录，拼接 suffix，防止父级 symlink 绕过。
- **目录删除 LIKE 必须转义**：前缀匹配清理子文件时，`%` `_` 是 SQL LIKE 通配符，必须用 `ESCAPE '\'` 配合转义。
- **回调找不到记录返回 200**：Python 服务在回调投递失败时会指数退避重试；若 ridge 侧找不到关联记录（如文件已删除），返回 200 让 Python 侧停止重试，避免重试风暴。
- **配置体系隔离**：Python 转换服务配置通过 `app_settings` 表（`python_converter_base_url`、`api_key`、`callback_token`、`callback_base_url`），不混用 `ridge-settings.json` 或 `getSettings()`。
- **manual convert API 只改状态不入队直接转换**：`POST /api/workspace/files/convert` 只把状态重置为 `pending` 并 enqueue `file.convert` job；实际转换由 worker 异步执行，避免 API 超时。
- **callbackBaseUrl 未配置 = pure polling**：`callbackUrl` 仅在 `config.callbackBaseUrl` 存在时传入 Python 服务；未配置时 worker 纯轮询，不依赖 webhook。

---

## 2026-05-13 任务 39 内部项目→外部仓库语义改造 + 测试稳定性

### 实现要点

- **术语统一**：内部保留「项目」，外部统一改为「外部仓库」，前端侧边栏标签同步替换。
- **DB 层**：`projects.source` → `external_origin`，`projectType` 值域 `'internal' | 'external' | 'workspace'`；migration v11 确保旧数据正确迁移。
- **内部项目从 scope 排除**：`buildManagedProjectScopes` 和 `loadManagedProjectScopes` 双重过滤 `projectType !== 'internal'`；`POST /api/sessions` 显式拦截内部项目路径，不依赖 scope 缓存。
- **任务 cwd 规则**：内部项目任务 cwd=`workspaceDir`（不作为 pi 运行目录），外部仓库任务 cwd=仓库路径。
- **前端 cwd 分流**：`WorkspacePage.vue` 内部项目用 `workspaceDir`，外部仓库用 `project.projectRoot`。
- **`mapProjectRow` 防御性**：非法旧值 `source` → `'folder'`，`null` → `null`。

### 测试稳定性根因与修复

- **排序非确定性**：`ORDER BY created_at DESC` 在两条记录同毫秒时 SQLite 返回顺序不确定。修复：追加主键 tie-breaker：`ORDER BY created_at DESC, note_id DESC` / `clip_id DESC` / `task_id DESC` / `favorite_id DESC`。涉及文件：`routes/fleeting.ts`、`task-system.ts`、`storage/index.ts`。
- **forks 隔离 + fileParallelism 固化**：`vitest.config.ts` 保持 `pool: "forks"` + `fileParallelism: false` + `isolate: true` + `maxConcurrency: 1`。`isolate: true` 确保模块级 `vi.mock`（如 fleeting-analysis.test.ts 的 fleeting-attachments mock）不会污染同进程其他测试文件；`fileParallelism: false` 避免多 worker 进程并行时 authRuntime/DB 目录竞争。
- **`--no-isolate` 不兼容**：`vi.mock("../fleeting-attachments.js")` 会污染整个 worker 的模块缓存，导致 fleeting-api.test.ts 和 fleeting-attachments.test.ts 使用被 mock 的模块（返回空数组或 500），因此不能用 `--no-isolate` 提速。
- **authRuntime 不全局 reset**：`vitest-setup.ts` 移除 `authRuntime.resetForTests()`；`createAuthenticatedAgent` 不做 reset，直接 login。避免同 worker 进程内前一个文件的 session 状态被清零，导致后文件 401。

### 门禁规则

- `npm run check` 通过（0 error, 19 warnings —— 全是既有 `any` warning）。
- `pnpm test` 后端 10 连跑全绿，前端 34/34 files 253/253 tests 全绿。
- **SQLite `ALTER TABLE RENAME COLUMN` 不可靠**：旧 `source TEXT NOT NULL` 场景下 `RENAME COLUMN` 不会重命名且残留旧列；正确做法：ADD `external_origin` → UPDATE 映射旧值 → DROP `source`。

## 2026-05-13 任务 41 Python 通用转化服务契约消费实现

### 改造要点

- **契约消费**：ridge Node 后端不再自研 PDF/Word/音频/图片解析转换栈，全部迁移为调用独立 Python 通用转化服务，按 `40-Python通用转化服务API契约.md` 消费。
- **类型与客户端**：`conversion-service-client.ts` 实现契约全部 TypeScript 类型、`ConversionServiceClient`（multipart 上传、查询、取消、产物下载/inline 解析）、`ConversionServiceError` 及 `mapErrorToRidgeAction`（按契约错误码表映射 retry 策略）、配置读写（`app_settings` 表 `python_converter_base_url` / `api_key` / `callback_token`）。
- **Worker 改造**：`file-conversion-worker.ts` 重写——`processOne` 提交任务到 Python 服务（multipart + `callbackUrl` + `clientJobId`），记录 `pythonJobId`，启动补偿轮询（30s 间隔 / 10min 最大）。`handleConversionResult` 幂等，可被 worker 轮询和 webhook 回调共用：成功则下载产物、落盘、归档原文件、更新 `converted`；失败则写 `convert_failed` + `notification_events`。
- **Webhook 路由**：`POST /api/webhooks/conversion` 带 `?token=` 验签，从 payload `metadata.ridgeFileId` 或 `clientJobId` 关联本地文件；找不到记录返回 `200` 避免 Python 服务重试风暴。
- **产物落盘**：`writeArtifactsToWorkspace` 写入 `<name>.md`、`<name>.assets/`、`<name>.metadata.json`（追加 `_ridge` 字段），原文件归档到 `.originals/`。
- **入口集成**：`index.ts` `startServer` 中读取配置、创建 `ConversionServiceClient`、构造 `callbackBaseUrl`、传入 worker；`listenHttpServer` 之前注册 webhook 路由。
- **触发扩展**：`isConvertibleExtension` 扩展为契约支持的全部扩展名（PDF/DOCX/PPTX/XLSX/HTML/TXT/MP3/WAV/M4A/FLAC/OGG/PNG/JPG/WEBP/TIFF）。

### 关键经验

- **不要 mock Python 服务能力**：测试中可用 fake HTTP server 验证 ridge 侧契约消费，但业务实现必须是真 HTTP 客户端（`ConversionServiceClient`）。
- **worker 与回调共用同一结果处理函数**：`handleConversionResult` 必须幂等（检查当前状态是否已是终态），避免回调和轮询同时到达导致重复落盘或状态竞争。
- **回调找不到记录返回 200**：Python 服务在回调投递失败时会指数退避重试；若 ridge 侧找不到关联记录（如文件已删除），返回 200 可让 Python 侧停止重试，避免重试风暴。
- **配置体系**：`index.ts` `startServer` 中使用 `loadConversionServiceConfigFromDb()` 从 `app_settings` 表读取 `python_converter_base_url`、`python_converter_api_key`、`python_converter_callback_token`、`python_converter_callback_base_url`；不再通过 `getSettings()` 读取 Python 配置。
- **手动转换 API 已迁移**：旧 JS 自研转换栈已废弃，`POST /api/workspace/files/convert` 现在重置 `file_processing_status` 为 `pending` 并重新入队 `file.convert`，由 Python 服务 worker 执行转换。
- **产物落盘追加 `_ridge` 而非覆盖**：`metadata.json` 中保留 Python 侧全部字段，只追加 `_ridge` 对象，符合契约“Python 侧透传未知字段”原则。
- **轮询间隔用 sleep 而非 setTimeout**：worker `processOne` 中补偿轮询用 `await sleep(pollFallbackMs)` 顺序执行，比 setTimeout 更易控和测试。
- **旧测试适配**：`file-conversion-worker.test.ts` 原测试直接调用本地 JS 转换，改造后需 mock `ConversionServiceClient`；`file-upload-convert-trigger.test.ts` 的 TXT 不可转换断言需更新为 `.txt` 现在也是 convertible。

### 测试覆盖

- `conversion-service-client.test.ts`：类型校验、Fake HTTP Server 全端点交互、401 错误、配置读写。26 项通过。
- `file-conversion-worker.test.ts`：worker 成功/失败路径、无 status 记录跳过、非 `pending` 拒绝、幂等、retry 去重。**6 项通过。**
- `conversion-comprehensive.test.ts`（新增）：transient retry 耗尽后进入 `convert_failed`、staging + rollback 保护旧产物、already-archived source 支持（logical source 不存在但 `.originals/` 存在）、downloadArtifact timeout 约束、webhook 空 token 拒绝。**5 项通过。**
- `file-upload-convert-trigger.test.ts`：未配置时不 enqueue。**1 项通过。**
- `file-conversion-e2e.test.ts`、`manual-convert-api.test.ts`、`pdf-word-conversion.test.ts`：保留旧手动转换 API 测试，54 项通过。

### 全量状态

- `npm run check`：0 errors，22 warnings（历史 `any`）。
- `pnpm test` 后端：352 passed（含新增 comprehensive 测试），转换相关测试 100% 通过。
- `pnpm test` 前端：256 passed。

## 任务20 — 音频图片 Markdown 处理（2026-05-13 修复版）

### 新增能力

- **音频转写**：worker 按 `audio.transcription` 类型传递 `language: auto, segmentDuration: 30, format: markdown` 选项，产物为 `<name>.md`（含时间戳）+ `<name>.metadata.json` + `.originals/<audio>`。
- **图片 OCR**：worker 按 `image.ocr` 类型传递 `language: auto, outputBlocks: true` 选项，产物为 `<name>.md`（含 OCR 文本）+ `<name>.metadata.json` + `.originals/<image>`；metadata 不生成 `visualDescription` 字段。
- **Markdown 直接作为文本资产**：上传 `.md`/`.markdown` 文件时自动注册 `file_processing_status` 为 `converted`，跳过 `pending→converting` 队列。
- **音频前端预览完整链路**：后端 `/api/files/blob` 支持 audio MIME 类型；前端 `WorkspaceContentArea.vue` 和 `WorkbenchOperationPanel.vue` 对 audio previewKind 生成 blobUrl；`WorkbenchReadonlyFilePreview.vue` 渲染 HTML5 `<audio>` 播放器。
- **RAG 索引入口**：转换成功后将产物 `.md` 写入 `search_index_status`（含内容 hash）；Markdown 编辑保存后更新 `search_index_status` 为 `pending`，夜间索引以最新内容为准；Markdown 上传即注册 `search_index_status`。
- **契约类型一致**：`AudioTranscriptionOptions.format` 联合类型新增 `"markdown"`，worker 使用 `ConversionOptions` 类型传递。

### 全量测试修复（根因）

- `fleeting-api.test.ts`：将 call-count 模拟改为**路径匹配模拟**（`filepath === secondPath`），消除并发中其他 `fs.readFile` 调用对计数器的干扰。
- `workspace-tasks.test.ts`：将 `ensureDefaultMilestone` 从 `SELECT → INSERT` 竞态模式改为 **`INSERT OR IGNORE → SELECT`** 原子模式，消除并发测试间的 SQLite 唯一约束冲突。

### 测试覆盖

- `conversion-comprehensive.test.ts`（新增）：audio transcription 转换链、image OCR 转换链、worker 按任务类型传递正确 options、产物含时间戳/无视觉描述。
- `file-processing-status.test.ts`（新增）：`.md` 文件上传直接标记 `converted` 并注册 `search_index_status`。
- `WorkspaceContentArea.test.ts`（新增）：audio previewKind blobUrl 生成、unsupported fallback。
- `WorkbenchReadonlyFilePreview.test.ts`（新增）：`<audio>` 元素渲染、src 属性、blobUrl 传递。

### 全量状态

- `npm run check`：0 errors，21 warnings（历史 `any`，本任务未引入新 warning）。
- `pnpm test` 后端：366 passed，转换相关测试 100% 通过。
- `pnpm test` 前端：261 passed（新增 5 项组件测试）。
