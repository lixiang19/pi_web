# Pi Web 项目记忆

> 只记决策和教训，代码/文档能查到的不记。控制在 10-15 条以内。

## 架构决策

- [Pi SDK] 只能用 SDK 模式，禁止 RPC（官方限制，无替代方案）
- [数据存储] 统一用服务端 JSON 文件存储（~/.ridge/），不混用 localStorage（架构简单统一）
- [前后端分离] server 负责 runtime + 权限 + 持久化，web 只做投影消费，禁止在 Web 层伪造会话语义
- [Agent注册表] `packages/server/pi-default-config/agents/` 只给用户自定义 Agent 占位；ridge 只在 server 代码里内置一个基础默认 Agent `builtin:assistant`，不覆盖写入内置 Agent 文件。
- [输入安全] 所有服务端写入必须白名单校验，防止原型污染（**proto** 注入）
- [目录边界] 工作区文件树与 Home 目录项目选择必须拆成两个接口，不能共用一套 root 校验（安全语义不同）
- [Pi默认配置覆盖] ridge 只使用 Pi 默认配置根 `~/.pi/agent`，不另造配置根；仓库内置配置在 `packages/server/pi-default-config/`，server 启动时非破坏性覆盖写入，保留 Pi sessions 和用户自定义 skills/prompts 等目标侧资源。
- [项目真源] 已添加项目必须是真源；会话列表、文件树、worktree 归属都从项目列表收敛，禁止再从 session 或 server 启动目录反推项目边界
- [系统聊天项目] 工作区 `chat` 是独立系统项目：它要进入会话归属与新聊天默认落点，但不能混入 `/api/projects` 的用户项目列表
- [工作区默认目录] 运行时工作区绝不能默认回落到仓库根或 npm 启动目录；默认工作空间是 `~/ridge-workspace`，当前路径记录在 `~/.pi/ridge.db`
- [配置存储] `ridge-settings.json` 已退役；设置、项目、收藏、当前工作空间路径等 ridge 运行状态统一落到 `~/.pi/ridge.db`
- [chat 初始化契约] `<workspace>/chat` 只允许是目录；已存在但不是目录时必须直接失败，不能吞掉错误继续复制
- [单用户认证] VPS 个人部署采用固定密码登录，登录成功后使用服务端内存 Session 和 `ridge_session` HttpOnly Cookie；除 `/api/auth/session|login|logout` 外，其余 `/api/*` 和终端 WebSocket 都必须鉴权。当前固定密码写在服务端，仓库或镜像泄露即视为密码泄露。
- [云化架构] 多用户商业化采用“中心控制面 + 每用户专属 VPS runtime”，不是共享数据库多租户；中心只管账号、VPS、路由、升级、备份和计费，用户 workspace、Pi 会话正文、RAG、图谱和 `~/.pi/ridge.db` 留在用户 VPS。
- [重型转换服务边界] 文档/PDF/Word/音频/图片等重型解析与转换长期由独立 Python 通用转化服务承载；文档/URL 默认走 MarkItDown，图片 OCR/描述默认走 OpenAI-compatible 视觉模型，音频转写默认走 Groq Speech to Text；MarkItDown 图片/音频、Tesseract 与 faster-whisper 只作为显式 fallback。ridge Node 后端只做 workspace 安全校验、`file_processing_status` 状态机、`background_jobs` 队列调度、产物落盘（`.md/.assets/.metadata.json/.originals`）；Node 不自研 PDF/Word/图片/音频解析栈、不内嵌模型推理。Python 服务源码已内置到 `services/converter/`，但运行时仍是独立进程/容器，按 `文档/功能开发/40-Python通用转化服务API契约.md` 对外提供 `/v1` API。
- [Pi转化工具] Pi Agent 自定义工具 `convert_file_to_markdown` 只调用 Python Converter 并把 Markdown 返回给 Agent，不写 workspace、不归档原文件、不更新 `file_processing_status`；正式文件产物仍走文件处理队列或闪念沉淀。URL 网页正文提取走 `exa_get_contents`，直接调用 Exa 官方 Contents API。两类工具都归类为 `read` 权限，`read: deny` 时必须从可用工具移除。
- [Converter公网认证] Python Converter 虽然所有 `/v1` 请求都要求 `Authorization: Bearer <key>`，但 `dev-key` 只能用于本地 loopback 开发；绑定 `0.0.0.0` 或 production 环境必须显式配置非默认 `RIDGE_CONVERTER_API_KEYS`，并让 ridge Node 的 `PYTHON_CONVERTER_API_KEY` 使用同一个值。

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
- [Android移动端边界] `packages/mobile` 是移动端 Vue 真源，根目录 `android/` 只是 Capacitor 壳；移动端第一版只保留捕捉、轻对话、任务和必要设置，不复用桌面工作台、多标签、文件树或终端。
- [Android设备连接边界] Android 可用服务地址直接注册 `deviceType=android` 并 REST 心跳；公共注册路径只接受 Android，capability 固定为 `mobile_capture/camera/microphone`，剔除 `skill_android`，且 Android 永不接收 runtime bundle。

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
- [任务回顾边界] task review agent 只能写 `task_review.suggestion` 通知，不能直接改任务/里程碑；正式对象变更必须等用户接受通知建议后走任务系统状态机。任务页可展示关联建议，但仍复用通知中心动作契约。
- [任务回顾会话真源] task review 的“处理会话长期无进展”必须优先读取 `workspace_tasks.processing_session_id` 绑定的 `sessions`；只有任务没有绑定 processing session 时才用未归档 `session_index` 补充。
- [任务处理会话索引与边界] 创建 task processing session 后必须同时写 `workspace_tasks.processing_session_id` 和 `session_index(session_type='task', task_id)`；PATCH/messages 对任务会话显式传普通 Agent 必须在加载 Pi runtime 前返回 400，只允许 `task-agent`。
- [建议动作幂等] 通知建议的 `accept_suggestion` 必须在事务内先 claim 非终态通知再执行正式写入；否则重复点击/并发请求会让 `task.create`、`milestone.create` 这类建议重复落库。
- [乐观更新] 任务 toggle/create/delete 应先本地更新状态、失败再回滚，避免每次操作后 await load() 全量重新加载的延迟感
- [规划工具与子代理权限] 7 个规划工具全部映射到 `task`，子代理主工具映射到 `subagent`。`compileAgentPermission` 移除规划工具时遍历 `PLANNING_TOOL_NAMES`；移除子代理时同时移除 `subagent`、`steer_subagent`、`get_subagent_result`。`steer_subagent` 和 `get_subagent_result` 不单独生成权限审批，可用性跟随主工具。
- [外部目录权限] `external_directory` 是独立安全防护权限，工具访问会话 `cwd` 外路径时默认 `ask`；目录放行后仍叠加普通工具权限，`read` / `ls` / `edit` 路径规则支持 `~` 和 `$HOME`。
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

- [设备 token 鉴权] 桌面设备注册后返回 token，后续所有敏感操作（心跳、重命名、bundle 获取、ack）必须校验 token。GET bundle 用 query `?token=`，POST ack 用 body `token`，rename/heartbeat 用 body `token`。缺失或错误 token 统一 401。
- [WebSocket 设备连接] 桌面端通过 `ws://host/api/devices/:deviceId/ws?token=xxx` 建立长连接；服务器每 30s ping，桌面 pong 回复即刷新在线状态。token 在 upgrade 阶段异步校验，失败 401 断开。SSE 事件通过 ws 从桌面回传服务器，再由服务器 SSE 管道广播给 Web 客户端。
- [Bundle 过滤规则] Skill 路径中任意目录名含 `[tag]` 即视为设备专属；所有 tag 必须全部匹配设备 `skill_${tag}` capability 才保留，通用 Skill（无 tag）始终保留。不能用文件名简单匹配，因为 skill 可能在子目录中。
- [Bundle ack 覆盖] `device_bundle_acks` 以 `device_id` 为 PK，同设备多次 ack 时 `ON CONFLICT DO UPDATE` 覆盖，只记录最后一次 ack。
- [permission 审批] 运行时权限审批不是 ask 工具，也不是新工具消息；它是 tool_call 前拦截层。pending 走独立 `permissionRequests` 卡片，历史不单独落 UI，避免把审批语义伪装成工具协议
- [server 类型补洞] 当 workspace 没有完整第三方类型包时，可在 `packages/server/src/types/` 放最小 shim 保住 server `tsc --noEmit`，但 shim 只补边界，不扩散到业务层
- [server 路由类型] 拆分 Express 路由时，Deps 接口不能用 `unknown` 接收真实服务函数；要导入领域类型、schema 输出类型和服务 ReturnType，否则 strictFunctionTypes 会让注入点和路由内部同时失去类型检查。
- [侧边栏临时隐藏] 隐藏一级导航入口时优先改 `workbenchPrimaryNavItems`，保留真实路由和页面文件，除非明确要求删除能力
- [消息桥接] Web 想做真实工具回放，server 绝不能把 Pi `toolResult` 压扁成只剩 `role/content/timestamp`；`toolCallId/toolName/details/isError` 缺一个，关联、摘要、专属渲染都会废
- [会话流桥接] 恢复会话能显示但发送后消息不刷新，优先检查 server 是否真正绑定了 `AgentSession.subscribe()`；如果 SSE 只发 `status` 不发 runtime message 事件，前端恢复链路会正常，发送链路一定失效
- [AI对话主线API] 会话主链路只保留 `/events`、`/cancel`、`/ask/:requestId`、`/permissions/:requestId`；旧 `/stream`、`/abort`、`/asks/:id/respond`、`/permissions/:id/respond` 不再作为服务端别名存在。desktop 会话的 messages/events/cancel/ask/permissions 都先按 `session_index.run_location` 转发到桌面运行时。
- [归档会话只读] 归档只读必须前后端双层生效：server 同步 `sessions.archived` 与 `session_index.archived`，归档后 `messages/ask/permissions/cancel` 返回 403 且 desktop 不转发；web 从 session summary/snapshot 派生 `composer.isDisabled`，显示只读原因并保留草稿。
- [乐观消息去重] Pi SDK 会给 user message 也发 `message_start/message_end`，Web 端已有乐观用户消息时，server SSE 桥接必须过滤这两类 user 事件，否则每次发送都会重复一条 user 消息
- [Git能力探测] Git 面板显隐不能靠 `getGitStatus()` 报错倒推；要单独提供轻量 `isGitRepository` 探测链路，把“能力判断”和“状态读取”拆开
- [Git与版本边界] Git 只服务真实 `.git` 项目；工作空间隐藏版本必须走“版本”入口和 `/api/workspace/version/*`，只提供状态、diff、提交版本，禁止 fallback 到 ridge 内置 Git 或暴露分支/远程/push/pull。
- [消息可见性] 多轮会话的历史折叠必须是显式 UI 状态，不能把“最后一轮切片显示”藏在渲染默认值里；否则用户继续输入会误以为旧消息被删，但底层 session/jsonl 其实完整
- [历史分页] 会话历史分页单位必须是 user 轮次，不是消息条数；工具消息/thinking/toolResult 会放大消息数，若按条数截窗，UI 与用户心智必然错位
- [导航去重] 会话侧栏不要再维护“最近访问”这类二次导航；标签页已承担最近工作集语义，侧栏应只保留稳定信息架构（项目/搜索），否则状态重复、localStorage 重复、认知也重复
- [搜索入口] 左侧"搜索"只负责进入独立搜索页；真实搜索输入与结果必须放主内容区，侧栏搜索框只是本地过滤器（两者全存在会造成职责混淆，侧栏过滤器应删除统一入口）
- [RAG刷新契约] RAG 上传和普通编辑不是同一触发语义：Markdown 上传要同步可检索；普通 Markdown 编辑只标记 `refresh_policy=deferred` 并保留旧 chunk，直到手动刷新或夜间索引再重建；删除/移动文件必须同步清理或改写 RAG metadata。
- [V2阶段2文件闭环] 文件页操作入口已收口到 `FilesView` + `useWorkspaceFiles`，支持上传、新建文件夹、重命名、移动、删除、重试和重新转换；Markdown 编辑保存必须走 `/api/files/content`，不能再走 notes API，否则会丢失 workspace 文件路径、RAG deferred 和隐藏版本点。
- [空间隐藏版本契约] `空间/<作品名>/index.html` 可通过普通文件编辑器保存；保存走 `/api/files/content`，写入 RAG immediate pending，并通过 `workspace-version.ts` 创建隐藏版本点。预览 API 仍只负责私有 `srcdoc` 读取，不创建公开 URL。
- [Wiki维护契约] 夜间维护顺序固定为 RAG deferred 索引 -> graph -> Wiki -> Wiki immediate RAG；Wiki agent 必须读取当前 `Wiki/**/*.md` 作为用户可编辑真源，只维护少量 canonical Markdown 页面，拒绝隐藏/越界/符号链接写入路径，空 `Wiki/index.md` 不注入。
- [RAG向量契约] RAG embedding 使用 SiliconFlow `Qwen/Qwen3-VL-Embedding-8B`；配置统一从 `.env` / `SILICONFLOW_*` 环境变量读取。索引阶段缺 Key/远端失败必须写 `index_failed` 和通知；搜索阶段只允许旧 chunk 做精确文本命中，不能把历史 96 维本地 hash 向量继续混入语义相似度。
- [图片RAG契约] 图片原文件是 RAG 一等源：上传 `.png/.jpg/.jpeg/.webp/.bmp/.gif/.tif/.tiff` 后直接用 Qwen3-VL 图片 embedding 入库；图片 OCR 转换产物 `.md` 仍作为独立文本 RAG 源入库，二者互补，不能只依赖 OCR 代表图片 RAG。
- [全局搜索边界] 全局搜索聚合文件、任务、里程碑、项目、会话索引、记忆、Wiki、空间和 RAG，但不搜索外部项目文件内容，也不读取 Pi 会话正文；项目注册信息可以出现，外部项目文件路径不能作为 file/RAG 结果泄露。
- [知识诊断入口] V2 阶段 5 的知识健康状态统一从 `GET /api/workspace/knowledge/diagnostics` 读取；搜索页空查询态展示 RAG 队列/失败目标、记忆/Wiki 注入、图谱、MCP 只读工具、后台任务和通知，禁止前端另造诊断协议或伪造图谱/MCP 状态。
- [workspace MCP边界] workspace MCP 只能由设备 token 访问，工具必须保持只读；读文件必须同时做 workspace 词法边界和 realpath 边界，并拒绝任何隐藏路径段，外部仓库文件内容不能通过 MCP 暴露。
- [runtime bundle URL] runtime bundle 里携带设备 token 的 MCP URL 不能直接信任非本机 Host header；公网部署必须显式配置 origin 形式的 `RIDGE_PUBLIC_BASE_URL` 或 `RIDGE_SERVER_BASE_URL`。
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
- [上线门禁文档] V2 阶段 6 后，`文档/功能开发/` 根目录只允许保留 `index.md`；功能矩阵不能再用 `-`、`◐`、`⚠️` 表示上线前缺口，缺口要么补齐，要么删除入口，要么用 `N/A` 明确不适用，并由 `release-gate.test.ts` 守住。
- [上线产物边界] Playwright `test-results`、`playwright-report`、临时 `.tmp` 源码文件和固定截图输出都不得进入源码真源；E2E 若需截图必须写入已忽略的 `test-results/`，并由 `release-gate.test.ts` 守住。
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
- [文件通知清理] 删除工作空间文件/目录时，必须同步删除 `notification_events` 中 `related_type='file'` 且 `related_id` 精确或目录前缀匹配的失败通知；否则 e2e/临时文件删除后通知中心会残留不可重试的陈旧通知。
- [summary缺文件跳过] `summary.daily` 读取 session jsonl 时遇到 `ENOENT` 应完成为 `{ skipped: true, reason: "session_file_missing" }`，不重试、不写 `background_job.failed`，因为会话文件已清理时用户没有可执行恢复动作。
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
- [闪念队列边界] 闪念 PRD 语义是 DB 队列，不是 `收件箱/*.md` 文件列表；2026-05-20 后默认产品边界改为 AI 主导，后端不再暴露 `process/*` 人工处理动作，前端不再展示按建议/日记/任务/里程碑/剪藏/附件处理/删除按钮，只保留分析失败重试。
- [闪念展开详情] 已处理闪念的 `recommendationText` 是 Agent summary，展开卡片必须展示为“处理结果”；展开态要提供卡片内显式收起入口，不能只依赖时间线小圆点。
- [闪念附件提示] 带附件保存会串联创建闪念、上传附件和触发分析；这些内部成功状态要支持静默，只由外层保存流程展示一次成功 toast，避免一次操作弹出多条绿条。
- [网页端闪念输入契约] 网页端闪念不是让 AI 判断是否保留；用户输入即表示要沉淀。图片进入临时附件库后作为视觉输入，不默认 OCR；录音进入临时附件库后转写 Markdown，原音频迁移到正式附件库且 YAML 引用附件地址；PDF/Word 等文档转 Markdown 但原件默认不进正式附件库；URL 默认进入剪藏/资料沉淀，剪藏 Markdown 必须记录 URL YAML，正文提取由 `fleeting-agent` 调用 `exa_get_contents` 完成。
- [闪念刷新链路] 全局闪念入口保存后必须广播前端事件或走实时通道通知收件箱 store；否则 DB 已写入但当前页面 badge/list 不会更新。后台分析建议完成前 store 需要轮询或 SSE 刷新。
- [checkbox 回写] checkbox 来源的待办任务切换完成状态不能只更新 DB；必须回写 .md 文件对应行的 `- [ ]` ↔ `- [x]`，否则刷新后状态丢失
- [首页选择器异步默认值] 首页这类长驻标签页不要只在 setup 时拷贝异步 props；模型/Agent/thinking 默认值从 core/settings 异步到达后，需要在“不覆盖用户有效选择”的前提下同步本地选择状态
- [首页模型/Agent下拉链路] 主页下拉数据来自 `usePiChatCore` boot 的 `/api/providers`、`/api/agents`、`/api/session-contexts`；`usePiChatCore` 禁止模块 import 时自动 boot，且 `/api/session-contexts` 缺失会让整个 boot 失败，表现为模型/Agent 下拉为空。
- [主左栏入口瘦身] 工作台主左侧固定入口不再展示「搜索」和「文件」；保留 `WorkspaceSearchView`、`FilesView` 与 API 能力，但不能从旧文档推断它们仍是主左栏入口。
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

- **任务 Agent 状态**：当前不再提供内置 `task-agent` 配置；任务处理会话链路保留历史边界，后续需要按新的默认 Agent 模型重做。
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
2) **闪念 AI 主导边界**：`routes/fleeting.ts` 中 `process/journal`、`process/clip`、`process/task`、`process/milestone`、`process/attachment` 已移除；闪念页不展示按建议、日记、任务、里程碑、剪藏、附件处理或删除按钮，只保留状态展示和失败重试。
3) **闪念临时附件**：`.ridge/fleeting-attachments` 是闪念临时附件目录；附件上传 API、`fleeting_attachments` DB 引用和删除清理闭环。会话附件 `session_attachments` 是另一套独立体系；临时附件等待后续 AI 主导链路消费，不再由人工 process 路由迁移到正式 `附件/`。
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
- **重试入队一致性**：`POST /api/workspace/files/retry` 必须要求后台任务队列可用；队列不可用返回 503 且保持失败状态。失败状态恢复、旧 `file.convert` 取消和新任务入队必须放在同一 SQLite transaction。
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
- **配置体系隔离**：Python 转换服务配置通过 `.env` / 环境变量（`PYTHON_CONVERTER_BASE_URL`、`PYTHON_CONVERTER_API_KEY`、`PYTHON_CONVERTER_CALLBACK_TOKEN`、`PYTHON_CONVERTER_CALLBACK_BASE_URL`），不混用 `ridge-settings.json` 或 `getSettings()`。
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
- **类型与客户端**：`conversion-service-client.ts` 实现契约全部 TypeScript 类型、`ConversionServiceClient`（multipart 上传、查询、取消、产物下载/inline 解析）、`ConversionServiceError` 及 `mapErrorToRidgeAction`（按契约错误码表映射 retry 策略）、`.env` / 环境变量配置读取。
- **Worker 改造**：`file-conversion-worker.ts` 重写——`processOne` 提交任务到 Python 服务（multipart + `callbackUrl` + `clientJobId`），记录 `pythonJobId`，启动补偿轮询（30s 间隔 / 10min 最大）。`handleConversionResult` 幂等，可被 worker 轮询和 webhook 回调共用：成功则下载产物、落盘、归档原文件、更新 `converted`；失败则写 `convert_failed` + `notification_events`。
- **Webhook 路由**：`POST /api/webhooks/conversion` 带 `?token=` 验签，从 payload `metadata.ridgeFileId` 或 `clientJobId` 关联本地文件；找不到记录返回 `200` 避免 Python 服务重试风暴。
- **产物落盘**：`writeArtifactsToWorkspace` 写入 `<name>.md`、`<name>.assets/`、`<name>.metadata.json`（追加 `_ridge` 字段），原文件归档到 `.originals/`。
- **入口集成**：`index.ts` `startServer` 中读取配置、创建 `ConversionServiceClient`、构造 `callbackBaseUrl`、传入 worker；`listenHttpServer` 之前注册 webhook 路由。
- **触发扩展**：`isConvertibleExtension` 扩展为契约支持的全部扩展名（PDF/DOCX/PPTX/XLSX/HTML/TXT/MP3/WAV/M4A/FLAC/OGG/PNG/JPG/WEBP/TIFF）。

### 关键经验

- **不要 mock Python 服务能力**：测试中可用 fake HTTP server 验证 ridge 侧契约消费，但业务实现必须是真 HTTP 客户端（`ConversionServiceClient`）。
- **worker 与回调共用同一结果处理函数**：`handleConversionResult` 必须幂等（检查当前状态是否已是终态），避免回调和轮询同时到达导致重复落盘或状态竞争。
- **回调找不到记录返回 200**：Python 服务在回调投递失败时会指数退避重试；若 ridge 侧找不到关联记录（如文件已删除），返回 200 可让 Python 侧停止重试，避免重试风暴。
- **配置体系**：`index.ts` `startServer` 中使用 `loadConversionServiceConfigFromEnv()` 从 `.env` / 环境变量读取 `PYTHON_CONVERTER_BASE_URL`、`PYTHON_CONVERTER_API_KEY`、`PYTHON_CONVERTER_CALLBACK_TOKEN`、`PYTHON_CONVERTER_CALLBACK_BASE_URL`；不再通过 `getSettings()` 或 `app_settings` 读取 Python 配置。
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

## 2026-05-15 任务 21 空间 HTML 作品私有预览

### 契约

- 空间作品路径固定为 `空间/<作品名>/index.html`，第一版只支持单文件 HTML。
- 服务端入口：`packages/server/src/routes/workspace-space.ts`。
- API：
  - `GET /api/workspace/space`：确保 `空间/` 存在，列出一级作品目录中存在 `index.html` 的条目。
  - `GET /api/workspace/space/:id/preview-html`：按服务端生成的作品 ID 读取对应 `index.html`，不接受前端任意路径。
- 前端入口：`WorkspacePage.vue` 左侧「空间」固定入口，打开 `feature:space`；点击作品打开 `space:<indexPath>` 预览标签。

### 安全与便利性

- iframe 使用 `srcdoc`，不生成公开 URL。
- sandbox 使用 `allow-scripts` 以保留单文件 HTML 的内联 JS 交互能力，但不包含 `allow-same-origin`，因此不能拿到主站同源权限或 cookie。
- `SpacePreviewTab.vue` 注入 CSP：`default-src 'none'`、`connect-src 'none'`、`form-action 'none'`、`base-uri 'none'`、`navigate-to 'none'`，且 CSP 必须早于用户 HTML active content，禁止 ridge API 调用、表单、导航和外联请求。
- 服务端读取路径必须同时做 `ensureWithinRoot`、`.ridge` 系统目录与 realpath 边界检查；符号链接越界到 `空间/` 外或隐藏 `.ridge` 段会返回 400。
- 预览 HTML 上限为 10 MB，避免异常大文件进入 `srcdoc`。
- 直接请求缺失 `index.html` 的作品 ID 返回 404。
- 隐藏版本管理不是空间预览 API 自身能力；空间作品作为工作空间可见文件，依赖工作空间级隐藏版本管理覆盖 `空间/` 目录。

### 测试

- `workspace-space-api.test.ts` 覆盖列表、HTML 读取、缺 `index.html` 不展示、缺失读取 404、`.ridge` 拒绝、符号链接越界拒绝、非空间路径 ID 拒绝。
- `SpacePreviewTab.test.ts` 覆盖 `sandbox="allow-scripts"`、无 `allow-same-origin`、CSP 禁止 `connect-src`、CSP 早于用户脚本且允许内联脚本。
- `SpaceView.test.ts` 覆盖点击作品事件与无公开链接空状态。
- `WorkspacePage.test.ts` 覆盖「空间」固定入口顺序与点击作品打开 `space_preview` 标签。

## 2026-05-15 任务 22/23/24 RAG 与全局搜索

### 契约

- RAG 只索引工作空间内可见文本资产，排除 `.ridge`、`.originals`、`.git`、`node_modules` 和外部项目文件内容。
- Markdown 上传立即写入 `file_processing_status=converted` 并同步 RAG；普通 Markdown 编辑只标记 `refresh_policy=deferred`，保留旧 chunk，手动刷新或夜间刷新才重建。
- RAG worker 处理显式 `rag.index` job 时默认按 `manual` 事件执行，避免 deferred 目标被后台 job 标记完成但没有真正重建；worker 还有每天 03:00 的夜间入口，会用 `includeDeferred=true,event=nightly` 消费 deferred pending。
- `search_chunks` 持久化 `embedding_id` 和 `embedding_vector`；当前实现使用 SiliconFlow `Qwen/Qwen3-VL-Embedding-8B` 生成文本/图片向量，检索用精确文本召回 + embedding 相似度排序。
- `content_hash` 未变且已有同 hash chunk 时跳过重建；hash 变更才删除旧 chunk 并重建。
- 空间 `index.html` 是 RAG 的 HTML 标准源，文件上传路径为 `空间/<作品名>/index.html` 时同步进入 RAG。
- RAG 索引和手动刷新必须同时做词法路径和 realpath/symlink 边界检查。
- 全局搜索聚合文件、任务、里程碑、项目、会话索引、记忆、Wiki、空间和 RAG；不暴露 `graph` 占位类型，图谱节点等待 Task 28 Kuzu 图谱存储后接入。
- 目录筛选按路径边界匹配，`记忆` 不匹配 `记忆体`；搜索文件树跳过符号链接，避免工作空间内链接越界读取外部目录。
- 项目搜索结果点击打开项目主页标签，不把项目路径当文件打开；项目筛选要推导项目内 file/RAG 的 `projectId`。

### 测试

- `rag-standard-indexer.test.ts` 覆盖结构化 chunk、metadata、embedding vector、hash skip、空间 HTML、外部路径/符号链接排除、来源定位、手动刷新、删除、移动和失败通知。
- `rag-worker-e2e.test.ts` 覆盖显式 job 重建 deferred 与夜间入口消费 deferred。
- `workspace-search-api.test.ts` 覆盖聚合、类型筛选、项目内 file/RAG、目录边界、缺失空间 `index.html` 不抛错、符号链接越界和外部项目内容排除。
- `rag-consumer.test.ts` 覆盖默认工作空间 RAG 消费链路。
- `WorkspaceSearchView.test.ts` 覆盖文件打开、RAG 刷新、项目结果打开项目主页事件。

## 2026-05-15 任务 26/27 summary daily 与 MEMORY 维护注入

### 契约

- 会话结束入口是 `POST /api/sessions/:sessionId/end`；前端关闭会话 tab、页面卸载和 `pagehide` 时都会尝试调用该入口。
- `/api/sessions/:sessionId/end` 对同一 session 的 `summary.daily` 做幂等保护；已有 pending/running/completed 且未 failed/cancelled 的 job 时返回原 job，不重复入队。
- `summary.daily` job 以 session 为去重键，以 payload `dailyDate` 为串行 scope；同一天不同会话都能排队，但 daily 写入不会并发。
- summary agent 只读 `sessionFile`，当前实现返回 Markdown 正文；服务端把结果追加到 `记忆/daily/YYYY/MM/YYYY-MM-DD.md`，不生成单会话摘要文件。旧的结构化方案已在 2026-05-20 被取代。
- summary agent 产物路径由服务端二次归一：工作空间产物写 workspace 相对路径；外部项目绝对路径写成 `项目名: 项目内相对路径`，避免 daily 泄露本机绝对路径。
- 非 active session 的 `/end` 会从 `session_contexts` 补 `projectLabel/projectRoot`，避免外部项目路径归一化降级。
- 后台 summary/memory agent 使用独立设置 `backgroundAgentModel` / `backgroundAgentThinkingLevel`；模型通过 Pi `ModelRegistry.find(provider, model)` 解析，未配置模型时交给 Pi SDK 默认选择；设置页提供可见配置入口。
- summary 完成后排队 `memory.maintain`；memory agent 只读当天 daily 和 `记忆/MEMORY.md`，不读原始会话。
- `MEMORY.md` 只保存短句长期记忆；服务端过滤 token、密码、私钥、密钥等敏感内容，并按长度预算写回。
- 用户显式说“记住/请记住”时，消息入口在发送给 Pi 前立即写入 `MEMORY.md`；显式说“忘掉/别再记/不要再记”时立即删除匹配记忆。
- 新会话启动和 resource reload 时同步读取 `记忆/MEMORY.md` 与 `Wiki/index.md` 注入 XML 块；只有标题的空文件不注入；注入含“记忆可能过时，当前用户最新话语和当前文件事实优先”提醒。

### 测试

- `workspace-memory.test.ts` 覆盖 daily 生成、禁止单会话摘要、summary→memory 排队、跨日不改旧 daily、外部产物路径归一、后台模型配置、空内容不注入、注入提醒、显式记住/忘掉、敏感信息过滤。
- `background-jobs.test.ts` 覆盖 session 级 summary job 不误去重，以及同一天 daily 串行。
- `security-guards.test.ts` 覆盖 `/end` 入队、完成后重复结束幂等、非 active 外部 session 保留 project context。
- `WorkspacePage.test.ts` 覆盖页面卸载时结束仍打开的会话标签，以及 `pagehide` 下优先使用 `sendBeacon`。
- `SettingsTabContent.test.ts` 覆盖后台整理模型/思考强度入口渲染和保存。

## 2026-05-15 任务 28 Kuzu 图谱存储与抽取

### 契约

- 图谱存储目录固定为 `.ridge/graph.kuzu/`；workspace 初始化会创建目录并写入 `schema.cypher`，真实 Kuzu 数据库位于 `database.kuzu`。
- Kuzu schema 包含 `Project`、`File`、`Task`、`Person`、`Org`、`Concept`、`Tech`、`Source`、`Decision` 九类节点；关系统一为 `EvidenceRelation`，必须带 `evidence`、`source_path`、`confidence`、`updated_at`。
- graph agent 输入只来自标准化来源：已索引 Markdown 标准产物、`记忆/daily/**/*.md`、内部项目 Markdown 文档；排除外部项目、`.ridge`、`.originals`、非 Markdown 原件和图片/音频/PDF 原文件。
- 直接读取 daily 或内部项目 Markdown 前校验 `realpath` 仍在 workspace 内；内部项目根目录如果是指向 workspace 外的符号链接，会被跳过。
- 夜间维护顺序为 RAG deferred 索引完成后运行 graph agent，再运行 Wiki agent，并在 Wiki 写入后立即补一次 non-deferred RAG 索引。
- 用户自然语言纠错入口为 `POST /api/workspace/graph/corrections`，服务端让 graph agent 解析纠错并写回 Kuzu，用户不直接编辑图谱。
- 关系证据按 prompt 和存储层统一截断为 80 字以内，避免 graph agent 输出和 Kuzu 写入契约分裂。
- `GET /api/workspace/backup` 生成服务器备份 ZIP，包含 `ridge.db`、工作空间文件和 `.ridge/graph.kuzu`；排除 `.ridge/rag`、`.ridge/cache`、`.ridge/runtime`、`.ridge/fleeting-attachments`；隐藏 Git exclude 包含 `.ridge`，图谱不进隐藏版本管理。
- 备份打包显式跳过符号链接，避免 workspace 内链接把外部文件纳入备份。

### 测试

- `graph-store.test.ts` 覆盖 schema、证据关系、80 字截断、真实嵌入式 Kuzu 写入和纠错写入。
- `graph-agent.test.ts` 覆盖来源边界、输出 schema 解析和维护 runner。
- `graph-agent.test.ts` 覆盖内部项目根目录符号链接越界时不读取外部 Markdown。
- `graph-worker.test.ts` 覆盖夜间 RAG 后触发 graph agent。
- `workspace-graph-api.test.ts` 覆盖纠错 API 认证、graph runner 未初始化 503、成功调用 runner。
- `workspace-backup.test.ts` 覆盖备份清单和 ZIP 内容。
- `workspace-backup.test.ts` 覆盖备份跳过符号链接。
- `workspace-backup-api.test.ts` 覆盖备份下载 API 认证、ZIP 包含 graph.kuzu 且排除 RAG 缓存。
- `iso-git-service.test.ts` 覆盖隐藏 Git 排除 `.ridge`。
- `workspace-chat.test.ts` 覆盖初始化写入 graph schema。

## 2026-05-13 任务 30/31/32 项目注册、设备在线状态、Runtime Bundle

### 实现要点

- **项目注册（Task 30）**：
  - 新增 `POST /api/workspace/projects/internal` 创建工作空间内项目（目录 `~/ridge-workspace/项目/<name>`，`projectType='internal'`）。
  - 新增 `POST /api/workspace/projects/external` 注册外部仓库（支持 `deviceId` 绑定）。
  - 新增 `POST /api/workspace/projects/github` GitHub URL 克隆并注册。
  - `PATCH /api/workspace/projects/:id` 仅支持归档/解归档；`DELETE` 删除注册记录（有会话时 409）。
  - 同设备同路径唯一约束通过 `idx_projects_device_path` UNIQUE INDEX 实现。
  - 内部项目前后端双重防线禁止作为 pi cwd（`POST /api/sessions` 入口显式检查路径前缀）。

- **设备注册与在线状态（Task 31）**：
  - `POST /api/devices/register` 桌面设备注册，返回 `deviceId + token`（32 字节 hex）。
  - `POST /api/devices/heartbeat` 刷新 `last_seen_at`。
  - `GET /api/devices` 自动执行 `sweepOfflineDevices()`（超时 60s 设为 offline）。
  - `POST /api/devices/:deviceId/rename` 重命名设备。
  - 离线设备的项目禁止启动会话（409）。
  - 服务器设备内置（`ensureServerDevice()` 在 `index.ts` 启动时执行）。

- **Runtime Bundle（Task 32）**：
  - `GET /api/devices/:deviceId/bundle` 生成并返回 runtime bundle（manifest + files）。
  - Bundle 包含：全局 agents/skills（按设备 capability 过滤）、MCP/工具/权限/模型配置占位、启动上下文（MEMORY.md + Wiki/index.md）。
  - 设备专属 Skill 过滤：文件名含 `[mac]`/`[chrome]` 等 tag 时，只有设备 `skill_<tag>` capability 为 true 才下发。
  - `POST /api/devices/:deviceId/bundle/ack` 确认接收（预留）。

- **前端 API 扩展**：`packages/web/src/lib/api.ts` 新增 10 个 API 函数，覆盖内部项目创建、外部仓库注册、GitHub 克隆、归档、设备注册/心跳/重命名/Bundle 获取。

### DB 变更

- Migration v16：devices 表增加 `token` 字段（由 `CORE_TABLE_COLUMNS` repair 机制处理，不在 migration SQL 中 `ALTER TABLE` 避免 duplicate column）。
- Migration v16：projects 表 `device_id` 空字符串清理为 NULL；新增 `idx_projects_device_path` UNIQUE INDEX 实现同设备同路径唯一。
- Migration v21：合并任务 20-24 与任务 30-32 后用于幂等收敛 RAG / runtime bundle 表与索引，避免并行分支复用 13-17 迁移号时本机开发库漏表。

### 测试覆盖

- 后端 `task30-31-32.test.ts`：16 项测试覆盖内部项目创建、外部仓库注册、重复注册 409、归档、删除不删文件、有会话禁止删除、内部项目拒绝 cwd、设备注册、设备列表、心跳、超时离线、重命名、离线设备禁止会话、Bundle 生成、Mac-only Skill 过滤、Bundle ack。
- 前端 `task30-31-32.test.ts`：API 函数存在性验证 + 设备能力 Skill 过滤逻辑验证。
- 后端全量：377 passed（36 files）。前端全量：261 passed（35 files）。
- `npm run check`：通过，仅剩已有项目的 4 个未使用变量错误（与本次实现无关）。

### 关键经验

- **migration 与 repair columns 不重复**：新增列如果在 `CORE_TABLE_COLUMNS` 中已声明，`repairKnownTableColumns` 会在启动时自动补列；migration SQL 中不能再 `ALTER TABLE ADD COLUMN`，否则旧库会 duplicate column。本次 `token` 字段即通过此机制处理。
- **zod record 类型谨慎使用**：zod v4 的 `z.record(z.boolean())` 对 `{ skill_mac: true }` 这类 JSON 反序列化后的值（实际上是字符串 "true"）会报 invalid_key；改为 `z.record(z.any()).optional()` 并在代码层做类型断言更可靠。
- **设备能力契约**：Skill tag 与 capability key 的映射约定为 `skill_<tag>`（如 `skill_mac`），前后端统一。
- **token 不暴露在列表 API**：`serializeDevice` 默认不包含 `token`，只有 `POST /api/devices/register` 显式在响应体中附加，防止列表接口泄露敏感凭证。
- **Pi DefaultResourceLoader skill 目录结构要求**：Pi `loadSkills()` 要求 Skill 必须放在命名子目录中（如 `skills/my-skill/SKILL.md`），`SKILL.md` 必须有 YAML frontmatter 至少包含 `description` 字段，文件名必须是 `SKILL.md`。不能直接把 `.md` 文件放 skills 根目录。`getAgentsFiles()` 只查找 `AGENTS.md` 或 `CLAUDE.md`，其他命名不识别。
- **WebSocket E2E 禁止 mock 注入**：测试必须通过真实 `ws` 客户端连接 `ws://127.0.0.1:${port}/api/devices/:id/ws?token=...`，验证握手、ping/pong、sse_event 消息、run_request/run_result 自动响应。`afterAll` 中必须 `_clearMockConnectionsForTesting()` + 关闭 HTTP server 防止进程 hang。
- **Bundle ack 完整链路校验**：ack 必须校验 bundleId、contentHash、bundleVersion、projectId、projectPath、materializedHash 全部匹配。`device_bundle_served` 表已包含 project_id/project_path/materialized_hash。新增测试流程：GET bundle → materialize → compute materializedHash → POST ack → DB 验证。
- **Auth 稳定性根治**：`createAuthenticatedAgent` 彻底移除 login 重试，仅设置 `x-test-client-key` header 作为持久默认，完全绕过 session cookie 机制。`auth.test.ts` 中 rate-limit 测试使用独立 `getTestClientKey()` 获取独立 client key。vitest pool 保持 `forks`（threads 导致 hang 更严重）。`vitest-setup.ts` 不全局 reset auth singleton，避免 worker 复用时污染其他测试文件。
- **GitHub URL 安全边界**：clone 前必须检查 URL scheme（仅 http/https）、hostname（仅 github.com）、credential（username/password 拒绝）、path traversal（`/../` 拒绝）。`new URL(url).pathname` 用于解析 owner/repo，query/hash 不影响 repoName。注册失败时必须清理已创建的目录。
- **RAG 排除外部仓库**：`POST /api/files/upload` 到外部仓库路径时，必须在 `file_processing_status` 中排除记录，避免外部仓库内容混入 RAG 索引。
- **server 设备离线判定**：`matchingProject.deviceId !== 'server'` 避免 server 本地外部仓库被误判为桌面项目。server 本地外部仓库（deviceId='server'）应允许新建会话。

## 2026-05-15 任务 34 通知与建议中心

### 契约

- 通知中心是待处理系统事件入口，不进入 RAG，不替代聊天，也不做系统级推送。
- `notification_events` 是通知真源，字段包含 `source`、`related_type`、`related_id`、`actions_json`、`updated_at`、`handled_at`；合并后通知索引迁移版本为 22。
- `GET /api/notifications` 支持 `unhandled/all/failed/suggestions/handled` 筛选并返回计数；`info` 类型默认不进入 `unhandled`，只在 `all` 中可查。
- `POST /api/notifications/:eventId/actions` 支持 `dismiss`、`mark_handled`、`retry`、`accept_suggestion`、`reject_suggestion`、`open_related`。
- 接受建议时才写正式对象，当前支持 `task.update`、`task.create`、`milestone.update`、`milestone.create`，并继续走任务系统状态机。
- 建议应用和通知标记已处理必须在同一 SQLite transaction 中提交，避免正式对象写入和通知状态脱节。
- 文件处理失败和 RAG 失败通知关联 `file`，后台任务最终失败关联 `background_job`；重试动作恢复对应状态并重新入队。
- 重试动作必须确认对应失败记录存在；文件/RAG 重试在后台队列不可用时返回错误且不标记通知已处理。
- 动作接口必须先校验动作存在于当前通知可用动作；非法建议 payload 返回错误且通知状态不变。
- 文件/RAG 重试的失败状态恢复、取消旧任务和重新入队必须在同一数据库事务中完成。
- 关联对象回退只按 `event_type` 白名单读取 payload；普通信息里的同名字段不生成打开对象动作。
- 服务端默认补充非终态通知的安全生命周期动作 `mark_handled` 和 `dismiss`，生产方动作只负责领域语义。
- 左侧固定入口「通知」打开 `feature:notifications` 单例标签，并显示未处理数量；文件、会话、任务/里程碑、项目、自动化有明确打开路径，不支持详情页的 `background_job` 不返回无效打开动作。
- 前端通知动作按钮按 `notificationId:actionId` 做 pending 禁用，避免重复提交。

### 测试

- `notifications-api.test.ts` 覆盖列表/计数/动作推导、info 默认降噪、所有建议写入/拒绝、不可用动作、非法建议 payload、文件/RAG/background job 重试、队列缺失不改状态。
- `NotificationCenterView.test.ts` 覆盖渲染、重试动作、pending 禁用、打开关联文件/项目/自动化、筛选切换。
- `useNotifications.test.ts` 覆盖 composable 首次加载、空工作空间、筛选切换、动作刷新和错误回退。
- `WorkspacePage.test.ts` 覆盖固定入口顺序包含通知、通知入口单例标签、通知更新刷新。
- `npm run check`、`pnpm --filter @pi/server typecheck`、`pnpm test` 全部通过。

## 2026-05-15 任务 36 自动化规则运行与跳过

### 契约

- 自动化本质是定时创建普通 AI 会话并发送 prompt，不做 DAG、条件分支或复杂编排。
- `automation_rules.scope` 只能是 `workspace` 或 `project`；项目自动化必须有 `project_id`。
- `automation_runs` 是运行记录真源，状态为 `success`、`failed`、`skipped`，失败/跳过必须写 `reason`，成功应写 `session_id`。
- workspace 自动化在服务端运行；server 本地项目自动化在服务端运行；桌面项目自动化必须在项目绑定设备运行。
- 桌面项目离线或项目归档时，本次触发只写 `skipped` run，不转移到其他设备。
- 桌面项目在线运行时，服务端写轻量 `session_index(run_location='desktop')`，然后通过 desktop bridge 发送 `create_session` 和 `send_message`。
- 自动化失败或跳过写 `automation.failed` / `automation.skipped` 通知，关联 `automation`，动作包含打开自动化和重试。
- 通知中心重试自动化时重新走自动化调度逻辑并写新 run；如果仍失败或跳过，会生成新通知。
- `automation.skipped` 通知即使没有生产方动作，也必须由通知中心默认派生 `retry`。
- 桌面项目会话的 `session_index.workspace_path` 写项目实际运行路径，不写默认工作空间路径。
- 自动化页必须暴露运行上下文、项目绑定和运行历史，不能只隐藏在 cwd 字段里；失败/跳过历史可直接重试。
- `automation_runs` 需要启动期缺表/缺列 repair，不能只依赖迁移版本号。

### 测试

- `automation-api.test.ts` 覆盖规则列表/创建/启停/删除/立即运行、scope/project 保存、`automation_runs` 写入、离线项目 skipped、通知写入。
- `notifications-api.test.ts` 覆盖 `automation.skipped` 默认重试动作。
- `ridge-db-migration.test.ts` 覆盖当前版本库缺失 `automation_runs` 时的自修复。
- `AutomationRuleEditor.test.ts` 覆盖项目 scope、运行历史展示和历史重试按钮。
- `npm run check` 通过。
- `npm run build --workspace @pi/server` 通过。

## 2026-05-15 V2 阶段 3 桌面端与本机项目上线闭环

### 收口结论

- V2 阶段 3 已归档到 `文档/功能开发/归档/45-V2阶段3桌面端与本机项目上线闭环.md`。
- `文档/功能开发/index.md` 已把 Task 14、30、31、32 和阶段 3 汇总项标为完成；30/31/32 单项任务已移入 `文档/功能开发/归档/`。
- 阶段 3 的完成口径不是新增兼容层，而是确认当前真实链路：设备注册/token/心跳/离线清理、WebSocket 调度、runtime bundle 下载/物化/ack、桌面会话 SSE 回传、离线拒绝、桌面采集入口、使用 Pi 默认 `~/.pi/agent`，ridge 覆盖式写入配置。

### 验收证据

- `task30-31-32.test.ts` 覆盖项目注册、设备注册、离线拒绝、bundle 生成、bundle ack 完整链路、真实 WebSocket E2E、server 不保存桌面消息正文。
- `websocket-e2e.test.ts` 覆盖真实 ws 连接、ping/pong、run_request/run_result 和 SSE 回传。
- `desktop-bundle-sync.test.ts` 覆盖桌面端 bundle sync、物化目录和 ack。
- `security-guards.test.ts` 覆盖桌面会话 ask、permission、cancel、归档只读边界。
- `desktop-bridge.test.ts` 与 `FleetingCaptureButton.test.ts` 覆盖 Tauri 桌面桥接、采集入口、离线和未登录限制。

### 文档同步

- `文档/项目设计/V2最终上线计划.md` 阶段 3 已标归档。
- `文档/开发进展/项目完成情况可视化.html` 已移除“桌面端真实物化闭环”为剩余缺口的陈旧描述。

### 阶段 3 复验修复

- 复跑桌面/设备目标测试时，`task30-31-32.test.ts` 的“upload API 跳过外部仓库路径”暴露 400：外部仓库上传已跳过 RAG，但仍无条件调用 `commitWorkspaceVersionPoint`，隐藏版本点要求文件在 `~/ridge-workspace` 内。
- 修复在 `routes/workspace-data.ts`：文件页 create/move/delete/upload 先过滤工作空间内文件，只有工作空间文件才创建隐藏版本点；外部仓库文件继续执行真实文件操作，但不进入工作空间隐藏版本。

## 2026-05-16 V2 阶段 4 备份恢复设置错误边界

### 收口结论

- V2 阶段 4 已归档到 `文档/功能开发/归档/46-V2阶段4备份恢复设置错误边界.md`。
- `GET /api/workspace/backup` 生成 ZIP：`server/ridge.db` + `workspace/**` + `.ridge/graph.kuzu`，排除 `.ridge/rag`、`.ridge/cache`、`.ridge/runtime`、`.ridge/fleeting-attachments`，并跳过符号链接。
- `backup-manifest.json` 是恢复校验真源，记录 `formatVersion`、`appName`、创建时间、包含/排除路径、可重建索引、文件 `path/size/sha256`。
- `POST /api/workspace/restore` 先创建 pre-restore 快照，校验 manifest/checksum 后整包替换 `ridge.db` 与 workspace；失败回滚原 DB 和原工作空间。
- `/api/system/info` 现在返回数据目录、数据库路径、默认工作空间、服务状态和设备在线汇总；设置页展示这些状态，并提供备份下载与恢复包上传。
- `ErrorBoundary.vue` 已包裹工作台主要 tab，局部异常不再导致整个工作台白屏。

### 验收证据

- `workspace-backup.test.ts`
- `workspace-backup-api.test.ts`
- `SettingsTabContent.test.ts`
- `ErrorBoundary.test.ts`
- `npm run typecheck`

## 2026-05-16 任务 52 Android 闪念捕捉

### 收口结论

- Android 捕捉页真源在 `packages/mobile/src/features/capture/CapturePage.vue`，支持文字、录音、拍照、相册图片、附件删除和组合保存。
- 移动端草稿队列保存文字、附件 URI、文件名、MIME、大小和 base64 内容；上传失败保留 `failed` 草稿，可按同一提交器重试，成功后删除本地草稿。
- 录音状态机收口为 `idle -> recording -> preview -> uploading -> done/failed`，删除预览录音回到 `idle`。
- 服务端新增 `POST /api/mobile/captures`，位于普通 API auth 前，但必须通过 Android `deviceId + token`；非 Android 或 token 错误返回 401。
- 移动捕捉仍写现有 `fleeting_notes` 和 `fleeting_attachments`，附件落在 `.ridge/fleeting-attachments/{noteId}/`，并触发现有 fleeting analysis；不引入移动端独立闪念模型。
- 附件写入和移动捕捉接口均做失败清理，避免半条闪念、孤儿附件记录或已落盘但无 DB 记录的临时文件。

### 验收证据

- `task52-mobile-capture.test.ts` 覆盖 Android token 成功创建闪念和附件、错误 token 不写入、非法附件不产生半条闪念。
- `media-draft-storage.test.ts`、`capture-attachment.test.ts`、`recording-state.test.ts`、`mobile-capture-submitter.test.ts`、`CapturePage.test.ts` 覆盖移动端草稿、附件转换、录音状态、失败保留和捕捉页提交。
- `npm run check` 通过。

## 2026-05-16 任务 53 Android 轻对话

### 收口结论

- Android 轻对话复用现有 `/api/sessions`、`/messages`、`/attachments`、`/events`、`/cancel` 主线，不新增移动端会话模型。
- 服务端允许有效 Android 设备 `Bearer` token 访问 `/api/sessions*`；无效 Bearer token 返回 401，普通 Web/桌面 Cookie 鉴权保持原逻辑。
- Android token 创建会话时服务端默认使用当前默认工作空间，写普通 `workspace` 会话，并在 `session_index` 中收口为 `run_location='server'`。
- Android 创建会话拒绝 `cwd`、分叉、桌面/项目/task-only 相关参数和 `task-agent`，避免移动端暴露服务器路径或创建任务处理会话。
- 移动端轻对话实现包含基础会话列表、新建/继续、文本发送、图片/录音附件上传、SSE 合并、取消生成和失败草稿保留。
- 原生 `EventSource` 不能设置 Authorization header，因此移动端 SSE 使用 `?token=<android-token>`，其他会话请求继续使用 Bearer header。

### 验收证据

- `task53-mobile-chat.test.ts` 覆盖 Android token 创建普通 server 会话、拒绝 cwd/分叉/task-only agent、错误 token 不创建会话、messages/cancel 入口。
- `mobile-chat-api-client.test.ts`、`mobile-chat-sse.test.ts`、`mobile-chat-store.test.ts` 覆盖移动端 token API、SSE 合并、发送失败保留和最终回复清草稿。
- `ChatPage.test.ts` 覆盖移动端新建会话、发送文本、流式回复展示、取消生成和发送失败草稿保留。

## 2026-05-16 任务 54 Android 任务查看与轻操作

### 收口结论

- Android 任务页复用现有工作区任务和处理会话 API，不新增移动端任务模型。
- 服务端允许有效 Android `Bearer` token 访问受限工作区任务入口：任务列表/详情、项目摘要 GET、任务状态 PATCH、处理会话 GET/POST。
- Android token 的任务 PATCH 被前置守卫收口为 `{ status, actor: "user" }`；标题、优先级、项目绑定、里程碑、blockedReason、sortOrder、删除任务、项目创建/修改/删除均返回 403。
- 移动端 `TasksPage.vue` 按待办、进行中、审核中、已完成展示任务；`blocked` 保留服务端原状态并归入移动端“进行中”组，不改写任务状态。
- 移动端状态操作走服务端状态机，失败时 `mobile-task-store.ts` 回滚乐观更新并保留错误信息。
- 任务处理会话按钮调用 `POST /api/workspace/tasks/:taskId/processing-session`，成功后进入 `/chat?sessionId=<id>`；轻对话页会选择 query 中的会话并加载消息。

### 验收证据

- `task54-mobile-tasks.test.ts` 覆盖 Android token 读取任务/项目摘要、状态轻操作、非法状态流转拒绝、越权任务/项目操作拒绝、继续已有处理会话。
- `mobile-task-api-client.test.ts`、`mobile-task-store.test.ts`、`TasksPage.test.ts` 覆盖移动端 token API、分组、失败回滚、详情和处理会话跳转。
- `ChatPage.test.ts` 复测轻对话页。

## 2026-05-17 全局搜索极简体验

### 产品结论

- 搜索页是内容查找入口，不是知识系统控制台。
- 用户概念里没有 `Wiki`、`记忆`、`RAG`、`MCP` 等内部类别；搜索 UI 不展示类型筛选、类型分组或类型标签。
- 后端仍可保留类型、时间、项目、目录等查询能力给内部调用；前端默认只给一个搜索框和扁平结果列表。
- 知识诊断继续读真实 `/api/workspace/knowledge/diagnostics`，但只在异常时用用户语言提示「内容暂时搜不到」，并提供「重新整理」动作。

### 验收证据

- `WorkspaceSearchView.vue` 已移除筛选控件、类型分组、索引状态面板和普通结果刷新按钮。
- `WorkspaceSearchView.test.ts` 覆盖极简空态不暴露内部知识分类、异常重新整理、搜索只传 `q + limit`、普通结果不显示类型标签或手动刷新。
- `cd packages/web && pnpm exec vitest run src/components/workspace/__tests__/WorkspaceSearchView.test.ts` 通过。

## 2026-05-17 左侧导航项目会话化

### 产品结论

- 工作台主左栏是导航与会话列表，不是文件管理面板。
- 主左栏只承载固定功能入口、工作空间会话、项目/项目会话和归档，且工作空间会话在项目区上方。
- 文件树、文件上传、新建文件夹、移动、删除和转换只属于右侧"文件"标签页。
- 项目区可以放添加项目入口；设备入口按第一版设计打开设置页设备状态，不新增独立设备页。

### 验收证据

- `WorkspaceSidebar.vue` 已移除 `FileTreePanel` 和笔记/文件夹/Canvas/Base 新建按钮。
- `WorkspacePage.vue` 通过 `ProjectSelectorDialog` 注册外部项目，设备入口打开 `feature:settings`。
- `file-manager.ts` 的目录枚举会跳过失效 symlink、无权限条目和越界 symlink，避免项目选择器被 Home 目录里的坏链接阻塞。
- `cd packages/web && pnpm exec vitest run src/pages/__tests__/WorkspacePage.test.ts src/pages/WorkspacePage.note-reliability.test.ts src/lib/__tests__/session-sidebar.test.ts` 通过。
- `pnpm --filter @pi/server test -- src/__tests__/file-manager.test.ts` 通过。

## 2026-05-17 主页工作台启动区

### 产品结论

- 主页是 ridge 工作台启动区，不是固定会话页；打开主页仍不创建 Pi 会话。
- 主页首屏需要同时表达工作空间身份、当前路径、状态摘要和完整 AI composer。
- 模型、Agent、思考强度、附件和快捷动作都留在主页 composer；快捷动作继续只写入草稿。
- 最近事情、最近文件和 AI 建议保留为下方扫描区，服务于创建下一条会话前的上下文感知。

### 验收证据

- `HomePage.vue` 已改为工作台启动区布局，包含 `home-command-center` 和 `home-context-rail`。
- `HomePage.test.ts` 覆盖新布局、路径/状态摘要、完整 selector、附件、快捷动作、发送状态和失败保留。

## 2026-05-17 全站样式重构 - 设计令牌系统

### 产品结论

- 全站 40+ 组件完成魔法数字替换，引入语义化设计令牌（design tokens），统一字号、边框、背景三层语义。
- 字体从 Manrope 切换到 Inter Variable（`@fontsource-variable/inter`），更现代专业。
- 页面级重设计完成：HomePage（扁平命令行风格）、InboxView（全宽处理工作台）、TaskView（看板/列表/日历/里程碑统一）、WorkspaceSearchView（类型图标 + 筛选芯片）、NotificationCenterView（彩色图标 + 状态点）。
- 网页端采集从 9 种模式精简为 3 种（文字/文件/录音），去掉不可用的截图/选区/剪贴板/网址采集。

### 设计令牌规范

| 层级 | Token | 值 | 使用场景 |
|------|-------|-----|---------|
| **字号** | `text-micro` | 10px | 计数、时间戳、标签 |
| | `text-caption` | 11px | 次要说明、空状态提示 |
| | `text-body-sm` | 12px | 列表项正文、表单标签 |
| | `text-body` | 13px | 默认正文、按钮文字 |
| | `text-body-lg` | 15px | 输入框、稍大正文 |
| | `text-hero` | 16px | 标题、首屏大字 |
| **边框** | `border-subtle` | 30% 透明度 | 分隔线、卡片边框 |
| | `border-default` | 50% 透明度 | 输入框边框、列表分隔 |
| | `border-strong` | 80% 透明度 | 激活态、重要分隔 |
| **背景** | `bg-subtle` | 20% 透明度 | 悬浮背景、表头 |
| | `bg-soft` | 40% 透明度 | 行悬停、芯片背景 |
| | `bg-hover` | 60% 透明度 | 按钮悬停、下拉项选中 |

### 迁移规则

- **字号**：所有 `text-[Npx]` 魔法数字 → 对应 Token；`text-xs` 保留为 12px 基线。
- **边框**：`border-border` / `border-border/XX` → `border-default`；`border-muted` → `border-subtle`。
- **背景**：`bg-muted/XX` → `bg-subtle`（20%）或 `bg-soft`（40%）或 `bg-hover`（60%）。
- **Input/Button/SelectTrigger**：使用 CVA `size="sm"`（32px），禁止手动覆盖 `h-7`/`h-8`。
- **全局基础**：`style.css` import Inter + `design-tokens.css`；滚动条统一冷灰蓝；`::selection` 用 `color-mix`。

### 验收证据

- `design-tokens.css` 定义 6 字号 + 3 边框 + 3 背景 `@utility`。
- `npm run check`（vue-tsc）通过，0 新增类型错误。
- `cd packages/web && pnpm exec vitest run` 312/312 通过。
- 7 个主题文件审查确认兼容新 Token。
- `cd packages/web && pnpm test src/components/workspace/__tests__/HomePage.test.ts` 通过。

## 2026-05-17 对话记忆抽取细化

- [module:memory][2026-05-17] 对话记忆 L1 以日期 Markdown 为真源。2026-05-20 后 daily 会话条目直接写 Markdown 摘要，不再写结构化 Atom。
- [module:memory][2026-05-17] L2 Scenario 写入 `记忆/scenarios/<scenario-slug>.md`。2026-05-20 后由真实 `memory-agent` 基于 daily 维护，不再要求引用旧结构化条目 ID。
- [module:memory][2026-05-17] L3 `MEMORY.md` 只保留启动注入需要的当前有效结论，每条使用 `[scope][date]` 格式；敏感信息、非法 scope/date 和无引用 Scenario 会被过滤。

## 2026-05-18 Chrome 浏览器阅读插件

- [module:capture][2026-05-18] Chrome 插件应注册为 `browser` 设备，只做浏览器采集入口；进入闪念的浏览器内容只保存脱敏 URL，后续沉淀交给现有闪念处理、RAG、图谱、Wiki 和后台 Agent。
- [module:capture][2026-05-18] 浏览器自动采集必须依赖真实阅读信号，且服务端保存 URL 前删除敏感 query 和 `utm_*` 跟踪参数。
- [module:capture][2026-05-20] 浏览器 URL 仍作为 `browser` 设备写入闪念 DB；旧的人工 `process/clip` 剪藏动作已移除，后续沉淀应走 AI 主导链路而不是前端手动按钮。
- [module:converter][2026-05-18] Converter 处理 `input.url` 网页且 URL 路径无扩展名时，必须按 `mimeType` 或响应 `Content-Type` 补临时扩展名，例如 `text/html` 补 `.html`，让 MarkItDown 走 HTML 转换路径。

## 2026-05-18 工作空间隐藏版本 ignore

- [module:workspace-version][2026-05-18] 隐藏版本 ignore 是服务端契约，不是 UI 展示规则；`.DS_Store`、`.ridge`、`.git`、依赖目录、构建产物和缓存目录必须在 status、diff、commit 三条路径同时过滤。

## 2026-05-19 闪念分析结构化输出

- [module:fleeting][2026-05-19] 已被 2026-05-20 内置闪念 Agent 真实处理取代：早期结构化建议工具只用于生成建议，不再是当前实现。
- [module:fleeting][2026-05-19] 已被 2026-05-20 内置闪念 Agent 真实处理取代：早期系统提示词替换/`pi-ai complete()` 路径不再是当前实现。
- [module:fleeting][2026-05-20] 已被 2026-05-20 内置闪念 Agent 真实处理取代：当前实现需要内存 `AgentSession`，不再直接调用 `@mariozechner/pi-ai complete()`。
- [module:fleeting][2026-05-20] Web 文件/音频闪念附件默认走 multipart 上传到 `.ridge/fleeting-attachments/<noteId>/`，不能把文件、PDF、Word、Markdown 或音频读成 base64 塞进 JSON。闪念 Agent worker 启动前提取附件正文：文本类读前缀，PDF/Word/音频/图片走 Python Converter 转 Markdown/转写/OCR，并按字符预算截断后放入内部 Agent prompt。

## 2026-05-20 分屏主页关闭

- [module:workspace-shell][2026-05-20] `home` 是会话入口但也是普通可关闭标签；根工作台只剩最后一个标签时保留一个主页入口，分屏 pane 的最后一个标签关闭后必须收起 pane，不能用新的主页占位替换。

## 2026-05-20 全局权限基线

- [module:agent-permission][2026-05-20] `~/.pi/agent/permissions.json` 是可选全局权限基线；文件不存在或未配置某个权限键时仍默认 `allow`。
- [module:agent-permission][2026-05-20] 全局 `default` / `defaults` 可被 Agent frontmatter 的 `permission` 覆盖，适合 `default.task: deny` 后只给特定 Agent 配 `permission.task: allow`。
- [module:agent-permission][2026-05-20] 全局 `locked` 是硬拒绝层，只接受 `deny`，优先于 Agent 权限和运行时 `always` 授权；永久敏感文件路径应放入 `locked.read`。
- [module:agent-permission][2026-05-20] 子代理主工具和权限键统一为 `subagent`；规划工具仍归 `task`。`subagent: deny` 同时移除主工具和两个辅助工具，辅助工具不单独审批。

## 2026-05-20 内置闪念 Agent 真实处理

- [module:fleeting][2026-05-20] 闪念后台处理现在启动不可见内置 `fleeting-agent` 的内存 `AgentSession`，由真实 Agent 直接读写工作空间、运行 bash、使用任务/里程碑规划工具完成沉淀。
- [module:fleeting][2026-05-20] 闪念内部会话不保存 transcript，但会注入与普通会话同源的工作空间记忆/Wiki 上下文。
- [module:fleeting][2026-05-20] `fleeting-agent` 是内部 Agent：`visible:false`、前端 `/api/agents` 不返回、普通会话不能选择、普通 Agent 不能通过 `subagent` 调用；权限只显式拒绝 `ask: deny` 和 `subagent: deny`。
- [module:fleeting][2026-05-20] 闪念 Agent 完成后必须调用统一 `complete_internal_task`；`completed` 写 `status='processed'` 与 `analysis_status='processed'`，`failed` 写 `analysis_status='failed'` 与 `last_error`。
- [module:fleeting][2026-05-20] 旧的闪念建议 schema 已被真实处理完成工具取代；Agent 异常或未调用完成工具走后台 job 重试/最终失败路径。
- [module:internal-agent][2026-05-20] 内部 Agent 统一使用 `complete_internal_task({ status, summary, error? })` 汇报结果；工具由 worker 绑定 agent/job/相关对象，Agent 不传 note_id、session_id 或对象列表。
- [module:memory][2026-05-20] summary agent 使用基础 `@mariozechner/pi-ai complete()`，不创建 `AgentSession`，只输出 daily Markdown；memory-agent 是真实不可见内部 Agent，维护 `记忆/MEMORY.md` 与 `记忆/scenarios/*.md`。
- [module:memory][2026-05-20] `memory-agent` 权限固定为 `ask/subagent/bash: deny`，编辑只允许 `记忆/MEMORY.md` 与 `记忆/scenarios/*`，完成后调用 `complete_internal_task`。
