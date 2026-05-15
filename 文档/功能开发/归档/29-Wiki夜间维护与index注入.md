# 29 Wiki 夜间维护与 index 注入

## 目标

实现 Wiki Agent 夜间维护少量 canonical Markdown 页面。

## 范围

- `Wiki/`。
- `Wiki/index.md`。
- wiki agent。
- 从工作空间 Markdown、记忆、daily、RAG、图谱、正式附件转换产物合成。
- 新增、改写、删除低价值或过时页面。
- `Wiki/index.md` 和 MEMORY 一起注入。

## 不做

- Wiki 不是第二个文件库。
- 不做百科式大量自动建页。
- 不替代 RAG。

## 验收

- Wiki 是少量核心入口页。
- 用户可直接编辑 Wiki Markdown。
- AI 后续维护以当前文件为准。
- 空 `Wiki/index.md` 不注入。

## 关联设计

- `文档/项目设计/记忆Wiki图谱与工作空间MCP.md`

## Spec 提取点

- Wiki 页面选择规则。
- index 格式。
- 夜间触发顺序。

## Spec 草案

### 输入

- 工作空间 Markdown。
- 记忆和 daily。
- RAG 结果。
- 图谱节点和关系。

### 行为

- Wiki Agent 在 graph agent 后运行。
- 维护少量 canonical 页面。
- `Wiki/index.md` 是固定入口。
- 可以删除低价值或过时页面。

### 测试

- 夜间任务按 RAG -> graph -> Wiki -> Wiki immediate RAG 顺序执行。
- 空 `Wiki/index.md` 不注入。
- 用户编辑后的 Wiki 被作为当前真源读取。
- Wiki 页面进入 RAG。

## 实现记录

- 新增 `packages/server/src/wiki-agent.ts`：
  - 收集当前 `Wiki/**/*.md`、`记忆/MEMORY.md`、`记忆/daily/**/*.md`、已索引 Markdown RAG chunk 和 Kuzu 图谱快照。
  - Wiki agent 严格返回 `{ pages, deletePaths }` JSON。
  - 页面路径只允许相对 `Wiki/` 的 `.md` 路径，拒绝绝对路径、`..`、`Wiki/` 前缀和隐藏/系统路径段。
  - 拒绝绝对路径、`..`、`Wiki/` 前缀、隐藏/系统路径段和符号链接写入路径。
  - 写入页面后标记 RAG pending；内容未变但未索引的保留页也补标记；删除页面后同步移除 RAG target。
- `rag-worker.ts` 夜间入口扩展为 RAG -> graph -> Wiki -> Wiki immediate RAG。
- `runtime-bundle.ts` 启动上下文读取当前真源 `记忆/MEMORY.md` 与 `Wiki/index.md`。
- `index.ts` 启动时创建 Pi Wiki maintainer 并注入 RAG worker。
- `workspace-memory.ts` 既有注入逻辑保持：空 `Wiki/index.md` 不注入，非空内容用 `<ridge_wiki_index>` 注入。

## 验证

- `cd packages/server && pnpm test -- src/__tests__/wiki-agent.test.ts`
- `cd packages/server && pnpm test -- src/__tests__/graph-worker.test.ts`
- `npm run build --workspace @pi/server`
