# 20 音频图片 Markdown 处理

## 目标

实现音频、图片和 Markdown 的文件处理规则。

## 范围

- 音频转写 Markdown。
- 音频 metadata。
- 分段时间戳。
- 图片 OCR。
- 图片 metadata。
- 图片向量入口。
- Markdown 直接作为文本资产。

## 不做

- 图片第一版不生成视觉描述。
- 音频采集当场不转写。
- Markdown 编辑不立即触发 RAG。

## 验收

- 音频原件归档。
- 图片 OCR 文本可进入 RAG。
- Markdown 当前内容是 RAG 真源。
- 用户编辑 Markdown 后自动转换不得覆盖。

## 关联设计

- `文档/项目设计/文件处理流程.md`
- `文档/项目设计/闪念系统与桌面采集.md`

## Spec 提取点

- 音频转写产物格式。
- 图片 OCR 产物格式。
- Markdown 编辑检测。

## Spec 草案

### 音频输出

- `<name>.md`
- `<name>.metadata.json`
- `.originals/<audio>`

### 图片输出

- OCR 文本。
- 图片 metadata。
- 图片向量索引入口。

### 行为

- 音频转写保留分段时间戳。
- 图片不生成视觉描述。
- Markdown 文件直接作为文本资产。

### 测试

- 音频生成转写 Markdown。
- 图片生成 OCR 文本和 metadata。
- Markdown 编辑后 RAG 以新内容为准。
- 图片视觉描述字段不存在。
