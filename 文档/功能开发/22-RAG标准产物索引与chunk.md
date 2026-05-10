# 22 RAG 标准产物索引与 chunk

## 目标

实现基于标准产物的 RAG chunk 构建和索引写入。

## 范围

- 读取 Markdown、OCR、音频转写和 metadata。
- 解析 Markdown 结构。
- 按标题、段落、表格和语义边界切块。
- 生成 embedding。
- 保存 chunk 文本和 metadata。
- 建立过滤字段。

## 不做

- 不直接索引混杂原文件。
- 不索引外部项目文件。
- 不索引临时附件。

## 验收

- chunk 保存工作空间相对路径、标题路径、序号、更新时间、内容 hash、文件类型。
- 检索结果能回到原 Markdown 和位置。
- 内部项目、记忆、Wiki、空间进入 RAG。
- 外部项目不进入 RAG。

## 关联设计

- `文档/项目设计/文件处理流程.md`
- `文档/项目设计/文件剪藏RAG与附件.md`

## Spec 提取点

- chunk schema。
- embedding 调用。
- 来源定位格式。

## Spec 草案

### Chunk 字段

- id
- source_path
- heading_path
- chunk_index
- content
- content_hash
- file_type
- updated_at
- embedding_id

### 行为

- 只读取标准产物。
- 按 Markdown 结构和语义边界切块。
- 每个 chunk 生成 embedding。
- 保留可回跳来源。

### 测试

- Markdown 按标题生成 chunk。
- chunk metadata 包含相对路径。
- 外部项目文件不会生成 chunk。
- RAG 结果可定位来源文件。
