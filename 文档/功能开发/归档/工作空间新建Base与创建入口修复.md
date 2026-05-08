# 工作空间新建 Base 与创建入口修复

## 背景

用户反馈：

1. `WorkspacePage.vue` 点击创建入口时报 `ReferenceError: createFileEntry is not defined`。
2. “新建 Base”不能通过隐式“先新建文件夹，再在文件夹里新建 base”的方式实现。

## 已确认规则

- 新建 Base 与笔记、Canvas、文件夹保持一致：
  - 有选中目录：在选中目录创建 `.base`。
  - 无选中目录：在工作区根目录创建 `.base`。
- 新建文件夹成功后：自动选中新文件夹并展开，便于继续在该文件夹内创建内容。

## 现状根因

- `packages/web/src/pages/WorkspacePage.vue` 调用了 `createFileEntry`，但未从 `@/lib/api` 导入，导致运行时 `ReferenceError`；`vue-tsc` 应能检测为 `Cannot find name`。
- `handleCreateBase()` 在目录为空时传 `undefined`，服务端 `/api/workspace/base/create` 对空 `folder` 默认落到 `workspaceDir/数据库`，形成隐式目录。
- `handleCreateFolder()` 成功后只刷新文件树，不更新 `selectedDirPath`，也不展开新目录。

## 改动点

### 前端

- `packages/web/src/pages/WorkspacePage.vue`
  - 导入 `createFileEntry`。
  - 调整 `handleCreateBase()`：空目录传递为空路径语义，确保创建到工作区根目录。
  - 调整 `handleCreateFolder()`：创建成功后选中新目录，并展开该目录。
  - 保持四类新建按钮的目标目录规则一致。

- `packages/web/src/pages/__tests__/WorkspacePage.test.ts`
  - 新增页面级测试：
    - 创建笔记/文件夹不会因 `createFileEntry` 未导入失败。
    - 无选中目录时创建 Base 传入根目录语义，不进入 `数据库/`。
    - 有选中目录时创建 Base 传入选中目录。
    - 新建文件夹后选中并展开新文件夹。

### 后端

- `packages/server/src/routes/workspace-data.ts`
  - 调整 `/api/workspace/base/create`：`folder` 为空时目标目录为 `defaultWorkspaceDir`，不再默认创建 `数据库/`。

- 后端测试
  - 增加或调整 Base 创建测试：
    - `folder` 为空时 `.base` 位于工作区根目录。
    - `folder` 有值时 `.base` 位于指定目录。

## 影响范围

- 工作空间左侧新建按钮。
- `/api/workspace/base/create` 的默认落点。
- 可能影响其他未传 `folder` 调用 `createBase()` 的入口；统一改为根目录语义。

## 风险

- 如果旧逻辑依赖默认 `数据库/` 目录，本次会改变落点。但用户已明确不接受隐式先建文件夹的行为。
- 文件树刷新与展开是异步流程，实现时应使用已有 `refreshTree` / `expandToPath` 能力，避免延迟兜底。

## 回退策略

- 若 Base 根目录创建影响其他入口，可回退服务端默认落点修改，并改为所有调用方显式传目标目录；但不恢复隐式 `数据库/` 行为。

## 验收标准

- 点击新建笔记/文件夹不再出现 `createFileEntry is not defined`。
- 未选中目录点击新建 Base：`.base` 创建在工作区根目录。
- 选中目录点击新建 Base：`.base` 创建在该目录。
- 点击新建文件夹后，该文件夹自动成为当前创建目标并展开。
- 相关测试先失败后通过。
- 根目录 `npm run check` 通过；相关前后端测试通过。
