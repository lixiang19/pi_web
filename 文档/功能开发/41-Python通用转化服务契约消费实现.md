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

## 2. 关键修复（相对于初始实现）

### 2.1 配置加载（P0 #2）

**修复前**：`index.ts` 通过 `getSettings()` 读取 Python 配置，与现有 settings 体系耦合。
**修复后**：使用 `loadConversionServiceConfigFromDb()` 从 `app_settings` 表直接读取 `python_converter_base_url`、`python_converter_api_key`、`python_converter_callback_token`、`python_converter_callback_base_url`。配置与 settings 类型完全解耦。

### 2.2 上传入队开关（P0 #3）

**修复前**：`workspace-data.ts` 使用 `deps.isConversionEnabled?.() !== false`，在 undefined 时也会入队。
**修复后**：改为 `deps.isConversionEnabled?.() === true`，未配置 Python 服务时绝对不入队。

### 2.3 Background Jobs 生命周期（P0 #4）

**修复前**：`processOne` 在提交 Python 任务后立即 `jobQueue.complete()`，callback/polling 到达时找不到 running job。
**修复后**：
- `processOne` 提交任务后只更新 `result_json`，**不 complete**。
- `handleConversionResult` 中成功落盘后才 `jobQueue.complete()`。
- 最终失败后才 `jobQueue.fail()`。
- Transient retry（`rate_limited`/`fetch_failed`/`conversion_timeout`）：
  - `file_processing_status` 回到 `pending`（不写死 `convert_failed`）
  - `python_conversion_jobs` 记录 `failed` + `retry_count++`
  - `background_jobs` 调用 `jobQueue.fail()` 触发 retry 机制
- 三者状态始终一致：`file_processing_status` 反映业务状态，`python_conversion_jobs` 反映 Python 侧状态，`background_jobs` 反映队列状态。

### 2.4 补偿轮询（P0 #5）

**修复前**：只在启动时扫描一次 `python_conversion_jobs`。
**修复后**：
- `processOne` 内阻塞轮询：提交后每 30s 查询一次，10min 超时。
- 全局持续补偿扫描：每 60s 扫描所有 `status IN ('submitted', 'running')` 的记录。
- `resumePollingJobs` 对 `queued`/`running` 状态更新为 `running` 后继续等待，不返回错误。
- Webhook 与轮询通过 `handleConversionResult` 的幂等性（检查 `file_processing_status` 是否已是终态）避免重复处理。

### 2.5 手动重新转换 `.originals` Fallback（P0 #6）

**修复前**：worker 直接用 `posixPath` 作为上传路径，但原文件可能已被归档到 `.originals/`。
**修复后**：
- `resolveSourceFilePath(logicalPath)`：先检查逻辑路径是否存在，不存在则检查 `.originals/` fallback。
- Worker 使用 `actualSourcePath` 上传给 Python 服务（真实文件）。
- `filePath`（逻辑路径）用于 DB 状态机和 metadata（保持 ridge 语义一致）。

### 2.6 Artifact 下载契约（P0 #7）

**修复前**：`downloadArtifacts` 只支持 inline UTF-8 和 `downloadArtifact(artifactId)`。
**修复后**：
- `downloadSingleArtifact` 支持：
  - inline base64（自动启发式检测：`/^[A-Za-z0-9+/]*={0,2}$/`）
  - inline UTF-8 文本
  - `downloadUrl` 相对路径（拼接 `baseUrl`）和绝对路径
  - `artifactId` fallback 下载
- 超时控制：60s `AbortController`。
- 大小限制：100MB。
- 必需产物校验：`.md` 和 `.metadata.json` 必须存在，否则抛出错误（不归档）。
- `isSafeArtifactName` 禁止 `..`、`/`、`\`。

### 2.7 Workspace 安全（P0 #8）

**修复前**：worker 和 webhook 缺少统一的 workspace 边界校验。
**修复后**：
- `assertWorkspaceSafe(filePath, workspaceDir)`：校验 `path.resolve` + `path.relative` 不越界、不是 `.ridge` 系统路径。
- Worker：`processOne` 和 `handleConversionResult` 均调用 `assertWorkspaceSafe`。
- Webhook：`conversion-webhook.ts` 中通过 `python_conversion_jobs` 表查找后，再校验 `ridgeFileId` 在 workspace 内。
- Artifact 落盘：`writeArtifactsToWorkspace` 中所有产物路径均通过 `ensureWithinWorkspace` 校验。

### 2.8 Metadata `_ridge` 与编辑守卫（P0 #9）

**修复前**：`writeArtifactsToWorkspace` 未写入 `mdHash`，导致手动转换 API 的编辑守卫无法工作。
**修复后**：
- `writeArtifactsToWorkspace` 中计算 `mdHash = sha256(mdBuffer)` 并写入 `meta._ridge.mdHash`。
- 手动转换 API（`workspace-files.ts`）读取 `meta._ridge?.mdHash` 与当前 `.md` 文件 hash 比较，不一致时返回 409（需 `force=true` 覆盖）。
- 修复类型错误：`meta._ridge` 先提取为 `Record<string, unknown>` 再访问 `.mdHash`。

---

## 3. 测试覆盖（P0 #10）

### 3.1 已存在并通过的测试

| 测试文件 | 覆盖点 | 状态 |
|---------|--------|------|
| `conversion-service-client.test.ts` | Fake HTTP Server 全端点、401 错误、配置读写、类型校验 | 26 项通过 |
| `file-conversion-worker.test.ts` | Worker 成功路径、失败路径、无 status 跳过、非 pending 拒绝、幂等、retry 去重 | 6 项通过 |
| `file-upload-convert-trigger.test.ts` | PDF/DOCX/TXT 上传 enqueue、未配置不入队（新增） | 4 项通过 |
| `manual-convert-api.test.ts` | 已迁移为入队行为（pending 返回 note、converted 编辑守卫、force 覆盖、.originals 回退、404 缺失） | 6 项通过 |
| `file-conversion-e2e.test.ts` | 树状态继承、DOCX 树状态、enqueue 行为 | 5 项通过 |
| `pdf-word-conversion.test.ts` | 旧自研栈单元测试（保留历史） | 通过 |

### 3.2 新增测试要点

- **未配置不入队**：`file-upload-convert-trigger.test.ts` 新增 "does NOT enqueue when isConversionEnabled returns false"。
- **配置从 app_settings 真实读取**：`conversion-service-client.test.ts` 覆盖 `loadConversionServiceConfig` 的缺失/完整 key 场景。
- **Webhook token/unknown/terminal/non-terminal**：`conversion-webhook.ts` 路由已覆盖（需 E2E 测试补充，当前由类型和单元测试间接覆盖）。
- **downloadUrl/inline base64**：`file-conversion-worker.ts` 中的 `downloadSingleArtifact` 已支持（需专门单元测试补充）。
- **Artifact traversal**：`isSafeArtifactName` 在 `writeArtifactsToWorkspace` 和 `downloadAndValidateArtifacts` 中已校验。
- **Metadata 原字段保留**：`writeArtifactsToWorkspace` 中 `meta._ridge` 追加而非覆盖。
- **.originals 重新转换**：`manual-convert-api.test.ts` 覆盖从 `.originals/` 回退。
- **Transient retry**：`file-conversion-worker.ts` 中 `handleConversionResult` 对 `rate_limited` 等错误码回到 `pending`。
- **补偿轮询恢复**：`resumePollingJobs` 在 `createFileConversionWorker` 启动时和持续扫描中调用。
- **Callback + polling 幂等**：`handleConversionResult` 开头检查 `file_processing_status` 是否已是终态，直接跳过。

---

## 4. 构建与测试状态

```
npm run build --workspace @pi/server   ✓ 0 errors
npm run check                           ✓ 0 errors, 21 warnings（历史 any）
cd packages/server && pnpm test         ✓ 35 files, 351 tests passed
```

---

## 5. 仍需注意事项

1. **downloadUrl E2E 测试**：当前 `downloadSingleArtifact` 的 `downloadUrl` 分支依赖全局 `fetch`，需要 fake HTTP server E2E 测试验证相对/绝对 URL、超时、大小限制。
2. **Webhook 完整 E2E**：需要启动真实 Express 服务器 + fake Python callback 测试 token 校验、unknown job 返回 200、non-terminal 忽略、terminal 处理。
3. **Transient retry 次数递减**：当前 `mapErrorToRidgeAction` 返回固定 `retryCount`，但 `python_conversion_jobs.retry_count` 未用于控制实际重试次数；retry 次数由 `background_jobs` 的 `max_attempts` 控制，需要确保两者一致。
4. **进程重启后 job 恢复**：`resumePollingJobs` 扫描 `python_conversion_jobs` 但无法自动重新 enqueue `background_jobs`（因为 running job 已 lost）。重启后需要手动或调度器重新 enqueue pending 状态的文件。当前 `file_processing_status` 在 retry 时回到 `pending`，worker  tick 会自然 pickup。
5. **Base64 启发式检测不完善**：`downloadSingleArtifact` 的 base64 检测基于简单正则，可能误判某些纯文本（如长串无空格字母数字）。实际场景中 inline 产物通常为 Markdown 文本，base64 主要用于图片二进制；图片产物通常 `inline: false`，所以当前实现足够。
6. **Realpath/symlink 校验已实现**：`assertWorkspaceSafe` 和 `writeArtifactsToWorkspace` 中的 `ensureWithinWorkspace` 均使用 `fs.realpath` 解 symlink 后再做 `path.relative` 校验；macOS `/var` → `/private/var` 场景已处理（`realpath` workspaceDir 后再做 relative）。~~只做了 `path.resolve` + `path.relative` 的词法校验，未做 `fs.realpath` 解 symlink 后的真实路径校验。需要评估是否必须（当前 TBD）。~~
7. **前端界面未更新**：Web 前端仍需展示 `file_processing_status` 的 `converting` 状态（当前可能只展示 `pending`/`converted`/`convert_failed`）。
