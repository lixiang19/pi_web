# 41 Python 通用转化服务契约消费实现

> **状态**：已完成（2026-05-13）<br>
> **定位**：ridge Node 后端消费独立 Python 通用转化服务 API 契约的完整实现。

---

## 1. 实现范围

### 1.1 已完成模块

| 模块 | 路径 | 职责 |
|------|------|------|
| 类型定义 + HTTP 客户端 | `packages/server/src/conversion-service-client.ts` | 契约 TypeScript 类型、`ConversionServiceClient`（multipart 上传、查询、取消、产物下载/inline 解析）、错误映射、配置读写（`app_settings` 表）、产物落盘（含 `_ridge` 和 `mdHash`） |
| 后台 Worker | `packages/server/src/file-conversion-worker.ts` | `file.convert` worker：调用 Python 服务、阻塞补偿轮询（30s 间隔 / 10min 最大）、全局持续补偿扫描（60s 间隔）、`handleConversionResult` 幂等 |
| 回调 Webhook | `packages/server/src/routes/conversion-webhook.ts` | `POST /api/webhooks/conversion`，token 验签、workspace 路径遍历校验、调用 `handleConversionResult` |
| 上传触发 | `packages/server/src/routes/workspace-data.ts` | 上传后按 `isConvertibleExtension` 入队 `file.convert`（仅在 `isConversionEnabled() === true` 时） |
| 手动重转换 | `packages/server/src/routes/workspace-files.ts` | `POST /api/workspace/files/convert` 重置为 `pending` 并重新入队，支持 `.originals/` 回退与编辑守卫 |
| 入口集成 | `packages/server/src/index.ts` | `startServer` 中从 `app_settings` 读取配置、创建 `ConversionServiceClient`、注册 webhook 路由、启动 worker、暴露 `isConversionEnabled` |
| 持久化表 | `python_conversion_jobs`（migration 12） | 持久化 `python_job_id`、`client_job_id`、`status`，支持进程重启后恢复轮询和持续扫描 |

### 1.2 已废弃模块

- `packages/server/src/file-converter.ts`：旧 JS 自研 PDF/Word/HTML 解析栈，不再被任何业务代码调用，仅保留为历史参考。

---

## 2. 关键修复（第四轮 reviewer 必须项）

### 2.1 callbackBaseUrl 不再默认 localhost（必须项 #1）

**修复前**：未配置 `callbackBaseUrl` 时默认使用 `http://127.0.0.1:${port}/api/webhooks/conversion`，向 Python 服务传递不可达的回调地址。
**修复后**：`callbackBaseUrl` 仅在显式配置时才设置 `callbackUrl`；未配置时传 `undefined`，Python 服务无回调，ridge 纯依赖补偿轮询。

### 2.2 logical path 与 actual source path 严格分离（必须项 #2）

**修复前**：`workspace-files.ts` 将 `.originals/` 实际路径塞进 `payload.sourcePath`，worker 当作逻辑路径使用。
**修复后**：
- `manual convert` / `retry` 的 job payload 不再包含 `sourcePath`（仅含 `workspaceDir`）。
- Worker 使用 `job.relatedId` 作为逻辑主键（DB 状态机/file_processing_status）。
- `resolveActualSourcePath(logicalPath)` 在 worker 内部解析 `.originals/` fallback，仅用于 Python 上传。

### 2.3 writeArtifactsToWorkspace 支持 already-archived（必须项 #3）

**修复前**：`writeArtifactsToWorkspace` 固定 `fs.rename(sourcePath, archivedTo)`，logical source 不存在时抛出 ENOENT。
**修复后**：
- 先检查 sourcePath 是否存在；不存在时检查 `.originals/` fallback。
- 如果 source 已在 `.originals/` 中，跳过归档步骤（`archivedTo = null`）。
- Metadata `_ridge.sourcePath` 始终是 logical path，不变成 `.originals/` 实际路径。

### 2.4 manual / retry / upload 增加 conversion enabled gate（必须项 #4）

**修复前**：`POST /convert`、`POST /retry` 在 Python 服务未启用时仍然改状态并入队，返回虚假 `enqueued: true`。
**修复后**：
- `workspace-files.ts` 增加 `isConversionEnabled?: () => boolean` 依赖。
- `POST /convert` 和 `POST /retry` 开头检查 `deps.isConversionEnabled?.()`，未启用返回 `503`。
- `index.ts` 创建 router 时传入 `isConversionEnabled`。

### 2.5 Transient retry 耗尽后必须 convert_failed（必须项 #5）

**修复前**：transient retry 无限回到 `pending`，可能死循环。
**修复后**：`handleConversionResult` 检查 `background_jobs.attempt_count >= max_attempts`；耗尽后直接调用 `failConversion`，`file_processing_status` 进入 `convert_failed` 并写 `notification_events`，三表状态一致。

### 2.6 Artifact 落盘 staging + atomic rollback（必须项 #6）

**修复前**：中途失败只 rollback 原文件，不保护旧 `.md/.metadata.json/.assets`。
**修复后**：
- Stage 1：备份旧产物到 `.ridge-staging-<basename>-<timestamp>/`。
- Stage 2：写入新产物到 `.tmp-<basename>-<timestamp>/`。
- Stage 3：原子提交（归档 → 移动产物 → 清理 staging）。
- 失败时 rollback：恢复旧产物、恢复归档的原文件、清理临时目录。

### 2.7 Webhook realpath 父级逐级解析（必须项 #7）

**修复前**：`assertWebhookPathSafe` 对不存在目标直接降级到 `path.resolve`，不检测父级 symlink 绕过。
**修复后**：逐级向上 `fs.realpath` 已存在父目录，将 resolved 后缀拼接到 realParent 上；同时 `realpath(workspaceDir)` 确保比较基准正确。

### 2.8 downloadArtifact 与 downloadArtifacts 约束一致（必须项 #8）

**修复前**：`downloadArtifact()` 无 timeout、无 maxSize、错误类型为原生 Error。
**修复后**：
- `downloadArtifact(jobId, artifactId, opts)` 支持 `timeoutMs`（`AbortController`）和 `maxSizeBytes`。
- 大小超限抛出 `ConversionServiceError("file_too_large", 413)`。
- `downloadSingleArtifact` fallback 调用时同样传递 `opts`。

---

## 3. 测试覆盖

### 3.1 已存在并通过的测试

| 测试文件 | 覆盖点 | 状态 |
|---------|--------|------|
| `conversion-service-client.test.ts` | Fake HTTP Server 全端点、401 错误、配置读写、类型校验 | 26 项通过 |
| `file-conversion-worker.test.ts` | Worker 成功路径、失败路径、无 status 跳过、非 pending 拒绝、幂等、retry 去重 | 6 项通过 |
| `conversion-comprehensive.test.ts`（新增） | Transient retry 耗尽后 convert_failed+通知、staging+rollback 保护旧产物、already-archived source 支持、downloadArtifact timeout 约束、webhook 空 token 拒绝 | 5 项通过 |
| `file-upload-convert-trigger.test.ts` | 未配置时不 enqueue | 1 项通过 |
| `manual-convert-api.test.ts` | pending 返回 note、converted 编辑守卫、force 覆盖、.originals 回退、404 缺失 | 6 项通过 |
| `file-conversion-e2e.test.ts` | 树状态继承、DOCX 树状态、enqueue 行为、retry 清除旧 job | 5 项通过 |
| `pdf-word-conversion.test.ts` | 旧自研栈单元测试（保留历史） | 8 项通过 |

---

## 4. 构建与测试状态

```
npm run build --workspace @pi/server   ✓ 0 errors
npm run check                           ✓ 0 errors, 22 warnings（历史 any）
cd packages/server && pnpm test         ✓ 36 files, 352~353 tests passed
```

---

## 5. 仍需注意事项

1. **前端界面**：Web 前端仍需展示 `file_processing_status` 的 `converting` 状态（当前可能只展示 `pending`/`converted`/`convert_failed`）。
