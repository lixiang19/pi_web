# Reka 说明

这个技能现在只面向 **shadcn-vue**。

因此下面这些 React 官方 shadcn/ui 语境中的概念，**在这里都不应继续使用**：

- `base` vs `radix`
- `asChild` / `render` 二选一对照
- `isRSC`
- React Server Components 专属约束

## 当前原则

1. 当前项目应按 **Vue + shadcn-vue + Reka UI** 理解
2. 组件 API 以 shadcn-vue 官方文档和项目现有源码为准
3. 不要继续把 React 官方 shadcn/ui 的底座差异规则硬套到 Vue 项目上
4. 如果遇到组件组合差异，先读项目实际组件源码，再决定写法

## 明确禁止

以下说法在当前技能里都视为错误：

- “先看 `npx shadcn@latest info` 里的 `base` 字段”
- “这是 radix preset，所以必须走 React 那套 `asChild` 规则”
- “因为是 RSC 项目，所以需要 `use client`”

这些都属于错误生态的残留认知。
