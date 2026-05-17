# Git 与版本边界收口

## 目标

把真实 Git 和 ridge 工作空间隐藏版本彻底分开：

- Git 只对目录内真实存在 `.git` 的项目可用。
- 工作空间历史使用“版本”入口，不暴露分支、远程、push/pull。
- 会话右侧侧栏默认显示：摘要、文件、版本；仅真实 Git 仓库额外显示 Git。

## 实现

- `/api/git/*` 不再 fallback 到 ridge 内置 Git；普通目录返回 `engine: "none"`。
- 新增 `/api/workspace/version/status|diff|commit`，使用 `workspace-version.ts` 的隐藏版本上下文。
- 右侧会话侧栏新增 `WorkbenchVersionPanel`，只展示变更、diff 和“提交版本”。
- `WorkspaceChatTab` 和 `ProjectFilePanel` 在非真实 Git 仓库时不渲染 Git tab。

## 验证

- `cd packages/server && pnpm test -- git-router.test.ts`
- `cd packages/server && pnpm test -- workspace-version-router.test.ts`
- `cd packages/web && pnpm vitest run src/components/workspace/__tests__/WorkspaceChatTab.test.ts`
- `npm run check`
