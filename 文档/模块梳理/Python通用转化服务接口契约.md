# Python 通用转化服务接口契约

> **定位**：独立 Python 通用转化服务与 ridge Node 后端之间的稳定接口边界。<br>
> **原则**：本契约一旦确定，Python 侧按此实现，ridge 侧按此消费；任何变更需双方评审并走版本升级流程。

---

## 1. 服务定位

- **独立服务**：Python 通用转化服务（以下简称 **Converter**）源码位于 ridge monorepo 的 `services/converter/`，运行时仍是独立进程/容器；
- **多租户**：通过 API Key 支持多 client / 多 project 调用，ridge 只是其中一个 client；
- **只做转换**：Converter 只负责把输入文件转换为结构化产物（Markdown、JSON、文本等），不处理 workspace 权限、状态机、目录结构、RAG 索引；
- **无状态**：内部不持久化业务数据；产物临时存储，按保留期清理。

---

## 2. 职责矩阵

| 职责 | Converter (Python) | ridge Node 后端 | ridge Web 前端 |
|------|-------------------|-----------------|----------------|
| Workspace 安全校验 | ❌ | ✅ 根路径/lexical/realpath/`.ridge` 边界 | ❌ |
| `file_processing_status` 状态机 | ❌ | ✅ `pending` → `converting` → `converted`/`convert_failed` | 展示/重试 |
| `background_jobs` 队列调度 | 内部队列（独立） | ✅ 管理 `file.convert` job | ❌ |
| 原文件归档 `.originals/` | ❌ | ✅ 转换成功后移动 | ❌ |
| 产物落盘 `.md/.assets/.metadata.json` | ❌ | ✅ 从 artifact 下载并写入 workspace | ❌ |
| 内容转换（PDF→MD、音频→文本、图片 OCR） | ✅ | ❌ | ❌ |
| 图片提取、表格识别、OCR | ✅ | ❌ | ❌ |
| 引擎能力发现 | 提供 `/v1/capabilities` | 消费并缓存 | 不直接调用 |
| 认证与限流 | 校验 API Key，执行限流 | 持有并传递 API Key | ❌ |
| 回调通知 | POST `callbackUrl` | 接收并驱动状态更新 | ❌ |
| RAG 索引触发 | ❌ | `converted` 后 enqueue RAG job | ❌ |

> **核心原则**：前端浏览器**不直接调用** Converter；所有交互通过 ridge Node 后端代理。

### 1.1 monorepo 内置实现（2026-05-17）

当前 ridge 仓库内已提供 `services/converter/` Python 后端实现：

- `FastAPI` 暴露 `/v1/health`、`/v1/capabilities`、`/v1/conversions`、查询、取消、产物列表和产物下载；
- API Key 使用 `Authorization: Bearer <key>`，默认从 `RIDGE_CONVERTER_API_KEYS` 读取；
- 支持 multipart 文件上传、HTTPS URL、base64 Data URI，拒绝本地路径、非 HTTPS URL、localhost/private network URL；
- `document.markdown`：默认走 MarkItDown，覆盖文本、Markdown、HTML、PDF、DOCX、PPTX、XLSX、CSV、JSON 等 MarkItDown 支持的输入；
- `input.url` 指向网页且路径没有扩展名时，Converter 按响应 `Content-Type` 或调用方传入的 `mimeType` 补齐临时文件扩展名，例如 `text/html` 补 `.html`，保证 MarkItDown 能按 HTML 处理；
- `document.ocr_markdown`：默认走 MarkItDown；图片输入也交给 MarkItDown 图片转换；
- `image.ocr`：默认走 MarkItDown 图片转换（EXIF + 可选 LLM caption），`options.engine="tesseract"` 时才走本地 pytesseract fallback；
- `image.description`：默认走 MarkItDown 图片转换；配置 `OPENAI_API_KEY` 后向 MarkItDown 注入 OpenAI client/model；
- `audio.transcription`：默认走 MarkItDown audio converter（`markitdown[all]` 的 audio-transcription 依赖），`options.engine="faster-whisper"` 时才走 faster-whisper fallback；
- 产物仍按契约返回 `<name>.md`、`<name>.metadata.json`、可选 blocks/segments/assets，由 ridge Node 下载并落盘。

本实现不改变职责矩阵：Converter 不读取 workspace 本地路径、不写 `.originals/`、不更新 `file_processing_status`、不触发 RAG。

---

## 3. 接口清单

### 3.1 基础端点

| 端点 | 说明 |
|------|------|
| `GET /v1/health` | 健康检查 + 简略能力列表 |
| `GET /v1/capabilities` | 支持的 task、options、格式、引擎版本 |

### 3.2 核心端点

| 端点 | 说明 |
|------|------|
| `POST /v1/conversions` | 创建转换任务；multipart 文件上传 或 URL/base64 输入 |
| `GET /v1/conversions/{jobId}` | 查询任务状态、结果、产物清单 |
| `POST /v1/conversions/{jobId}/cancel` | 请求取消 queued/running 任务 |
| `GET /v1/conversions/{jobId}/artifacts/{artifactId}` | 下载产物（流式，支持 Range） |
| `GET /v1/conversions/{jobId}/artifacts` | 列出所有产物（元数据，不含二进制） |

### 3.3 版本策略

- 当前版本：`/v1`
- 新增字段/任务/options → 保持 `/v1`，向后兼容
- 破坏性变更 → `/v2`
- 客户端必须忽略未知响应字段

---

## 4. 认证

- **方式**：HTTP `Authorization: Bearer <apiKey>`
- **apiKey 归属**：按 client/project 维度发放；ridge 可持有多个 Key（如开发/生产分离）
- **校验**：Converter 校验 Key 有效性 + project 白名单；非法时返回 `401 auth_failed`
- **与 ridge 认证解耦**：Converter **不读取** ridge `ridge_session` Cookie；API Key 是唯一凭证

---

## 5. 输入安全

| 输入方式 | 支持 | 安全约束 |
|----------|------|----------|
| multipart 文件上传 | ✅ 推荐 | 大小限制、MIME 校验 |
| 预签名 URL (`input.url`) | ✅ 可选 | 仅 HTTPS；可选域名白名单；禁止 `file://` / `ftp://` / localhost |
| base64 Data URI (`input.base64`) | ✅ fallback | 大小受限（建议 < 1MB） |
| 本地文件路径 | ❌ **禁止** | 防止任意文件读取（SSRF/路径遍历） |

> **禁止项**：`input` 中任何字段不得携带服务器本地文件路径；Converter 不得基于路径直接读取文件系统。

---

## 6. 异步任务模型

### 6.1 语义

- 所有转换均为**异步任务**；`POST /v1/conversions` 始终返回 `202 Accepted` + `jobId`；
- `waitMs` 参数支持同步等待（最大 30s），但语义仍是 job；超时后返回 `status: running` 或 `queued`，客户端继续轮询或等待回调；
- 不支持阻塞式同步返回完整产物。

### 6.2 状态机

```
queued → running → succeeded
   ↓        ↓         ↓
canceled  failed    artifacts 可用
```

| 状态 | 含义 |
|------|------|
| `queued` | 已入队，等待资源 |
| `running` | 正在转换 |
| `succeeded` | 完成，产物可用 |
| `failed` | 引擎或内部错误，error 非 null |
| `canceled` | 被调用方取消 |

### 6.3 查询与回调

- **回调优先**：ridge Node 在创建任务时传入 `callbackUrl`，Converter 在状态终态时 POST 回调；
- **补偿轮询**：若回调丢失，ridge worker 启动补偿轮询（建议间隔 30s）；
- **幂等查询**：重复 `GET` 同一 `jobId` 返回相同结果（终态后 immutable）。

---

## 7. 产物规范

### 7.1 产物结构

每个任务返回 `artifacts[]`，每项包含：

| 字段 | 说明 |
|------|------|
| `artifactId` | 产物唯一 ID |
| `name` | 文件名 |
| `mimeType` | MIME 类型 |
| `size` | 字节数 |
| `inline` | `true` 时 `content` 直接含内容；`false` 时走 `downloadUrl` |
| `content` | inline 内容（base64 或 UTF-8 文本） |
| `downloadUrl` | 带短时签名/token 的下载地址（默认有效期 1 小时） |

### 7.2 inline 策略

- 文本产物 < 64KB → `inline: true`
- 图片/音频/大文本 > 64KB → `inline: false`，走 `downloadUrl`
- `downloadUrl` 支持 HTTP `Range` 请求

### 7.3 按任务类型的产物约定

| 任务 | 必含产物 | 可选产物 |
|------|----------|----------|
| `document.markdown` | `<name>.md`, `<name>.metadata.json` | `img-NNN.*`（提取的图片） |
| `audio.transcription` | `<name>.md`, `<name>.metadata.json` | `<name>.segments.json` |
| `image.ocr` | `<name>.md`, `<name>.metadata.json` | `<name>.blocks.json` |
| `image.description` | `<name>.md`, `<name>.metadata.json` | — |
| `document.ocr_markdown` | `<name>.md`, `<name>.metadata.json` | `img-NNN.*` |

---

## 8. 错误边界

### 8.1 错误码

| 错误码 | HTTP | 触发场景 | ridge 侧处理 |
|--------|------|----------|-------------|
| `unsupported_format` | `400` | 格式不在支持列表 | 通知用户，标记 `convert_failed` |
| `invalid_input` | `400` | 参数非法 / URL 格式错误 | 重试前修正参数 |
| `file_too_large` | `413` | 超出单文件限制 | 提示用户压缩/拆分 |
| `conversion_timeout` | `504` | 引擎执行超时 | 可重试或简化选项 |
| `conversion_failed` | `502` | 引擎内部异常 | 不建议立即重试 |
| `auth_failed` | `401` | API Key 无效 | 告警，检查配置 |
| `rate_limited` | `429` | 超出限流配额 | 退避后重试 |
| `fetch_failed` | `502` | 从 URL 拉取源文件失败 | 检查 URL 有效期 |
| `not_found` | `404` | jobId / artifactId 不存在 | 检查 ID 或已过期 |
| `already_canceled` | `409` | 重复取消 | 忽略 |
| `quota_exceeded` | `403` | 账户配额耗尽 | 联系管理员 |

### 8.2 回调失败

- Converter 投递 `callbackUrl` 失败时，指数退避重试最多 5 次；
- 全部失败后，依赖 ridge 侧补偿轮询。

---

## 9. 运行策略

### 9.1 幂等性

- `clientJobId` + API Key 为幂等键；
- 幂等窗口建议 24 小时；窗口内重复请求返回同一 `jobId`；
- 不重复计费。

### 9.2 重试

| 场景 | 重试方 | 策略 |
|------|--------|------|
| 引擎 transient 错误 | Converter | 内部重试最多 2 次 |
| `fetch_failed` / `rate_limited` | ridge worker | 退避后重试，最多 3 次 |
| `conversion_timeout` | ridge worker | 可重试 1 次 |
| `conversion_failed` | — | 不建议自动重试，通知用户 |

### 9.3 超时

| 类型 | 默认值 | 可调 |
|------|--------|------|
| `waitMs` 同步等待 | 调用方设定（最大 30s） | 是 |
| `document.markdown` 执行 | 5 分钟 | 是（options） |
| `audio.transcription` 执行 | 音频时长 × 2 | 否 |
| 预签名 URL 拉取 | 30s | 否 |
| 产物下载签名有效期 | 1 小时 | 否 |

### 9.4 限流

- 按 API Key：创建任务建议每秒 10 次；查询每秒 100 次；
- 按并发：单 Key 最多 5 个 `running` 任务；
- 超出返回 `429`，响应头带 `Retry-After`。

### 9.5 保留期与清理

| 数据 | 保留期 | 到期行为 |
|------|--------|----------|
| 任务记录 | 30 天 | `GET /v1/conversions/{jobId}` 返回 `404` |
| 产物文件 | 7 天 | `downloadUrl` 失效 |
| 源文件 buffer | 立即释放 | 转换完成后不保留 |

> **ridge 侧要求**：收到 `succeeded` 后应立即下载产物并落盘，不依赖 Converter 长期保留。

---

## 10. privacy 与安全

- **产物隔离**：不同 API Key / project 的产物存储在逻辑隔离空间；
- **URL 白名单**：预签名 URL 可配置域名白名单，禁止内网地址；
- **日志脱敏**：不打印文件内容、URL 签名参数、完整 API Key；
- **沙箱执行**：引擎进程应在受限容器/沙箱运行，禁止非必要网络出站；
- **不存储源文件**：转换完成后源文件内存 buffer 立即释放。

---

## 11. ridge 集成主流程

```
用户上传文件
  → POST /api/files/upload（Node）
    → 写 disk
    → INSERT file_processing_status (pending)
    → background_jobs.enqueue({ type: "file.convert", payload: { filePath, task } })
      → file-conversion-worker.ts claimNext()
        → UPDATE status = converting
        → POST /v1/conversions（multipart 上传 + callbackUrl）
          → 202 + jobId
        → 等待 callback 或轮询
        → 下载 artifacts
        → Node 落盘：
            <name>.md
            <name>.metadata.json
            <name>.assets/
            .originals/<original>
        → UPDATE status = converted
        → 触发 RAG 索引入队
        → 写 notification_events
```

### 11.1 状态映射

| Converter 状态 | ridge `file_processing_status` | 动作 |
|---------------|------------------------------|------|
| `queued` / `running` | `converting` | 等待 |
| `succeeded` | `converted` | 落盘、归档、通知 |
| `failed` | `convert_failed` | 写 error、通知、保留原文件 |
| `canceled` | `convert_failed`（或自定义处理） | 记录取消原因 |

### 11.2 产物落盘位置

Python 产物由 Node 后端下载后写入 workspace 文件树：

```
附件/<name>.md           ← 从 artifact "<name>.md" 写入
附件/<name>.assets/       ← 从 artifact "img-NNN.*" 下载写入
附件/<name>.metadata.json  ← 从 artifact "<name>.metadata.json" 写入
附件/.originals/<original> ← Node 归档原文件
```

### 11.3 metadata.json 合并规则

Node 落盘时保留 Python 侧全部字段，并追加 `_ridge` 对象：

```json
{
  "engine": "markitdown",
  "engineVersion": "0.0.1a40",
  "_ridge": {
    "sourcePath": "附件/report.pdf",
    "workspacePath": "附件/report.md",
    "archivedAt": "2024-06-01T12:00:13Z",
    "archivedTo": "附件/.originals/report.pdf"
  }
}
```

> `_ridge` 为 ridge 专属扩展命名空间；Python 侧透传但不解释。

### 11.4 callback 路由

ridge 回调路由示例：

```
POST /api/webhooks/conversion
Authorization: Bearer <webhookSecret>  // 与 Converter API Key 不同，仅用于验签
Body: ConversionJob (同 GET /v1/conversions/{jobId})
```

- 回调需验签（HMAC 或 URL 内嵌 token）；
- 根据 `clientJobId` 或 `metadata.ridgeFileId` 关联到具体任务记录；
- 若找不到关联记录，返回 `200` 避免 Converter 重试风暴（幂等投递）。

### 11.5 闪念 URL 剪藏流程

```
Chrome 插件 / 浏览器网址采集
  → POST /api/browser/captures
    → fleeting_notes.content = 脱敏 URL
    → 用户处理为剪藏
      → POST /api/fleeting/{noteId}/process/clip
        → Node 调用 POST /v1/conversions
            task=document.markdown
            input.url=<URL>
            input.mimeType=text/html
            options.engine=markitdown
        → 下载 Markdown artifact
        → 写入 剪藏/<标题>.md
        → INSERT clips(content=Markdown, url=<URL>)
        → UPDATE fleeting_notes.status = 'processed'
        → markRagTargetPending(剪藏/<标题>.md)
```

- 转换失败时返回错误并保留原闪念；
- 剪藏 Markdown 文件由 Node 写入工作空间，Converter 不直接写 workspace；
- URL 剪藏不经过 `file_processing_status`，它属于闪念处理动作，不是文件上传转换任务。

---

## 12. MarkItDown 特别约束

- **输出目标**：LLM / 文本分析友好的 Markdown，**不承诺高保真排版还原**；
- **字段尽力提取**：`pages`、`images`、`tables`、`footnotes`、`endnotes` 缺失时用 `null`，不用 `0`；
- **引擎溯源**：metadata 必须含 `engine: "markitdown"`、`engineVersion: "x.y.z"`；
- **表格降级**：复杂表格可转为简化 Markdown 或 `[TABLE]` 占位符；
- **ridge 不依赖精细字段**：RAG 索引和搜索以 Markdown 正文为主，metadata 为辅助。

---

## 13. 变更控制

### 13.1 接口变更流程

1. 任何变更需先更新本文档；
2. 向后兼容变更 → 无需改版本号，更新 `capabilities` 即可；
3. 破坏性变更 → 启动 `/v2` 设计，旧版本保留至少 6 个月 deprecation 期；
4. 双方（ridge Node + Converter）需在同一 Sprint 内完成对接测试。

### 13.2 文档关联

| 文档 | 内容 |
|------|------|
| `文档/功能开发/40-Python通用转化服务API契约.md` | 完整 API 设计、JSON 示例、TypeScript 类型、OpenAPI Schema |
| `文档/模块梳理/文件处理状态模块契约.md` | 状态机定义 |
| `文档/模块梳理/后台任务队列.md` | 队列调度定义 |

### 13.3 ridge 侧新增模块（2025-05-13）

| 模块 | 路径 | 职责 |
|------|------|------|
| 类型定义 + HTTP 客户端 | `packages/server/src/conversion-service-client.ts` | 契约 TypeScript 类型、ConversionServiceClient、错误映射、配置读写、产物落盘 |
| 后台 worker 改造 | `packages/server/src/file-conversion-worker.ts` | `file.convert` worker 调用 Python 服务，补偿轮询，回调处理 |
| 回调 webhook 路由 | `packages/server/src/routes/conversion-webhook.ts` | `POST /api/webhooks/conversion`，验签，调用 `handleConversionResult` |
| 入口集成 | `packages/server/src/index.ts` | 初始化 `ConversionServiceClient`，注册 webhook 路由，启动 worker |
| 持久化表 | `python_conversion_jobs` | 持久化 `python_job_id`、`client_job_id`、`status`，支持进程重启后恢复轮询 |
| 前端触发 | `workspace-data.ts` | 上传后按 `isConvertibleExtension` 入队 `file.convert`（当 `isConversionEnabled` 为 true） |
| 手动重转换 | `workspace-files.ts` | `POST /api/workspace/files/convert` 重置状态为 `pending` 并重新入队（支持 `.originals/` 回退与编辑守卫） |

(End of file)
