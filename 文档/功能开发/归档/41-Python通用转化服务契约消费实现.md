# 41 Python 通用转化服务契约消费实现

## 目标

将 ridge Node 后端从自研 PDF/Word/音频/图片转换栈，迁移为调用独立 Python 通用转化服务（按 `40-Python通用转化服务API契约.md` 消费）。

## 范围

- ✅ 实现契约 TypeScript 类型（请求/响应/产物/错误/回调）
- ✅ 实现真 HTTP 契约客户端 `ConversionServiceClient`（multipart 上传、查询、取消、产物下载/inline 解析）
- ✅ 实现配置加载/保存（`python_converter_base_url`、`api_key`、`callback_token`）
- ✅ 改造 `file-conversion-worker.ts`：worker 提交任务到 Python 服务，启动补偿轮询，回调/轮询共用 `handleConversionResult`
- ✅ 实现回调 webhook 路由 `POST /api/webhooks/conversion`，带 token 验签
- ✅ 产物落盘（`<name>.md`、`<name>.metadata.json` + `_ridge`、`<name>.assets/`）、原文件归档 `.originals/`
- ✅ 错误映射到 ridge 行为（retry 策略、通知用户）
- ✅ `workspace-data.ts` 上传触发和 `isConvertibleExtension` 按契约扩展名更新
- ✅ 测试：契约客户端 HTTP 交互（fake server）、worker 调用流程、产物落盘、错误处理、幂等性

## 不做

- ❌ Python 服务本身实现（属于独立项目）
- ❌ 前端直接调用 Python 服务（仍通过 Node 代理）
- ❌ 实时流式转录（首版只支持异步 job 模型）

## 技术方案

### 新增模块

1. **`packages/server/src/conversion-service-client.ts`**
   - 契约全部 TypeScript 类型（按文档第10节）
   - `ConversionServiceClient` 类：覆盖 `health`、`capabilities`、`createConversion`（multipart + JSON）、`getConversion`、`cancelConversion`、`downloadArtifact`、`listArtifacts`、`downloadArtifacts`（inline 自动解析 + 非 inline HTTP 下载）
   - `ConversionServiceError` 及 `mapErrorToRidgeAction`（按文档 7.2 错误码表映射 retry 策略和用户消息）
   - `loadConversionServiceConfig` / `saveConversionServiceConfig`（基于 `app_settings` 表）
   - `deriveTaskFromExtension`、`isConvertibleExtension`、`deriveConversionOutputPaths`、`generateClientJobId`、`writeArtifactsToWorkspace`（落盘 + `_ridge` 字段追加）

2. **`packages/server/src/file-conversion-worker.ts`**（重写）
   - `processOne` 流程：
     1. 校验 `file_processing_status` 为 `pending`
     2. `UPDATE status = converting`
     3. `deriveTaskFromExtension` 决定 task 类型
     4. `conversionClient.createConversionWithFile`（multipart 上传 + `callbackUrl` + `clientJobId` + `metadata.ridgeFileId`）
     5. 记录 `pythonJobId` 到 background job `result_json`
     6. 启动补偿轮询（间隔 30s，最大 10min），轮询到终态调用 `handleConversionResult`
   - `handleConversionResult`（幂等，可被 worker 轮询和 webhook 回调同时调用）：
     - 若状态已是终态则跳过
     - `succeeded` → `downloadArtifacts` → `writeArtifactsToWorkspace` → `UPDATE status = converted` → `jobQueue.complete`
     - `failed/canceled` → `mapErrorToRidgeAction` → `UPDATE status = convert_failed` → 写 `notification_events` → `jobQueue.fail`

3. **`packages/server/src/routes/conversion-webhook.ts`**
   - `POST /api/webhooks/conversion`
   - 校验 `?token=` 与 `callbackToken`
   - 从 payload 的 `metadata.ridgeFileId` 或 `clientJobId` 关联本地文件
   - 找不到关联记录时返回 `200`（避免 Python 服务重试风暴）
   - 构造 `ConversionJob` 调用 `handleConversionResult`

4. **`packages/server/src/index.ts`**（集成点）
   - `startServer` 中：
     1. `loadConversionServiceConfig` 读取配置
     2. 若配置存在，创建 `ConversionServiceClient`
     3. 构造 `callbackBaseUrl = http://127.0.0.1:${port}/api/webhooks/conversion`
     4. 传入 `fileConversionWorker`
     5. `startServer` 末尾（`listenHttpServer` 之前）注册 webhook 路由（需 `conversionClient` 存在）

### 旧模块废弃

- `file-converter.ts` 及其 `convertFileToStandard` 不再被 worker 调用，但保留用于：
  - `workspace-files.ts` 的 `POST /api/workspace/files/convert` 手动转换 API（后续可再迁移）
  - 现有 `pdf-word-conversion.test.ts` 单元测试
- `isConvertibleExtension` 已从 `file-converter.ts` 迁移到 `conversion-service-client.ts`，`workspace-data.ts` 和 `workspace-files.ts` 已更新 import

### 产物落盘规则（按契约 9.3 节）

```
附件/report.pdf          ← 原文件（转换前）
附件/report.md           ← 从 artifact "report.md" 写入
附件/report.assets/
  ├── img-001.png        ← 从 artifact "img-001.png" 下载写入
附件/report.metadata.json ← 从 artifact "report.metadata.json" 写入，并追加 _ridge 字段
附件/.originals/report.pdf ← Node 移动原文件归档
```

metadata.json 追加 `_ridge`：
```json
{
  "engine": "markitdown",
  "...": "...",
  "_ridge": {
    "sourcePath": "附件/report.pdf",
    "workspacePath": "附件/report.md",
    "archivedAt": "2024-06-01T12:00:13Z",
    "archivedTo": "附件/.originals/report.pdf"
  }
}
```

## 测试策略

1. `conversion-service-client.test.ts`（TDD，先写测试后实现）：
   - 类型校验（`ConversionTask`、`Artifact`、`ErrorDetail`）
   - `ConversionServiceClient` 构造、错误映射
   - Fake HTTP Server 测试全部端点（`health`、`capabilities`、`createConversion`、`getConversion`、`cancel`、`downloadArtifact`、`listArtifacts`、`downloadArtifacts` inline + non-inline）
   - 401 错误抛出 `ConversionServiceError`
   - 配置读写 `loadConversionServiceConfig` / `saveConversionServiceConfig`

2. `file-conversion-worker.test.ts`（重写）：
   - Mock `ConversionServiceClient` 测试 worker 成功路径（multipart 提交 → 轮询 → 落盘 → `converted`）
   - Mock 失败路径（Python 返回 `failed` → `convert_failed` + notification）
   - 无 `file_processing_status` 记录时跳过
   - 非 `pending` 状态（如 `convert_failed`）时 worker 拒绝自动重试
   - `handleConversionResult` 幂等性测试
   - retry enqueue 去重逻辑

3. `file-upload-convert-trigger.test.ts`（更新）：
   - `.txt` 现在也是 convertible，测试更新为确认会 enqueue

4. `file-conversion-e2e.test.ts`、`manual-convert-api.test.ts`、`pdf-word-conversion.test.ts`：
   - 这些测试调用的是旧的 `convertFileToStandard`（手动转换 API），仍保留并通过。

## 验收标准

- [x] `npm run check` 通过（lint + typecheck），0 error
- [x] `cd packages/server && pnpm test` 转换相关测试全部通过
- [x] 新增契约类型、HTTP 客户端、worker、webhook 路由、配置体系完整实现
- [x] 产物落盘包含 `_ridge` 字段
- [x] 回调 webhook 带 token 验签，找不到记录返回 200
- [x] 补偿轮询按契约实现（30s 间隔 / 10min 最大）
- [x] 文档已更新 `文档/模块梳理/Python通用转化服务接口契约.md`
- [x] 任务文档已完成
- [ ] 完成后归档到 `文档/功能开发/归档/`
- [ ] `MEMORY.md` 已更新架构决策
