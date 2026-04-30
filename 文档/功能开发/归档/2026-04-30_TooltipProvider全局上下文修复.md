# TooltipProvider 全局上下文修复

## 问题

浏览器报错：

```text
Injection `Symbol(TooltipProviderContext)` not found. Component must be used within `TooltipProvider`
```

说明存在 `Tooltip` 在全局 `TooltipProvider` 外渲染的路径。

## 成功标准

1. App 根节点为所有路由内容提供 `TooltipProvider`。
2. 不依赖具体布局组件补上下文，避免非工作台路由或后续全局浮层再次缺失。
3. 新增测试覆盖：任意根路由渲染 `Tooltip` 不抛出缺失 provider 错误。

## 实施

- 先新增 `App.test.ts` 复现根路由 Tooltip 缺失 provider。
- 将 `TooltipProvider` 上移到 `App.vue`。
- 移除 `PlatformShell.vue` 中重复的 provider 包裹。
