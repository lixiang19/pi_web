---
workflow: 完整工作流智能体
task: 将当前工作台升级为支持 worktree 生命周期、左栏 project/worktree 资源树，以及右侧 Git/文件功能区的一阶段能力
state_path: 文档/功能开发/2026-04-11_右侧功能区与Worktree_Git能力迁移_状态.json
---

# 右侧功能区与Worktree/Git能力迁移 方案

- 状态：草案
- 日期：2026-04-11
- Owner：ridge
- 目标版本/里程碑：Workbench Phase 1

## 1. 背景与问题

- 背景：当前项目已经具备 session 持久化、project/worktree 上下文解析、文件树访问边界等基础能力，但 worktree 仍然只是“被动识别的元数据”，尚未成为可管理、可切换、可驱动 UI 上下文的核心资源。
- 现象/痛点：
  - 用户只能在左栏看到由 session 反推出来的 worktree 分组，无法显式创建、管理 worktree。
  - 右侧区域当前只是单一文件树，无法承载 Git 工作流。
  - 当前 worktree 没有独立生命周期 API，无法支持 validate/create/delete。
  - Git 相关操作在当前项目中基本缺失，无法支撑 worktree 工作流闭环。
  - 没有统一的 effective directory 抽象，导致文件树、资源选择器、后续 Git 面板难以共享同一目录上下文。
- 成功定义：用户可以在当前工作台中以 project/worktree 为核心进行创建、切换、删除与 Git 操作，且右侧 Git/文件功能区始终跟随当前会话或草稿的有效目录上下文。

## 2. 目标与非目标

- 目标：
  - 建立 worktree 生命周期 API：list / validate / create / delete。
  - 将左栏从“session 列表”升级为“project / worktree / archived”资源树。
  - 将右侧从单一文件树升级为 Git / 文件双 Tab 功能区。
  - 建立统一的 effectiveDirectory 抽象，供右侧功能区与资源选择器共享。
  - 第一阶段迁移 openchamber 的核心 Git 工作流：status、branch、remote、fetch/pull/push、commit/commit&push、AI 生成 commit message、merge/rebase、worktree integrate。
  - 创建 worktree 后立即创建并切换会话，形成完整链路闭环。
- 非目标：
  - 不在第一阶段接入 GitHub PR / issue 上下文联动。
  - 不在第一阶段迁移 stash / conflict dialog 的完整复杂流程。
  - 不在第一阶段引入右侧 Todo / Terminal 多标签。
  - 不做兼容旧交互的双轨设计，直接按新结构收敛。

## 3. 现状探索（Explorer）

- 入口与调用链：
  - `packages/web/src/pages/WorkbenchPage.vue` - 当前工作台三栏入口，右侧挂载 `ProjectFilePanel`。
  - `packages/web/src/components/workbench/ProjectFilePanel.vue` - 当前右侧仅承载 `WorkspaceFileTree`。
  - `packages/web/src/components/WorkspaceFileTree.vue` - 当前文件树基于 `rootDir` 请求 `/api/files/tree`。
  - `packages/web/src/composables/useWorkbenchSessionState.ts` - 当前通过 `activeSession.cwd || activeDraftContext.cwd || workspaceDir` 计算 `fileTreeRoot`。
  - `packages/web/src/composables/usePiChat.ts` - 已有 `activeDraftContext`，支持草稿态绑定目标 `cwd`。
  - `packages/web/src/components/chat/SessionSidebar.vue` - 当前左栏 project header 只支持“新建会话”。
  - `packages/web/src/lib/session-sidebar.ts` - 当前按 `sessions` 反推 `project-root / worktree / archived` 分组。
  - `packages/server/src/project-context.ts` - 当前通过 `git worktree list --porcelain` 解析 worktree 上下文。
  - `packages/server/src/index.ts` - 当前 `/api/sessions` 会返回 `projectRoot / worktreeRoot / worktreeLabel / branch`；`/api/files/tree` 已限制到工作区与同仓库 worktree 边界。
- 关键数据结构/状态：
  - `packages/web/src/lib/types.ts: SessionSummary` - 已包含 `projectRoot / worktreeRoot / worktreeLabel / branch`。
  - `packages/web/src/composables/usePiChat.ts: activeDraftContext` - 已支持草稿目录与父会话上下文。
  - `packages/web/src/composables/useWorkbenchSessionState.ts: fileTreeRoot` - 当前右侧目录上下文的临时实现。
  - `packages/server/src/types/index.ts: ProjectContext / WorktreeInfo / WorkspaceScope` - 服务端已具备 worktree 识别基础类型。
- 约束与坑点：
  - 当前左栏分组完全依赖 session，导致没有 session 的 worktree 不可见。
  - 当前项目没有 Git API 能力层，右侧 Git 面板无法直接接入。
  - 当前右侧区域还不是“功能区容器”，页面结构需要调整。
  - 删除 worktree 的默认策略被用户明确要求为“默认同时删除本地/远程 branch”，属于高风险破坏性操作，必须在设计中强化确认与可观测性。
  - 项目明确要求不做补丁式兼容，必须从结构上重建能力。

## 4. 资料与依据（Librarian）

- 关键结论：
  - openchamber 的 worktree 不是单点按钮，而是贯穿 session、directory、Git、right sidebar 的跨模块能力；关键位置包括：
    - `openchamber/packages/ui/src/lib/worktrees/worktreeManager.ts`
    - `openchamber/packages/ui/src/lib/worktreeSessionCreator.ts`
    - `openchamber/packages/ui/src/hooks/useEffectiveDirectory.ts`
    - `openchamber/packages/ui/src/components/views/GitView.tsx`
  - openchamber 左栏并非只根据 session 反推 worktree，而是使用“项目 + available worktrees + session metadata”联合构造 project/worktree 资源树。
  - openchamber 的右侧并非文件树，而是多标签功能区；本项目第一阶段只迁移 `Git / 文件` 双 Tab。
  - openchamber 的 GitView 体量很大，若直接整体照搬会引入 PR、stash、conflict 等超出第一阶段范围的复杂性，因此需要裁剪为核心闭环能力。
  - 当前项目已有 `activeDraftContext` 与 `fileTreeRoot` 雏形，说明 effectiveDirectory 可以在现有基础上演进，而不必完全另起状态系统。

## 5. 方案概览（主方案）

### 5.1 方案摘要

- 一句话：以 `effectiveDirectory + project/worktree 资源树 + 服务端 Git/worktree API` 为核心，重构当前工作台的左栏与右侧，使 worktree 成为可管理、可切换、可执行 Git 流程的一级资源。
- 取舍：不做 openchamber Git 能力的全量照搬，而是先收敛到 Files + Git 双 Tab 与核心 Git 工作流，确保第一阶段闭环完整、结构正确。
- 影响面：
  - 服务端：project/worktree/git API、新类型、新 git 命令封装
  - 前端：左栏分组模型、右侧面板容器、文件树上下文、Git 面板、worktree dialog
  - 用户：工作台心智从“会话驱动”升级为“project/worktree/context 驱动”

### 5.2 风险与回滚

- 风险：
  - worktree 删除默认删除本地/远程 branch：破坏性极强；缓解措施：必须二次确认、明确展示 branch 与 remote、服务端打印审计日志。
  - Git API 第一阶段引入多种命令：fetch/pull/push/merge/rebase/commit；缓解措施：按 API 分层封装并提供明确错误语义。
  - 左栏与右侧同时改造，联动范围大；缓解措施：先建立 context 层，再替换 UI 消费者。
  - Git 面板体量膨胀风险；缓解措施：强制拆分为多个子组件，禁止单文件堆积。
- 回滚：
  - 后端按 API 粒度回退新增 worktree/git 接口。
  - 前端若功能区不稳定，可暂时回退到旧 `ProjectFilePanel`，但这只作为开发期回退策略，不保留长期兼容分支。
  - worktree create/delete 失败时不写入额外持久化数据，保证失败即可回滚。

## 6. 详细设计（Spec）

### 6.1 交互/行为（如适用）

- 用户流程：
  1. 用户在左栏 project header 点击“新建 worktree”。
  2. 打开 `NewWorktreeDialog`，可选择：
     - 从新分支创建
     - 从现有分支创建
  3. 前端先调用 validate 接口。
  4. validate 通过后调用 create worktree。
  5. worktree 创建成功后立即创建 session，并将 `cwd` 指向新 worktree。
  6. 左栏刷新 project/worktree 资源树。
  7. active session 自动切到新会话。
  8. 右侧 Git / 文件功能区自动切到新 worktree 的 effectiveDirectory。
- 边界条件：
  - 非 Git 项目不显示新建 worktree入口。
  - validate 失败时 dialog 内联展示错误，不创建任何资源。
  - 删除 worktree 时必须显示：
    - worktree path
    - local branch
    - remote branch
    - 关联 session 数量
    - 默认将删除本地/远程 branch 的明确警示
  - 无 active session 且无 draft 时，右侧功能区 fallback 到 workspaceDir。
  - 若当前目录不是 Git repo，Git Tab 显示空态说明，而非报错崩溃。

### 6.2 接口与契约

- API/函数签名：
  - `GET /api/projects/:id/worktrees`：`projectId -> { worktrees: WorktreeInfo[] }`
  - `POST /api/projects/:id/worktrees/validate`：`ValidateWorktreePayload -> ValidateWorktreeResult`
  - `POST /api/projects/:id/worktrees`：`CreateWorktreePayload -> WorktreeInfo`
  - `DELETE /api/projects/:id/worktrees`：`DeleteWorktreePayload -> { ok: true, deletedSessionIds: string[] }`
  - `GET /api/git/status?cwd=...`：`cwd -> GitStatusResponse`
  - `GET /api/git/branches?cwd=...`：`cwd -> GitBranchesResponse`
  - `GET /api/git/remotes?cwd=...`：`cwd -> GitRemoteInfo[]`
  - `POST /api/git/fetch`：`{ cwd, remote?, branch? } -> { ok: true }`
  - `POST /api/git/pull`：`{ cwd, remote? } -> { ok: true }`
  - `POST /api/git/push`：`{ cwd, remote?, branch? } -> { ok: true }`
  - `POST /api/git/commit`：`{ cwd, message, files[] } -> { ok: true, hash?: string }`
  - `POST /api/git/generate-commit-message`：`{ cwd, files[] } -> { subject: string, highlights: string[] }`
  - `POST /api/git/create-branch`：`{ cwd, branchName, fromRef? } -> { ok: true }`
  - `POST /api/git/checkout`：`{ cwd, branchName } -> { ok: true }`
  - `POST /api/git/rename-branch`：`{ cwd, oldName, newName } -> { ok: true }`
  - `POST /api/git/merge`：`{ cwd, branchName } -> { ok: true }`
  - `POST /api/git/rebase`：`{ cwd, branchName } -> { ok: true }`
  - `POST /api/git/worktree/integrate`：`{ repoRoot, worktreePath, sourceBranch, targetBranch } -> { ok: true }`
- 错误码/异常：
  - validate 失败返回 400，并给出 `branchError` / `worktreeError`。
  - Git 命令失败统一返回明确 message，不允许吞错误。
  - 非 Git 仓库请求 Git API 返回 400。
  - 请求目录超出允许范围返回 400。
  - 删除 worktree 失败时若目录已删但 branch 未删，必须返回部分失败信息并记录日志。

### 6.3 数据与存储（如适用）

- Schema/字段：
  - `WorktreeInfo`
    - `path: string`
    - `branch?: string`
    - `label: string`
    - `projectRoot: string`
  - `ValidateWorktreeResult`
    - `ok: boolean`
    - `branchError?: string`
    - `worktreeError?: string`
    - `resolvedPath?: string`
  - 前端状态：
    - `availableWorktreesByProject: Map<string, WorktreeInfo[]>`
    - `effectiveDirectory: string`
    - `rightPanelTab: "git" | "files"`
- 迁移策略：
  - 不做持久化数据迁移。
  - 基于现有 `SessionSummary.worktreeRoot/worktreeLabel` 继续使用，不额外设计兼容层。
  - 左栏分组逻辑直接切换为新模型，不保留旧版本分组算法。

### 6.4 兼容性与发布

- 兼容策略：不做旧 UI 兼容；直接升级当前工作台结构。
- 发布步骤：
  1. 先上线服务端 API。
  2. 再接前端 context 层。
  3. 再替换左栏和右侧容器。
  4. 最后接 worktree create/delete 与 Git 动作。
  5. 通过 eslint / ts 检查后再联调。

### 6.5 可观测性

- 日志：
  - worktree validate 请求日志
  - worktree create / delete 日志
  - delete 时 branch 删除目标日志
  - Git 命令执行日志（cwd、action、branch/remote）
- 指标：
  - worktree create 成功率
  - worktree delete 成功率
  - Git commit / merge / rebase 成功率
  - Git API 请求耗时
- 告警：
  - 连续 Git API 失败
  - worktree 删除部分成功部分失败
  - branch 删除失败率过高

## 7. 验收标准（必须可验证）

- 功能验收：
  - [ ] 左栏可以按 `project root / worktree / archived` 展示资源树，而不再只是基于 session 倒推。
  - [ ] 没有 session 的 worktree 也能显示在左栏。
  - [ ] project header 可以新建 worktree，支持“新分支 / 现有分支”两种模式。
  - [ ] 创建 worktree 后自动创建并切换会话。
  - [ ] 右侧已从单一文件树升级为 `Git / 文件` 双 Tab 功能区。
  - [ ] 文件 Tab 能正确跟随 effectiveDirectory。
  - [ ] Git Tab 能展示状态、分支、远程，并执行 fetch/pull/push。
  - [ ] Git Tab 支持选择文件 commit / commit & push。
  - [ ] Git Tab 支持 AI 生成 commit message。
  - [ ] Git Tab 支持 merge / rebase。
  - [ ] Git Tab 支持 worktree integrate。
  - [ ] 删除 worktree 时默认同时删除本地/远程 branch，并删除关联会话树。
- 非功能验收：
  - [ ] 性能：切换 session 或 draft 后，右侧功能区 300ms 内开始展示对应上下文。
  - [ ] 可靠性：worktree create / delete / Git 操作失败时界面有明确错误反馈，不出现静默失败。
  - [ ] 安全：文件树与 Git API 只允许访问有效目录范围；删除 worktree 时必须二次确认。

## 8. 里程碑与任务（Milestones）

> 原则：只拆 1-3 个里程碑；每个里程碑都必须有可验证的交付物与退出标准。里程碑内再列任务，但不要过度细碎。

### M1：服务端 worktree / Git 基础能力

- 交付物：可供前端使用的 worktree 与 Git API
- 退出标准：前端可独立调用并获得稳定响应
- 任务：
  - [ ] 新增 worktree API（文件/模块：`packages/server/src/index.ts`, `packages/server/src/types/index.ts`）验收：list/validate/create/delete 可返回正确结果
  - [ ] 建立 Git API 能力层（文件/模块：`packages/server/src/index.ts` 及相关 git 封装）验收：status/branches/remotes/fetch/pull/push/commit/merge/rebase 可独立工作
  - [ ] 建立系统统一管理的 worktree 目录规则（文件/模块：server worktree service）验收：同项目多 worktree 路径稳定且可预测

### M2：前端上下文与左栏重构

- 交付物：effectiveDirectory + availableWorktreesByProject + 新左栏资源树
- 退出标准：worktree 可作为 project 子资源稳定显示与切换
- 任务：
  - [ ] 新增 `useEffectiveDirectory`（文件/模块：`packages/web/src/composables`）验收：session/draft/worktree 切换时输出目录正确
  - [ ] 新增 `useProjectWorktrees`（文件/模块：`packages/web/src/composables`）验收：可按 project 拉取并刷新 worktree 列表
  - [ ] 重写 `buildSessionProjects`（文件/模块：`packages/web/src/lib/session-sidebar.ts`）验收：无 session 的 worktree 也可显示
  - [ ] 重构 `SessionSidebar.vue`（文件/模块：`packages/web/src/components/chat/SessionSidebar.vue`）验收：支持 project 级新建 worktree 与 worktree 级新建会话/删除

### M3：右侧功能区与 worktree/Git 闭环

- 交付物：Git / 文件双 Tab 功能区 + worktree create/delete 全链路
- 退出标准：用户可在工作台中完成完整 worktree + Git 核心工作流
- 任务：
  - [ ] 新增 `ProjectContextPanel`（文件/模块：`packages/web/src/components/workbench`）验收：支持 Git / 文件双 Tab 切换
  - [ ] 接入 `WorkspaceFileTree` 到新功能区（文件/模块：`ProjectContextPanel`, `WorkspaceFileTree.vue`）验收：文件树以 effectiveDirectory 为 root
  - [ ] 新增 `WorkbenchGitPanel` 及子组件（文件/模块：`packages/web/src/components/workbench/git/*`）验收：支持状态、分支、commit、sync、merge/rebase、integrate
  - [ ] 新增 `NewWorktreeDialog`（文件/模块：`packages/web/src/components/chat` 或 `workbench`）验收：可创建新分支/现有分支 worktree
  - [ ] 接通 create worktree -> create session -> switch session（文件/模块：`usePiChat`, `WorkbenchPage.vue`, `SessionSidebar.vue`）验收：创建后右侧与左栏同步切换
  - [ ] 接通 delete worktree -> delete session tree -> delete branches（文件/模块：server + sidebar actions）验收：删除后左栏与右侧状态一致

## 9. 执行计划与闭环

- 执行顺序：M1 -> M2 -> M3
- 每个里程碑验证：
  - M1：服务端接口联调用例 + curl / 前端临时调用验证
  - M2：左栏切换/显示逻辑验证 + TS 类型检查
  - M3：完整手动链路验证（创建 worktree、自动新建会话、右侧切换、Git 操作）+ eslint + ts 检查
- 最终回报：变更摘要 + 验收勾选 + 风险残留 + 下一步
