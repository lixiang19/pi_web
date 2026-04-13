# Web工作台与Pi服务桥接 Module Codemap

## Responsibility

- 负责提供 Web 端 Pi 工作台，统一组织左侧会话列表、中间消息流、右侧文件树三栏结构。
- 负责提供共享页面壳与导航，把工作台、设置页、主题页、会话详情页统一收敛到同一套路由外框下。
- 负责把 `@mariozechner/pi-coding-agent` 的持久化 session 能力桥接成前端可消费的 HTTP 与 SSE 接口，而不是只暴露运行时内存会话。
- 负责发现并管理 Pi agent 资源，统一合并 `~/.pi/agent/agents` 与最近 `.pi/agents`，并把 project 覆盖关系投影给前端。
- 负责把会话级 agent 选择真正注入 Pi runtime，包括 system prompt 追加、模型/thinking 覆写、steps 预算和工具权限 gate，而不是只在前端保存一个名字。
- 负责把 prompt、skill、command 三类 Pi 资源目录通过服务端真实暴露给输入区，而不是让前端硬编码 quick prompt 或伪造 slash command 列表。
- 负责把 session 历史、项目/worktree 信息、归档状态与当前流式状态投影为稳定的前端摘要模型。
- 负责将左栏的视图状态与服务端的会话语义状态拆分：归档在服务端持久化，pin、折叠、recent、展开等视图状态在前端本地持久化。
- 负责把输入区升级为会话级输入编排器，统一管理草稿、发送态、模型/thinking/agent 显式选择、`@agent` 提及与 `/` 资源选择。
- 负责在前端把消息、草稿和加载生命周期按 `sessionId` 分桶缓存，并通过邻近会话预取减少会话切换时的整份重新拉取。
- 负责通过限窗快照和前端扩窗机制控制长会话历史加载，避免中间区默认渲染整份消息历史。
- 负责在 Web 入口完成主题契约导入、全局 base 规则注入、默认主题 token 注册与明暗模式根节点切换，让 shadcn-vue 组件和工作台自定义样式共享同一套设计变量。
- 负责约束工作台分隔策略：ridge 主题下优先使用 surface 层次与留白，不依赖裸 `border-*` 做结构分隔，避免 Tailwind 默认 `currentColor` 污染边框颜色。
- 负责约束主题资产边界：`style.css` 只承载 Tailwind 构建期入口与全局 base，`assets/*.css` 主题文件只承载运行时 token，禁止把 `@import "tailwindcss"`、`@custom-variant`、`@layer base` 注入运行时主题样式。
- 负责把用户级设置、收藏和自定义项目统一持久化到 ~/.ridge/ 下的服务端 JSON 文件，而不是在 Web 层散落 localStorage。
- 负责限制文件树访问边界，只允许浏览当前工作区及同仓库 worktree 范围内的目录。
- 负责把“工作区文件树浏览”和“用户 Home 目录项目选择”拆成两条独立后端边界，避免混淆安全语义。
- 不负责桌面壳原生交互、PR 状态、分享链接、复杂工具执行面板，这些仍在后续迭代范围内。
- 服务对象包括 Web 最终用户、Tauri 桌面壳中的前端运行时，以及本仓库的开发构建流程。

## Design

### Architecture Pattern

- 模式命名：前后端分层 + SDK 持久化会话桥接 + agent 资源发现/运行时注入 + 本地视图状态投影

```text
+-----------------------------+
| Vue App                     |
| main.ts -> router -> App    |
| PlatformShell.vue           |
| - WorkbenchPage             |
| - SettingsPage              |
| - ThemesPage                |
| - SessionDetailPage         |
+--------------+--------------+
               |
               v
+-----------------------------+
| 前端编排与派生层            |
| usePiChat.ts                |
| useWorkbenchSessionState.ts |
| useWorkbenchResourcePicker.ts|
| useWorkbenchPage.ts         |
| useThemePreferences.ts      |
| useProjects.ts              |
| useDirectoryBrowser.ts      |
| session-sidebar.ts          |
| lib/theme.ts                |
| assets/registry.ts          |
| - session refresh           |
| - SSE sync                  |
| - draft persistence         |
| - model/thinking/agent      |
| - resource catalog          |
| - theme token normalize     |
| - ridge surface header/inset |
| - theme bootstrap           |
| - project browse / CRUD     |
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
| - filesystem browse         |
| - settings/favorites/projects |
+------+----------------------+
       |                      |
  v                      v
+-----------------------+   +------------------+
| 元数据/用户存储/仓库上下文 |   | Pi SDK / 文件系统 |
| session-metadata       |   | SessionManager   |
| storage/index.js       |   | createAgentSession |
| utils/paths.js         |   | DefaultResourceLoader |
| project-context        |   | tool_call hooks  |
| agents.js              |   |                  |
| agent-permissions      |   |                  |
+------------------+   +------------------+
```

- Vue 层只消费投影后的摘要和树结构，不直接拼接底层 session 文件信息。
- 前端编排层负责把服务端的 session 摘要转成项目、group、父子会话树，并把会话派生状态、资源面板控制、主题偏好持久化拆成独立 composable。
- 服务层同时承担三件事：列出和打开 SDK 持久化 session、维护归档元数据、约束文件树访问范围。
- 正常发送链路的 SSE 主流程必须绑定 `AgentSession.subscribe()`，由 Pi runtime 真实推送 `message_start/message_update/message_end/turn_end`；仅靠 `POST /api/sessions/:id/messages` 改 `status` 不能让前端消息流更新。
- 服务端桥接 `message_start/message_end` 时必须过滤 `role === 'user'` 的事件，因为前端发送期已经做了乐观用户消息写入；不做过滤会导致每次发送重复一条用户消息。
- `turn_end` 不是可省略事件：桥接层需要在这里把 active record 收口为最新快照，并把会话状态回写为 `idle`（如有 ask/permission 挂起则由服务端再次解析为 `streaming`）。

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
- 由 `usePiChat` 创建与维护，再经由 `useWorkbenchSessionState.ts`、`useWorkbenchResourcePicker.ts` 与 `WorkbenchChatPanel.vue` 消费并驱动输入区 UI。
- 依据：`packages/web/src/lib/types.ts`，`packages/web/src/composables/usePiChat.ts`

- 抽象名称：新会话草稿上下文

```ts
type SessionDraftContext = {
  cwd: string
  parentSessionId: string
}
```

- 这是把“还没真正创建 session，但已经进入工作台”的状态显式建模后的前端抽象，决定草稿态的目录、父会话和首次发送时的落盘参数。
- 由 `usePiChat.openSessionDraft()` 维护，`useWorkbenchSessionState.ts` 与 `WorkbenchPage.vue` 消费以显示草稿态标题、父会话回退和文件树根目录。
- 依据：`packages/web/src/composables/usePiChat.ts`，`packages/web/src/composables/useWorkbenchSessionState.ts`，`packages/web/src/pages/WorkbenchPage.vue`

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
- 由服务端 `GET /api/resources` 生产，`usePiChat` 拉取后交给 `useWorkbenchResourcePicker.ts` 与 `WorkbenchResourcePicker.vue` 渲染与注入输入区。
- 依据：`packages/server/src/index.js`，`packages/web/src/lib/api.ts`，`packages/web/src/lib/types.ts`

- 抽象名称：用户级项目记录

```ts
export interface ProjectItem {
  id: string
  name: string
  path: string
  addedAt: number
}
```

- 这是 Sidebar 自定义项目区和“添加项目”Dialog 共享的核心用户对象，表示一个持久化保存的绝对路径入口，而不是会话树里的 project group。
- 由服务端 `GET /api/projects` 生产，`useProjects.ts`、`ProjectSelectorDialog.vue` 和 `SessionSidebar.vue` 消费。
- 依据：`packages/web/src/lib/types.ts`，`packages/web/src/composables/useProjects.ts`，`packages/server/src/storage/index.js`

- 抽象名称：主题偏好状态

```ts
export interface Settings {
  theme: 'system' | 'light' | 'dark'
  themeName: ThemeName
}

export type ThemePreference = {
  themeName: ThemeName
  mode: 'light' | 'dark'
}

export const applyThemePreference = (preference: ThemePreference) => {
  applyTheme(preference.themeName, preference.mode)
}
```

- 这是主题系统从“启动时注入默认主题”升级为“运行时可切换且由服务端设置存储驱动”的核心抽象。
- `lib/theme.ts` 负责把偏好应用到 DOM，`useThemePreferences.ts` 负责页面级交互状态，`stores/settings.ts` 负责通过服务端设置存储恢复和写回主题模式与主题名。
- 依据：`packages/web/src/lib/theme.ts`，`packages/web/src/composables/useThemePreferences.ts`，`packages/web/src/pages/ThemesPage.vue`

- 抽象名称：agent 资源定义与发现结果

```ts
export interface AgentSummary {
  name: string
  description: string
  displayName?: string
  mode: 'primary' | 'task' | 'all'
  model?: string
  thinking?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
  maxTurns?: number
  skills?: string[]
  inheritContext?: boolean
  runInBackground?: boolean
  enabled: boolean
  permission?: AgentPermission
  sourceScope: 'default' | 'user' | 'project'
  source: string
}
```

- 这是输入区 agent 选择器和服务端运行时注入之间的契约对象，包含统一 agent schema 中会影响主会话与后续 task runtime 的核心字段。
- discovery 先合并内置默认 agent，再叠加 `~/.pi/agent/agents` 与最近 `.pi/agents`，最后由 `GET /api/agents` 过滤掉 disabled 与 task-only agent 返回主会话可选列表。
- 依据：`packages/server/src/default-agents.js`，`packages/server/src/agents.js`，`packages/web/src/lib/types.ts`

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

- 抽象名称：主题注册表与运行时注入器

```ts
@import './assets/theme-contract.css'

export const themes = {
  default: normalizeThemeCss(defaultTheme),
  amber: normalizeThemeCss(amberTheme),
  // ...
}

const normalizeThemeCss = (themeCss: string) =>
  themeCss.replace(/\n@theme\s+inline\s*\{[\s\S]*?\}\s*$/m, '')

export const applyTheme = (themeName: ThemeName, mode: ThemeMode = 'dark') => {
  ensureThemeStyleElement().textContent = themes[themeName]
  document.documentElement.dataset.theme = themeName
  document.documentElement.classList.toggle('dark', mode === 'dark')
}
```

- 这是 Web 主题系统的核心抽象，构建期由 `style.css + theme-contract.css` 暴露 Tailwind 语义类和全局 base 规则，运行时由 `registry.ts + theme.ts` 只注入浏览器可执行的真实 CSS 变量。
- `registry.ts` 负责剥离构建期专用 `@theme inline` 块并导出主题样式，`theme.ts` 负责样式挂载、`data-theme` 标记和 `.dark` 根类切换；主题文件保持 token-only，`main.ts` 在设置加载完成后再执行初始化。
- 依据：`packages/web/src/assets/registry.ts`，`packages/web/src/lib/theme.ts`，`packages/web/src/main.ts`

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

- 模式名：主题资产归一化 + 启动期样式注入 + 构建期基础层收口
  - 实现位置：`normalizeThemeCss()` 与 `initializeThemeSystem()`，位于 `packages/web/src/assets/registry.ts`、`packages/web/src/lib/theme.ts`
  - 为什么这么做：Tailwind v4 只会为构建期看得见的语义 token 和 base 规则生成结果，因此必须把 `style.css` 固定为唯一构建期入口，把 `theme-contract.css` 固定为契约层；运行时主题文件只能保留 token，避免把构建期 DSL 当成浏览器 CSS 执行。

- 模式名：共享路由壳 + 子页面装配
  - 实现位置：`PlatformShell.vue` 与 `router/index.ts`，位于 `packages/web/src/layouts/PlatformShell.vue`、`packages/web/src/router/index.ts`
  - 为什么这么做：一旦工作台不再只是单页，背景、导航、页面标题和最大宽度容器就不该散落在多个页面里重复实现，应该由共享路由壳统一承担。

- 模式名：主题偏好持久化
  - 实现位置：`stores/settings.ts`、`lib/theme.ts` 与 `useThemePreferences()`，位于 `packages/web/src/stores/settings.ts`、`packages/web/src/lib/theme.ts`、`packages/web/src/composables/useThemePreferences.ts`
  - 为什么这么做：主题、收藏和项目入口都属于用户级偏好，必须统一收敛到服务端 JSON 存储层，否则 Web 层状态会分散且难以迁移。

- 模式名：独立浏览边界
  - 实现位置：`GET /api/files/tree` 与 `GET /api/filesystem/browse`，位于 `packages/server/src/index.js`
  - 为什么这么做：工作区文件树和用户 Home 目录项目选择服务的是两种不同的安全域；复用同一个 root 校验会把工作区约束和用户目录浏览混成一条规则，后续很难维护。

## Flow

- 场景：左栏启动与会话摘要恢复流程

```text
[1] main.ts 挂载 router
  -> [2] PlatformShell.vue 渲染共享壳与导航
  -> [3] WorkbenchPage.vue mounted
  -> [4] usePiChat.boot()
  -> [5] GET /api/sessions
  -> [6] SessionManager.listAll()
  -> [7] project-context/session-metadata enrich
  -> [8] SessionSidebar buildSessionProjects()
```

- 第 5 到 7 步把 SDK 持久化 session、归档元数据和 git/worktree 上下文整合成增强摘要。
- 第 8 步前端再按项目、group、父子会话树组织 UI。

- 场景：左栏切换已有会话流程

```text
[1] SessionSidebar click session
  -> [2] usePiChat.loadSession(sessionId)
  -> [3] 命中 sessionCache 则立即切换 UI
  -> [4] 未命中才 GET /api/sessions/:id?limit=...
  -> [5] 建立 /stream SSE 订阅并消费 snapshot
  -> [6] 中间消息区、资源目录与右侧文件树更新
```
- **2026-04-11 侧栏分组收敛更新**：左栏“最近访问”、`project root`、`worktree`、`archived` 各实际渲染分组默认只投影前 3 条，会话余量通过组内“展开更多”一次性展开；该展开状态只属于当前页面会话，不持久化到 localStorage，搜索态则直接展示全部命中结果。
- **2026-04-11 左栏标记收敛更新**：会话节点右侧不再渲染 Git 分支图标；左栏 pin 能力已从根上删除，包括节点 pin 图标、hover pin 按钮、`pi.sessions.pinned` 本地存储和按 pinned 优先的排序逻辑，列表统一回归按 `updatedAt` 倒序。
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
  -> [3] WorkbenchPage.vue 进入草稿态并切换文件树/资源目录
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
[1] useWorkbenchSessionState.ts 计算 fileTreeRoot
  -> [2] WorkspaceFileTree watch(rootDir)
  -> [3] GET /api/files/tree
  -> [4] resolveWorkspaceScope() 判定允许 root
  -> [5] fs.readdir() 返回目录节点
  -> [6] 前端懒加载展开目录
```

- 和之前不同的是，`root` 现在允许同仓库 worktree 路径，不再局限于单一工作区目录。

- 场景：添加自定义项目流程

```text
[1] SessionSidebar 点击“添加项目”
  -> [2] ProjectSelectorDialog.vue 打开
  -> [3] useDirectoryBrowser.load()
  -> [4] GET /api/filesystem/browse?path=...
  -> [5] 用户确认目录
  -> [6] useProjects.add(path)
  -> [7] POST /api/projects
  -> [8] ~/.ridge/projects.json 落盘并回刷 Sidebar
```

- 第 4 步只允许浏览 Home 范围内的目录，不复用工作区文件树接口。
- 第 8 步写入的是用户级项目入口列表，点击项目时才会进一步触发新会话草稿创建。

- 场景：agent 发现与输入区选择流程

```text
[1] WorkbenchPage.vue / usePiChat.boot()
  -> [2] GET /api/agents?cwd=...
  -> [3] discoverAgents(cwd)
  -> [4] 合并内置默认 agent、~/.pi/agent/agents 与最近 .pi/agents
  -> [5] 过滤 disabled 与 task-only agent
  -> [6] WorkbenchChatHeader Select 展示主会话可选 agent
```

- 关键分支：若 project scope 与 user scope 存在同名 agent，则 project 版本覆盖 user 版本；若同名用户/项目 agent 覆盖内置默认 agent，则覆盖结果进入最终注册表。
- 严格分支：若 agent 文件含未知 frontmatter 字段或非法 permission，会被直接跳过并记录服务端日志，而不是带病进入前端列表。

- 场景：输入编排与资源注入流程

```text
[1] usePiChat.boot()/loadSession()
  -> [2] GET /api/resources?cwd=...&sessionId=...
  -> [3] ResourceLoader.getPrompts()/getSkills()
  -> [4] extensionRunner.getRegisteredCommands()
  -> [5] useWorkbenchResourcePicker.ts 过滤资源，WorkbenchResourcePicker.vue 渲染 / 资源面板
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

- 第 3 步会同步应用 system prompt、model、thinking、maxTurns 预算与 active tools。
- 第 4 到 5 步保证 agent 改动不是 UI 状态，而是会真正改变 Pi session 的执行上下文。

 - 场景：设置页与主题页导航流程

```text
[1] PlatformShell.vue 渲染顶部导航
  -> [2] RouterLink 跳转 /settings 或 /themes
  -> [3] 对应 page setup 执行 composable
  -> [4] SettingsPage.vue 展示运行态摘要
  -> [5] SettingsPage.vue / ThemesPage.vue 调用 useThemePreferences()
  -> [6] stores/settings.ts 写回 ~/.ridge/settings.json 中的 theme + themeName
  -> [7] lib/theme.ts 监听并写入 DOM
```

- 设置页不直接管理主题 token，只负责导航和运行态摘要。
- 主题页通过 composable 驱动主题切换，避免把持久化逻辑写进模板事件里。

- 场景：Web 工作台主题启动流程

```text
[1] main.ts load settings -> import style.css + theme-contract.css
  -> [2] Tailwind 在构建期生成 bg-background/text-foreground 等语义类
  -> [3] assets/registry.ts normalizeThemeCss() 去掉 @theme inline
  -> [4] lib/theme.ts getResolvedThemePreference()
  -> [5] lib/theme.ts ensureThemeStyleElement()
  -> [6] 写入已持久化或默认主题 CSS 变量到 <style>
  -> [7] html.dataset.theme/theme mode 同步到根节点
  -> [8] router + 页面组件统一读取主题变量
```

- 第 2 步解决“语义主题类未生成”的构建期问题。
- 第 3 到 7 步在应用挂载前完成，因此首屏渲染能恢复用户上次主题，且运行时只依赖标准 CSS 变量注入。

## Integration

### External Dependencies

| Module/File | Dependency | Purpose |
| --- | --- | --- |
| packages/server/src/index.js | express | 暴露 REST 与 SSE 服务 |
| packages/server/src/index.js | zod | 校验请求参数 |
| packages/server/src/index.js | @mariozechner/pi-coding-agent | 列出、打开、创建并驱动 Pi session |
| packages/server/src/storage/index.js | node:crypto | 生成稳定项目 ID |
| packages/server/src/index.js | node:os | 计算 Home 目录边界与用户数据目录 |
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
main.ts
  -> router/index.ts
    -> App.vue
      -> layouts/PlatformShell.vue
        -> pages/WorkbenchPage.vue
          -> components/workbench/WorkbenchHeader.vue
          -> components/chat/SessionSidebar.vue
            -> components/chat/ProjectSelectorDialog.vue
            -> components/chat/SessionSidebarSessionNode.vue
            -> composables/useProjects.ts
            -> composables/useDirectoryBrowser.ts
            -> lib/session-sidebar.ts
          -> components/workbench/chat/WorkbenchChatPanel.vue
            -> components/workbench/chat/WorkbenchChatHeader.vue
            -> components/workbench/chat/WorkbenchMessageStream.vue
            -> components/workbench/chat/WorkbenchComposer.vue
              -> components/workbench/chat/WorkbenchResourcePicker.vue
          -> components/workbench/ProjectFilePanel.vue
            -> components/WorkspaceFileTree.vue
              -> lib/api.ts
                -> /api/files/tree
        -> pages/SettingsPage.vue
          -> composables/useWorkbenchSessionState.ts
        -> pages/ThemesPage.vue
          -> composables/useThemePreferences.ts
        -> pages/SessionDetailPage.vue
          -> components/workbench/chat/WorkbenchMessageStream.vue
          -> components/workbench/ProjectFilePanel.vue
  -> lib/theme.ts
    -> assets/registry.ts
pages/WorkbenchPage.vue
  -> composables/useWorkbenchPage.ts
    -> composables/useWorkbenchSessionState.ts
    -> composables/useWorkbenchResourcePicker.ts
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

packages/server/src/index.js
  -> project-context.js
  -> storage/index.js
    -> utils/paths.js
    -> utils/fs.js
    -> utils/lock.js
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
| ~/.ridge/projects.json | 用户目录 | 持久化 Sidebar 自定义项目入口列表 |
| ~/.ridge/settings.json | 用户目录 | 持久化主题等用户级设置 |
| ~/.ridge/favorites.json | 用户目录 | 持久化文件树收藏等用户级偏好 |
| ~/.pi/agent/agents | 用户目录 | 用户级 agent YAML/Prompt 资源目录 |
| .pi/agents | 当前项目或最近上级目录 | 项目级 agent YAML/Prompt 资源目录，覆盖同名 user agent |

### Consumers

- Web 浏览器中的最终用户，直接消费左栏会话管理、中间消息流和右侧文件树。
- Tauri 桌面壳中的前端页面，复用相同的 Web 工作台实现。
- npm workspace 脚本，通过根 `build`、Web `check/build`、Server `build` 验证该模块。

### Data Flow Summary

```text
用户点击左栏 / 输入消息
  -> PlatformShell / WorkbenchPage / SessionSidebar / WorkbenchChatPanel
  -> useWorkbenchSessionState / useWorkbenchResourcePicker / usePiChat / useProjects / useDirectoryBrowser / session-sidebar 派生层
  -> lib/api.ts HTTP + SSE
  -> Express 服务层
  -> SessionManager / DefaultResourceLoader / agent registry / git / 文件系统 / 元数据存储 / 用户级 JSON 存储
  -> 增强摘要、agent 列表、项目入口与消息流返回前端
  -> 左栏树、自定义项目区与消息区更新
```

## Key Files Reference

| File | Lines | Purpose |
| --- | --- | --- |
| packages/server/src/index.js | 1167 | 服务端会话桥接、agent runtime 注入、历史恢复、归档删除与文件树入口 |
| packages/server/src/storage/index.js | 214 | 用户级设置、收藏和项目入口的统一 JSON 存储层 |
| packages/server/src/utils/paths.js | 45 | 定义 ~/.ridge/ 下各类用户数据文件路径 |
| packages/server/src/agents.js | 502 | agent 目录发现、frontmatter 解析、CRUD 与 YAML 序列化 |
| packages/server/src/agent-permissions.js | 262 | agent permission 归一化、工具裁剪与编辑路径 gate |
| packages/server/src/project-context.js | 166 | 解析项目/worktree 上下文与工作区访问范围 |
| packages/server/src/session-metadata.js | 144 | 持久化 session 归档元数据与会话级 agent 选择 |
| packages/web/src/composables/usePiChat.ts | 434 | 前端会话编排、agent 选择、SSE 同步与会话动作入口 |
| packages/web/src/composables/useWorkbenchSessionState.ts | 187 | 工作台会话派生层，承接标题、目录根、下拉选择与会话跳转动作 |
| packages/web/src/composables/useWorkbenchResourcePicker.ts | 139 | Slash 资源面板派生层，负责过滤、注入与资源目录刷新 |
| packages/web/src/composables/useThemePreferences.ts | 48 | 主题页交互层，负责组合当前偏好并驱动主题切换 |
| packages/web/src/composables/useProjects.ts | 78 | 自定义项目列表状态管理与 CRUD 编排 |
| packages/web/src/composables/useDirectoryBrowser.ts | 86 | Home 目录浏览状态管理与面包屑派生 |
| packages/web/src/composables/useWorkbenchPage.ts | 24 | 工作台组合层，只负责拼装会话派生与资源派生 composable |
| packages/web/src/router/index.ts | 62 | Web 路由入口，声明共享页面壳、工作台与设置/主题/详情页 |
| packages/web/src/layouts/PlatformShell.vue | 92 | 共享页面壳，提供背景、导航和路由级标题区域 |
| packages/web/src/pages/WorkbenchPage.vue | 92 | 三栏工作台页面装配，连接左栏、聊天页和文件树页签 |
| packages/web/src/pages/SettingsPage.vue | 153 | 设置页，展示运行态摘要与平台导航入口 |
| packages/web/src/pages/ThemesPage.vue | 123 | 主题页，负责切换主题 token 与明暗模式 |
| packages/web/src/pages/SessionDetailPage.vue | 134 | 会话详情页，聚焦单个会话消息流与目录上下文 |
| packages/web/src/components/chat/SessionSidebar.vue | 390 | 左侧会话栏主组件，管理搜索、折叠、pin、recent 与动作派发 |
| packages/web/src/components/chat/ProjectSelectorDialog.vue | 151 | 添加项目 Dialog，负责目录浏览、确认和错误展示 |
| packages/web/src/components/chat/SessionSidebarSessionNode.vue | 229 | 递归渲染父子会话树与节点操作 |
| packages/web/src/components/workbench/chat/WorkbenchChatPanel.vue | 107 | 中间聊天区域总装配，组合头部、消息流与输入区 |
| packages/web/src/components/workbench/chat/WorkbenchMessageStream.vue | 228 | 消息流滚动容器，管理回到底部与历史扩窗滚动锚点 |
| packages/web/src/components/workbench/chat/WorkbenchComposer.vue | 106 | 输入区与资源选择器容器，承接草稿输入和发送动作 |
| packages/web/src/lib/session-sidebar.ts | 248 | 左栏项目/group/树结构派生与搜索规则 |
| packages/web/src/App.vue | 7 | 根应用壳，仅提供 RouterView 容器 |
| packages/web/src/lib/theme.ts | 103 | 主题运行时注入入口，负责主题恢复、DOM 注入和明暗模式切换 |
| packages/web/src/assets/registry.ts | unknown | 主题资产注册表，负责把主题 CSS 归一化成当前工作台可消费的 token |
| packages/web/src/lib/api.ts | 109 | Web 端 REST 请求封装与 agent API 入口 |
| packages/web/src/lib/types.ts | 99 | 会话、agent、文件树和 mutation 类型定义 |
| README.md | 36 | 项目结构与启动方式说明 |

## 2026-04-12 ask 阻塞式交互更新
### 服务桥接变化
- 服务端新增 `ask` 扩展注入，位置：`packages/server/src/ask-extension.ts` 与 `packages/server/src/index.ts`
- `SessionRecord` 新增 `pendingAskRecords`，运行时把 ask 明确建模为“挂起中的 tool”
- `SessionSnapshot` 新增 `interactiveRequests`，用于把 pending ask 投影给前端
- 新增接口：`POST /api/sessions/:sessionId/asks/:askId/respond`
- `AgentPermission` 从 `question` 收敛为 `ask`

### 当前链路
```text
LLM 调用 ask tool
  -> server ask extension 创建 pending ask
  -> SessionRecord.pendingAskRecords 挂起 tool promise
  -> SSE snapshot 推送 interactiveRequests
  -> Web 底部 ask 卡片渲染
  -> 用户提交/取消
  -> POST /api/sessions/:id/asks/:askId/respond
  -> server resolve 原 ask tool promise
  -> runtime 继续执行并产出 toolResult
```

### 设计边界
- ask 现在是 Web 工作台第一条真实阻塞式交互链路
- 仍然没有开放通用 `ctx.ui.custom()` 浏览器适配
- 当前只支持 ask，不把协议泛化成任意 interactive request 容器

## 2026-04-12 ask 历史回放桥接修正
### 根因
- server 原先只把消息投影成 `role/content/timestamp`
- Pi runtime 的 `toolResult` 真实还有 `toolCallId/toolName/details/isError`
- 这些字段丢失后，Web 无法判断 ask 结果属于哪个工具，也拿不到问答详情

### 修正内容
- `packages/server/src/index.ts` 的 `serializeMessage()` 现在保留：
  - `toolCallId`
  - `toolName`
  - `details`
  - `isError`
- `packages/server/src/types/index.ts`
- `packages/server/src/types/pi-sdk.d.ts`
- `packages/web/src/lib/types.ts`

### 结果
```text
Pi runtime SessionMessage
  -> server serializeMessage 完整投影工具元数据
  -> SessionSnapshot.messages
  -> usePiChat/createRawMessage 保留 tool 元字段
  -> ChatProcessGroup 识别 ask toolCall/toolResult
  -> 历史回放显示问题摘要 / 答案摘要 / 完整问答对
```

### 设计结论
- pending ask 与历史 ask 必须分两条线
- 但历史 ask 绝不能再做独立协议，必须回归普通工具消息
- Web 若继续做工具定制渲染，前提都是 **消息元数据不能在桥接层丢失**

## 2026-04-12 permission 审批对齐 opencode
### 服务桥接变化
- `AgentPermission` / `PermissionRule` 现在统一支持 `allow | ask | deny`
- `CompiledPermissionPolicy` 从 `editRules + toolActions` 收敛为 `rulesByPermission`
- `createPermissionGateExtension()` 从仅拦截 edit，升级为统一拦截全部 permission key
- `SessionRecord` 新增 `pendingPermissionRecords` 与会话级 `runtimePermissionRules`
- `SessionSnapshot` 新增 `permissionRequests`
- 新增接口：`POST /api/sessions/:sessionId/permissions/:requestId/respond`

### 当前链路
```text
LLM 发起普通 toolCall
  -> server permission gate 匹配 allow/ask/deny
  -> ask 命中时创建 pending permission request
  -> SessionRecord.pendingPermissionRecords 挂起当前 tool_call
  -> SSE snapshot 推送 permissionRequests
  -> Web 底部 PermissionRequestCard 渲染
  -> 用户选择 once / always / reject
  -> POST /api/sessions/:id/permissions/:requestId/respond
  -> server 继续放行 或 返回拒绝
  -> 原 toolCall 继续执行/失败
```

### 设计边界
- 审批不是 ask 工具，也不是独立工具历史
- `always` 只作用于当前 session，靠 `runtimePermissionRules` 追加最小白名单
- 规则对象未命中默认 `allow`
- 当前 Web 只渲染 pending 审批卡片，不保留审批历史 UI

## 2026-04-12 Git项目显隐收敛
### 变更目的
- 左侧会话列表里的 Git worktree 按钮、worktree 删除按钮，只在项目真实属于 Git 仓库时显示。
- 右侧 `ProjectFilePanel` 不再依赖 `getGitStatus()` 报错来“被动证明”非 Git；改为先走轻量探测，再决定是否渲染 Git Tab。

### 当前链路
```text
ProjectFilePanel(rootDir)
  -> useIsGitRepo(rootDir)
  -> GET /api/git/is-repo?cwd=...
  -> gitService.isGitRepository(cwd)
  -> isGitRepo:boolean
  -> Git Tab 显示 / 隐藏
```

### 设计结论
- Git 面板显隐属于“仓库能力探测”，不属于 `getGitStatus()` 错误分支；两者职责必须拆开。
- 右侧面板在非 Git 项目时只保留文件视图，不显示 Git Tab，不再把错误文案暴露给用户当作正常状态。
- 服务端 `SessionSummary` 现在显式携带 `isGit`；左侧 Sidebar 基于真实项目上下文投影 `SessionProjectView.isGit`，不再把“有 session”错误等价成“Git 项目”。
- 未解析出 Git 上下文的空项目视图，默认不显示 Git worktree 操作。

### 受影响文件
- `packages/server/src/index.ts`
- `packages/web/src/lib/api.ts`
- `packages/web/src/lib/types.ts`
- `packages/web/src/composables/useIsGitRepo.ts`
- `packages/web/src/components/workbench/ProjectFilePanel.vue`
- `packages/web/src/components/chat/SessionSidebar.vue`

## 2026-04-12 Pi 资源隔离开关
### 变更目的
- 允许 Web 服务端在**不动全局 auth/models/sessions** 的前提下，临时切断 `~/.pi/agent` 资源发现。
- 目标只限 `DefaultResourceLoader` 相关资源：prompts、skills、extensions、themes、AGENTS 附加指令；不改模型登录、全局会话索引、provider 注册。

### 当前链路
```text
RIDGE_PI_ISOLATED=1
  -> server createPiAgentScopeSettingsManager(cwd)
  -> createAgentSession / DefaultResourceLoader 共用隔离 agentDir
  -> 主会话、恢复会话、临时 catalog、子代理都不再读取全局 ~/.pi/agent 资源
  -> 项目 cwd/.pi 资源仍然保留
  -> AuthStorage / ModelRegistry / SessionManager 继续使用正常全局链路
```

### 设计结论
- 资源隔离和运行时凭证隔离必须拆开；否则“想禁全局 skill”会误伤登录和模型可用性。
- 隔离开关必须下沉到 `SettingsManager(agentDir)` 这一条真实 Pi runtime 边界，`DefaultResourceLoader` 和 `createAgentSession` 必须共享同一作用域，不能只隔离资源目录扫描。
- 子代理 runtime 也必须跟随同一开关；否则主会话隔离，子代理又从全局吃 skill，链路会重新漏回去。

### 受影响文件
- `packages/server/src/index.ts`
- `packages/server/src/subagents.ts`
- `packages/server/src/pi-resource-scope.ts`
- `packages/server/src/types/pi-sdk.d.ts`

## 2026-04-12 项目真源收敛
### 变更目的
- 左侧“浏览项目”只能显示用户**手动添加**的项目，禁止再从会话摘要反推项目节点。
- 会话、文件树、worktree 归属统一收敛到“已添加项目”这一个真源，去掉 server 启动目录衍生出的静态 workspace scope。
- 未选中项目时，工作台保持空态，不自动落回 `workspaceDir`。

### 当前链路
```text
已添加项目列表 ~/.pi/ridge-settings.json
  -> server buildManagedProjectScopes()
  -> /api/sessions 只返回命中已添加项目作用域的 session
  -> SessionSummary.projectId/projectRoot/projectLabel 对齐已添加项目
  -> web buildSessionProjects(storedProjects + sessions)
  -> 左栏只渲染已添加项目节点

当前文件树 root
  -> /api/files/tree?root=...
  -> ensureManagedProjectScope(root)
  -> 只允许访问已添加项目目录及其 worktree
```

### 设计结论
- `workspaceDir` 现在只保留为系统信息/相对路径参考，不再作为项目、会话、文件树的默认真源。
- `/api/sessions` 虽仍返回扁平数组，但内部语义已改成“先按已添加项目建作用域，再汇总会话”，不再按全局 workspace 扫描后反推项目。
- 新建会话必须带入某个已添加项目目录；未选项目时只能停留在草稿空态，不能偷偷创建到 server 启动目录。
- `SessionSummary.projectId` 现在对齐 `ProjectItem.id`，worktree 仍通过 `worktreeRoot/worktreeLabel/branch` 表达，不再拿 git common dir 当左栏项目主键。

### 受影响文件
- `packages/server/src/index.ts`
- `packages/server/src/project-context.ts`
- `packages/server/src/types/index.ts`
- `packages/web/src/composables/usePiChat.ts`
- `packages/web/src/composables/useEffectiveDirectory.ts`
- `packages/web/src/lib/session-sidebar.ts`
- `packages/web/src/components/chat/SessionSidebar.vue`
- `packages/web/src/pages/WorkbenchPage.vue`