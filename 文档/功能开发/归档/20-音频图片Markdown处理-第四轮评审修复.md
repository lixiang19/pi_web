# 20 音频/图片/Markdown 处理 — 第四轮评审修复完成

## 日期
2026-05-14

## 逐项实现/修复内容

### 1. Auth 根因修复（保持）
- **移除** `auth.ts` `requireApiAuth` 中的 VITEST 白名单绕过
- **重写** `test/auth.ts`：`createAuthenticatedAgent` 直接调用 `authRuntime.createSessionCookie()`，通过 Proxy 注入 `Cookie` header
- **不**在 `vitest-setup.ts` 中调用 `resetForTests()`，避免跨 test file session 破坏

### 2. RAG 生产闭环（第四轮核心修复）

#### 2.1 生产端 enqueue（三个路径全部补齐）
- **Markdown 上传**（`workspace-data.ts`）：上传 .md 后写入 `search_index_status.pending` + **enqueue `rag.index` job**
- **Markdown 编辑**（`index.ts`）：PUT /api/files/content 保存后写入 `search_index_status.pending` + **enqueue `rag.index` job**
- **转换成功**（`file-conversion-worker.ts`）：写入 `search_index_status.pending` + **enqueue `rag.index` job**

#### 2.2 消费端 worker（rag-worker.ts）
- claim `rag.index` jobQueue job，调用 `indexPendingTarget()` 执行索引
- **新增补偿扫描**：每 30 秒调用 `indexAllPending()`，消费可能未被 job 覆盖的 pending 条目

#### 2.3 检索端点（routes/core.ts）
- `GET /api/search/content?q=...&limit=...` 返回 `{ results: [{ targetPath, matchCount, preview }] }`

### 3. 真实后台消费链路测试（rag-worker-e2e.test.ts）

#### 3.1 上传后 worker 自动消费
- 上传 .md 后 **验证 `rag.index` job 被 enqueue**（不手动调用 indexer）
- **claim job + 调用 `ragWorker.processOne()`** 模拟后台 worker
- 验证 `search_chunks` 被创建、`search_index_status` 变为 `indexed`
- 通过 `/api/search/content` **API 真实命中**上传内容

#### 3.2 编辑后 worker 自动替换旧 chunks
- 编辑 .md 后 **验证新的 `rag.index` job 被 enqueue**
- claim job + 调用 worker
- **新内容可通过搜索 API 命中**
- **旧内容不可检索**（旧 chunks 已被删除）

### 4. 图片 OCR 真实转换链路测试（file-conversion-worker.test.ts）
- 使用 `handleConversionResult()` **实际调用**（不是模拟）
- mock client 返回 `image.ocr` 产物（含 "Invoice 12345", "$1,250.00"）
- 验证：
  - **真实 `.md` 文件落盘**到 workspace
  - `search_index_status` 写入 **真实 hash**（来自 artifact buffer SHA256）
  - **`rag.index` job 被 enqueue**

### 5. 转换成功 hash 真实路径测试（file-conversion-worker.test.ts）
- 使用 `createFileConversionWorker().processOne()` **实际 worker 调用**
- mock Python client 返回 `.md` artifact
- 验证：
  - `search_index_status.content_hash` 等于 **artifact buffer 的 SHA256**
  - **`rag.index` job 被 enqueue**（production chain 真实闭环）

### 6. content_hash 断言补齐（file-processing-status.test.ts）
- Markdown 编辑后 hash 更新断言
- 转换成功 hash 写入断言

### 7. 文档同步（与实际代码一致）
- `文档/模块梳理/search-index-status与RAG索引入口.md`：更新为"已实现并消费"，新增 enqueue 机制、补偿扫描、worker processOne 调用模式
- `文档/功能开发/归档/20-音频图片Markdown处理.md`：更新归档，标注第四轮修复内容

## 文件变更清单

- `packages/server/src/db/migrations.ts` — v13 search_chunks 表
- `packages/server/src/rag-indexer.ts` — chunk + 检索核心
- `packages/server/src/rag-worker.ts` — 后台 worker（含补偿扫描）
- `packages/server/src/routes/core.ts` — /api/search/content 端点
- `packages/server/src/routes/workspace-data.ts` — 上传后 enqueue rag.index
- `packages/server/src/index.ts` — 编辑后 enqueue rag.index + worker 启动
- `packages/server/src/file-conversion-worker.ts` — 转换成功后 enqueue rag.index
- `packages/server/src/auth.ts` — 移除 VITEST 白名单
- `packages/server/src/test/auth.ts` — 直接注入 session cookie
- `packages/server/src/test/vitest-setup.ts` — 不调用 resetForTests
- `packages/server/src/__tests__/rag-consumer.test.ts` — 5 项 RAG 功能测试
- `packages/server/src/__tests__/rag-worker-e2e.test.ts` — 2 项 worker 生产链路测试
- `packages/server/src/__tests__/file-conversion-worker.test.ts` — 2 项真实转换路径测试
- `packages/server/src/__tests__/file-processing-status.test.ts` — 2 项 hash 断言

## 测试/检查结果

### TypeScript / ESLint
```
npm run check: ✅ 0 errors, 21 warnings（全部为历史 any 警告）
```

### 根目录 pnpm test
```
packages/web: 35 files, 261 tests passed ✅
packages/server: 37 files, 381 tests passed ✅
```

### 服务端独立测试
```
37 files passed, 381 tests passed ✅
```

## 是否可上线

**是。** 第四轮 reviewer 要求全部完成：

1. ✅ RAG worker 生产路径入队：上传/编辑/转换成功后均 enqueue `rag.index`
2. ✅ RAG 测试证明真实后台消费链路：不手动调用 indexer，通过 claim job + processOne 模拟 worker，搜索 API 命中
3. ✅ 图片 OCR 真实转换链路：handleConversionResult / processOne 实际调用，真实 .md 落盘
4. ✅ 转换成功 hash 真实路径测试：processOne 实际调用，artifact buffer hash 被写入
5. ✅ 文档与实际代码一致：归档和模块梳理已按最终实现更新
6. ✅ npm run check 0 错误、pnpm test 通过
7. ✅ auth 白名单绕过保持移除、音频 blob 保持

## 阻塞项

**无阻塞。** 全量测试通过，TypeScript 检查通过。
