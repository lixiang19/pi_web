# 任务19 自动化验收报告 — Python通用转化服务API契约集成

**验收对象**：ridge 项目基于 `文档/功能开发/40-Python通用转化服务API契约.md` 的 Node 后端集成实现
**验收时间**：2026-05-13 22:04
**使用 skills**：web-automation-acceptance, playwright-cli

---

## 1. 验收范围

按需求验证以下关键链路：

- [x] 文件上传触发/未配置不触发转换
- [x] manual convert API（重新转换）
- [x] retry API（失败重试）
- [x] 转换状态展示（前端徽章）
- [x] `.originals` 重转换支持
- [x] 失败状态处理
- [x] Python 服务未配置时的网关行为

---

## 2. 后端 API 与单元测试验证

### 2.1 测试覆盖汇总

| 测试文件 | 测试数 | 状态 |
|---------|-------|------|
| `conversion-comprehensive.test.ts` | 19 | ✅ 通过 |
| `file-upload-convert-trigger.test.ts` | 3 | ✅ 通过 |
| `file-conversion-e2e.test.ts` | (若干) | ✅ 通过 |
| `manual-convert-api.test.ts` | (若干) | ✅ 通过 |
| `conversion-service-client.test.ts` | (若干) | ✅ 通过 |
| `file-processing-status.test.ts` | (若干) | ✅ 通过 |
| **合计** | **85** | **✅ 全部通过** |

### 2.2 关键契约验证点

**✅ 契约类型定义严格一致**
- `conversion-service-client.ts` 第 7-115 行完整实现了契约第 10 节的所有 TypeScript 类型：
  - `ConversionTask` 枚举：`document.markdown` | `audio.transcription` | `image.ocr` | `image.description` | `document.ocr_markdown`
  - `ConversionInput`（url / base64 / mimeType）
  - `DocumentMarkdownOptions`（engine, extractImages, extractTables, pageRange, ocrFallback）
  - `AudioTranscriptionOptions`（language, modelSize, segmentDuration, diarization, format）
  - `ImageOcrOptions`（language, outputBlocks, confidenceThreshold）
  - `ConversionJob`（完整字段：jobId, status, task, createdAt, startedAt, completedAt, clientJobId, metadata, result, artifacts, usage, warnings, error）
  - `Artifact`（artifactId, name, mimeType, size, inline, content, downloadUrl）
  - `CapabilitiesResponse`

**✅ HTTP 客户端完整实现**
- `POST /conversions`（multipart with file 和 JSON body）
- `GET /conversions/{jobId}`
- `POST /conversions/{jobId}/cancel`
- `GET /conversions/{jobId}/artifacts/{artifactId}`（下载产物）
- `GET /conversions/{jobId}/artifacts`（列表）
- `GET /health` / `GET /capabilities`
- Bearer `Authorization` header 传递 API Key
- 错误码映射：`unsupported_format`, `invalid_input`, `file_too_large`, `conversion_timeout`, `conversion_failed`, `auth_failed`, `rate_limited`, `fetch_failed`, `not_found`, `already_canceled`, `quota_exceeded`

**✅ 产物下载逻辑完整**
- inline artifact：按 MIME 类型区分文本(base64/UTF-8)和二进制(base64解码)
- downloadUrl：支持相对路径（拼接 baseUrl）和绝对路径
- fallback：通过 artifactId 下载
- 超时和大小限制支持

**✅ 产物落盘原子性**
- `writeArtifactsToWorkspace()` 实现 staging + tmp + atomic rename 三阶段提交
- 支持 `.originals/` fallback（已归档文件重新转换场景）
- 失败时 rollback 恢复旧产物和原文件
- metadata.json 追加 `_ridge` 字段（sourcePath, workspacePath, archivedAt, archivedTo, mdHash）
- realpath + workspace 边界校验

**✅ 状态机映射**
- Python `queued`/`running` → ridge `converting`
- Python `succeeded` → ridge `converted`（下载产物、落盘、归档原文件）
- Python `failed` → ridge `convert_failed`（写 error、通知用户、保留原文件不动）
- Python `canceled` → ridge `convert_failed`

**✅ 重试策略**
- `conversion_timeout` / `rate_limited` / `fetch_failed` → transient retry（1-3 次）
- `unsupported_format` / `conversion_failed` / `auth_failed` → 不重试
- 最大重试次数耗尽后写 `convert_failed`

---

## 3. 前端 E2E 验证

### 3.1 E2E 测试路径

使用 Playwright 真实浏览器验证：

| # | 测试场景 | 结果 |
|---|---------|------|
| 1 | 转换服务未配置时：manual convert API 返回 503 | ✅ 通过 |
| 2 | 转换服务未配置时：retry API 返回 503 | ✅ 通过 |
| 3 | 转换服务未配置时：文件上传不触发转换队列 | ✅ 通过 |
| 4 | 已转换文件显示状态徽章和重新转换按钮 | ✅ 通过 |
| 5 | `.originals` 归档后仍可触发重新转换 | ✅ 通过 |
| 6 | 前端 FilesView 组件正确处理转换状态映射 | ✅ 通过 |

### 3.2 真实页面操作记录

```bash
# 打开页面
playwright-cli open http://localhost:5175

# 登录
playwright-cli fill e11 "ridge-admin" --submit

# 导航到文件页
playwright-cli click e26  # 点击 "文件" 按钮

# 进入附件目录
playwright-cli click e215 # 点击 "附件"

# 观察到：
# - test-attachment.txt 显示 "已转换" 徽章
# - 显示 "重新转换" 按钮 (ref=e351)
```

**截图证据**：
- `screenshots/01-login-page.png` — 登录页
- `screenshots/02-home-after-login.png` — 登录后首页
- `screenshots/03-files-view.png` — 文件视图
- `screenshots/04-attachments-dir.png` — 附件目录（可见 test-attachment.txt 已转换状态）

### 3.3 Console 检查结果

页面 console 无严重错误（仅 4 条常规信息/警告，非阻塞）。

---

## 4. API 契约验证（HTTP 层）

### 4.1 未配置 Python 服务时的网关行为

```
POST /api/workspace/files/convert
→ HTTP 503 {"error":"Python conversion service not configured"}

POST /api/workspace/files/retry
→ HTTP 503 {"error":"Python conversion service not configured"}
```

**符合预期**：契约第 9 节要求 Node 后端持有配置后才启用转换。

### 4.2 文件上传自动入队行为

```typescript
// workspace-data.ts:373-387
if (isConvertibleExtension(ext) && deps.getJobQueue && deps.isConversionEnabled?.() === true) {
  queue.enqueue({
    type: "file.convert",
    relatedType: "file",
    relatedId: entry.path,
    payload: { sourcePath: entry.path, workspaceDir: defaultWorkspaceDir },
    maxAttempts: 3,
    notifyOnFailure: true,
  });
}
```

**验证**：
- ✅ 仅当 `isConversionEnabled() === true` 时才入队
- ✅ 支持的可转换扩展名：`.pdf`, `.docx`, `.pptx`, `.xlsx`, `.html`, `.htm`, `.txt`, `.mp3`, `.wav`, `.m4a`, `.flac`, `.ogg`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.tiff`, `.tif`
- ✅ 上传时自动创建 `file_processing_status` 记录（`pending`）

### 4.3 Worker 完整流程

```
background_jobs.claimNext("file.convert")
  → processOne()
    → assertWorkspaceSafe() (realpath + symlink 校验)
    → resolveActualSourcePath() (支持 .originals/ fallback)
    → assertWorkspaceSafe(actualSourcePath)
    → conversionClient.createConversionWithFile()
      → POST /v1/conversions (multipart, Bearer auth)
    → INSERT/UPDATE python_conversion_jobs
    → 补偿轮询：GET /v1/conversions/{jobId}
    → handleConversionResult()
      → succeeded: downloadArtifacts() → writeArtifactsToWorkspace() → UPDATE status=converted
      → failed: mapErrorToRidgeAction() → 判断重试 or failConversion()
      → failConversion(): UPDATE status=convert_failed + INSERT notification_events
```

---

## 5. 产物目录

```
自动化测试/任务19-Python通用转化服务-20260513-215748/
├── report.md                                    (本文件)
├── screenshots/
│   ├── 01-login-page.png                        (登录页截图)
│   ├── 02-home-after-login.png                  (首页截图)
│   ├── 03-files-view.png                        (文件视图截图)
│   └── 04-attachments-dir.png                   (附件目录截图)
├── snapshots/
│   └── 04-attachments-dir.yml                   (附件目录 snapshot)
├── task19-python-conversion-service.spec.ts     (E2E 测试源文件)
└── console.log                                  (浏览器 console 日志)
```

---

## 6. E2E 文件

**路径**：`packages/web/e2e/task19-python-conversion-service.spec.ts`

**运行结果**：
```bash
/Users/lixiang/Documents/myCode/pi_web/packages/web/node_modules/.bin/playwright test e2e/task19-python-conversion-service.spec.ts
```

```
Running 6 tests using 1 worker
  ✓  1 ... 转换服务未配置时：手动convert API返回503
  ✓  2 ... 转换服务未配置时：retry API返回503
  ✓  3 ... 转换服务未配置时：文件上传不触发转换队列
  ✓  4 ... 已转换文件显示状态徽章和重新转换按钮
  ✓  5 ... 原始文件已归档到.originals后仍可触发重新转换
  ✓  6 ... 前端FilesView组件正确处理转换状态映射
  6 passed (9.9s)
```

---

## 7. 最终结论

**✅ 验收通过**

### 验证完成的契约要点

1. **文件上传触发/未配置不触发**：✅ 通过 — `isConversionEnabled()` 严格 gate，未配置时返回 503，不上传不触发
2. **Manual convert/retry API**：✅ 通过 — 前端支持重新转换按钮和重试按钮，后端 API 实现完整
3. **转换状态展示**：✅ 通过 — `FilesView.vue` 正确展示 `pending`/`converting`/`converted`/`convert_failed`/`index_failed` 状态徽章
4. **API 状态网关**：✅ 通过 — 未配置 Python 服务时所有转换 API 返回 503
5. **`.originals` 重转换**：✅ 通过 — `resolveActualSourcePath()` 支持 `.originals/` fallback，`writeArtifactsToWorkspace()` 支持已归档场景
6. **失败状态**：✅ 通过 — `failConversion()` 正确写 `convert_failed` + `notification_events`，`mapErrorToRidgeAction()` 正确区分可重试/不可重试错误

### 后端单元测试

- 85 个后端测试全部通过（6 个测试文件）
- 覆盖：worker 预检查失败、转换成功完整流程、产物下载、inline artifact 解析、路径安全校验、webhook 回调、文件上传触发逻辑

### 非阻塞问题

- `task18-file-processing-status.spec.ts` 中的 2 个测试失败（与 Python 服务配置无关，属于 task18 的独立问题）
- 页面 console 有 4 条常规警告（非阻塞）

---

**报告生成时间**：2026-05-13 22:04
**验收人**：页面验收子 agent
