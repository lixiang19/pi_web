# 20 音频/图片/Markdown 处理 — 第三轮评审修复完成

## 日期
2026-05-14

## 逐项实现/修复内容

### 1. Auth 根因修复（已移除白名单绕过）
- **移除** `auth.ts` `requireApiAuth` 中的 VITEST 白名单绕过：`process.env.VITEST && x-test-client-key` 判断已删除
- **重写** `test/auth.ts`：`createAuthenticatedAgent` 直接调用 `authRuntime.createSessionCookie()`，通过 Proxy 注入 `Cookie` header，不再依赖登录端点和 cookie jar 持久化
- **结果**：每个 test file 自包含，无需 resetForTests，不同 test file 在同进程运行不互相破坏 session

### 2. 真实 RAG 消费链路（核心要求）
- **新增 `search_chunks` 表**（v13 迁移）：存储实际 chunk 文本内容
- **`rag-indexer.ts`**：
  - `chunkText()`：1000 字符分片，200 字符重叠
  - `indexPendingTarget()`：读取 pending → 读取 .md 内容 → 计算 SHA256 hash → chunk → 原子事务（删旧 chunks + 写新 chunks + 更新 status=indexed）
  - `searchContent()`：基于 `LIKE lower(chunk_text)` 的文本检索
  - `indexAllPending()`：批量扫描消费
- **`rag-worker.ts`**：后台 jobQueue 消费者，claim `rag.index` job，调用 `indexPendingTarget()`
- **服务启动**：`index.ts` `startServer()` 中启动 RAG worker

### 3. 图片 OCR 文本进入检索链路
- 转换 worker (`file-conversion-worker.ts`) 成功后将产物 `.md` 写入 `search_index_status.pending`
- RAG worker 消费后 chunk 存储，可通过 `/api/search/content?q=...` 检索命中
- **测试证明**：模拟 OCR 内容（"Invoice 12345", "$1,250.00"）可被检索命中

### 4. Markdown 上传/编辑进入检索链路
- **上传**：`workspace-data.ts` 上传 .md 后写入 `search_index_status.pending`，hash 基于文件内容 SHA256
- **编辑**：`index.ts` PUT /api/files/content 保存后更新 hash 并标记 pending，旧 chunks 被替换
- **测试证明**：
  - Markdown 上传后真实 chunk 并可检索
  - 编辑后检索使用最新内容（旧内容不可检索）

### 5. content_hash 断言补齐
- `file-processing-status.test.ts` 新增 3 项断言：
  - Markdown 编辑后 `search_index_status.content_hash` 更新为新内容 SHA256
  - 转换成功 `search_index_status.content_hash` 基于 artifact buffer SHA256

### 6. 文档同步更新
- `文档/模块梳理/search-index-status与RAG索引入口.md`：更新为"已实现并消费"，新增消费链路实现、search_chunks 表结构、检索 API
- `文档/功能开发/归档/20-音频图片Markdown处理.md`：更新归档，标注"真实消费链路"和"auth 根因修复"

### 7. 文件变更清单
- `packages/server/src/db/migrations.ts` — v13 search_chunks 表
- `packages/server/src/rag-indexer.ts` — 新增（消费核心，chunk+检索）
- `packages/server/src/rag-worker.ts` — 新增（后台 worker）
- `packages/server/src/routes/core.ts` — /api/search/content 检索端点
- `packages/server/src/auth.ts` — 移除 VITEST 白名单
- `packages/server/src/test/auth.ts` — 直接注入 session cookie
- `packages/server/src/test/vitest-setup.ts` — 移除 resetForTests
- `packages/server/src/index.ts` — 启动 RAG worker + crypto import
- `packages/server/src/__tests__/rag-consumer.test.ts` — 新增 5 项 RAG 测试
- `packages/server/src/__tests__/file-processing-status.test.ts` — 补充 2 项 hash 断言

## 测试/检查结果

### TypeScript / ESLint
```
npm run check: ✅ 0 errors, 21 warnings（全部为历史 any 警告，与本次改动无关）
```

### 测试
```
根目录 pnpm test: ✅
- packages/web: 35 files, 261 tests passed
- packages/server: 36 files, 378 tests passed（含 5 项 RAG 集成测试）
```

### 服务端独立测试（5x 连续运行）
```
Run 1: 36 passed, 378 passed ✅
Run 2: 36 passed, 378 passed ✅
Run 3: 36 passed, 378 passed ✅
Run 4: 36 passed, 378 passed ✅
Run 5: 36 passed, 378 passed ✅
```

## 是否可上线

**是。Task 20 已完成所有 reviewer 要求：**

1. ✅ 移除测试白名单绕过，auth 根因修复
2. ✅ 真实消费链路实现（pending → chunk → 存储 → 检索）
3. ✅ 图片 OCR 文本可检索、Markdown 上传/编辑后内容可检索
4. ✅ 测试证明检索命中（5 项 RAG 测试 + hash 断言）
5. ✅ content_hash 在 edit 和 conversion 路径有断言
6. ✅ 模块梳理文档已更新
7. ✅ npm run check 0 错误、pnpm test 通过

## 阻塞项

**无阻塞。** 全量测试通过，TypeScript 检查通过。