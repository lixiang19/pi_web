# openchamber 左侧会话列表功能梳理

## 文档目的

- 读取 openchamber 左侧会话列表相关实现，梳理完整能力边界。
- 为当前项目后续重做左侧会话栏提供事实材料。
- 本文只描述 openchamber 已有代码事实，不做实现建议，不混入本项目的推测性设计。

## 总体结论

openchamber 的左侧会话列表不是单纯的“最近对话列表”，而是一个围绕项目、worktree、父子会话、归档、文件夹、搜索、排序、状态指示和移动端适配构建的多层会话管理系统。它的主入口是 `packages/ui/src/components/session/SessionSidebar.tsx`，但真正的能力是由一组独立 hook、子组件、store 和 localStorage 持久化键共同协作完成的。

它的核心结构可以概括为：

1. 顶部活动区：UI 文案显示为 `recent`，但真实数据来源是 `activeNow` 机制，不是简单按时间列出最近所有对话。
2. 中部项目树：每个项目下再拆 `project root`、多个 worktree group、`archived` group。
3. 会话树：每个 group 里的 session 支持父子层级、折叠展开、pin、状态标识、分享、归档、删除等操作。
4. 文件夹层：session 可以进一步进入文件夹树，归档 group 还支持自动归类文件夹。
5. 底部工具区：设置、快捷键、关于、更新等入口。

## 入口与结构分层

### 主入口

- `packages/ui/src/components/session/SessionSidebar.tsx`
  - 负责组装 sidebar 全部状态。
  - 自己不再承担所有细节，而是作为 orchestrator 把各个 hook 和子组件串起来。

### 主要子组件

- `sidebar/SidebarHeader.tsx`
  - 顶部头部区域，负责项目添加、搜索、显示模式切换。
- `sidebar/SidebarActivitySections.tsx`
  - 顶部活动区渲染器，目前 section key 为 `active-now`，标题显示为 `recent`。
- `sidebar/SidebarProjectsList.tsx`
  - 主树形项目列表，负责项目区块、group 区块和空态渲染。
- `sidebar/SessionGroupSection.tsx`
  - 渲染单个 group，例如某个 worktree、归档组。
- `sidebar/SessionNodeItem.tsx`
  - 渲染单条 session 行，包含父子结构、状态、操作菜单等。
- `SessionFolderItem.tsx`
  - 渲染会话文件夹，支持重命名、删除、拖拽落点。
- `sidebar/ConfirmDialogs.tsx`
  - 删除会话、删除文件夹确认对话。
- `sidebar/SidebarFooter.tsx`
  - 底部工具入口。

### 关键 hooks

- `hooks/useSessionGrouping.ts`
  - 核心分组器，负责把 session 组织为 `project root / worktree / archived` 三类 group，并处理父子 session 树。
- `hooks/useProjectSessionLists.ts`
  - 负责按项目收集 live sessions、archived sessions、worktree sessions。
- `hooks/useSessionSidebarSections.ts`
  - 把项目、group、搜索过滤结果组装成最终可渲染 section。
- `hooks/useProjectSessionSelection.ts`
  - 负责项目切换后恢复该项目的活跃会话。
- `hooks/useSessionActions.ts`
  - 负责选择、重命名、分享、取消分享、归档、删除等行为。
- `hooks/useSidebarPersistence.ts`
  - 负责折叠、pin、group 顺序、当前项目活跃会话等本地持久化。
- `hooks/useArchivedAutoFolders.ts`
  - 负责归档会话的自动文件夹归类。
- `hooks/useProjectRepoStatus.ts`
  - 负责项目 git repo 状态与根分支信息。
- `hooks/useSessionPrefetch.ts`
  - 负责鼠标悬停和最近活跃会话的预取。
- `hooks/useDirectoryStatusProbe.ts`
  - 负责目录存在性探测与缓存。

### 主要类型

- `sidebar/types.ts`
  - `SessionNode`：单个会话树节点，含 `children` 和 `worktree`。
  - `SessionGroup`：一组 session 的容器，含 label、branch、directory、isArchivedBucket 等信息。
  - `GroupSearchData`：搜索过滤后每个 group 的匹配结果。

## 功能能力总览

### 1. 顶部 recent 区域

- 顶部 section 在 UI 上显示标题 `recent`。
- 但底层数据不是“所有最近会话”，而是 `activeNow` 列表。
- `activeNow` 数据来自 `sidebar/activitySections.ts`：
  - storage key：`oc.sessions.activeNow`
  - 最大存活时间：`36 * 60 * 60 * 1000`
  - 自动排除子会话：有 `parentID` 的 session 不会进入 activeNow。
  - 自动排除 archived session。
- 在 `SessionSidebar.tsx` 中，当 `sessionStatus` 出现 `busy` 或 `retry` 会把 session 放进 activeNow。
- `SidebarActivitySections.tsx` 最多默认显示 7 条，超过后可展开查看更多。

### 2. 项目维度组织

- sidebar 不是全局平铺 session，而是先按项目组织。
- 项目来自 `useProjectsStore`。
- 每个项目都维护自己的：
  - 是否折叠
  - 当前活跃 session
  - group 顺序
  - repo 状态
  - 根分支信息
- 项目切换时会尝试恢复该项目上一次活跃的 session，而不是总是选第一条。

### 3. project root / worktree / archived 三类 group

`useSessionGrouping.ts` 会为每个项目构造固定结构：

1. `project root`
   - 表示主项目目录上的会话。
   - 如果是 git repo 且能识别根分支，会展示 `project root: <branch>`。
2. `worktree groups`
   - 每个 git worktree 一个 group。
   - label 优先来自 worktree metadata，其次 branch 或目录名。
   - 活跃的 worktree 会排在更前面。
3. `archived`
   - 存放归档会话和未能归到主目录/worktree 的 session。
   - 默认折叠。

### 4. worktree 能力

- openchamber 把 worktree 当作左栏中的一级能力，而不是附属元数据。
- 数据来源：
  - `useSessionStore().availableWorktreesByProject`
  - `useSessionStore().worktreeMetadata`
- `useProjectSessionLists.ts` 会把项目根目录和全部 worktree 路径一起并入 session 收集范围。
- `useSessionGrouping.ts` 负责把某个 session 判定到哪个 worktree group：
  - 优先使用 `worktreeMetadata.get(session.id)`
  - 其次看 session 自身 directory 是否与某个 worktree 路径匹配
- worktree 排序规则：
  - 有活动 session 的 worktree 优先
  - 活跃 worktree 再按最后更新时间倒序
  - 非活跃 worktree 再按 label 升序
- 左栏中还内置 `NewWorktreeDialog`，说明 worktree 不只是展示，还可以从左栏发起创建。

### 5. 子会话 / 父子会话树

- session 支持父子关系，通过 `parentID` 建树。
- `useSessionGrouping.ts` 中先构建 `sessionMap` 和 `childrenMap`，再递归生成 `SessionNode`。
- 根节点筛选规则：
  - 没有 parentID 的 session 是根节点
  - 有 parentID 但父 session 不存在，也是根节点
  - 如果父 session 和当前 session 的 archived 状态不同，也会断开，单独作为根节点
- 子会话展开状态通过 `SESSION_EXPANDED_STORAGE_KEY = oc.sessions.expandedParents` 持久化。
- `toggleParent()` 会在 UI 中切换展开状态，并同步写回 localStorage。
- activeNow 明确排除子会话，因此顶部 recent 区不会出现 subtasks。

### 6. 最近对话与“活动中”的真实关系

- openchamber 当前实现中，顶部标题写的是 `recent`，但事实上来源是 activeNow。
- 这意味着它更接近“最近活跃且还值得追踪的主会话”，而不是“所有最近更新的聊天”。
- 这个行为由三层代码共同决定：
  - `activitySections.ts`：定义 activeNow 存储与清理规则
  - `SessionSidebar.tsx`：在 sessionStatus 变 busy/retry 时写入 activeNow
  - `SidebarActivitySections.tsx`：把这个列表渲染为标题为 `recent` 的顶部 section

### 7. 搜索

- 搜索状态：
  - `isSessionSearchOpen`
  - `sessionSearchQuery`
  - `debouncedSessionSearchQuery`
  - `normalizedSessionSearchQuery`
- 搜索逻辑分两层：
  1. session 搜索文本：`title + directory`
  2. group 搜索文本：`label + branch + description + directory`
- `useSessionSidebarSections.ts` 还会把文件夹名称也纳入匹配。
- 搜索命中后只保留有匹配内容的 group。
- 搜索还能统计 `searchMatchCount`。

### 8. 文件夹能力

- 左侧会话不仅能按项目和 worktree 分组，还能进一步进入文件夹树。
- 相关 store：`useSessionFoldersStore`
- 关键能力：
  - 创建文件夹
  - 重命名文件夹
  - 删除文件夹
  - 展开/折叠文件夹
  - 将 session 放入文件夹
  - 将 session 从文件夹移出
- archived group 还有自动文件夹能力，由 `useArchivedAutoFolders.ts` 维护。
- 文件夹折叠状态独立持久化，不和 project/group 混在一起。

### 9. Pin 置顶

- pin 状态存储在 `oc.sessions.pinned`。
- 通过 `compareSessionsByPinnedAndTime()` 参与排序。
- 排序会优先考虑 pinned 状态，再考虑时间。
- pin 逻辑对 project root、worktree group 内的排序都生效。

### 10. 项目折叠、group 折叠、group 排序

- 项目折叠 key：`oc.sessions.projectCollapse`
- group 折叠 key：`oc.sessions.groupCollapse`
- group 顺序 key：`oc.sessions.groupOrder`
- 这些状态由 `useSidebarPersistence.ts` 统一写回 localStorage。
- 非 VS Code 运行时还会把项目折叠状态同步到桌面设置。
- archived group 默认会在首次初始化时被自动加入 collapsedGroups。

### 11. 当前项目活跃会话恢复

- key：`oc.sessions.activeSessionByProject`
- 作用：记住每个项目最后使用的 session。
- 当切换项目时，`useProjectSessionSelection.ts` 会尝试恢复这个 session。
- 这样用户从项目 A 切回项目 B 时，会直接回到上次使用的会话，而不是重置。

### 12. 会话操作能力

`useSessionActions.ts` 统一封装了左栏中的会话行为：

- `handleSessionSelect`
  - 切换当前会话
  - 如有需要同时切换目录
  - 移动端下自动切到 chat tab 并关闭 session switcher
  - 如果点击的是当前 session 且允许 reselect，会发 `openchamber:session-reselected` 事件
- `handleSaveEdit`
  - 保存会话标题修改
- `handleShareSession`
  - 生成分享链接
- `handleCopyShareUrl`
  - 复制分享链接到剪贴板
- `handleUnshareSession`
  - 取消分享
- `handleDeleteSession`
  - 根据来源决定 archive 还是 hard delete
  - 会连带统计并处理所有 descendant sessions
- `confirmDeleteSession`
  - 确认后执行删除或归档

### 13. 删除与归档的差异

- 对未归档会话，默认动作偏向 archive。
- 对 archived bucket 中的会话，动作可以转为 hard delete。
- 如果会话存在子会话：
  - 删除或归档会级联处理整棵 descendant 树。

### 14. 目录切换与目录存在性探测

- 选择某条 session 时，如果它的 directory 和当前目录不同，会触发 `setDirectory(sessionDirectory, { showOverlay: false })`。
- `useDirectoryStatusProbe.ts` 用于探测 session 关联目录是否存在，并缓存结果。
- 这类目录状态会用于 session 行的展示和交互保护。

### 15. PR / 分支 / repo 状态

- `SessionSidebar.tsx` 内部定义了 `PrVisualState` 和 `PrIndicator`。
- PR 状态来自 `useGitHubPrStatusStore`。
- `getPrVisualState()` 会把 PR 状态归类为：
  - `draft`
  - `open`
  - `blocked`
  - `merged`
  - `closed`
- 项目 repo 状态与根分支由 `useProjectRepoStatus.ts` 负责探测。
- worktree label 还会和当前 branch 做同步修正。

### 16. 移动端与桌面端差异

- 移动端通过 `mobileVariant` 进入另一套使用方式：
  - 选中 session 后会自动切回 `chat`
  - 自动关闭 session switcher
  - 更偏向覆盖层/抽屉式交互
- 桌面端会附加：
  - Mac 标题栏拖拽区
  - 全屏检测
  - 多运行 launcher
  - update dialog
  - 本地目录选择对话

## 数据与状态来源

### 核心 store

- `useSessionStore`
  - `sessions`
  - `archivedSessions`
  - `sessionsByDirectory`
  - `currentSessionId`
  - `sessionStatus`
  - `sessionMemoryState`
  - `sessionAttentionStates`
  - `permissions`
  - `worktreeMetadata`
  - `availableWorktreesByProject`
  - `getSessionsByDirectory`
  - `updateSessionTitle`
  - `shareSession`
  - `unshareSession`
  - `deleteSession`
  - `deleteSessions`
  - `archiveSession`
  - `archiveSessions`
- `useProjectsStore`
  - `projects`
  - `activeProjectId`
  - `setActiveProjectIdOnly`
  - `addProject`
  - `removeProject`
  - `reorderProjects`
- `useDirectoryStore`
  - `currentDirectory`
  - `homeDirectory`
  - `setDirectory`
- `useSessionFoldersStore`
  - `foldersMap`
  - `collapsedFolderIds`
  - `getFoldersForScope`
  - `createFolder`
  - `renameFolder`
  - `deleteFolder`
  - `addSessionToFolder`
  - `removeSessionFromFolder`
  - `toggleFolderCollapse`
  - `cleanupSessions`
  - `getSessionFolderId`
- `useGitStore`
  - `directories`
- `useGitHubPrStatusStore`
  - `entries`
- `useUIStore`
  - `setActiveMainTab`
  - `setSessionSwitcherOpen`
  - `showDeletionDialog`
  - `notifyOnSubtasks`

### LocalStorage 键

- `oc.sessions.projectCollapse`
  - 项目折叠状态
- `oc.sessions.groupOrder`
  - 每个项目下 group 的顺序
- `oc.sessions.groupCollapse`
  - group 折叠状态
- `oc.sessions.activeSessionByProject`
  - 每个项目的当前活跃 session
- `oc.sessions.expandedParents`
  - 展开的父会话集合
- `oc.sessions.pinned`
  - pin 会话集合
- `oc.sessions.activeNow`
  - 顶部 recent 区使用的活跃会话来源

## 关键交互流程

### 流程 1：顶部 recent 形成机制

1. `sessionStatus` 进入 `busy` 或 `retry`。
2. `SessionSidebar.tsx` 把对应 sessionId 加入 `activeNowEntries`。
3. `persistActiveNowEntries()` 写入 `oc.sessions.activeNow`。
4. `deriveActiveNowSessions()` 从 session map 中恢复实体 session。
5. `SidebarActivitySections.tsx` 以标题 `recent` 渲染。
6. 默认展示前 7 条，更多时可手动展开。

### 流程 2：项目切换并恢复历史会话

1. 用户点击某个项目。
2. `setActiveProjectIdOnly(projectId)` 更新当前项目。
3. `useProjectSessionSelection.ts` 查找该项目上次活跃 session。
4. 如果存在，调用 `handleSessionSelect()` 选中该 session。
5. `handleSessionSelect()` 会同步切换目录与当前会话。

### 流程 3：构造 worktree 与 archived 分组

1. `useProjectSessionLists.ts` 收集项目主目录和 worktree 目录下的 sessions。
2. `useSessionGrouping.ts` 先去重、再按 pin+时间排序。
3. 通过 `parentID` 构建 childrenMap。
4. 根节点按 `project root / worktree / archived` 分类。
5. worktree groups 再按活跃度和更新时间排序。

### 流程 4：子会话树展开

1. `SessionNodeItem` 点击父会话展开按钮。
2. `toggleParent(sessionId)` 更新 `expandedParents`。
3. 新状态写回 `oc.sessions.expandedParents`。
4. 递归渲染 `SessionNode.children`。

### 流程 5：删除/归档一棵会话树

1. 用户在某个 session 上点删除。
2. `handleDeleteSession()` 先通过 `collectDescendants()` 找出全部子会话。
3. 如果当前来源是 archived bucket，则走 hard delete。
4. 否则优先走 archive。
5. 所有 descendant 会被级联处理。

### 流程 6：搜索过滤

1. 用户输入搜索文本。
2. `debouncedSessionSearchQuery` 去抖后归一化为小写。
3. `useSessionSidebarSections.ts` 过滤 group、session node 和 folder 名。
4. 只保留有命中的 project/group。
5. 同时统计匹配数用于 UI 展示。

## 关键文件清单

### 主入口与文档

- `packages/ui/src/components/session/SessionSidebar.tsx`
- `packages/ui/src/components/session/sidebar/DOCUMENTATION.md`

### 视图组件

- `packages/ui/src/components/session/sidebar/SidebarHeader.tsx`
- `packages/ui/src/components/session/sidebar/SidebarActivitySections.tsx`
- `packages/ui/src/components/session/sidebar/SidebarProjectsList.tsx`
- `packages/ui/src/components/session/sidebar/SessionGroupSection.tsx`
- `packages/ui/src/components/session/sidebar/SessionNodeItem.tsx`
- `packages/ui/src/components/session/SessionFolderItem.tsx`
- `packages/ui/src/components/session/sidebar/ConfirmDialogs.tsx`
- `packages/ui/src/components/session/sidebar/SidebarFooter.tsx`

### hooks

- `packages/ui/src/components/session/sidebar/hooks/useSessionGrouping.ts`
- `packages/ui/src/components/session/sidebar/hooks/useProjectSessionLists.ts`
- `packages/ui/src/components/session/sidebar/hooks/useSessionSidebarSections.ts`
- `packages/ui/src/components/session/sidebar/hooks/useProjectSessionSelection.ts`
- `packages/ui/src/components/session/sidebar/hooks/useSessionActions.ts`
- `packages/ui/src/components/session/sidebar/hooks/useSidebarPersistence.ts`
- `packages/ui/src/components/session/sidebar/hooks/useArchivedAutoFolders.ts`
- `packages/ui/src/components/session/sidebar/hooks/useProjectRepoStatus.ts`
- `packages/ui/src/components/session/sidebar/hooks/useSessionPrefetch.ts`
- `packages/ui/src/components/session/sidebar/hooks/useDirectoryStatusProbe.ts`

### 状态与工具

- `packages/ui/src/components/session/sidebar/activitySections.ts`
- `packages/ui/src/components/session/sidebar/types.ts`
- `packages/ui/src/components/session/sidebar/utils.tsx`
- `packages/ui/src/stores/useSessionStore.ts`
- `packages/ui/src/stores/useSessionFoldersStore.ts`
- `packages/ui/src/stores/useProjectsStore.ts`
- `packages/ui/src/stores/useGitStore.ts`
- `packages/ui/src/stores/useGitHubPrStatusStore.ts`

## 结论摘要

openchamber 的左侧会话列表本质上是一个“项目树 + worktree + 会话树 + 文件夹 + 状态聚合”的复合管理器，而不是普通 sidebar。它已经覆盖了以下完整能力：

- 顶部活动会话区
- 项目级组织
- worktree 分组
- 父子会话树
- archived 会话桶
- 文件夹层级
- 搜索过滤
- pin 排序
- 分享、归档、删除、重命名
- 项目活跃会话恢复
- 目录切换
- repo / PR / branch 状态
- 移动端和桌面端分化逻辑

如果后续要在当前项目重做左侧会话栏，openchamber 可直接参考的不是单个组件样式，而是这套“分层编排 + 局部持久化 + 项目/worktree/session 三层结构”的功能模型。