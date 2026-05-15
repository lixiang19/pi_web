# 28 Kuzu 图谱存储与抽取

## 目标

实现 Kuzu 图谱存储和夜间 graph agent 抽取。

## 范围

- `.ridge/graph.kuzu/`。
- Kuzu schema。
- graph agent。
- 从工作空间 Markdown、正式附件转换产物、内部项目文档、daily 抽取。
- 实体：项目、文件、任务、人物、组织、概念、技术、资料、决策。
- 关系证据来源和短摘录。

## 不做

- 外部项目不进入图谱。
- 用户不直接手动编辑图谱。
- 第一版不做巨大图谱画布。

## 验收

- 图谱进入服务器完整备份。
- 图谱不进隐藏 Git。
- 图谱不直接读取混杂原文件。
- 用户可通过自然语言纠错后由 AI 修正。

## 关联设计

- `文档/项目设计/记忆Wiki图谱与工作空间MCP.md`
- `文档/项目设计/文件处理流程.md`

## Spec 提取点

- Kuzu schema。
- 抽取 prompt 和输出 schema。
- 证据格式。

## Spec 草案

### 存储

- 路径：`.ridge/graph.kuzu/`
- 节点：Project、File、Task、Person、Org、Concept、Tech、Source、Decision。
- 边：带 `evidence`、`source_path`、`confidence`、`updated_at`。

### 行为

- 夜间 RAG 后运行 graph agent。
- 只读取标准产物和 daily。
- 外部项目不入图谱。
- 用户通过自然语言纠错后再修正。

### 测试

- 内部项目文档可抽取节点。
- 外部项目文件不会入图谱。
- 关系保存不超过 80 字的短摘录证据。
- Kuzu 目录进入备份清单，并通过 `GET /api/workspace/backup` 进入真实备份 ZIP。
- 备份和图谱来源读取都不得通过符号链接越界读取 workspace 外文件。

## 实现记录（2026-05-15）

- `packages/server/src/graph-store.ts` 实现 Kuzu schema、真实 Kuzu 客户端、实体/关系 upsert、自然语言纠错写回。
- `packages/server/src/graph-agent.ts` 实现 graph agent prompt、输出 JSON schema 解析、标准来源收集和夜间维护 runner。
- `packages/server/src/graph-agent.ts` 在直接读取 daily/内部项目 Markdown 前校验 `realpath`，跳过解析后越界的项目根目录和文件。
- `packages/server/src/routes/workspace-graph.ts` 提供 `POST /api/workspace/graph/corrections`。
- `packages/server/src/rag-worker.ts` 夜间入口在 deferred RAG 后触发 graph runner。
- `packages/server/src/workspace-chat.ts` 初始化 `.ridge/graph.kuzu/schema.cypher`。
- `packages/server/src/workspace-backup.ts` 将 `.ridge/graph.kuzu` 纳入服务器备份清单，并提供 `GET /api/workspace/backup` 使用的 ZIP 生成链路；备份排除可重建缓存目录。
- `packages/server/src/workspace-backup.ts` 打包时显式跳过符号链接，避免外部文件被跟随纳入备份。
- `packages/server/src/iso-git-service.ts` 将 `.ridge` 写入隐藏 Git exclude。

## 验收证据

- `pnpm --filter @pi/server test -- src/__tests__/graph-store.test.ts`
- `pnpm --filter @pi/server test -- src/__tests__/graph-agent.test.ts`
- `pnpm --filter @pi/server test -- src/__tests__/graph-worker.test.ts`
- `pnpm --filter @pi/server test -- src/__tests__/workspace-graph-api.test.ts`
- `pnpm --filter @pi/server test -- src/__tests__/workspace-backup.test.ts`
- `pnpm --filter @pi/server test -- src/__tests__/workspace-backup-api.test.ts`
- `pnpm --filter @pi/server test -- src/__tests__/iso-git-service.test.ts`
- `pnpm --filter @pi/server test -- src/__tests__/workspace-chat.test.ts`
- `graph-store.test.ts` 内置真实 Kuzu 写入读回测试：`createKuzuGraphStore().upsertExtraction(...)` 写入临时 Kuzu 库后用 Kuzu 查询读回。
- 二次子 agent 审查后补充验证：`graph-agent.test.ts` 覆盖内部项目根目录符号链接越界防护；`workspace-backup.test.ts` 覆盖备份跳过符号链接；根目录 `npm run check` 通过。
