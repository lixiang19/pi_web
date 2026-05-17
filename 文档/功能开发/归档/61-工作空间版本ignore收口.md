# 工作空间版本 ignore 收口

## 目标

工作空间“版本”只记录用户可见、需要恢复的内容。系统元数据、依赖目录、构建产物和运行缓存不能进入隐藏版本状态、diff 或提交。

## 实现

- `iso-git-service.ts` 提供 `isWorkspaceVersionIgnoredPath`，按路径段过滤 `.DS_Store`、`.git`、`.ridge`、`node_modules`、`dist`、`build`、`target`、`.next`、`.turbo`、`coverage`、`.pi-web`。
- `getStatus` 在转换状态时过滤 ignore 路径。
- `getFileDiff` 对 ignore 路径返回空 diff。
- `commit` 和 `commitWorkspaceVersionPoint` 在提交前过滤 ignore 路径；只剩 ignore 文件时返回空保存点。

## 验收

- `.DS_Store` 和嵌套 `.DS_Store` 不出现在版本状态里。
- `.DS_Store` 不产生 diff。
- 只提交 `.DS_Store` 时不创建版本点。
- `cd packages/server && pnpm test -- iso-git-service.test.ts`
- `cd packages/server && pnpm test -- workspace-version.test.ts`
- `cd packages/server && pnpm test -- workspace-version-router.test.ts`
