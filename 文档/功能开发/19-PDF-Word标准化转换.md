# 19 PDF Word 标准化转换

## 目标

实现 PDF、Word 的标准化转换流程。

## 范围

- 保存原文件。
- 调用 Docling 或同类解析能力。
- 生成 Markdown。
- 提取图片、表格和 assets。
- 生成 metadata JSON。
- 原文件归档到同目录 `.originals`。
- 解析失败状态。

## 不做

- RAG 不直接索引原 PDF/Word。
- 用户编辑过的 Markdown 不自动覆盖。
- 重新转换必须用户确认。

## 验收

- 生成物和原文件在同一语义位置。
- PDF 保留标题、段落、页码、层级、表格、图片、脚注或尾注、metadata。
- Word 保留标题层级、正文、列表、表格、图片、脚注或尾注、文档属性。
- 转换失败保留原文件。

## 关联设计

- `文档/项目设计/文件处理流程.md`

## Spec 提取点

- Docling 调用接口。
- 产物命名规则。
- `.originals` 归档规则。
- 失败处理。

## Spec 草案

### 输入

- PDF 文件。
- Word 文件。

### 输出

- `<name>.md`
- `<name>.assets/`
- `<name>.metadata.json`
- `.originals/<original>`

### 行为

- 调用解析器生成 Markdown 和 assets。
- 原文件归档到 `.originals`。
- RAG 只索引 Markdown 和 metadata。
- 用户编辑后的 Markdown 不被自动覆盖。

### 测试

- PDF 转换生成四类产物。
- Word 转换保留标题、列表、表格和图片。
- 解析失败保留原文件并写失败状态。
- 用户编辑后自动重转被拒绝。
