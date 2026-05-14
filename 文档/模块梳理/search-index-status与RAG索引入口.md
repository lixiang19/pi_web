# search_index_status 与 RAG 索引入口模块契约

> 状态：**已实现并消费**（完整可执行 RAG 消费链路）
> 对应功能：Task 20（音频/图片/Markdown 处理）

## 1. 模块定位

`search_index_status` 是 ridge 的**待索引内容队列**，连接内容生产端（文件转换、Markdown 编辑）与 RAG 消费端（chunk 索引 worker）。

- **生产方**：文件转换 worker（audio→md、image→OCR md、document→md）、Markdown 上传/编辑
- **消费方**：`rag-worker.ts`（轮询 pending → chunk → 存储 → 可检索）
- **中间层**：`search_index_status` 表（`pending`/`indexed`/`index_failed` 三态）+ `search_chunks` 表（实际 chunk 存储）

## 2. 表结构

### 2.1 search_index_status（队列状态）

```sql
CREATE TABLE IF NOT EXISTS search_index_status (
  target_path TEXT PRIMARY KEY,      -- 产物 .md 路径（RAG 真源）
  target_type TEXT NOT NULL DEFAULT 'file',  -- 固定 'file'
  status TEXT NOT NULL DEFAULT 'pending',      -- pending | indexed | index_failed
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
  chunk_index INTEGER NOT NULL,        -- 分片序号
  chunk_text TEXT NOT NULL,            -- 分片文本（可检索真源）
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_search_chunks_target
  ON search_chunks(target_path, chunk_index);
CREATE INDEX IF NOT EXISTS idx_search_chunks_text
  ON search_chunks(chunk_text);         -- LIKE 检索索引
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
- **任何状态 → pending**：内容变更（Markdown 编辑、重新转换）时强制覆盖，并删除旧 chunks

## 4. 内容源与 content_hash 规则

| 源类型 | target_path | content_hash 计算方式 | 生产时机 |
|--------|-------------|----------------------|----------|
| Markdown 上传 | 原 `.md` 路径 | `SHA256(文件内容)` | 上传 API 落盘后 |
| Markdown 编辑 | 原 `.md` 路径 | `SHA256(新内容)` | PUT /api/files/content 保存后 |
| 音频转换产物 | `.md` 产物路径 | `SHA256(md artifact buffer)` | worker 写盘后 |
| 图片 OCR 产物 | `.md` 产物路径 | `SHA256(md artifact buffer)` | worker 写盘后 |
| 文档转换产物 | `.md` 产物路径 | `SHA256(md artifact buffer)` | worker 写盘后 |

hash 为空字符串 `""` 不再出现；所有写入均基于真实内容。

## 5. 消费链路实现

### 5.1 核心模块：`rag-indexer.ts`

```typescript
// 1. 读取 pending 目标
// 2. 解析内容源（直接读取 .md 文件）
// 3. Chunk 文本（默认 1000 字符，200 重叠）
// 4. 原子事务：删除旧 chunks + 写入新 chunks + 更新 status=indexed
// 5. 返回 { success, indexed, error? }

export async function indexPendingTarget(targetPath: string): Promise<{
  success: boolean;
  indexed: boolean;
  error?: string;
}>;

// 批量扫描并索引所有 pending
export async function indexAllPending(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}>;

// 基于 LIKE 的文本检索（已索引内容）
export async function searchContent(
  query: string,
  limit?: number
): Promise<Array<{
  targetPath: string;
  matchCount: number;
  preview: string;
}>>;
```

### 5.2 Worker 模块：`rag-worker.ts`

- 后台 jobQueue 消费者，claim `rag.index` 类型的 job
- 调用 `indexPendingTarget()` 执行索引
- 支持手动触发（`indexAllPending()`）和后台自动轮询

### 5.3 检索 API：`/api/search/content`

```
GET /api/search/content?q={query}&limit={limit}
Response: { results: [{ targetPath, matchCount, preview }] }
```

## 6. 索引入口完整性

当前已实现：
- ✅ 表结构 + 索引（search_index_status + search_chunks）
- ✅ 生产端写入（上传/编辑/转换）
- ✅ content_hash 真实计算
- ✅ **消费端实现**：chunk → 存储 → 可检索
- ✅ **检索 API**：基于 LIKE 的文本检索
- ✅ **Worker**：后台自动消费 pending 队列
- ✅ 增量判断依据（hash 变更触发重索引）

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
// Markdown 文件上传后直接标记 pending
const mdContent = await fs.readFile(entry.path, "utf-8");
const mdHash = crypto.createHash("sha256").update(mdContent).digest("hex");
db.prepare(`INSERT INTO search_index_status ...`).run(entry.path, mdHash, now);
```

### 7.3 Markdown 编辑 API (`index.ts` PUT /api/files/content)

```typescript
// 保存后更新 hash 并标记 pending（触发重索引）
const contentHash = crypto.createHash("sha256").update(payload.content).digest("hex");
db.prepare(`INSERT INTO search_index_status ... ON CONFLICT ...`).run(posixPath, contentHash, now);
```

## 8. 文件关联

- `packages/server/src/db/migrations.ts` — 表定义（v13）
- `packages/server/src/rag-indexer.ts` — 消费链路核心
- `packages/server/src/rag-worker.ts` — 后台 worker
- `packages/server/src/routes/core.ts` — /api/search/content 检索端点
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
