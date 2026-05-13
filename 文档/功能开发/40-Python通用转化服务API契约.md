# 40 Python 通用转化服务 API 契约

> **状态**：长期接口设计（尚未实现）。<br>
> **定位**：独立 Python 通用转化服务（multi-tenant / multi-project），不属于 ridge 项目专属；后续 ridge Node 后端按此契约调用。

---

## 1. 目标与范围

### 1.1 目标

为未来独立部署的 Python 通用转化服务定义稳定 API 契约，使得：
1. ridge 项目完成后可直接按此接口调用该服务；
2. 该服务可独立开发、独立部署，供其他项目或朋友使用；
3. 所有文档/PDF/Word/音频/图片等重型解析与转换逻辑长期由 Python 侧承载，Node 后端不再自研解析栈。

### 1.2 能力范围分层

| 阶段 | 任务类型 | 支持的输入格式 | 核心引擎 | 优先级 |
|------|----------|---------------|----------|--------|
| **第一阶段** | `document.markdown` | PDF, DOCX, PPTX, XLSX, HTML, TXT | MarkItDown (Microsoft) | P0 |
| **后续** | `audio.transcription` | MP3, WAV, M4A, FLAC, OGG | Whisper 等 | P1 |
| **后续** | `image.ocr` | PNG, JPG, WEBP, TIFF | OCR / 多模态 LLM | P1 |
| **后续** | `image.description` | PNG, JPG, WEBP | 多模态 LLM（可选） | P2 |
| **后续** | `document.ocr_markdown` | 扫描版 PDF, 图片型文档 | OCR + MarkItDown | P2 |

### 1.3 不做

- 短期 CLI / Node.js 自研解析方案（旧实现将逐步迁移到本契约）；
- ridge 浏览器前端直接调用 Python 服务；
- Python 服务内部的用户系统或计费系统；
- 实时流式转录（WebSocket），首版只支持异步任务模型。

---

## 2. 服务定位与架构边界

### 2.1 服务定位

- **独立部署**：Python 服务是独立进程/容器，与 ridge Node 后端可位于不同主机；
- **多 client / 多 project**：通过 API Key + `clientJobId` 支持多项目调用，不绑定 ridge 具体业务模型；
- **无状态**：自身不维护持久化会话或文件系统树；产物临时存储，按保留期清理；
- **只做内容转换**：不处理 workspace 权限、状态机、目录落盘、RAG 索引等 ridge 专属逻辑。

### 2.2 ridge 集成边界

```
┌─────────────────────────────────────────────────────────────┐
│                         ridge Web 前端                          │
│                      （不直接调用 Python）                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    ridge Node 后端                              │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────┐   │
│  │ 权限/安全校验 │  │ file_processing   │  │ background   │   │
│  │ workspace 归属│  │ _status 状态机    │  │ _jobs 队列   │   │
│  └──────────────┘  └──────────────────┘  └──────────────┘   │
│                              │                                │
│                              ▼                                │
│              POST /v1/conversions (HTTP+API Key)             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Python 通用转化服务（本契约定义）                  │
│              MarkItDown / Whisper / OCR 引擎                  │
│              临时产物存储 + 异步任务调度                        │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 职责矩阵

| 职责 | ridge Node 后端 | Python 通用转化服务 |
|------|----------------|-------------------|
| Workspace 安全校验 | ✅ 根路径/lexical/realpath 校验 | ❌ 不做 |
| `file_processing_status` 状态机 | ✅ `pending` → `converting` → `converted`/`convert_failed` | ❌ 不做 |
| `background_jobs` 队列调度 | ✅ 管理 `file.convert` job | ❌ 自有内部队列 |
| 原文件归档到 `.originals/` | ✅ | ❌ |
| 产物落盘 `.md/.assets/.metadata.json` | ✅ | ❌ 只提供下载/inline |
| 内容转换（PDF→MD、音频→文本等） | ❌ | ✅ |
| 图片提取、表格识别、OCR | ❌ | ✅ |
| 引擎版本/能力发现 | 消费 `/v1/capabilities` | 提供 `/v1/capabilities` |
| 认证与限流 | 持有 API Key，传递请求 | 校验 API Key，执行限流 |

---

## 3. API 设计

### 3.1 基础约定

- **Base URL**：`https://converter.example.com/v1`（服务部署地址可配置）
- **版本前缀**：`/v1`，破坏性变更走 `/v2`；新增字段必须向后兼容；未知字段客户端忽略。
- **认证**：HTTP `Authorization: Bearer <apiKey>`，每个 API Key 可映射到一组 `projectId` 白名单。
- **Content-Type**：
  - 上传：`multipart/form-data`
  - JSON API：`application/json`
  - 产物下载：按实际 MIME
- **时区**：所有时间戳为 ISO 8601 UTC（`2024-06-01T12:00:00Z`）。

### 3.2 端点清单

| 方法 | 端点 | 说明 |
|------|------|------|
| `GET` | `/v1/health` | 健康检查 + 基础能力列表 |
| `GET` | `/v1/capabilities` | 支持的 task、options、格式、引擎版本 |
| `POST` | `/v1/conversions` | 创建转换任务（核心） |
| `GET` | `/v1/conversions/{jobId}` | 查询任务状态与结果 |
| `POST` | `/v1/conversions/{jobId}/cancel` | 请求取消任务 |
| `GET` | `/v1/conversions/{jobId}/artifacts/{artifactId}` | 下载产物（带签名 URL 或流） |
| `GET` | `/v1/conversions/{jobId}/artifacts` | 列出该任务的所有产物 |

### 3.3 创建任务 `POST /v1/conversions`

#### 3.3.1 请求体（multipart 优先）

```http
POST /v1/conversions HTTP/1.1
Authorization: Bearer rk_live_xxxxxxxx
Content-Type: multipart/form-data; boundary=----FormBoundary

------FormBoundary
Content-Disposition: form-data; name="task"

document.markdown
------FormBoundary
Content-Disposition: form-data; name="file"; filename="report.pdf"
Content-Type: application/pdf

<binary>
------FormBoundary
Content-Disposition: form-data; name="options"

{"engine":"markitdown","extractImages":true}
------FormBoundary
Content-Disposition: form-data; name="clientJobId"

ridge-file-1715606400000
------FormBoundary
Content-Disposition: form-data; name="callbackUrl"

https://ridge.local/api/webhooks/conversion
------FormBoundary--
```

#### 3.3.2 字段定义

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `task` | `string` | ✅ | 任务类型枚举，见 3.4 |
| `file` | `File` | 条件 | multipart 上传的二进制文件；与 `input.url` 二选一 |
| `input` | `object` | 条件 | 非 multipart 输入（URL 或 base64），见 3.5 |
| `options` | `object` | ❌ | 任务特定选项，见 3.4 |
| `clientJobId` | `string` | ❌ | 调用方幂等键；同 client + 同 `clientJobId` 在幂等窗口内返回同一 `jobId` |
| `callbackUrl` | `string` | ❌ | 任务完成/失败时 POST 回调，body 同 `GET /v1/conversions/{jobId}` 响应 |
| `metadata` | `object` | ❌ | 透传元数据，原样出现在响应 `metadata` 中；不用于业务逻辑 |
| `preferredFormat` | `string` | ❌ | 产物格式偏好，默认 `markdown`；可选 `json`、`text`、`html` |
| `waitMs` | `number` | ❌ | 同步等待最大毫秒数（0~30000）；超时仍返回 `202 Accepted` + `status: queued/running`；语义仍是异步 job |

> **安全约束**：禁止通过 `input` 传任意服务器本地文件路径（如 `file:///etc/passwd` 或 `/home/xxx/...`），避免任意文件读取/SSRF。服务应只接受：
> - multipart 文件上传
> - 预签名 URL（HTTP/HTTPS，需校验域名白名单）
> - base64 Data URI（大小受限）

### 3.4 任务类型（task）与选项（options）

#### 3.4.1 `document.markdown`

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `engine` | `string` | `markitdown` | 转换引擎；预留 `pandoc`、`docling` 等扩展 |
| `extractImages` | `boolean` | `true` | 是否提取内嵌图片为 artifact |
| `extractTables` | `boolean` | `true` | 是否保留表格结构（Markdown 表格或占位符） |
| `pageRange` | `[number, number]?` | `null` | 仅转换指定页码范围（PDF） |
| `ocrFallback` | `boolean` | `false` | PDF 无文本层时是否 fallback 到 OCR |

> **MarkItDown 约束**：
> - MarkItDown 的输出目标是**LLM/文本分析友好的 Markdown**，不承诺高保真排版还原；
> - 复杂表格可能转为简化 Markdown 表格或 `[TABLE]` 占位符；
> - metadata 不强依赖页数/图片/脚注等字段，这些字段由引擎尽力提取，缺失时以 `null` 而非 `0` 表示；
> - 引擎 metadata 必须记录 `engine: "markitdown"`、`engineVersion: "x.y.z"`，方便问题追溯。

#### 3.4.2 `audio.transcription`

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `language` | `string` | `auto` | 语言代码（如 `zh`, `en`） |
| `modelSize` | `string` | `base` | 模型尺寸：`tiny`, `base`, `small`, `medium`, `large` |
| `segmentDuration` | `number` | `30` | 分段时长（秒），用于输出时间戳切片 |
| `diarization` | `boolean` | `false` | 是否启用说话人分离 |
| `format` | `string` | `srt` | 输出格式：`srt`, `vtt`, `json`, `txt` |

#### 3.4.3 `image.ocr`

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `language` | `string` | `auto` | OCR 语言提示 |
| `outputBlocks` | `boolean` | `true` | 是否返回逐块 bbox 与文本 |
| `confidenceThreshold` | `number` | `0.6` | 置信度过滤（0~1） |

#### 3.4.4 `image.description`

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `detail` | `string` | `medium` | 描述详细程度：`low`, `medium`, `high` |
| `maxTokens` | `number` | `300` | 描述最大 token 数 |

---

## 4. 响应规范

### 4.1 创建任务响应

```http
HTTP/1.1 202 Accepted
Content-Type: application/json

{
  "jobId": "conv_01H1234567890ABCDEF",
  "status": "queued",
  "task": "document.markdown",
  "createdAt": "2024-06-01T12:00:00Z",
  "clientJobId": "ridge-file-1715606400000",
  "metadata": {
    "ridgeWorkspacePath": "附件/report.pdf"
  }
}
```

### 4.2 查询任务响应

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jobId": "conv_01H1234567890ABCDEF",
  "status": "succeeded",
  "task": "document.markdown",
  "createdAt": "2024-06-01T12:00:00Z",
  "startedAt": "2024-06-01T12:00:05Z",
  "completedAt": "2024-06-01T12:00:12Z",
  "clientJobId": "ridge-file-1715606400000",
  "metadata": {
    "ridgeWorkspacePath": "附件/report.pdf"
  },
  "result": {
    "title": "季度报告",
    "textPreview": "# 季度报告\n\n本季度收入...",
    "pageCount": 12,
    "wordCount": 3456,
    "language": "zh"
  },
  "artifacts": [
    {
      "artifactId": "art_01HABCDEF",
      "name": "report.md",
      "mimeType": "text/markdown",
      "size": 15420,
      "inline": true,
      "content": "# 季度报告\n\n..."
    },
    {
      "artifactId": "art_02HABCDEF",
      "name": "report.metadata.json",
      "mimeType": "application/json",
      "size": 1024,
      "inline": true,
      "content": "{\"engine\":\"markitdown\",...}"
    },
    {
      "artifactId": "art_03HABCDEF",
      "name": "img-001.png",
      "mimeType": "image/png",
      "size": 48200,
      "inline": false,
      "downloadUrl": "/v1/conversions/conv_01H1234567890ABCDEF/artifacts/art_03HABCDEF?sig=..."
    }
  ],
  "usage": {
    "inputTokens": null,
    "outputTokens": null,
    "model": null,
    "credits": 1.5
  },
  "warnings": [
    "表格第3行解析为简化格式"
  ],
  "error": null
}
```

### 4.3 响应字段定义

| 字段 | 类型 | 说明 |
|------|------|------|
| `jobId` | `string` | 服务侧全局唯一任务 ID |
| `status` | `string` | `queued` / `running` / `succeeded` / `failed` / `canceled` |
| `task` | `string` | 原始任务类型 |
| `createdAt` | `string(ISO8601)` | 创建时间 |
| `startedAt` | `string?` | 开始执行时间 |
| `completedAt` | `string?` | 完成/失败/取消时间 |
| `clientJobId` | `string?` | 调用方传入的幂等键 |
| `metadata` | `object?` | 原样透传 |
| `result` | `object?` | 结构化结果摘要（如 title, pageCount, language, textPreview）；小文本可放 `textPreview`，大文本走 artifact |
| `artifacts` | `Artifact[]?` | 产物清单 |
| `usage` | `object?` | 资源消耗（tokens, credits, seconds 等） |
| `warnings` | `string[]?` | 非致命警告 |
| `error` | `ErrorDetail?` | 失败时非 null |

### 4.4 Artifact 结构

| 字段 | 类型 | 说明 |
|------|------|------|
| `artifactId` | `string` | 产物唯一 ID |
| `name` | `string` | 文件名 |
| `mimeType` | `string` | MIME 类型 |
| `size` | `number` | 字节数 |
| `inline` | `boolean` | `true` 时 `content` 字段直接包含内容（适合 < 64KB 文本）；`false` 时走下载 URL |
| `content` | `string?` | inline 时的 base64 或 UTF-8 文本 |
| `downloadUrl` | `string?` | 带短时签名或 token 的下载地址；默认有效期 1 小时 |

> **产物大小策略**：
> - 文本产物（Markdown、JSON、SRT、TXT）< 64KB 时推荐 `inline: true`；
> - 图片、音频、大文本（> 64KB）必须 `inline: false`，通过 `downloadUrl` 流式下载；
> - `downloadUrl` 应支持 `Range` 请求，便于大文件断点续传。

---

## 5. 产物规范（按任务类型）

### 5.1 `document.markdown` 产物

| 产物 | 文件名约定 | MIME | 内容 |
|------|-----------|------|------|
| Markdown 正文 | `<name>.md` | `text/markdown` | 转换后的 Markdown 文本 |
| 元数据 | `<name>.metadata.json` | `application/json` | 引擎信息、页数、字数、语言、asset 清单等 |
| 提取图片 | `img-NNN.<ext>` | `image/*` | 原文件内嵌图片 |

**metadata.json 结构**：

```json
{
  "engine": "markitdown",
  "engineVersion": "0.0.1a40",
  "task": "document.markdown",
  "convertedAt": "2024-06-01T12:00:12Z",
  "sourceType": "pdf",
  "title": "季度报告",
  "author": null,
  "pages": 12,
  "wordCount": 3456,
  "language": "zh",
  "images": 3,
  "tables": 2,
  "footnotes": null,
  "endnotes": null,
  "assets": [
    { "name": "img-001.png", "size": 48200, "mimeType": "image/png" }
  ],
  "warnings": ["表格第3行解析为简化格式"]
}
```

> **MarkItDown 约束重申**：
> - `pages` / `images` / `tables` / `footnotes` / `endnotes` 为尽力提取字段，缺失时用 `null`，不用 `0`；
> - 若引擎无法区分 footnote 与 endnote，两者均为 `null`；
> - `sourceHash` 不由 Python 服务生成（因为 ridge 侧在落盘时自行计算），Python 侧不保证 hash 一致性。

### 5.2 `audio.transcription` 产物

| 产物 | 文件名约定 | MIME | 内容 |
|------|-----------|------|------|
| 转录文本 | `<name>.md` | `text/markdown` | 带时间戳的 Markdown 文本 |
| 分段 JSON | `<name>.segments.json` | `application/json` | 逐段起止时间、文本、说话人（如启用 diarization） |
| 元数据 | `<name>.metadata.json` | `application/json` | 音频时长、采样率、语言、模型等 |

### 5.3 `image.ocr` 产物

| 产物 | 文件名约定 | MIME | 内容 |
|------|-----------|------|------|
| OCR 文本 | `<name>.md` | `text/markdown` | 识别的纯文本 |
| 块级 JSON | `<name>.blocks.json` | `application/json` | 逐块 bbox + text + confidence |
| 元数据 | `<name>.metadata.json` | `application/json` | 图片尺寸、语言、引擎等 |

---

## 6. 完整 JSON 示例

### 6.1 PDF 转 Markdown

**请求**：

```json
{
  "task": "document.markdown",
  "input": {
    "url": "https://storage.example.com/signed/report.pdf?exp=1715606400&sig=abc123"
  },
  "options": {
    "engine": "markitdown",
    "extractImages": true,
    "extractTables": true
  },
  "clientJobId": "ridge-ws-paper-1715606400000",
  "callbackUrl": "https://ridge.local/api/webhooks/conversion",
  "metadata": {
    "ridgeFileId": "file_123",
    "ridgeWorkspacePath": "附件/paper.pdf"
  }
}
```

**响应（succeeded）**：

```json
{
  "jobId": "conv_01HABC123",
  "status": "succeeded",
  "task": "document.markdown",
  "createdAt": "2024-06-01T10:00:00Z",
  "startedAt": "2024-06-01T10:00:02Z",
  "completedAt": "2024-06-01T10:00:15Z",
  "clientJobId": "ridge-ws-paper-1715606400000",
  "metadata": {
    "ridgeFileId": "file_123",
    "ridgeWorkspacePath": "附件/paper.pdf"
  },
  "result": {
    "title": "Deep Learning for Natural Language Processing",
    "textPreview": "# Deep Learning for Natural Language Processing\n\n## Abstract\nWe present...",
    "pageCount": 8,
    "wordCount": 4200,
    "language": "en"
  },
  "artifacts": [
    {
      "artifactId": "art_md_01",
      "name": "paper.md",
      "mimeType": "text/markdown",
      "size": 15230,
      "inline": true,
      "content": "# Deep Learning for Natural Language Processing\n\n## Abstract\nWe present a comprehensive survey..."
    },
    {
      "artifactId": "art_meta_01",
      "name": "paper.metadata.json",
      "mimeType": "application/json",
      "size": 680,
      "inline": true,
      "content": "{\"engine\":\"markitdown\",\"engineVersion\":\"0.0.1a40\",\"pages\":8,\"images\":2,\"tables\":1}"
    },
    {
      "artifactId": "art_img_01",
      "name": "img-001.png",
      "mimeType": "image/png",
      "size": 45000,
      "inline": false,
      "downloadUrl": "/v1/conversions/conv_01HABC123/artifacts/art_img_01?sig=..."
    }
  ],
  "usage": { "credits": 2.0 },
  "warnings": [],
  "error": null
}
```

### 6.2 音频转录

**请求**：

```json
{
  "task": "audio.transcription",
  "input": {
    "url": "https://storage.example.com/signed/meeting.m4a?sig=..."
  },
  "options": {
    "language": "zh",
    "modelSize": "base",
    "segmentDuration": 30,
    "diarization": false,
    "format": "json"
  },
  "clientJobId": "ridge-audio-meeting-1715606500000",
  "metadata": {
    "ridgeFileId": "file_456"
  }
}
```

**响应（succeeded）**：

```json
{
  "jobId": "conv_01HDEF456",
  "status": "succeeded",
  "task": "audio.transcription",
  "createdAt": "2024-06-01T11:00:00Z",
  "completedAt": "2024-06-01T11:02:30Z",
  "clientJobId": "ridge-audio-meeting-1715606500000",
  "result": {
    "durationSeconds": 1860,
    "language": "zh",
    "segmentCount": 62
  },
  "artifacts": [
    {
      "artifactId": "art_txt_01",
      "name": "meeting.md",
      "mimeType": "text/markdown",
      "size": 12400,
      "inline": true,
      "content": "## 00:00 - 00:30\n\n主持人：今天的议题是...\n\n## 00:30 - 01:00\n\nAlice：我补充一下数据..."
    },
    {
      "artifactId": "art_seg_01",
      "name": "meeting.segments.json",
      "mimeType": "application/json",
      "size": 4500,
      "inline": true,
      "content": "[{\"start\":0,\"end\":30,\"text\":\"主持人：今天的议题是...\"},...]"
    },
    {
      "artifactId": "art_meta_01",
      "name": "meeting.metadata.json",
      "mimeType": "application/json",
      "size": 300,
      "inline": true,
      "content": "{\"durationSeconds\":1860,\"sampleRate\":44100,\"model\":\"whisper-base\",\"language\":\"zh\"}"
    }
  ],
  "usage": { "credits": 3.5 },
  "warnings": ["00:15-00:22 段信噪比较低，转录可能不准确"],
  "error": null
}
```

### 6.3 图片 OCR

**请求**：

```json
{
  "task": "image.ocr",
  "input": {
    "url": "https://storage.example.com/signed/invoice.png?sig=..."
  },
  "options": {
    "language": "zh",
    "outputBlocks": true,
    "confidenceThreshold": 0.65
  },
  "clientJobId": "ridge-img-invoice-1715606600000"
}
```

**响应（succeeded）**：

```json
{
  "jobId": "conv_01HGHI789",
  "status": "succeeded",
  "task": "image.ocr",
  "createdAt": "2024-06-01T13:00:00Z",
  "completedAt": "2024-06-01T13:00:03Z",
  "clientJobId": "ridge-img-invoice-1715606600000",
  "result": {
    "textPreview": "发票号码：12345678\n金额：¥1,250.00\n日期：2024-05-20",
    "blockCount": 12,
    "avgConfidence": 0.91
  },
  "artifacts": [
    {
      "artifactId": "art_md_01",
      "name": "invoice.md",
      "mimeType": "text/markdown",
      "size": 320,
      "inline": true,
      "content": "发票号码：12345678\n金额：¥1,250.00\n日期：2024-05-20\n..."
    },
    {
      "artifactId": "art_blocks_01",
      "name": "invoice.blocks.json",
      "mimeType": "application/json",
      "size": 2100,
      "inline": true,
      "content": "[{\"bbox\":[12,34,120,56],\"text\":\"发票号码\",\"confidence\":0.98},...]"
    },
    {
      "artifactId": "art_meta_01",
      "name": "invoice.metadata.json",
      "mimeType": "application/json",
      "size": 250,
      "inline": true,
      "content": "{\"width\":1024,\"height\":768,\"engine\":\"tesseract\",\"language\":\"zh\"}"
    }
  ],
  "usage": { "credits": 0.5 },
  "warnings": [],
  "error": null
}
```

---

## 7. 错误码规范

### 7.1 错误响应结构

```json
{
  "error": {
    "code": "unsupported_format",
    "message": "The uploaded file .xyz is not supported for task document.markdown",
    "details": {
      "task": "document.markdown",
      "receivedMimeType": "application/octet-stream",
      "supportedFormats": ["pdf", "docx", "pptx", "xlsx", "html", "txt"]
    }
  }
}
```

### 7.2 错误码表

| 错误码 | HTTP 状态 | 含义 | 客户端行为建议 |
|--------|-----------|------|--------------|
| `unsupported_format` | `400` | 文件格式/扩展名不在任务支持列表 | 检查 `capabilities` 端点 |
| `invalid_input` | `400` | 输入参数非法（如 URL 格式错误、base64 损坏） | 修正请求参数 |
| `file_too_large` | `413` | 超出单文件大小限制 | 拆分/压缩后重试 |
| `conversion_timeout` | `504` | 任务执行超时（非 `waitMs`） | 可重试或简化选项 |
| `conversion_failed` | `502` | 引擎内部异常（解析失败、模型错误） | 人工检查文件质量 |
| `auth_failed` | `401` | API Key 无效或过期 | 刷新/更换 Key |
| `rate_limited` | `429` | 超出限流配额 | 退避后重试 |
| `fetch_failed` | `502` | 从预签名 URL 拉取源文件失败 | 检查 URL 有效期 |
| `not_found` | `404` | `jobId` 或 `artifactId` 不存在 | 检查 ID 正确性 |
| `already_canceled` | `409` | 任务已取消，无法再次取消 | 忽略 |
| `quota_exceeded` | `403` | 账户配额/ credits 耗尽 | 联系管理员 |

---

## 8. 运行边界与策略

### 8.1 幂等性

- **幂等键**：`clientJobId` + API Key（或 project 维度）组合；
- **幂等窗口**：建议 24 小时；窗口内重复请求返回同一 `jobId`，不重复计费；
- **不同 API Key**：相同 `clientJobId` 视为不同任务。

### 8.2 重试策略

- **服务侧重试**：引擎内部失败（如模型 transient error）时，Python 服务自行重试最多 2 次；
- **客户端重试**：`fetch_failed`、`rate_limited`、`conversion_timeout` 可安全重试；`conversion_failed` 不建议立即重试；
- **回调重试**：`callbackUrl` 投递失败时，按指数退避重试最多 5 次，间隔 5s → 10s → 20s → 40s → 80s。

### 8.3 超时

| 超时类型 | 值 | 说明 |
|----------|-----|------|
| 同步等待 `waitMs` | 调用方设定（最大 30s） | 超时不影响异步任务继续执行 |
| 任务执行超时 | 按 task 设定 | `document.markdown` 默认 5 分钟；`audio.transcription` 默认 音频时长 × 2 |
| 预签名 URL 拉取 | 30s | 下载源文件超时 |
| 产物下载签名 | 1 小时 | 过期后需重新 `GET /v1/conversions/{jobId}` 刷新 |

### 8.4 取消

- `POST /v1/conversions/{jobId}/cancel` 只能取消 `queued` 或 `running` 任务；
- 取消后 `status` 变为 `canceled`，已产生的临时产物保留 1 小时后清理；
- `succeeded` / `failed` 状态返回 `409 already_canceled` 语义（或 `400 bad_request`）。

### 8.5 限流

- 按 API Key 限流：建议 `POST /v1/conversions` 每秒 10 次，`GET` 每秒 100 次；
- 按并发任务数：单 API Key 最多同时 `running` 任务数建议 5 个；
- 超出时返回 `429 rate_limited`，响应头带 `Retry-After`。

### 8.6 大小限制

| 限制项 | 建议值 | 说明 |
|--------|--------|------|
| 单文件上传 | 100 MB | multipart / URL 下载均适用 |
| 总产物大小 | 500 MB | 超出时拒绝或仅保留主产物 |
| inline content | 64 KB | 超过自动转为 `inline: false` |
| 请求体（非 multipart） | 1 MB | JSON + base64 场景 |

### 8.7 保留期与清理

- **任务记录**：保留 30 天；到期后 `GET /v1/conversions/{jobId}` 返回 `404`；
- **产物文件**：保留 7 天；到期后 `downloadUrl` 失效；
- ** ridge 侧**：Node 后端在收到回调或轮询到 `succeeded` 后应立即下载产物并落盘，不依赖 Python 侧长期保留。

### 8.8 隐私与安全边界

- **不持久化源文件**：转换完成后源文件 buffer 立即释放；
- **产物隔离**：不同 API Key / project 的产物存储在逻辑隔离的临时空间；
- **URL 安全**：仅接受 HTTPS 预签名 URL；可选域名白名单；禁止 `file://`、`ftp://`、`http://localhost`；
- **日志脱敏**：日志中不打印文件内容、URL 签名参数、`apiKey` 完整值；
- **沙箱执行**：引擎进程应在受限容器/沙箱中运行，禁止网络出站（除回调）。

---

## 9. ridge 侧映射：Node 后端如何调用

### 9.1 整体流程

```
用户上传 PDF/Word/音频/图片
  → POST /api/files/upload（Node）
    → 写 disk
    → INSERT file_processing_status (pending)
    → background_jobs.enqueue({ type: "file.convert", payload: { filePath, task } })
      → file-conversion-worker.ts claimNext()
        → UPDATE status = converting
        → 调用 Python 服务 POST /v1/conversions（multipart 上传文件）
          → 202 + jobId
        → 轮询 GET /v1/conversions/{jobId} 或等待 callbackUrl
        → 下载 artifacts
        → Node 落盘：
            <name>.md
            <name>.metadata.json
            <name>.assets/
            .originals/<original>
        → UPDATE status = converted
        → 触发 RAG 索引入队（后续任务 22）
        → 写 notification_events（成功/失败）
```

### 9.2 状态机映射

| Python 侧状态 | ridge Node 侧状态 | 动作 |
|--------------|------------------|------|
| `queued` / `running` | `converting` | 等待 |
| `succeeded` | `converted` | 下载产物、落盘、归档原文件 |
| `failed` | `convert_failed` | 写 error、通知用户、保留原文件不动 |
| `canceled` | `convert_failed`（或保持 `converting` 后手动处理） | 记录取消原因 |

### 9.3 产物落盘规则

Python 服务返回的 artifacts 由 Node 后端负责写入 workspace 文件树：

```
附件/report.pdf          ← 原文件（转换前）
附件/report.md           ← 从 artifact "report.md" 写入
附件/report.assets/
  ├── img-001.png        ← 从 artifact "img-001.png" 下载写入
  └── img-002.png
附件/report.metadata.json ← 从 artifact "report.metadata.json" 写入，并追加 ridge 字段
附件/.originals/report.pdf ← Node 移动原文件归档
```

Node 落盘时应在 metadata.json 中**追加**以下 ridge 专属字段（不覆盖 Python 侧字段）：

```json
{
  "engine": "markitdown",
  "engineVersion": "0.0.1a40",
  "convertedAt": "2024-06-01T12:00:12Z",
  "_ridge": {
    "sourcePath": "附件/report.pdf",
    "workspacePath": "附件/report.md",
    "archivedAt": "2024-06-01T12:00:13Z",
    "archivedTo": "附件/.originals/report.pdf"
  }
}
```

> `_ridge` 前缀明确标识为 ridge 专属扩展字段；Python 服务应透传未知字段（存入 `metadata`），但不对其做业务解释。

### 9.4 失败处理

- Python 服务返回 `failed` 时，Node 提取 `error.code` 和 `error.message`，写入 `file_processing_status.error`；
- 同时生成 `notification_events` 记录，前端展示转换失败徽章和重试按钮；
- 原文件不动，不归档到 `.originals/`（归档只在成功时执行）；
- 用户点击重试 → `POST /api/workspace/files/retry` → 状态回到 `pending` → 重新入队 `file.convert`。

### 9.5 callback vs 轮询

ridge Node 后端**优先使用回调**：在创建任务时传入 `callbackUrl`（如 `https://ridge.local/api/webhooks/conversion`），减少轮询压力。

回调路由应：
- 校验签名（在 callback URL 中嵌入 token 或使用 HMAC）；
- 根据 `jobId` 查找对应的 `background_jobs` 记录；
- 若回调超时未到达，后台 worker 可启动补偿轮询（每 30s 查一次）。

---

## 10. TypeScript 类型草案

以下为 ridge Node 后端消费 Python 服务时推荐使用的类型定义，后续可按实际响应微调。

```typescript
// === 请求 ===

export type ConversionTask =
  | "document.markdown"
  | "audio.transcription"
  | "image.ocr"
  | "image.description"
  | "document.ocr_markdown";

export interface ConversionInput {
  /** 预签名 URL（推荐） */
  url?: string;
  /** base64 Data URI（fallback，大小受限） */
  base64?: string;
  /** MIME 类型，base64 场景必填 */
  mimeType?: string;
}

export interface DocumentMarkdownOptions {
  engine?: "markitdown" | "pandoc" | "docling";
  extractImages?: boolean;
  extractTables?: boolean;
  pageRange?: [number, number];
  ocrFallback?: boolean;
}

export interface AudioTranscriptionOptions {
  language?: string;
  modelSize?: "tiny" | "base" | "small" | "medium" | "large";
  segmentDuration?: number;
  diarization?: boolean;
  format?: "srt" | "vtt" | "json" | "txt";
}

export interface ImageOcrOptions {
  language?: string;
  outputBlocks?: boolean;
  confidenceThreshold?: number;
}

export interface ConversionOptions
  extends Partial<DocumentMarkdownOptions>,
    Partial<AudioTranscriptionOptions>,
    Partial<ImageOcrOptions> {}

export interface CreateConversionRequest {
  task: ConversionTask;
  input?: ConversionInput;
  options?: ConversionOptions;
  clientJobId?: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
  preferredFormat?: "markdown" | "json" | "text" | "html";
  waitMs?: number;
}

// === 响应 ===

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export interface Artifact {
  artifactId: string;
  name: string;
  mimeType: string;
  size: number;
  inline: boolean;
  content?: string;           // inline=true 时存在
  downloadUrl?: string;       // inline=false 时存在
}

export interface UsageInfo {
  inputTokens?: number | null;
  outputTokens?: number | null;
  model?: string | null;
  credits?: number;
  durationSeconds?: number;
}

export interface ErrorDetail {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ConversionJob {
  jobId: string;
  status: JobStatus;
  task: ConversionTask;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  clientJobId?: string;
  metadata?: Record<string, unknown>;
  result?: Record<string, unknown>;
  artifacts?: Artifact[];
  usage?: UsageInfo;
  warnings?: string[];
  error?: ErrorDetail | null;
}

// === 回调 ===

export type ConversionCallbackPayload = ConversionJob;

// === 能力发现 ===

export interface CapabilityTask {
  task: ConversionTask;
  supportedInputFormats: string[];   // 扩展名列表，如 [".pdf", ".docx"]
  supportedOutputFormats: string[];    // 如 ["markdown", "json"]
  optionsSchema: Record<string, unknown>; // JSON Schema 描述
}

export interface CapabilitiesResponse {
  version: string;
  tasks: CapabilityTask[];
  maxFileSizeBytes: number;
  maxInlineSizeBytes: number;
  defaultRetentionDays: number;
}
```

---

## 11. OpenAPI Schema 草案（核心路径）

```yaml
openapi: 3.1.0
info:
  title: Python Universal Conversion Service
  version: 1.0.0
  description: |
    独立部署的通用内容转化服务。支持文档转 Markdown、音频转录、图片 OCR。
    多 client、多 project、API Key 认证。异步任务模型。

servers:
  - url: https://converter.example.com/v1
    description: Production

security:
  - bearerAuth: []

paths:
  /conversions:
    post:
      summary: 创建转换任务
      requestBody:
        content:
          multipart/form-data:
            schema:
              type: object
              properties:
                task:
                  type: string
                  enum: [document.markdown, audio.transcription, image.ocr, image.description, document.ocr_markdown]
                file:
                  type: string
                  format: binary
                input:
                  type: string
                  description: JSON 序列化后的 ConversionInput（无 file 时必填）
                options:
                  type: string
                  description: JSON 序列化后的 ConversionOptions
                clientJobId:
                  type: string
                  maxLength: 128
                callbackUrl:
                  type: string
                  format: uri
                metadata:
                  type: string
                  description: JSON 序列化后的 object
                preferredFormat:
                  type: string
                  enum: [markdown, json, text, html]
                waitMs:
                  type: integer
                  minimum: 0
                  maximum: 30000
      responses:
        "202":
          description: 已接受，进入队列
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ConversionJob"
        "400":
          description: 参数错误
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorDetail"
        "413":
          description: 文件过大
        "429":
          description: 限流

  /conversions/{jobId}:
    get:
      summary: 查询任务状态
      parameters:
        - name: jobId
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ConversionJob"
        "404":
          description: 任务不存在

  /conversions/{jobId}/cancel:
    post:
      summary: 取消任务
      responses:
        "200":
          description: 已取消或任务已完成
        "409":
          description: 已取消/已完成，无法再次取消

  /conversions/{jobId}/artifacts/{artifactId}:
    get:
      summary: 下载产物
      parameters:
        - name: jobId
          in: path
          required: true
          schema:
            type: string
        - name: artifactId
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: 产物流
          content:
            application/octet-stream:
              schema:
                type: string
                format: binary
        "404":
          description: 产物不存在或已过期

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      description: API Key，如 `rk_live_xxxxxxxx`

  schemas:
    ConversionJob:
      type: object
      required: [jobId, status, task, createdAt]
      properties:
        jobId: { type: string }
        status:
          type: string
          enum: [queued, running, succeeded, failed, canceled]
        task: { type: string }
        createdAt: { type: string, format: date-time }
        startedAt: { type: string, format: date-time }
        completedAt: { type: string, format: date-time }
        clientJobId: { type: string }
        metadata: { type: object }
        result: { type: object }
        artifacts:
          type: array
          items:
            $ref: "#/components/schemas/Artifact"
        usage:
          $ref: "#/components/schemas/UsageInfo"
        warnings:
          type: array
          items: { type: string }
        error:
          $ref: "#/components/schemas/ErrorDetail"

    Artifact:
      type: object
      required: [artifactId, name, mimeType, size, inline]
      properties:
        artifactId: { type: string }
        name: { type: string }
        mimeType: { type: string }
        size: { type: integer }
        inline: { type: boolean }
        content: { type: string }
        downloadUrl: { type: string, format: uri }

    UsageInfo:
      type: object
      properties:
        inputTokens: { type: [integer, "null"] }
        outputTokens: { type: [integer, "null"] }
        model: { type: [string, "null"] }
        credits: { type: number }
        durationSeconds: { type: number }

    ErrorDetail:
      type: object
      required: [code, message]
      properties:
        code: { type: string }
        message: { type: string }
        details: { type: object }
```

---

## 12. 扩展策略与版本演进

### 12.1 向后兼容规则

- **新增 task**：在 `capabilities` 中公布，旧客户端不请求即不受影响；
- **新增 options 字段**：服务侧忽略不识别的 option（宽松校验），新字段默认值保持旧行为；
- **新增 response 字段**：客户端必须忽略未知字段（forward-compatible）；
- **变更产物格式**：如 MarkItDown 输出结构变化，应通过 `engineVersion` 区分，不在 API 版本号中体现。

### 12.2 破坏性变更

以下情况触发 `/v2`：
- 认证方式改变（如从 Bearer 改为 mTLS）；
- 核心资源路径变化（如 `conversions` 改为 `jobs`）；
- `status` 枚举移除值或改变语义；
- `Artifact` 结构发生不兼容变更（如 `inline` 字段移除）。

### 12.3 引擎升级透明性

- MarkItDown 版本升级不应改变 API 版本号；
- 通过 `engineVersion` 和 `capabilities` 让调用方感知能力差异；
- ridge Node 后端应在 metadata.json 中记录 `engineVersion`，便于追溯和排障。

---

## 13. 验收标准

- [ ] 本文档通过内部评审，作为 Python 服务开发的唯一接口真源；
- [ ] ridge 侧 `file.convert` worker 实现按本文档调用 Python 服务；
- [ ] Python 服务实现覆盖 `document.markdown`（MarkItDown）、`audio.transcription`、`image.ocr`；
- [ ] API 通过自动化测试（创建/查询/下载/取消/回调/错误场景）；
- [ ] 限流、幂等、超时、取消、产物保留期策略在生产环境验证；
- [ ] `npm run check` 通过（ridge 侧新增 TypeScript 类型）；
- [ ] 本文档归档到 `文档/功能开发/归档/`；
- [ ] `MEMORY.md` 已更新架构决策。

---

## 关联文档

- `文档/模块梳理/Python通用转化服务接口契约.md` — 稳定接口边界与职责矩阵
- `文档/模块梳理/文件处理状态模块契约.md` — 状态机定义
- `文档/模块梳理/后台任务队列.md` — 队列调度定义
- `文档/功能开发/19-PDF-Word标准化转换-实现.md` — 旧 JS 自研转换栈（将迁移）
- `文档/功能开发/20-音频图片Markdown处理.md` — 早期草案（将按本契约落地）

(End of file)
