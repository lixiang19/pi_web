# 文件剪藏RAG与附件

## RAG 范围

工作空间 RAG 默认索引 `~/ridge-workspace` 中的用户可见内容。

默认进入 RAG：

- 笔记；
- 日记；
- 剪藏；
- 正式附件；
- 记忆；
- Wiki；
- 空间；
- 内部项目；
- 其他工作空间可见文件。

默认不进入 RAG：

- `.ridge` 系统目录；
- 未处理闪念；
- 闪念临时附件；
- 外部项目。

## 正式附件

正式附件目录是 `~/ridge-workspace/附件`。

- 用户可见；
- 作为正式附件目录处理；
- 自动进入工作空间 RAG；
- 可被闪念处理结果、任务、日记、笔记、项目、剪藏等正式对象引用。

## 标准化解析

RAG 不直接基于混杂原文件构建。

文件先通过 Docling 和相关解析能力转成标准产物，再基于标准产物构建：

- 向量 RAG；
- Kuzu 图谱。

标准产物包括：

- Markdown；
- 图片和其他 assets；
- metadata JSON。

## 原文件归档

PDF、Word、音频等原始文件在转换后归档。

- 原文件归档到同目录隐藏 `.originals`。
- 转换产物留在原文件所在目录。
- 用户主要阅读和编辑 Markdown 产物。
- 转换失败时保留原文件并标记失败。

## 产物命名

同目录生成标准产物。

示例：

```txt
paper.md
paper.assets/
paper.metadata.json
.originals/paper.pdf
```

assets 目录使用 `<文件名>.assets` 命名。

metadata 使用 `<文件名>.metadata.json` 旁车文件。

## 文件类型

PDF、Word：

- 转为 Markdown；
- 提取图片和 assets；
- 生成 metadata；
- 原文件归档。

音频：

- 生成转写 Markdown；
- 生成音频 metadata；
- 保留必要分段时间戳；
- 原文件归档。

图片：

- 生成图片向量；
- 生成 OCR 文本；
- 生成 metadata；
- 不生成视觉描述。

## 索引更新

RAG 索引更新分三类。

用户上传文件后立即转换和索引。

普通文件变更、用户编辑 Markdown、后台 Agent 改写 Markdown，进入夜间统一索引。

用户可以手动触发立即更新索引。

- 文件页显示转换中、已索引、失败等状态。
- 解析失败时保留原件并显示失败状态。
- 用户可以重试失败转换。

图谱和 Wiki 不因上传立即更新。

夜间维护顺序是：

1. RAG；
2. 图谱；
3. Wiki。

## Markdown 编辑

转换生成的 Markdown 允许用户编辑。

- RAG 以编辑后的 Markdown 为准。
- 如果 Markdown 已被用户编辑，后续自动转换不得覆盖。
- 需要重新转换时，由用户手动触发并确认。
