# openchamber 中间对话区与输入框功能梳理

## 文档目的

- 研究 `openchamber` 中间主对话区与底部输入区的真实代码能力边界。
- 为当前项目后续设计“中间会话区 + 输入框工作台”提供事实依据。
- 左侧会话栏的能力已有单独文档，本篇只补充与中间区、输入框直接相关的联动能力，不重复左栏全文。

## 研究范围

本次主要阅读了 `openchamber` 里的以下入口：

- `packages/ui/src/components/views/ChatView.tsx`
- `packages/ui/src/components/chat/ChatContainer.tsx`
- `packages/ui/src/components/chat/MessageList.tsx`
- `packages/ui/src/components/chat/ChatMessage.tsx`
- `packages/ui/src/components/chat/ChatInput.tsx`
- `packages/ui/src/components/chat/hooks/useChatTimelineController.ts`
- `packages/ui/src/components/chat/hooks/useChatTurnNavigation.ts`

## 总体结论

openchamber 的中间区不是“消息列表 + 输入框”这么简单，而是一个围绕 **session、turn、历史窗口、交互阻塞、输入增强、工作流切换** 设计出来的对话工作台。

它的核心特征可以概括为：

1. **中间区是 session-aware 的时间线容器**，不是只负责把消息平铺出来。
2. **消息展示单位已经从单条 message 上升到 turn**，并支持 turn 窗口、历史加载、跳转和恢复到底部。
3. **输入框是独立工作台**，同时承载草稿、队列、附件、命令、技能、文件引用、agent 指派、模型选择、语音、拖拽等能力。
4. **会话切换与输入区是强绑定的**，草稿、队列、待恢复输入、会话级 agent 选择都不是页面级临时状态。
5. **很多能力都已经不是 UI 装饰，而是产品语义**，例如父子会话回退、阻塞请求卡片、queued message、会话级 draft、输入模式切换。

---

## 一、中间主对话区能力

### 1. 结构入口非常薄，但编排层非常厚

- `ChatView.tsx` 几乎只是把当前 `sessionId` 包给 `ChatErrorBoundary` 和 `ChatContainer`。
- 真正的能力都在 `ChatContainer.tsx`：
  - 当前 session 选择
  - 新会话 draft 自动打开
  - 消息加载与增量历史加载
  - turn 时间线控制
  - 滚动跟随与恢复
  - 父子会话回退
  - 阻塞卡片渲染
  - 空态与正常态切换

这说明 openchamber 的中间区不是靠页面组件堆出来的，而是靠一个中心 orchestrator 统一编排。

### 2. 中间区天然绑定当前 session，而不是全局聊天流

`ChatContainer` 内部直接从 session store 读取：

- `currentSessionId`
- `piSessions`
- `sessionHistoryMeta`
- `streamingMessageIds`
- `messageStreamStates`
- `sessionMemoryState`
- `permissions`
- `interactiveRequests`

也就是说，中间区的展示不是“前端自己维护一份 message 数组”，而是直接消费会话级状态投影。

### 3. 没有当前会话时，会自动进入 new session draft

`ChatContainer` 里有显式逻辑：当没有 `currentSessionId` 且没有草稿态时，会主动 `openNewSessionDraft()`。

这代表 openchamber 不是“必须先有会话才能打开中间区”，而是支持一种明确的 **新会话草稿态**：

- 左栏或项目切换后，可以先进入草稿态
- 中间区直接展示输入能力
- 等用户真正发送时，再进入真实 session 生命周期

这个能力对当前项目很关键，因为它决定了中间区不能只依附于“已存在 session”。

### 4. 父子会话关系在中间区也有入口，不只存在左栏

如果当前 session 有 `parentID`，`ChatContainer` 会显示一个 `Return to parent` 按钮。

这说明 openchamber 的父子会话不是左侧树形结构里的静态信息，而是中间区的真实导航能力：

- 用户可以从子会话直接回退父会话
- 父子关系影响中间区的导航和用户心智
- 会话树和中间聊天面板是联动设计，不是两个孤立模块

### 5. 中间区不是按“所有消息”渲染，而是按 turn 窗口控制

`ChatContainer` 会把当前 session 交给：

- `usePiNativeTurns()`
- `useChatTimelineController()`
- `useChatTurnNavigation()`

这三层组合起来形成了 turn-based 时间线能力：

1. 先把 Pi 原生消息投影成 turn 结构
2. 再按窗口裁切当前应该展示的 turn 范围
3. 再提供 turn 跳转、恢复到底部、定位某条消息等导航能力

这已经不是普通聊天列表，而是 **带历史窗口和可导航时间线的会话阅读器**。

### 6. 历史不是一次性全读，而是按窗口和信号逐步加载

中间区内存在这些能力：

- `loadMessages`
- `loadMoreMessages`
- `historyMeta`
- `hasMoreAbove`
- `isLoadingOlder`
- `loadEarlier()`

结合 `useChatTimelineController.ts`，可以确定 openchamber 的历史机制不是简单无限滚动，而是：

- 先显示当前窗口附近的 turn
- 有更老历史时给出显式信号
- 用户上滚或触发动作后，再向上加载
- 加载完后还要维护滚动锚点，不让视图跳动

### 7. 中间区内置“恢复到底部”与“脱离底部”的双状态

`ChatContainer` 结合 `useChatScrollManager()` 和 `ScrollToBottomButton` 管理：

- 当前是否 pinned 到底部
- 是否发生 overflow
- 是否需要显示“回到底部”按钮
- 程序性滚动和用户主动滚动的区别

这说明 openchamber 不是默认粗暴自动滚到底，而是把“阅读旧内容”和“跟随最新输出”视为两种不同状态。

### 8. 中间区能识别 busy / retry / compacting 等会话阶段

`ChatContainer` 会把当前 session 状态映射为：

- `idle`
- `busy`
- `retry`

并用这个状态控制：

- 是否自动滚动到底部
- 是否展示加载骨架和流式状态
- activeNow / recent 类能力的联动

这意味着中间区不是只看“有无新消息”，而是明确感知 agent 当前执行阶段。

### 9. 消息列表不是简单 map，而是重型虚拟列表

`MessageList.tsx` 使用了 `@tanstack/react-virtual`，并且定义了：

- 消息虚拟化阈值 `40`
- 移动端和桌面端不同的 overscan
- turn 级估算高度
- `Virtualizer`
- DOM offset / rect 观察

说明 openchamber 预设中间区会承载较长会话，不是面向短对话 demo。

### 10. 渲染单元不只有消息，还有阻塞卡片

`MessageList.tsx` 和 `ChatContainer.tsx` 里除了 `ChatMessage`，还会插入：

- `PermissionCard`
- `QuestionCard`
- interactive request 相关卡片

也就是说，中间区不是“用户消息 + assistant 消息”二元结构，而是会插入工作流节点：

- 权限请求
- 需要用户回答的问题
- 阻塞式交互

这对 Pi 很重要，因为 Pi 本身就支持需要用户继续输入、确认、选择的会话流。

### 11. 中间区支持时间线对话框和 turn 导航

`ChatContainer` 还接了 `TimelineDialog`，并把以下能力交给 `useChatTurnNavigation()`：

- `scrollToTurn`
- `scrollToMessage`
- `resumeToLatest`
- 按 turn 偏移跳转

这意味着 openchamber 已经把“长会话导航”当成独立能力，而不是只依靠浏览器原生滚动。

### 12. 空态不是占位图，而是新会话工作入口

`ChatEmptyState` 的存在说明：

- 没消息时有专门空态
- 空态与 `ChatInput` 是联动的
- 中间区即使没有消息，也仍然是一个可操作的工作区

因此 openchamber 的中间区生命周期至少有三态：

1. 新会话草稿态
2. 正常消息态
3. 历史/加载/阻塞混合态

---

## 二、输入框工作台能力

### 1. 输入框是独立的工作台，不是简单 textarea

单看 `ChatInput.tsx` 的体量就能确认：它不是输入组件，而是一个完整子系统。

它内部至少直接管理了这些状态：

- 文本内容
- 输入模式 `normal / shell`
- 拖拽意图 `attach / insert-path`
- 文件提及补全
- 命令补全
- 技能补全
- 自动补全 tab 切换
- 文本框高度
- 移动端控制面板
- 历史输入浏览索引
- 本地草稿持久化
- 中断指示态
- 已附加文件
- 待恢复输入
- session 级 agent 保存

这已经说明 openchamber 的输入区是“工作台底座”。

### 2. 草稿按 session 隔离持久化，不是全局草稿

`ChatInput.tsx` 显式用 `localStorage` 维护：

- `ridge_chat_input_draft_${sessionId ?? 'new'}`

并且：

- 进入组件时会先读当前 session 的 draft
- 切 session 时会切换到对应 draft
- 空白 draft 会被清除
- 新会话草稿态也有独立 key

这意味着 openchamber 把“未发送输入”视为会话资产，而不是页面临时值。

### 3. 输入模式不止一种，至少区分 normal 和 shell

`ChatInput` 内部有：

- `inputMode = 'normal' | 'shell'`

这说明 openchamber 并不把所有输入都当自然语言 prompt，而是支持一种明显不同的 shell/命令输入工作流。

这对当前项目的意义很大：

- 如果 Pi 要成为工作台，输入框就不能只做聊天框
- 输入模式会直接影响发送语义、提示文案和快捷键行为

### 4. 队列模式是输入区的一等能力

`ChatInput` 内部接入了 `messageQueueStore`，并区分：

- `queueModeEnabled`
- `queuedMessages`
- `queuedOnly`
- `handleQueueMessage()`

实际发送时，它不是只发当前文本，而是会先合并：

1. 已排队消息
2. 当前输入文本
3. 当前附加文件
4. inline 文件提及产生的附件
5. synthetic parts

这说明 openchamber 的输入区支持一种“先排多个意图，再统一发送”的工作方式，而不是只支持单条 prompt。

### 5. Enter / Ctrl+Enter 语义会随 queue mode 切换

`ChatInput` 中明确有一套规则：

- queue mode 开启时：`Enter` 优先加入队列，`Ctrl+Enter` 直接发送
- queue mode 关闭时：`Enter` 直接发送，`Ctrl+Enter` 改为入队

说明它把快捷键定义为产品行为，而不是浏览器默认行为。

### 6. 输入框内支持 agent mention，不只是文本提及

`ChatInput` 会调用 `parseAgentMentions()`，并从消息内容里识别 `@agent`。

它的效果不是纯高亮，而是会进入发送语义：

- 从输入文本中抽出 agent mention
- 作为 `agentMentionName` 参与真正 `sendMessage()`
- 并保存会话级 agent 选择

这说明 `@agent` 在 openchamber 里已经是调度语义，不是装饰语法。

### 7. 输入框内支持 inline 文件提及，并自动转成附件

`extractInlineFileMentions()` 会从输入文本里抽取文件 mention，并转成真正的 `attachments`。

因此 openchamber 不只是“上传附件”这一路径，还支持：

- 文本中直接提文件
- 自动识别文件 token
- 发送前把文件加入 attachment 列表
- 在消息里保留更自然的表达方式

这是一个比传统“点附件按钮”更强的上下文输入模型。

### 8. 自动补全至少分三类：prompts / agents / files

`ChatInput` 的自动补全有明确 tab：

- `prompts`
- `agents`
- `files`

相关组件包括：

- `FileMentionAutocomplete`
- `CommandAutocomplete`
- `SkillAutocomplete`

说明 openchamber 输入增强不是单点能力，而是多源补全系统：

- prompt/命令片段
- agent 选择
- 文件引用
- skill 发现

### 9. 技能补全与命令补全是独立能力，不依附文件补全

这两种补全不是“顺手加的菜单”，而是独立组件：

- `CommandAutocomplete`
- `SkillAutocomplete`

这表示输入区已经承担“发现系统能力”和“选择执行方式”的入口职责。

换句话说，输入框不仅在收文本，也在收 workflow intent。

### 10. 输入框支持 quick actions，不必每次从空白开始写

`ChatInput.tsx` 里有固定快捷动作：

- `继续`
- `反思计划`
- `检查实现`

说明 openchamber 认为用户很多时候不是自由创作 prompt，而是在当前上下文上触发高频动作。

这类 quick action 对 Pi 也很重要，因为 Pi 的核心场景本身就是连续工作，不是一次性问答。

### 11. 附件能力不是简单上传，而是多入口接入

openchamber 的附件至少有这些入口：

- 显式附件按钮
- inline 文件 mention
- 粘贴文本/内容插入
- 拖拽文件到输入区
- VS Code runtime 下通过 `/api/vscode/drop-files` 处理 dropped files
- Tauri shell 下处理本机路径拖拽

这说明输入区是一个上下文采集面，而不只是一个发送文本的地方。

### 12. 拖拽时区分 attach 和 insert-path 两种意图

`ChatInput` 内部的拖拽意图是：

- `attach`
- `insert-path`

这点很关键：

- 同样是拖文件进来，不一定都应该变成附件
- 有些场景应该只插入路径，保留轻量引用
- 有些场景才应该真正上传/附带内容

这说明 openchamber 对“文件进入对话”的语义分得很细。

### 13. 输入框支持待恢复输入与 synthetic parts 注入

`ChatInput` 会消费 store 中的：

- `pendingInputText`
- `consumePendingInputText()`
- `consumePendingSyntheticParts()`

这代表系统里其他动作可以把内容回填到输入框，例如：

- 某个操作取消后把原文本退回
- 某个外部对话框把构造好的片段塞回输入区
- 某个 workflow 先准备好 synthetic context，再等用户确认发送

输入框因此是全系统的汇合口，而不是孤立组件。

### 14. 输入框支持语音入口，而且有 conversation mode

`ChatInput` 直接引入 `BrowserVoiceButton`，而相关 hook 中还有 `conversationMode` 概念。

这说明 openchamber 的语音不是单次听写，而是在尝试做连续对话模式：

- 语音转文本
- 根据模式决定是否直接发送
- 与当前 session、模型、agent 绑定

### 15. 输入框支持模型、provider、agent 的会话内控制

`ChatInput` 直接接入：

- `ModelControls`
- `UnifiedControlsDrawer`
- `MobileAgentButton`
- `MobileModelButton`
- `useConfigStore()` 里的 provider/model/variant/agent

说明输入框下方那条控制区并不是附属设置，而是与本次发送强相关的上下文控制条。

### 16. 输入框支持移动端专门交互，而不是桌面布局硬缩放

`ChatInput` 里有这些移动端状态：

- `mobileControlsOpen`
- `mobileControlsPanel`
- `isKeyboardOpen`
- `inputBarOffset`

说明 openchamber 不是用同一套桌面输入 UI 直接缩到移动端，而是专门分了：

- 控制面板弹出方式
- 输入条偏移
- 键盘占位影响
- 移动端 agent / model 入口

### 17. 输入框支持可扩展高度与 focus mode

输入区内有：

- 动态测量 `textarea` 高度
- `MAX_VISIBLE_TEXTAREA_LINES = 8`
- `isExpandedInput`
- `setExpandedInput()`
- `expand_input` 快捷键

说明输入框并不是固定一行或固定高度，而是有“普通输入”和“展开专注输入”两种使用模式。

### 18. 输入框支持消息历史回看，不只是当前草稿

它内部维护：

- `historyIndex`
- `draftMessage`

并基于上下键在历史输入和当前草稿之间切换。

这说明输入区不仅面向本次输入，也保留了命令行式的历史召回能力。

### 19. 中断当前执行是输入区的一等操作

`ChatInput` 使用了：

- `abortCurrentOperation()`
- `abortPromptSessionId`
- `clearAbortPrompt()`
- `showAbortStatus`

并专门提供停止图标和状态反馈。

也就是说，输入区的主按钮不只是“发送”，在执行中还能切换为“停止当前操作”。

### 20. 输入框承载了项目 / worktree / 目录上下文联动

从 `ChatInput` 中读取的 store 可以看到它会感知：

- `projects`
- `activeProjectId`
- `availableWorktreesByProject`
- `currentDirectory`
- `setDirectory()`

这说明 openchamber 的输入区并不是脱离工作目录的纯聊天框，而是明显受当前项目和目录上下文影响。

---

## 三、openchamber 已形成的产品边界

把中间区和输入框放在一起看，openchamber 已经形成了这些明确边界：

### 1. 它不是聊天页，而是 session 工作台

证据是：

- 中间区围绕 session / turn / history / blocking request 组织
- 输入区围绕 draft / queue / file / agent / command / model 组织
- 左栏和中间区通过 parent session、active session、new draft 强绑定

### 2. 它不是“发一句等一句”，而是支持连续工作流

证据是：

- queued messages
- quick actions
- abort / retry
- pending input restore
- synthetic parts
- blocking cards
- timeline navigation

### 3. 它不是纯文本产品，而是上下文编排产品

证据是：

- 文件引用和附件是输入一等公民
- agent / command / skill / model 都能进入一次发送的语义
- 目录和项目上下文会影响输入与会话行为

### 4. 它不是只面向短会话，而是面向长链路任务

证据是：

- 虚拟列表
- turn window
- 历史加载
- 时间线对话框
- 恢复到底部
- 会话级 draft 持久化

---

## 四、补充：openchamber 如何做到多个会话来回切换不反复拉取

这次继续往下读后，一个非常关键的实现事实已经可以确认：

openchamber 的“多会话切换顺滑”并不是因为它把所有逻辑都塞进 `ChatContainer`，而是因为它把 **当前会话指针、每个会话的消息快照、历史窗口元信息、流式状态** 都拆开放进 store，并按 `sessionId` 长期缓存。

### 1. 切换当前会话，本质上只是切 current session 指针

`setCurrentSession()` 的职责非常克制：

- 更新 `currentSessionId`
- 通知服务端 view / unview
- 同步当前目录
- 触发状态轮询

它本身并不承担“重新拉整份消息列表”的职责。

这意味着 openchamber 的页面切换语义本质是：

- UI 只换当前 session 引用
- 中间区从 store 中读当前 session 对应的数据桶
- 是否补拉数据由消息缓存层单独决定

### 2. 会话数据不是只存 active session，而是按 sessionId 分桶常驻

从 store 可以看到，openchamber 至少按 `sessionId` 维持了这些结构：

- `piSessions`
- `messages`
- `sessionHistoryMeta`
- `sessionMemoryState`
- `streamingMessageIds`
- `messageStreamStates`

这说明它不是“界面上只保留当前会话的一份 message 数组”，而是：

- 每个 session 都有自己的消息缓存
- 每个 session 都有自己的历史窗口状态
- 每个 session 都有自己的流式生命周期状态
- 切回旧会话时，优先直接复用缓存结果

### 3. 首次 hydration 才会 loadMessages，而且有去重与乱序保护

`messageStore.loadMessages()` 里有非常明确的设计：

- `loadMessagesInFlightBySession`：同一 session 的并发加载复用同一个 Promise
- `loadMessagesRequestSeqBySession`：只接受当前 session 的最新请求结果，避免慢响应覆盖新结果
- `sessionHistoryMeta`：记录当前 limit、是否 complete、是否 loading

因此 openchamber 不是“每次点一下 session 就打一次重复请求”，而是：

1. 先查这个 session 是否已经 hydrated
2. 如果已经 hydrated，直接切过去展示
3. 如果没 hydrated，再做一次受控加载
4. 如果同一时间多处触发加载，也只保留一次有效请求

### 4. 它还会预取邻近会话，不等用户点了才开始拉

左侧栏还额外做了 `useSessionPrefetch()`：

- 当前会话前后相邻的 session 会被后台预取
- 最近访问链路附近的 session 也会被后台预取
- hover 某个 session 一小段时间后也可能入预取队列
- 已经 hydrated 的 session 会被跳过

这点很关键，因为用户主观上感受到的“秒切”，很多时候并不是因为完全没请求，而是因为 **请求已经提前在后台做完了**。

### 5. 长会话也不是每次全量重拉，而是按窗口扩容

`loadMoreMessages()` 的做法也很明确：

- 不是重新设计一套全新的消息树
- 不是每次把整份历史无限制拉回来
- 而是基于当前 `history limit` 继续向上扩窗

所以它的长会话策略本质上是：

- 当前 session 先保留一段消息窗口
- 用户继续向上看时，再扩大窗口
- 历史元信息和滚动锚点跟 session 一起缓存

也就是说，openchamber 的快，不只是“切换快”，还是“历史展开也尽量增量化”。

### 6. turn 在这里更多是阅读器模型，不是多会话切换快的根因

这次继续往下看后，另一个值得纠正的点也很明确：

openchamber 切会话顺滑的核心原因不是 `turn`，而是：

- session 级缓存
- session 级历史窗口元信息
- session 级流式状态
- session 级预取
- session 级当前指针切换

`turn` 更多解决的是：

- 长会话阅读
- 导航定位
- 时间线窗口裁切

但“多会话来回切换不反复拉取”这件事，根上靠的是缓存架构，而不是 `turn` 本身。

---

## 五、对当前项目下一步设计最有价值的结论

下面这些结论最值得直接带入本项目的后续设计讨论：

### 1. 中间区必须按“会话工作台”设计，但不必照搬 turn

openchamber 证明了中间区不能只是一个简单消息列表，但对当前项目来说，更重要的是先学它的缓存结构，而不是先学它的 `turn` 视图。

如果只做一个简单消息列表，后面会很难自然长出：

- 父子会话导航
- 阻塞式交互卡片
- 新会话草稿态
- 恢复到底部与历史阅读状态
- 多会话缓存切换

但如果目标是性能最优，那么第一阶段应该优先采用：

- `activeSessionId`
- `messagesBySessionId`
- `historyMetaBySessionId`
- `streamStateBySessionId`
- `composerDraftBySessionId`

而不是先引入 `turn timeline`。

### 2. 输入框必须按“输入编排器”设计，不能按“textarea + 发送按钮”设计

如果底层抽象太弱，后面这些能力都会变成补丁：

- 草稿持久化
- 队列发送
- 文件引用
- 命令 / 技能 / agent 补全
- 中断 / 恢复
- 语音 / 移动端控制

### 3. 会话、输入、目录、模型四类状态必须从一开始就分层

openchamber 的实现已经说明，这四层不能混在一个页面组件里：

- 会话状态：当前 session、父子关系、历史、状态阶段、缓存桶
- 输入状态：文本、草稿、队列、附件、待恢复输入
- 上下文状态：目录、项目、worktree、文件引用
- 发送配置：provider、model、agent、variant、权限策略

### 4. “新会话草稿态” 应该成为正式状态，而不是临时 if 分支

这是 openchamber 很关键的一点。只要这个状态设计清楚，很多能力都会顺下来：

- 从左栏新建但还没发消息
- 中间空态与输入区联动
- 草稿按会话保存
- 发送后平滑过渡成真实 session

### 5. 性能最优的前提下，先做 session 级缓存，再评估是否需要 turn

这次结合实际 Pi 与 openchamber 后，当前项目的优先级已经可以更明确地收敛成：

第一优先级：

- 多会话消息缓存
- 切换只改 `activeSessionId`
- 首次进入才 hydrate
- 邻近会话预取
- 历史分页 / 扩窗
- 流式输出批量刷新

第二优先级：

- 阻塞式交互卡片
- 父子会话回退
- 输入增强协议
- 文件进入对话的语义

第三优先级：

- 时间线导航
- 长会话定位
- 更细的 turn 级阅读器

也就是说，`turn` 不是不能做，而是不应该在当前阶段成为第一性结构。

---

## 六、建议作为下一阶段设计清单的能力分层

为了后续正式设计时不失控，可以把目标能力先拆成三层：

### 第一层：必须先立住的底座

- 新会话草稿态
- 当前会话中间区容器
- 会话级 draft 持久化
- 多会话缓存切换
- 发送 / 停止二态主按钮
- 长会话滚动与回到底部
- 父子会话回退入口

### 第二层：工作台化的关键增强

- 历史分页 / 历史窗口扩容
- 阻塞式交互卡片
- 文件附件与文件提及
- agent / command / skill 补全
- 模型 / agent / provider 控制条
- 队列发送
- 相邻会话预取

### 第三层：高级体验能力

- 语音 conversation mode
- 输入 focus mode
- 时间线对话框
- 移动端专用输入控制
- 多工作区 / worktree 上下文联动
- 视需要再引入 turn 导航模型

## 结论

如果只看 UI，openchamber 的中间区和输入框很容易被误判成“做得细一点的聊天界面”；但继续往源码里走会发现，它真正厉害的地方并不只是 `turn`，而是 **session 级状态拆分与缓存策略**。

对当前项目来说，最重要的不是先复刻样式，也不是先复刻 `turn timeline`，而是先承认这两个区域背后各自都是独立模块：

- 中间区本质是 **会话容器 + 多会话缓存切换 + 阻塞交互承载层**
- 输入框本质是 **多模输入与发送编排器**

只有先把 session 级缓存、草稿态、历史窗口、流式状态这些底座搭好，后续再决定要不要引入更重的 `turn` 阅读器，整个系统才不会越做越像补丁。