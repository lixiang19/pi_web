# search_index_status 与 RAG 索引入口模块契约

> 状态：**已实现并消费**（标准产物 RAG chunk、刷新、删除、移动链路、SiliconFlow 多模态 embedding）
> 对应功能：Task 20、22、23

## 1. 模块定位

`search_index_status` 是 ridge 的**待索引内容队列**，连接内容生产端（文件转换、Markdown 上传/编辑、手动刷新）与 RAG 消费端（chunk 索引 worker）。

- **生产方**：文件转换 worker（audio→md、image→OCR md、document→md）、Markdown 上传/编辑、图片上传
- **消费方**：`rag-worker.ts`（轮询 pending → chunk → 存储 → 可检索）
- **中间层**：`search_index_status` 表（`pending`/`indexed`/`index_failed` 三态，带 `refresh_policy`）+ `search_chunks` 表（实际 chunk 和来源定位）

## 2. 表结构

### 2.1 search_index_status（队列状态）

```sql
CREATE TABLE IF NOT EXISTS search_index_status (
  target_path TEXT PRIMARY KEY,      -- 产物 .md 路径（RAG 真源）
  target_type TEXT NOT NULL DEFAULT 'file',  -- 固定 'file'
  status TEXT NOT NULL DEFAULT 'pending',      -- pending | indexed | index_failed
  workspace_path TEXT NOT NULL DEFAULT '',     -- 所属工作空间
  source_path TEXT NOT NULL DEFAULT '',        -- 工作空间相对路径
  refresh_policy TEXT NOT NULL DEFAULT 'immediate', -- immediate | deferred
  last_event TEXT NOT NULL DEFAULT 'manual',   -- upload | convert | edit | manual | nightly
  content_hash TEXT,                   -- SHA256 增量判断依据
  indexed_at INTEGER,                  -- 成功索引时间
  error TEXT,                          -- index_failed 原因
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_search_index_status_state
  ON search_index_status(status, updated_at);
```

### 2.2 search_chunks（实际索引内容）

```sql
CREATE TABLE IF NOT EXISTS search_chunks (
  chunk_id TEXT PRIMARY KEY,
  target_path TEXT NOT NULL,           -- 关联 search_index_status.target_path
  source_path TEXT NOT NULL DEFAULT '', -- 工作空间相对路径
  heading_path TEXT NOT NULL DEFAULT '[]', -- JSON 标题路径
  chunk_index INTEGER NOT NULL,        -- 分片序号
  chunk_text TEXT NOT NULL,            -- 分片文本（可检索真源）
  content_hash TEXT NOT NULL DEFAULT '',
  file_type TEXT NOT NULL DEFAULT 'markdown',
  embedding_id TEXT NOT NULL DEFAULT '',
  embedding_vector TEXT NOT NULL DEFAULT '[]',
  start_line INTEGER NOT NULL DEFAULT 1,
  end_line INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_search_chunks_target
  ON search_chunks(target_path, chunk_index);
CREATE INDEX IF NOT EXISTS idx_search_chunks_text
  ON search_chunks(chunk_text);         -- 精确文本召回索引
CREATE INDEX IF NOT EXISTS idx_search_chunks_embedding
  ON search_chunks(embedding_id);
```

## 3. 状态流转

```
pending ──[rag-worker / indexPendingTarget]──► indexed
   │                                              │
   │──[失败]──────────────────────────────► index_failed
   │                                              │
   │──[内容重新变更]──────────────────────────► pending（覆盖）
```

- **pending → indexed**：`rag-indexer.ts` `indexPendingTarget()` 成功消费后写入
- **pending → index_failed**：内容源文件不存在或读取失败时写入
- **任何状态 → pending / immediate**：上传、转换、手动刷新会立即进入可消费状态。
- **任何状态 → pending / deferred**：普通 Markdown 编辑只更新待索引状态，不删除旧 chunks，不立即触发 RAG worker；用户手动刷新或夜间任务再重建。
- **删除**：删除文件或目录时同步删除 `search_index_status` 和 `search_chunks`。
- **移动/改名**：移动文件或目录时同步更新 `target_path` 与 `source_path`，不重建 chunk 文本。

## 4. 内容源与 content_hash 规则

| 源类型 | target_path | content_hash 计算方式 | 生产时机 |
|--------|-------------|----------------------|----------|
| Markdown 上传 | 原 `.md` 路径 | `SHA256(文件内容)` | 上传 API 落盘后 |
| Markdown 编辑 | 原 `.md` 路径 | `SHA256(新内容)` | PUT /api/files/content 保存后，`refresh_policy=deferred` |
| 空间 HTML | `空间/<作品名>/index.html` | `SHA256(HTML 原文)` | 上传 API 落盘后、空间 HTML 编辑保存后或手动刷新 |
| 图片原文件 | `.png/.jpg/.jpeg/.webp/.bmp/.gif/.tif/.tiff` 路径 | `SHA256(图片 buffer)` | 上传 API 落盘后或手动刷新 |
| 音频转换产物 | `.md` 产物路径 | `SHA256(md artifact buffer)` | worker 写盘后 |
| 图片 OCR 产物 | `.md` 产物路径 | `SHA256(md artifact buffer)` | worker 写盘后 |
| 文档转换产物 | `.md` 产物路径 | `SHA256(md artifact buffer)` | worker 写盘后 |

hash 为空字符串 `""` 不再出现；所有写入均基于真实内容。

## 5. 消费链路实现

### 5.1 核心模块：`rag-indexer.ts`

```typescript
// 1. 读取 pending 目标
// 2. 只接受工作空间内标准 Markdown/空间 HTML/图片源，排除 .ridge、.originals、外部项目路径和 realpath 越界
// 3. Markdown 按标题、段落、表格、代码块切 chunk；HTML 先提取文本；图片写入单个视觉 chunk，并读取 metadata sidecar
// 4. 使用 SiliconFlow Qwen/Qwen3-VL-Embedding-8B 生成文本/图片 embedding，写入 embedding_id + embedding_vector
// 5. content_hash 未变且已有同 hash chunk 时跳过重建
// 6. 原子事务：删除旧 chunks + 写入新 chunks/source metadata + 更新 status=indexed
// 7. 返回 { success, indexed, skipped?, error? }

export async function indexPendingTarget(targetPath: string): Promise<{
  success: boolean;
  indexed: boolean;
  error?: string;
}>;

export async function markRagTargetPending(targetPath: string, options?: {
  workspaceDir?: string;
  refreshPolicy?: "immediate" | "deferred";
  event?: "upload" | "convert" | "edit" | "manual" | "nightly";
}): Promise<void>;

export async function refreshRagTarget(targetPath: string, options?: {
  workspaceDir?: string;
}): Promise<{ success: boolean; indexed: boolean; error?: string }>;

export async function removeRagTarget(targetPath: string): Promise<void>;
export async function moveRagTarget(oldPath: string, newPath: string, options?: {
  workspaceDir?: string;
}): Promise<void>;

// 批量扫描并索引所有 pending；includeDeferred=true 用于夜间任务
export async function indexAllPending(options?: {
  workspaceDir?: string;
  includeDeferred?: boolean;
  event?: "manual" | "nightly";
}): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}>;

// 基于精确文本召回 + SiliconFlow embedding 相似度的检索（已索引内容）
export async function searchContent(
  query: string,
  limit?: number
): Promise<Array<{
  targetPath: string;
  matchCount: number;
  preview: string;
  sourcePath: string;
  headingPath: string[];
  startLine: number;
  endLine: number;
}>>;
```

### 5.1.1 Embedding 配置

默认模型为 `Qwen/Qwen3-VL-Embedding-8B`，默认 endpoint 为 `https://api.siliconflow.cn/v1/embeddings`。

配置来源优先级：`app_settings` 高于环境变量。

| app_settings key | 环境变量 | 说明 |
|------------------|----------|------|
| `siliconflow_embedding_api_key` | `SILICONFLOW_EMBEDDING_API_KEY` 或 `SILICONFLOW_API_KEY` | 必填 API Key |
| `siliconflow_embedding_base_url` | `SILICONFLOW_EMBEDDING_BASE_URL` 或 `SILICONFLOW_BASE_URL` | 可选，默认 `https://api.siliconflow.cn/v1` |
| `siliconflow_embedding_model` | `SILICONFLOW_EMBEDDING_MODEL` | 可选，默认 `Qwen/Qwen3-VL-Embedding-8B` |
| `siliconflow_embedding_dimensions` | `SILICONFLOW_EMBEDDING_DIMENSIONS` | 可选，传给 Qwen/Qwen3 系列 dimensions |
| `siliconflow_embedding_timeout_ms` | `SILICONFLOW_EMBEDDING_TIMEOUT_MS` | 可选，默认 30000 |
| `siliconflow_embedding_max_retries` | `SILICONFLOW_EMBEDDING_MAX_RETRIES` | 可选，默认 2 |

索引阶段缺少配置或远端失败会把目标写为 `index_failed` 并产生 `rag.index_failed` 通知，不静默标记成功。搜索阶段如果 embedding 查询向量不可用，只返回精确文本命中的旧 chunk，不把历史 96 维本地 hash 向量继续用于语义相似度。精确文本匹配必须下推到 SQL 并覆盖整个工作空间，向量相似度候选也必须覆盖全部兼容 embedding chunk，禁止用“最新 N 条 chunk”作为候选全集。

### 5.2 Worker 模块：`rag-worker.ts`

- 后台 jobQueue 消费者，claim `rag.index` 类型的 job
- 显式 `rag.index` job 默认按 `manual` 事件执行，deferred 目标也会真实重建
- 普通补偿扫描只处理非 deferred pending
- 每天 03:00 运行夜间入口，顺序为 `indexAllPending({ includeDeferred: true, event: "nightly" })` -> `graphRunner.runNightlyOnce()` -> `wikiRunner.runNightlyOnce()` -> `indexAllPending({ event: "nightly" })`
- Wiki agent 写入或保留但未索引的 `Wiki/*.md` 会以 `refresh_policy=immediate`、`last_event=nightly` 标记为 pending，并在本轮 Wiki 后的 non-deferred RAG 扫描中消费。

### 5.3 检索 API：`/api/search/content`

```
GET /api/search/content?q={query}&limit={limit}
Response: { results: [{ targetPath, matchCount, preview }] }

POST /api/workspace/rag/refresh
Body: { path }
Response: { success, indexed, skipped?, error? }
```

## 6. 索引入口完整性

当前已实现：
- ✅ 表结构 + 索引（search_index_status + search_chunks）
- ✅ 生产端写入（上传/编辑/转换）
- ✅ content_hash 真实计算
- ✅ **消费端实现**：chunk → 存储 → 可检索
- ✅ **检索 API**：基于 chunk 文本 + SiliconFlow embedding vector 的检索，返回来源路径、标题路径和行号定位
- ✅ **Worker**：后台自动消费 pending 队列，并提供夜间 deferred 扫描入口
- ✅ 增量判断依据（hash 未变跳过重建，hash 变更触发重索引）
- ✅ 普通 Markdown 编辑延迟索引，手动刷新或夜间任务立即索引
- ✅ 空间 `index.html` 可作为 HTML 标准源进入 RAG
- ✅ 图片原文件可作为视觉标准源进入 RAG；图片 OCR `.md` 产物仍按文本标准源进入 RAG
- ✅ realpath/symlink 越界防护
- ✅ 文件删除删除 chunk，文件移动/改名更新 metadata
- ✅ 索引失败写入 `notification_events`

## 7. 与周边模块接口

### 7.1 文件转换 worker (`file-conversion-worker.ts`)

```typescript
// 转换成功后写入 search_index_status pending
const mdPath = filePath.replace(/\.[^.]+$/, ".md");
const mdBuffer = downloaded.find(d => d.artifact.name.endsWith(".md"))?.buffer ?? null;
const mdHash = mdBuffer ? crypto.createHash("sha256").update(mdBuffer).digest("hex") : "";
db.prepare(`INSERT INTO search_index_status ...`).run(mdPath, mdHash, now);
// RAG worker 随后消费该 pending 记录
```

### 7.2 文件上传 API (`workspace-data.ts`)

```typescript
// Markdown/空间 HTML/图片标准源上传后直接标记 pending，并立即尝试 RAG 索引
await markRagTargetPending(entry.path, {
  workspaceDir: defaultWorkspaceDir,
  refreshPolicy: "immediate",
  event: "upload",
});
await indexPendingTarget(entry.path, {
  workspaceDir: defaultWorkspaceDir,
  event: "upload",
});
```

### 7.3 Markdown 编辑 API (`index.ts` PUT /api/files/content)

```typescript
// 保存后更新 hash 并标记 pending（触发重索引）
const contentHash = crypto.createHash("sha256").update(payload.content).digest("hex");
db.prepare(`INSERT INTO search_index_status ... ON CONFLICT ...`).run(posixPath, contentHash, now);
```

Markdown 编辑保存使用 `refresh_policy=deferred`，保留旧 chunks，等待手动刷新或夜间任务重建。空间 `index.html` 编辑保存使用 `refresh_policy=immediate`，因为空间作品预览依赖当前 HTML 真源，保存后应尽快进入 RAG 消费队列。

## 8. 文件关联

- `packages/server/src/db/migrations.ts` — 表定义（v13、v15 embedding_vector）
- `packages/server/src/rag-indexer.ts` — 消费链路核心
- `packages/server/src/rag-worker.ts` — 后台 worker
- `packages/server/src/routes/core.ts` — /api/search/content 检索端点
- `packages/server/src/routes/workspace-search.ts` — `/api/workspace/rag/refresh` 手动刷新端点
- `packages/server/src/routes/workspace-data.ts` — 上传写入
- `packages/server/src/index.ts` — Markdown 编辑写入 + worker 启动
- `packages/server/src/file-conversion-worker.ts` — 转换后写入
- `packages/server/src/conversion-service-client.ts` — 音频 `format: "markdown"` 契约

## 9. 变更记录

- **2026-05-14**：完成真实消费链路（Task 20 第三轮评审修复）
  - 新增 `search_chunks` 表存储实际 chunk 内容
  - 新增 `rag-indexer.ts`：chunk → 存储 → 检索 完整链路
  - 新增 `rag-worker.ts`：后台 jobQueue 消费者
  - 新增 `/api/search/content` 检索 API
  - 移除 auth.ts VITEST 白名单绕过（根因修复）
  - 修复 `createAuthenticatedAgent` 直接注入 session cookie
  - 5 项集成测试覆盖：Markdown 上传/编辑/OCR/检索/缺失源处理
- **2026-05-15**：完成 Task 22/23 标准产物 RAG 索引与刷新规则
  - `search_chunks` 增加 `source_path`、`heading_path`、`content_hash`、`file_type`、`embedding_id`、行号字段
  - Markdown 按标题、段落、表格、代码块切 chunk，并读取 `.metadata.json`
  - 外部路径、`.ridge`、`.originals` 不进入 RAG
  - 上传 Markdown 同步索引；普通编辑延迟；手动刷新立即重建
  - 删除/移动文件同步 RAG 表；索引失败写通知中心
- **2026-05-15**：补齐 Task 22/23/24 验收缺口
  - `search_chunks.embedding_vector` 持久化 embedding vector，检索时参与排序和召回
  - deferred 编辑由 RAG worker 夜间入口消费
  - content hash 未变跳过 chunk 重建
  - 空间 `index.html`、项目内文件、记忆、Wiki 均可进入 RAG
  - 手动刷新和索引消费增加 realpath/symlink 越界防护
- **2026-05-15**：切换 SiliconFlow 多模态 embedding
  - 默认使用 `Qwen/Qwen3-VL-Embedding-8B`
  - Markdown/HTML 使用文本 embedding，图片原文件使用图片 embedding
  - 历史 `local-hash-embedding` 不再参与语义相似度，只保留精确文本召回
