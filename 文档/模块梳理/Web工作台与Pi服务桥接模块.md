# Web工作台与Pi服务桥接 Module Codemap

## Responsibility

- 负责提供 Web 端 Pi 工作台，统一组织左侧会话列表、中间消息流、右侧文件树三栏结构。
- 负责把 `@mariozechner/pi-coding-agent` 的持久化 session 能力桥接成前端可消费的 HTTP 与 SSE 接口，而不是只暴露运行时内存会话。
- 负责发现并管理 Pi agent 资源，统一合并 `~/.pi/agent/agents` 与最近 `.pi/agents`，并把 project 覆盖关系投影给前端。
- 负责把会话级 agent 选择真正注入 Pi runtime，包括 system prompt 追加、模型/thinking 覆写、steps 预算和工具权限 gate，而不是只在前端保存一个名字。
- 负责把 prompt、skill、command 三类 Pi 资源目录通过服务端真实暴露给输入区，而不是让前端硬编码 quick prompt 或伪造 slash command 列表。
- 负责把 session 历史、项目/worktree 信息、归档状态与当前流式状态投影为稳定的前端摘要模型。
- 负责将左栏的视图状态与服务端的会话语义状态拆分：归档在服务端持久化，pin、折叠、recent、展开等视图状态在前端本地持久化。
- 负责把输入区升级为会话级输入编排器，统一管理草稿、发送态、模型/thinking/agent 显式选择、`@agent` 提及与 `/` 资源选择。
- 负责在前端把消息、草稿和加载生命周期按 `sessionId` 分桶缓存，并通过邻近会话预取减少会话切换时的整份重新拉取。
- 负责通过限窗快照和前端扩窗机制控制长会话历史加载，避免中间区默认渲染整份消息历史。
- 负责限制文件树访问边界，只允许浏览当前工作区及同仓库 worktree 范围内的目录。
- 不负责桌面壳原生交互、PR 状态、分享链接、复杂工具执行面板，这些仍在后续迭代范围内。
- 服务对象包括 Web 最终用户、Tauri 桌面壳中的前端运行时，以及本仓库的开发构建流程。

## Design

### Architecture Pattern

- 模式命名：前后端分层 + SDK 持久化会话桥接 + agent 资源发现/运行时注入 + 本地视图状态投影

```text
+-----------------------------+
| Vue App                     |
| App.vue                     |
| - SessionSidebar            |
| - Chat Stream               |
| - WorkspaceFileTree         |
+--------------+--------------+
               |
               v
+-----------------------------+
| 前端编排与派生层            |
| usePiChat.ts                |
| session-sidebar.ts          |
| - session refresh           |
| - SSE sync                  |
| - draft persistence         |
| - model/thinking/agent      |
| - resource catalog          |
| - project/group/tree build  |
+--------------+--------------+
               |
               v
+-----------------------------+
| Express 服务桥接层          |
| index.js                    |
| - SessionManager.listAll    |
| - Session open/create       |
| - agent discovery/config    |
| - agent runtime apply       |
| - archive/delete/rename     |
| - file tree                 |
+------+----------------------+
       |                      |
  v                      v
+------------------+   +------------------+
| 元数据与仓库上下文 |   | Pi SDK / 文件系统 |
| session-metadata |   | SessionManager   |
| project-context  |   | createAgentSession |
| agents.js        |   | DefaultResourceLoader |
| agent-permissions|   | tool_call hooks  |
+------------------+   +------------------+
```

- Vue 层只消费投影后的摘要和树结构，不直接拼接底层 session 文件信息。
- 前端编排层负责把服务端的 session 摘要转成项目、group、父子会话树，并管理 localStorage 里的折叠、pin、recent 等视图状态。
- 服务层同时承担三件事：列出和打开 SDK 持久化 session、维护归档元数据、约束文件树访问范围。

### Key Abstractions

- 抽象名称：增强后的会话摘要

```ts
export interface SessionSummary {
  id: string
  title: string
  cwd: string
  status: 'idle' | 'streaming' | 'error'
  createdAt: number
  updatedAt: number
  archived: boolean
  agent?: string
  model?: string
  thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
  resolvedModel?: string
  resolvedThinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
  sessionFile: string
  parentSessionId?: string
  projectId: string
  projectRoot: string
  projectLabel: string
  branch?: string
  worktreeRoot: string
  worktreeLabel: string
}
```

- 这是当前左栏与输入区共享的核心领域对象，前端不再只知道 `id/title/cwd`，而是能直接按项目、worktree、归档、父子会话组织，并恢复当前会话绑定的 agent、显式模型和 thinking 选择。
- 由服务端 `GET /api/sessions` 生产，`usePiChat` 和 `SessionSidebar.vue` 消费。
- 依据：`packages/web/src/lib/types.ts`，`packages/server/src/index.js`

- 抽象名称：会话归档元数据存储

```js
const createDefaultState = () => ({
  version: 2,
  sessions: {},
})

export function createSessionMetadataStore(workspaceDir) {
  // sessions[sessionId] = {
  //   archived?: boolean,
  //   title?: string,
  //   cwd?: string,
  //   sessionFile?: string,
  //   parentSessionPath?: string,
  //   createdAt?: number,
  //   updatedAt?: number,
  //   agent?: string,
  //   model?: string,
  //   thinkingLevel?: string,
  // }
}
```

- 这是服务端对 session 语义状态的补充持久化层，不只记录归档，还保存显式新建空会话的最小索引，以及会话级 agent/model/thinking 显式选择。
- 归档、空会话索引和会话级选择都写入工作区 `.pi-web/session-sidebar.json`，因此刷新页面或重启服务后仍然保留。
- 依据：`packages/server/src/session-metadata.js`

- 抽象名称：输入编排器状态

```ts
export interface ChatComposerState {
  sessionId: string | null
  draftText: string
  isSending: boolean
  canAbort: boolean
  selectedModel: string
  selectedThinkingLevel: ThinkingLevel | ''
  selectedAgent: string
  hasDraft: boolean
  isFocused: boolean
  isDisabled: boolean
  pendingPrompt: string
}
```

- 这是输入区从“单个 input 字符串”升级为“会话级输入编排器”的核心状态对象，统一承载草稿、发送中断、显式选择与待恢复输入。
- 由 `usePiChat` 创建与维护，`App.vue` 直接消费并驱动输入区 UI。
- 依据：`packages/web/src/lib/types.ts`，`packages/web/src/composables/usePiChat.ts`

- 抽象名称：新会话草稿上下文

```ts
type SessionDraftContext = {
  cwd: string
  parentSessionId: string
}
```

- 这是把“还没真正创建 session，但已经进入工作台”的状态显式建模后的前端抽象，决定草稿态的目录、父会话和首次发送时的落盘参数。
- 由 `usePiChat.openSessionDraft()` 维护，`App.vue` 直接消费以显示草稿态标题、父会话回退和文件树根目录。
- 依据：`packages/web/src/composables/usePiChat.ts`，`packages/web/src/App.vue`

- 抽象名称：会话快照缓存桶

```ts
type CachedSessionEntry = {
  snapshot: SessionSnapshot
  hydratedAt: number
}
```

- 这是前端按 `sessionId` 维护的消息快照缓存，用于支撑切会话秒切、SSE snapshot 回填、邻近预取和发送期乐观消息更新。
- 由 `usePiChat` 内部创建并维护，`loadSession()/prefetchSession()/connectStream()` 都会消费它。
- 依据：`packages/web/src/composables/usePiChat.ts`

- 抽象名称：Pi 资源目录响应

```ts
export interface ResourceCatalogResponse {
  prompts: PromptCatalogItem[]
  skills: SkillCatalogItem[]
  commands: CommandCatalogItem[]
}
```

- 这是输入区 `/` 资源选择器与 prompt chips 的真实后端契约，统一承载 prompt、skill、command 三类资源。
- 由服务端 `GET /api/resources` 生产，`usePiChat` 拉取后交给 `App.vue` 渲染与注入输入区。
- 依据：`packages/server/src/index.js`，`packages/web/src/lib/api.ts`，`packages/web/src/lib/types.ts`

- 抽象名称：agent 资源定义与发现结果

```ts
export interface AgentSummary {
  name: string
  description: string
  displayName?: string
  mode: 'primary' | 'task' | 'all'
  model?: string
  thinking?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
  steps?: number
  sourceScope: 'user' | 'project'
  source: string
}
```

- 这是输入区 agent 选择器和服务端运行时注入之间的契约对象，包含 YAML frontmatter 投影后的核心字段。
- 由服务端 `discoverAgents()` 和 `GET /api/agents` 生产，`usePiChat` 与 `App.vue` 消费。
- 依据：`packages/server/src/agents.js`，`packages/web/src/lib/types.ts`

- 抽象名称：agent permission 编译结果

```js
{
  raw: normalizedPermission,
  cwd,
  activeToolNames,
  editRules,
  toolActions,
}
```

- 这是把 agent YAML 中的 `permission` 段转成 runtime 可执行策略后的结构，既控制可见工具集合，也控制 `tool_call` 时的编辑路径放行。
- 由 `compileAgentPermission()` 生产，`createPermissionGateExtension()` 与 session runtime 消费。
- 依据：`packages/server/src/agent-permissions.js`，`packages/server/src/index.js`

- 抽象名称：项目与 worktree 上下文解析器

```js
export function createProjectContextResolver(workspaceDir) {
  return {
    resolveContext,
    resolveWorkspaceScope,
    isPathInsideRoot,
  }
}
```

- 该抽象把任意 session `cwd` 解析为 `projectId/projectRoot/worktreeRoot/branch`，并推导当前工作区允许浏览的 worktree 范围。
- 它是左栏能做项目 root / worktree 分组和文件树能跨同仓库 worktree 正常浏览的根基础。
- 依据：`packages/server/src/project-context.js`

- 抽象名称：左栏分组派生器

```ts
export const buildSessionProjects = (options: {
  sessions: SessionSummary[]
  pinnedIds: string[]
  query: string
  workspaceDir?: string
}) => SessionProjectView[]
```

- 该抽象负责从扁平会话列表构造 `project root / worktree / archived` 三类 group，并把 fork 关系还原成父子会话树。
- `SessionSidebar.vue` 只渲染派生结果，不自己维护复杂排序和搜索规则。
- 依据：`packages/web/src/lib/session-sidebar.ts`

- 抽象名称：会话编排器

```ts
const {
  activeSession,
  openSessionDraft,
  renameSession,
  archiveSession,
  deleteSession,
  loadSession,
  prefetchSession,
  submit,
  abort,
} = usePiChat()
```

- `usePiChat` 统一负责 session 列表刷新、SSE 同步、草稿态进入、按 session 缓存切换、邻近预取、创建/删除/重命名/归档这些动作，以及当前活动会话消息流。
- 页面和左栏组件不直接调用 `fetch`，全部经由它编排。
- 依据：`packages/web/src/composables/usePiChat.ts`

### Design Patterns

- 模式名：SDK 持久化 session 列表恢复
  - 实现位置：`listWorkspaceSessions()` 与 `ensureSessionRecord()`，位于 `packages/server/src/index.js`
  - 为什么这么做：左栏需要真实历史会话，而不是仅显示当前 Node 进程内创建过的会话，因此必须基于 `SessionManager.listAll/open` 重建会话视图。

- 模式名：服务端语义状态 / 前端视图状态分离
  - 实现位置：服务端 `session-metadata.js` 与前端 `useLocalStorage()`，分别位于 `packages/server/src/session-metadata.js`、`packages/web/src/components/chat/SessionSidebar.vue`
  - 为什么这么做：归档和空会话索引属于跨刷新保留的会话语义；pin、折叠、recent、展开父会话属于当前用户视图偏好，两者生命周期不同，不能混存一处。

- 模式名：空会话立即落盘
  - 实现位置：`persistSessionFileIfNeeded()`，位于 `packages/server/src/index.js`
  - 为什么这么做：Pi SDK 默认要等首条 assistant 才真正写 session 文件，但左栏支持显式新建会话；如果不立即落盘，刷新或重启后这些空会话会直接丢失。

- 模式名：父子会话树投影
  - 实现位置：`buildSessionTree()`，位于 `packages/web/src/lib/session-sidebar.ts`
  - 为什么这么做：SDK 会返回父 session 关系，左栏必须把扁平摘要恢复成树，才能支持子会话展开和级联归档/删除语义。

- 模式名：级联归档/删除
  - 实现位置：`collectDescendantIds()` 与 `/api/sessions/:id/archive|DELETE`，位于 `packages/server/src/index.js`
  - 为什么这么做：左栏对某个父会话做归档或硬删除时，必须对整棵子树保持一致，而不是留下孤儿节点。

- 模式名：同仓库 worktree 访问边界
  - 实现位置：`resolveWorkspaceScope()` 与 `GET /api/files/tree`，位于 `packages/server/src/project-context.js`、`packages/server/src/index.js`
  - 为什么这么做：worktree 可能在工作区目录之外，但仍属于同一仓库；文件树既不能放开到全盘，也不能把同仓库 worktree 错误拒绝掉。

- 模式名：agent 目录覆盖与严格 frontmatter 校验
  - 实现位置：`discoverAgents()`、`parseAgentFile()`，位于 `packages/server/src/agents.js`
  - 为什么这么做：当前实现必须支持 user/project 两级 agent，并且不允许未知 YAML 字段静默混入 runtime，避免前端显示和真实执行发生偏差。

- 模式名：动态 resource loader 注入
  - 实现位置：`createSessionResourceLoader()` 与 `applySessionAgentSelection()`，位于 `packages/server/src/index.js`
  - 为什么这么做：agent 切换后需要真正重建 system prompt 和扩展 hook，不能靠前端附加文本伪装 agent 已生效。

- 模式名：工具裁剪 + tool_call 二阶段权限 gate
  - 实现位置：`compileAgentPermission()` 与 `createPermissionGateExtension()`，位于 `packages/server/src/agent-permissions.js`
  - 为什么这么做：仅靠隐藏工具名不足以约束编辑边界，编辑类工具还必须在实际调用时再校验目标路径是否命中 allow 规则。

- 模式名：会话级草稿本地持久化
  - 实现位置：`usePiChat` 中的 `draftMap`、`applyDraftForSession()`、`restorePendingDraft()`，位于 `packages/web/src/composables/usePiChat.ts`
  - 为什么这么做：输入区草稿属于会话工作流的一部分，切换会话、发送失败或中止后都必须恢复，而不是丢失在页面临时状态里。

- 模式名：前端 session 分桶缓存 + 加载去重
  - 实现位置：`usePiChat` 中的 `sessionCache`、`hydrateSession()`、`loadSessionInFlightById`，位于 `packages/web/src/composables/usePiChat.ts`
  - 为什么这么做：当前服务端还没有历史扩窗接口，切会话性能只能先靠前端缓存桶、并发去重和请求乱序保护兜住，避免每次切换都重新等待整份快照。

- 模式名：新会话草稿延迟落盘
  - 实现位置：`openSessionDraft()` 与 `ensureSession()`，位于 `packages/web/src/composables/usePiChat.ts`
  - 为什么这么做：左栏点击“新建”时先进入正式草稿态，只有第一次发送消息才真正 `POST /api/sessions`，这样才能同时满足会话工作台心智和输入草稿连续性。

- 模式名：邻近会话预取
  - 实现位置：`prefetchNeighborSessions()`、`prefetchSession()`，位于 `packages/web/src/composables/usePiChat.ts`、`packages/web/src/components/chat/SessionSidebar*.vue`
  - 为什么这么做：切换体感快不只靠缓存命中，还要在 hover 和当前会话邻近位置提前做 hydration，把等待前移到后台。

- 模式名：历史限窗快照 + 前端扩窗
  - 实现位置：`GET /api/sessions/:id?limit=`、`toSessionSnapshot()`、`usePiChat.loadEarlier()`，位于 `packages/server/src/index.js`、`packages/web/src/composables/usePiChat.ts`
  - 为什么这么做：长会话如果默认返回整份消息，会同时拖慢切会话、首次打开和中间区渲染；先返回最新窗口，再按需向上扩窗，才符合性能优先的工作台设计。

- 模式名：真实资源目录驱动的输入增强
  - 实现位置：`buildResourceCatalog()` 与 `GET /api/resources`，位于 `packages/server/src/index.js`
  - 为什么这么做：prompt chips、skill 插入和 slash command 列表都必须来自 Pi SDK 真实资源发现，前端不能继续硬编码演示数据。

## Flow

- 场景：左栏启动与会话摘要恢复流程

```text
[1] App.vue mounted
  -> [2] usePiChat.boot()
  -> [3] GET /api/sessions
  -> [4] SessionManager.listAll()
  -> [5] project-context/session-metadata enrich
  -> [6] SessionSidebar buildSessionProjects()
```

- 第 3 到 5 步把 SDK 持久化 session、归档元数据和 git/worktree 上下文整合成增强摘要。
- 第 6 步前端再按项目、group、父子会话树组织 UI。

- 场景：左栏切换已有会话流程

```text
[1] SessionSidebar click session
  -> [2] usePiChat.loadSession(sessionId)
  -> [3] 命中 sessionCache 则立即切换 UI
  -> [4] 未命中才 GET /api/sessions/:id?limit=...
  -> [5] 建立 /stream SSE 订阅并消费 snapshot
  -> [6] 中间消息区、资源目录与右侧文件树更新
```

- 关键分支 A：如果该 session 已经 hydrated，前端直接复用缓存桶，避免切换阻塞在整份快照请求上。
- 关键分支 B：如果该 session 尚未在运行时打开，服务端会先通过 `SessionManager.open()` 与 `createAgentSession()` 恢复它。

- 场景：长会话向上扩窗流程

```text
[1] 中间区点击“加载更早消息”
  -> [2] usePiChat.loadEarlier()
  -> [3] GET /api/sessions/:id?limit=nextLimit
  -> [4] toSessionSnapshot() 返回更大的尾部窗口
  -> [5] 前端替换当前消息窗口
  -> [6] 按 scrollHeight 差值恢复滚动锚点
```

- 关键点：扩窗不是重新建树，也不是一次性把全历史拉回，而是只扩大当前可见窗口，并保持用户当前阅读位置不跳动。

- 场景：新会话草稿进入与首次发送流程

```text
[1] 左栏点击“新建”或“子会话”
  -> [2] usePiChat.openSessionDraft({ cwd, parentSessionId })
  -> [3] App.vue 进入草稿态并切换文件树/资源目录
  -> [4] 用户第一次 submit()
  -> [5] ensureSession() -> POST /api/sessions
  -> [6] sendMessage() + SSE 流式更新
```

- 服务端仍通过 `parentSessionPath` 建立真实父子关系，前端只是把“尚未落盘”的新会话显式表示成草稿态，而不是提前伪造真实 session。

- 场景：归档或硬删除一棵会话树

```text
[1] 左栏点击 archive / delete
  -> [2] collectDescendantIds(sessionId)
  -> [3] 写 session-metadata 或 rm session file
  -> [4] usePiChat.refreshSessions()
  -> [5] 左栏分组重新投影
```

- 归档写入 `.pi-web/session-sidebar.json`。
- 硬删除直接删除 session 文件，并清理运行时 record 与 SSE 客户端。

- 场景：右侧文件树加载流程

```text
[1] App.vue 计算 fileTreeRoot
  -> [2] WorkspaceFileTree watch(rootDir)
  -> [3] GET /api/files/tree
  -> [4] resolveWorkspaceScope() 判定允许 root
  -> [5] fs.readdir() 返回目录节点
  -> [6] 前端懒加载展开目录
```

- 和之前不同的是，`root` 现在允许同仓库 worktree 路径，不再局限于单一工作区目录。

- 场景：agent 发现与输入区选择流程

```text
[1] App.vue / usePiChat.boot()
  -> [2] GET /api/agents?cwd=...
  -> [3] discoverAgents(cwd)
  -> [4] 合并 ~/.pi/agent/agents 与最近 .pi/agents
  -> [5] 过滤 task-only agent
  -> [6] 输入区 Select 展示可选 agent
```

- 关键分支：若 project scope 与 user scope 存在同名 agent，则 project 版本覆盖 user 版本。
- 严格分支：若 agent 文件含未知 frontmatter 字段或非法 permission，会被直接跳过并记录服务端日志，而不是带病进入前端列表。

- 场景：输入编排与资源注入流程

```text
[1] usePiChat.boot()/loadSession()
  -> [2] GET /api/resources?cwd=...&sessionId=...
  -> [3] ResourceLoader.getPrompts()/getSkills()
  -> [4] extensionRunner.getRegisteredCommands()
  -> [5] App.vue 渲染 prompt chips 与 / 资源面板
  -> [6] 资源注入 draftText 或直接发送
```

- 第 3 到 4 步保证资源目录来自 Pi SDK 真实发现结果。
- 第 6 步区分 prompt 注入、skill 调用注入和 command 注入，不把三类资源混成同一语义。

- 场景：会话级 agent 应用流程

```text
[1] 输入区切换 agent / 发送消息
  -> [2] PATCH /api/sessions/:id 或 POST /api/sessions/:id/messages
  -> [3] applySessionAgentSelection()
  -> [4] compileAgentPermission()
  -> [5] DefaultResourceLoader.reload() + session.reload()
  -> [6] prompt() 进入真实 agent runtime
```

- 第 3 步会同步应用 system prompt、model、thinking、steps 预算与 active tools。
- 第 4 到 5 步保证 agent 改动不是 UI 状态，而是会真正改变 Pi session 的执行上下文。

## Integration

### External Dependencies

| Module/File | Dependency | Purpose |
| --- | --- | --- |
| packages/server/src/index.js | express | 暴露 REST 与 SSE 服务 |
| packages/server/src/index.js | zod | 校验请求参数 |
| packages/server/src/index.js | @mariozechner/pi-coding-agent | 列出、打开、创建并驱动 Pi session |
| packages/server/src/agents.js | @mariozechner/pi-coding-agent | 复用 `getAgentDir` 与 `parseFrontmatter` 发现 agent |
| packages/server/src/index.js | @mariozechner/pi-coding-agent | 复用 `DefaultResourceLoader` 把 agent prompt 与 permission gate 注入 runtime |
| packages/server/src/project-context.js | git CLI | 解析项目 root、branch 与 worktree |
| packages/server/src/index.js | node:fs/promises | 读取文件树与删除 session 文件 |
| packages/web/src/composables/usePiChat.ts | vue | 驱动会话编排状态 |
| packages/web/src/components/chat/SessionSidebar.vue | @vueuse/core | 本地持久化左栏视图状态 |
| packages/web/src/components/chat/SessionSidebar.vue | lucide-vue-next | 左栏图标与操作按钮 |
| packages/web/src/components/WorkspaceFileTree.vue | lucide-vue-next | 文件树图标 |

### Internal Dependencies

```text
App.vue
  -> components/chat/SessionSidebar.vue
     -> components/chat/SessionSidebarSessionNode.vue
     -> lib/session-sidebar.ts
  -> composables/usePiChat.ts
     -> lib/api.ts
        -> /api/system/info
        -> /api/providers
        -> /api/agents
        -> /api/sessions
        -> /api/sessions/:id
        -> /api/sessions/:id/messages
        -> /api/config/agents/:name
        -> /api/sessions/:id/archive
        -> /api/sessions/:id/abort
  -> components/WorkspaceFileTree.vue
     -> lib/api.ts
        -> /api/files/tree

packages/server/src/index.js
  -> project-context.js
  -> agents.js
  -> agent-permissions.js
  -> session-metadata.js
  -> SessionManager.listAll/open/create
  -> createAgentSession()
  -> DefaultResourceLoader
  -> fs.readdir()/fs.rm()/fs.stat()
```

### Configuration Files

| File | Location | Purpose |
| --- | --- | --- |
| package.json | 仓库根目录 | 定义 workspace 聚合构建入口 |
| packages/web/package.json | Web 包目录 | 定义 Vue 前端依赖与构建命令 |
| packages/server/package.json | Server 包目录 | 定义服务端依赖与运行入口 |
| .pi-web/session-sidebar.json | 工作区根目录 | 持久化 session 归档状态与会话级 agent 选择 |
| ~/.pi/agent/agents | 用户目录 | 用户级 agent YAML/Prompt 资源目录 |
| .pi/agents | 当前项目或最近上级目录 | 项目级 agent YAML/Prompt 资源目录，覆盖同名 user agent |

### Consumers

- Web 浏览器中的最终用户，直接消费左栏会话管理、中间消息流和右侧文件树。
- Tauri 桌面壳中的前端页面，复用相同的 Web 工作台实现。
- npm workspace 脚本，通过根 `build`、Web `check/build`、Server `build` 验证该模块。

### Data Flow Summary

```text
用户点击左栏 / 输入消息
  -> SessionSidebar / App.vue
  -> usePiChat / session-sidebar 派生层
  -> lib/api.ts HTTP + SSE
  -> Express 服务层
  -> SessionManager / DefaultResourceLoader / agent registry / git / 文件系统 / 元数据存储
  -> 增强摘要、agent 列表与消息流返回前端
  -> 左栏树与消息区更新
```

## Key Files Reference

| File | Lines | Purpose |
| --- | --- | --- |
| packages/server/src/index.js | 1167 | 服务端会话桥接、agent runtime 注入、历史恢复、归档删除与文件树入口 |
| packages/server/src/agents.js | 502 | agent 目录发现、frontmatter 解析、CRUD 与 YAML 序列化 |
| packages/server/src/agent-permissions.js | 262 | agent permission 归一化、工具裁剪与编辑路径 gate |
| packages/server/src/project-context.js | 166 | 解析项目/worktree 上下文与工作区访问范围 |
| packages/server/src/session-metadata.js | 144 | 持久化 session 归档元数据与会话级 agent 选择 |
| packages/web/src/composables/usePiChat.ts | 434 | 前端会话编排、agent 选择、SSE 同步与会话动作入口 |
| packages/web/src/components/chat/SessionSidebar.vue | 390 | 左侧会话栏主组件，管理搜索、折叠、pin、recent 与动作派发 |
| packages/web/src/components/chat/SessionSidebarSessionNode.vue | 229 | 递归渲染父子会话树与节点操作 |
| packages/web/src/lib/session-sidebar.ts | 248 | 左栏项目/group/树结构派生与搜索规则 |
| packages/web/src/App.vue | 375 | 三栏工作台总装配，连接左栏、消息区、agent 选择与文件树 |
| packages/web/src/lib/api.ts | 109 | Web 端 REST 请求封装与 agent API 入口 |
| packages/web/src/lib/types.ts | 99 | 会话、agent、文件树和 mutation 类型定义 |
| README.md | 36 | 项目结构与启动方式说明 |
