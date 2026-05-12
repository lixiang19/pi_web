# 工作台 Shell 与标签系统

## 职责

工作台 Shell 负责左侧固定入口、项目列表、工作空间会话入口、右侧标签栏和分屏标签生命周期。

## 入口

- `packages/web/src/pages/WorkspacePage.vue`
- `packages/web/src/composables/useSplitPanes.ts`
- `packages/web/src/composables/useProjects.ts`
- `packages/web/src/lib/session-sidebar.ts`
- `packages/web/src/components/workspace/split/`
- `packages/web/src/components/common/TabBar.vue`

## 标签类型

- `home`：空主页输入入口，首次发送后替换为会话标签。支持传入 `cwd` 和 `contextLabel` 用于项目新建会话。
- `conversation`：工作空间或项目会话标签。
- `singleton_feature`：闪念、搜索、通知、任务、文件、自动化、Skill、设置、归档。
- `terminal`：终端标签，可多开。
- `space_preview`：空间 HTML 预览标签。
- `file`：普通文件预览或编辑标签。

## 固定入口

左侧固定入口顺序：

- 闪念
- 搜索
- 通知
- 任务
- 文件
- 终端
- 自动化
- Skill
- 设置

除终端外，固定入口都使用稳定 `feature:<id>` 标签 ID，重复点击只激活已有标签。
终端每次点击都会创建新终端实例和新标签。

## 项目列表

- 左侧显示已注册项目，按 `updatedAt` 降序排列。
- 每个项目显示名称、路径、设备名、内部/外部、来源（GitHub/服务器文件夹）、在线/离线/归档状态。
- 项目下默认显示最近 3 个非归档会话，提供"展开更多/收起"查看剩余。
- 离线项目不展开会话列表，不能新建会话；历史会话不可点击打开。
- 归档项目只读，不可新建会话。
- 项目新建会话：点击加号打开 `home` 标签，`cwd` 设为项目路径，首次提交后创建项目会话。

## 工作空间会话

- 左侧显示工作空间历史会话列表，只显示非归档且 `projectId` 为空白的会话。
- 按 `updatedAt` 降序排列。
- 点击会话时，如果右侧已打开该会话标签，则激活；否则新开标签。

## 归档入口

- 左侧底部提供"归档"入口，打开右侧单例 `feature:archived` 标签。
- 归档会话默认不显示在普通列表。

## 会话规则

- 右侧标签栏加号创建新的 `home` 标签。
- 空 `home` 标签关闭不创建会话。
- `home` 首次提交后调用会话创建 API，并原地替换为 `conversation` 标签；`cwd` 继承自 `home` tab 的 `cwd` 字段（项目主页时为项目路径，普通主页时为工作空间目录）。
- 打开同一会话时，如果已有标签，只激活原标签，不创建重复标签。
- 关闭会话标签不删除会话。

## 会话界面与右侧工作侧栏

会话标签页内由 `WorkspaceChatTab.vue` 渲染，其内部布局为：

- **中间主区域**：`WorkbenchChatPanel` → `WorkbenchMessageStream` + `WorkbenchComposer`。
- **右侧工作侧栏**：固定四个 tab（摘要、文件、Git、Diff），通过 shadcn-vue `Tabs` 切换。

### 消息操作

每轮消息由 `ChatMessageItem.vue` 渲染：

- `user` 消息 hover 显示"编辑"按钮；点击后通过 `usePerSessionChat.forkSession()` 创建分叉会话（带 `parentSessionId`），并发送编辑后的 prompt。
- `assistant` 最终消息 hover 显示"复制"和"重试"按钮；点击重试后同样创建分叉会话，并重新发送对应轮次的用户 prompt。
- 任务会话（`taskId` 存在或 `sessionType === 'task'`）禁用编辑/重试，按钮 disabled + tooltip 说明。

### 右侧侧栏数据来源

- **摘要**：纯前端从当前 `usePerSessionChat` 计算属性投影（标题、ID、状态、轮次、运行位置、模型、Agent）。
- **文件**：复用 `WorkspaceFileTree.vue`，`rootDir` 取自 `chat.fileTreeRoot.value`（工作空间会话为 `workspaceDir`，项目会话为项目目录）。
- **Git**：复用 `WorkbenchGitPanel.vue`，通过 `useGitRepositoryStatus` 探测当前 `fileTreeRoot` 是否为 Git 仓库；非 Git 仓库显示不可用状态。
- **Diff**：第一版显示占位说明"Diff 暂不可用/等待隐藏版本管理"，不做伪装。

### 类型与 API

- `SessionSummary`（`@pi/protocol`）新增 `taskId?: string` 和 `sessionType?: string`。
- `IndexedSessionSummary`、`IndexedSessionLookup`（`session-indexer.ts`）同步暴露 `taskId` 和 `sessionType`。
- `/api/sessions` 返回体同步包含 `taskId` 和 `sessionType`。
- 前端通过 `chat.activeSession.value?.taskId / sessionType` 判断是否为任务会话。
