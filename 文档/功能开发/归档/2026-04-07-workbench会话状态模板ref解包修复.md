# 2026-04-07 workbench 会话状态模板 ref 解包修复

## 背景

Workbench 页面运行时报错：

- `TypeError: value.replace is not a function`
- 报错链路：`WorkbenchPage.vue -> formatShortPath() -> normalizePath()`

## 根因

不是路径数据本身错了。

根因是页面模板直接通过 `workbench.xxx` / `chat.xxx` 访问 composable 返回对象里的 `ref/computed`，在模板表达式里一旦进入 `||`、函数调用、可选链等组合表达式，Vue 不会把这种“对象属性上的 ref”稳定解包成原始值，最终把 `ComputedRefImpl` 传进了 `normalizePath()`。

所以 `normalizePath()` 收到的不是 string，而是 ref 对象，随后在 `value.replace(...)` 处崩溃。

## 修改

### 1. Workbench / Settings / SessionDetail 页面改为顶层解构

把 composable 返回值先在 `<script setup>` 顶层解构，再在模板里直接使用顶层变量。

这样模板拿到的是顶层 ref 绑定，Vue 会正确解包，不再把 ref 对象传入字符串处理函数。

涉及：

- `packages/web/src/pages/WorkbenchPage.vue`
- `packages/web/src/pages/SettingsPage.vue`
- `packages/web/src/pages/SessionDetailPage.vue`

### 2. 明确可传 `undefined` 的 prop 契约

为以下组件的可选 prop 显式补上 `| undefined`，避免在严格 `exactOptionalPropertyTypes` 下把 `undefined` 作为“已传值”时报类型错误。

- `packages/web/src/components/workbench/WorkbenchHeader.vue`
- `packages/web/src/components/workbench/chat/WorkbenchChatPanel.vue`
- `packages/web/src/components/workbench/chat/WorkbenchMessageStream.vue`

### 3. 顺手修正一个路由参数索引访问

- `packages/web/src/pages/SessionDetailPage.vue`
- 把 `route.params.sessionId` 改为 `route.params["sessionId"]`

## 验证

已执行：

- `npm run --workspace @pi/web check` ✅
- `npx eslint packages/web/src/pages/WorkbenchPage.vue packages/web/src/pages/SettingsPage.vue packages/web/src/pages/SessionDetailPage.vue packages/web/src/components/workbench/WorkbenchHeader.vue packages/web/src/components/workbench/chat/WorkbenchChatPanel.vue packages/web/src/components/workbench/chat/WorkbenchMessageStream.vue` ✅

额外确认：

- `npm run --workspace @pi/web build` 仍失败，但失败点是项目里已存在的无关问题：`PlatformShell.vue`、`theme.ts`、`ThemesPage.vue`，不是本次修复引入。

## 结论

本次问题已从根因修复：

- 不再让模板把 composable 内部的 ref/computed 作为对象属性链继续参与表达式计算
- 路径格式化函数重新只接收 string
- 同类页面也一起收口，避免同类错误在 Settings / SessionDetail 再次出现
