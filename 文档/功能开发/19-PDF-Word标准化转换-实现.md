# 19 PDF Word 标准化转换 — 实现文档

## 目标

实现 PDF、Word 文件的标准化转换流程，作为 ridge 知识资产化的核心环节。

## 范围

1. 上传 PDF/Word 后自动触发后台转换任务；
2. 纯 JavaScript 实现，不引入 Python 或外部服务依赖；
3. 生成四类产物：
   - `<name>.md` — Markdown 正文
   - `<name>.assets/` — 提取的图片资源
   - `<name>.metadata.json` — 元数据
   - `.originals/<original>` — 原文件归档
4. 转换失败保留原文件并记录状态（`convert_failed`）；
5. 用户编辑过的 Markdown 不会被自动覆盖，重新转换需手动确认；
6. 集成现有 `file_processing_status` 状态机和 `background_jobs` 队列。

## 不做

- RAG 索引（由后续任务 22 处理）；
- 音频/图片转换（任务 20）；
- Docling Python CLI 或外部服务调用。

## 技术方案

### 依赖

- `@pdf2md/core@0.2.0` — 纯 JS PDF 到 Markdown，client-side/Node.js 双端
- `mammoth@1.9.0` — Word `.docx` 到 HTML（再经 turndown 转 Markdown）
- `turndown@7.2.0` — HTML 到 Markdown 通用转换器

### 模块设计

1. **`packages/server/src/file-converter.ts`**
   - `convertPdfToStandard(sourcePath, workspaceDir): Promise<ConversionResult>`
   - `convertWordToStandard(sourcePath, workspaceDir): Promise<ConversionResult>`
   - 内部处理：
     - 解析文件 → Markdown 文本
     - 提取图片 → 写入 `.assets/`
     - 生成 metadata → 写入 `.metadata.json`
     - 原文件移动 → `.originals/`

2. **`packages/server/src/file-conversion-worker.ts`**
   - `createFileConversionWorker(options): { start, stop }`
   - 轮询 `background_jobs` 队列中 `file.convert` 类型任务
   - 状态流转：
     - 开始转换：`pending` → `converting`
     - 转换成功：`converting` → `converted`
     - 转换失败：`converting` → `convert_failed` + 写 error + 通知
   - 失败时原文件不动，只更新状态和通知

3. **`packages/server/src/routes/workspace-data.ts`** 上传集成
   - `POST /api/files/upload` 中，检测到 `.pdf`/`.docx` 文件时：
     - 照常创建 `pending` 状态记录（已有）
     - 额外 enqueue `file.convert` 后台任务

4. **`packages/server/src/routes/workspace-files.ts`** 重新转换 API
   - `POST /api/workspace/files/convert` — 手动触发重新转换
   - 检查已有 `.md` 的 mtime 和 hash，判断是否被用户编辑过（后续实现）
   - 如已有产物且未被编辑，拒绝自动重转

### 产物示例

```
附件/paper.pdf                 ← 原文件（转换前）
附件/paper.md                  ← Markdown 产物
附件/paper.assets/
  ├── img-001.png
  └── img-002.png
附件/paper.metadata.json       ← { title, author, pages, tables, images, ... }
附件/.originals/paper.pdf      ← 原文件归档
```

### 状态流转

```
upload → pending → converting → converted → indexed
                         ↓
                   convert_failed (retry → pending)
```

## 测试策略

按 TDD 流程：

1. 写 `__tests__/pdf-word-conversion.test.ts`（确认失败）
2. 实现 `file-converter.ts`（测试通过）
3. 写 `__tests__/file-conversion-worker.test.ts`（确认失败）
4. 实现 `file-conversion-worker.ts`（测试通过）
5. 写 `__tests__/file-upload-convert-trigger.test.ts`（确认失败）
6. 集成 upload 触发逻辑（测试通过）

测试覆盖点：
- PDF 转换生成四类产物
- Word 转换保留标题层级、正文、列表、表格、图片
- 解析失败保留原文件并写失败状态
- 用户编辑后自动重转被拒绝
- `.originals` 归档正确
- 图片提取到 `.assets/`
- metadata JSON 包含必要字段

## 关联模块

- `文件处理状态模块契约.md` — 状态机已就绪
- `文档/项目设计/文件处理流程.md` — 标准化转换流程设计
- `background-jobs.ts` — 队列基础设施
- `file-manager.ts` — 文件系统边界

## 验收标准

- [x] `npm run check` 通过（lint + typecheck）
- [x] `cd packages/server && pnpm test` 全部通过
- [x] 上传 PDF/Word 后自动进入 converting 状态
- [x] 转换完成后 tree 可见 `.md` + `.assets/` + `.metadata.json` + `.originals/`
- [x] 转换失败后原文件保留，状态为 `convert_failed` 并通知
- [x] 文档归档到 `文档/功能开发/归档/`
- [x] 记忆更新到 `文档/记忆/MEMORY.md`
