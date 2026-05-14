# 20 音频图片 Markdown 处理 — 实现完成

## 目标

实现音频、图片和 Markdown 的文件处理规则，包含**真实可执行的 RAG/向量索引消费链路**。

## 范围

- 音频转写 Markdown。
- 音频 metadata。
- 分段时间戳。
- 图片 OCR。
- 图片 metadata。
- **图片 OCR 文本进入真实可检索链路**（RAG 消费端实现）。
- Markdown 直接作为文本资产。
- **Markdown 上传/编辑后内容进入真实可检索链路**。

## 不做

- 图片第一版不生成视觉描述。
- 音频采集当场不转写（走后台异步 worker）。

## 验收

- [x] 音频原件归档。
- [x] **图片 OCR 文本真实可检索**（chunk → 存储 → LIKE 检索命中）。
- [x] **Markdown 当前内容是 RAG 真源**（上传后可直接检索）。
- [x] **Markdown 编辑后内容更新并重新可检索**。
- [x] 用户编辑 Markdown 后自动转换不得覆盖。
- [x] 图片不生成视觉描述。
- [x] 前端支持音频文件预览。
- [x] **全量测试通过**（371 passed, 5 项 RAG 集成测试）。

## 关联设计

- `文档/模块梳理/search-index-status与RAG索引入口.md`
- `文档/项目设计/文件处理流程.md`
- `文档/项目设计/闪念系统与桌面采集.md`

## 实现变更

### 1. 真实 RAG 消费链路（核心——第三轮评审修复）

#### 1.1 新增 `search_chunks` 表（v13 迁移）

```sql
CREATE TABLE search_chunks (
  chunk_id TEXT PRIMARY KEY,
  target_path TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  created_at INTEGER,
  updated_at INTEGER
);
```

#### 1.2 `rag-indexer.ts` — 消费核心

- `chunkText()`：1000 字符分片，200 字符重叠
- `indexPendingTarget()`：
  1. 读取 `search_index_status.pending`
  2. 读取当前 `.md` 文件内容
  3. 计算 content_hash（SHA256）
  4. chunk 文本
  5. 原子事务：删除旧 chunks → 写入新 chunks → 更新 status=indexed
- `searchContent()`：基于 `LIKE` 的 chunk 文本检索
- `indexAllPending()`：批量扫描并消费

#### 1.3 `rag-worker.ts` — 后台 Worker

- claim `rag.index` 类型 jobQueue job
- 调用 `indexPendingTarget()` 执行索引
- 成功 complete，失败 fail 触发重试

#### 1.4 `/api/search/content` — 检索 API

```
GET /api/search/content?q={query}&limit={limit}
Response: { results: [{ targetPath, matchCount, preview }] }
```

### 2. Worker 按任务类型传递正确 Options (`file-conversion-worker.ts`)

- `document.markdown`：`engine: "markitdown", extractImages: true, extractTables: true`
- `audio.transcription`：`language: "auto", segmentDuration: 30, format: "markdown"`
- `image.ocr`：`language: "auto", outputBlocks: true`

### 3. Markdown 直接作为文本资产 (`workspace-data.ts`)

- `.md`/`.markdown` 文件上传后注册 `converted` 状态，跳过转换队列
- 同时注册 `search_index_status` 为 `pending`，**RAG worker 随后真实消费**
- content_hash 基于真实文件内容 SHA256

### 4. 转换成功即入 RAG 队列 (`file-conversion-worker.ts`)

- 音频/图片/文档转换成功后，将产物 `.md` 路径写入 `search_index_status`
- 包含内容 hash，用于增量判断
- **RAG worker 随后真实 chunk 并存储**

### 5. Markdown 编辑触发 RAG 重索引 (`index.ts` PUT /api/files/content)

- Markdown 保存后计算新内容 hash
- 更新 `search_index_status` 为 `pending`
- **RAG worker 随后重新 chunk，旧 chunks 被替换，检索使用最新内容**

### 6. 音频预览完整链路

- `file-preview.ts`：新增 `audioMimeTypesByExtension` 映射，返回 `previewKind: "audio"`
- `packages/protocol/src/index.ts`：`FilePreviewKind` 新增 `"audio"`
- `WorkspaceContentArea.vue`：`activeBlobUrl` 同时处理 image 和 audio
- `WorkbenchOperationPanel.vue`：同上
- `WorkbenchReadonlyFilePreview.vue`：音频渲染 HTML5 `<audio>` 播放器
- 后端 `/api/files/blob`：允许 image + audio MIME 类型安全返回

### 7. 契约类型一致 (`conversion-service-client.ts`)

- `AudioTranscriptionOptions.format` 新增 `"markdown"` 联合类型成员
- Worker 使用 `ConversionOptions` 类型而非 `Record<string, unknown>`

### 8. auth 根因修复（测试稳定性）

- **移除 `auth.ts` VITEST 白名单绕过**：`requireApiAuth` 不再检查 `x-test-client-key`
- **重写 `test/auth.ts`**：`createAuthenticatedAgent` 直接调用 `authRuntime.createSessionCookie()`，通过 Proxy 注入 Cookie header，不再依赖登录端点和 cookie jar 状态
- **恢复 `vitest-setup.ts` 中的 `authRuntime.resetForTests()`**：每个 test file 开始前重置，因为新方案不依赖登录持久化

### 9. 测试覆盖

#### 9.1 RAG 消费链路测试 (`rag-consumer.test.ts`)

- ✅ Markdown 上传后真实 chunk 并可检索命中
- ✅ Markdown 编辑后 hash 更新、重新 chunk、旧内容不可检索
- ✅ 模拟 OCR 内容真实可检索
- ✅ 缺失内容源优雅降级（index_failed）
- ✅ `/api/search/content` 端点返回真实结果

#### 9.2 content_hash 断言 (`file-processing-status.test.ts`)

- ✅ Markdown 上传 hash 断言
- ✅ Markdown 编辑后 hash 更新断言
- ✅ 转换成功 hash 写入断言

#### 9.3 原有测试

- 后端：371 passed（新增 5 项 RAG 测试）
- 前端：261 passed
- `npm run check`：0 errors, 21 warnings（历史 any，本任务未引入新 warning）

## 文件变更清单

- `packages/server/src/db/migrations.ts` — v13 search_chunks 表
- `packages/server/src/rag-indexer.ts` — 新增（消费核心）
- `packages/server/src/rag-worker.ts` — 新增（后台 worker）
- `packages/server/src/routes/core.ts` — /api/search/content 端点
- `packages/server/src/auth.ts` — 移除 VITEST 白名单
- `packages/server/src/test/auth.ts` — 直接注入 session cookie
- `packages/server/src/test/vitest-setup.ts` — 恢复 resetForTests()
- `packages/server/src/index.ts` — 启动 RAG worker + crypto import
- `packages/server/src/__tests__/rag-consumer.test.ts` — 新增 5 项测试
- `packages/server/src/__tests__/file-processing-status.test.ts` — 补充 hash 断言

## 归档日期

2026-05-14（第三轮评审修复完成）
