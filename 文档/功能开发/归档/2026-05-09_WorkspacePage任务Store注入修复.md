# WorkspacePage 任务 Store 注入修复

## 问题

`WorkspacePage.vue` 在同一个 `setup` 中先调用 `provideWorkspaceTasks()`，随后又调用 `useWorkspaceTasks()`。Vue 的 `inject` 只能读取祖先组件提供的值，不能读取当前组件本次 `setup` 内刚提供的值。

结果是 `useWorkspaceTasks()` 走到 fallback 分支，并以 `undefined` 作为 `workspaceDir` 创建新 store，触发 `useWorkspaceTasks.ts` watcher 调用 `workspaceDir()` 时报错：`TypeError: workspaceDir is not a function`。

## 输入

- `core.info.value.workspaceDir` 提供当前工作空间路径。
- `WorkspacePage` 作为工作空间任务和收件箱 store 的 provider。

## 输出

- `WorkspacePage` 自身直接复用 provider 返回的 store。
- 子组件继续通过 inject 共享同一份 store。
- 不再在当前组件同一 `setup` 内通过 `useWorkspaceTasks()` 或 `useWorkspaceInbox()` 读取自己刚 provide 的值。

## 边界

- 不改 `TaskView`、`DashboardView` 等子组件的注入方式。
- 不改任务系统 API、数据库结构或加载逻辑。
- 收件箱同类模式一并收口，避免后续出现同样 fallback 风险。

## 验证

- 增加 `WorkspacePage` 回归测试，断言页面使用 `provideWorkspaceTasks()` / `provideWorkspaceInbox()` 返回值，不再调用同 setup fallback 的 `useWorkspaceTasks()` / `useWorkspaceInbox()`。
- 修改 `.vue` / `.ts` 后运行根目录 `npm run check`。

## 结果

- `WorkspacePage.vue` 已直接复用 `provideWorkspaceTasks()` 和 `provideWorkspaceInbox()` 的返回 store。
- 已通过 `pnpm --filter @pi/web test -- src/pages/__tests__/WorkspacePage.test.ts`。
- 已通过 `npm run check`。
