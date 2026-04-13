# 2026-04-13 resource picker 状态契约修复

## 背景

- 标签页版中间区接入 `useWorkbenchResourcePicker()` 时，前端把 picker 所需状态包成了一个 `computed`。
- 结果传入值变成 `Ref<object>`，而 `useWorkbenchResourcePicker()` 读取的是 `chat.resources.value`、`chat.activeSessionId.value` 这种“对象属性本身是 Ref”的结构。
- 运行时因此出现 `Cannot read properties of undefined (reading 'value')`。

## 根因

- `useWorkbenchResourcePicker()` 之前直接把输入类型绑定到 `ReturnType<typeof usePiChat>`。
- 这个契约过宽，掩盖了它其实只依赖少数几个字段：
  - `composer`
  - `activeSessionId`
  - `resources`
  - `refreshResources`
- `SessionTabContent.vue` 为了凑这个类型，错误地构造了 `computed(() => ({ ... }))`。

## 修复

### 1. 收紧 composable 输入契约

- `useWorkbenchResourcePicker.ts` 改为声明最小 `WorkbenchResourcePickerState`。
- 不再耦合完整 `usePiChat()` 返回值。

### 2. 改回正确传参形状

- `SessionTabContent.vue` 直接传入普通对象。
- 对象内部字段保持原始响应式形状：`activeSessionId`、`resources` 都是 Ref，而不是再包一层 computed。

## 验证

- `npm run lint`
- `npm run typecheck`

## 结果

- 资源选择器恢复正常渲染。
- 标签页版中间区与旧工作台共享同一套最小状态契约，不再依赖整块 chat composable 结构。