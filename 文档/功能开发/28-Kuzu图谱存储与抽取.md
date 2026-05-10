# 28 Kuzu 图谱存储与抽取

## 目标

实现 Kuzu 图谱存储和夜间 graph agent 抽取。

## 范围

- `.ridge/graph.kuzu/`。
- Kuzu schema。
- graph agent。
- 从工作空间 Markdown、正式附件转换产物、内部项目文档、daily 抽取。
- 实体：项目、文件、任务、人物、组织、概念、技术、资料、决策。
- 关系证据来源和短摘录。

## 不做

- 外部项目不进入图谱。
- 用户不直接手动编辑图谱。
- 第一版不做巨大图谱画布。

## 验收

- 图谱进入服务器完整备份。
- 图谱不进隐藏 Git。
- 图谱不直接读取混杂原文件。
- 用户可通过自然语言纠错后由 AI 修正。

## 关联设计

- `文档/项目设计/记忆Wiki图谱与工作空间MCP.md`
- `文档/项目设计/文件处理流程.md`

## Spec 提取点

- Kuzu schema。
- 抽取 prompt 和输出 schema。
- 证据格式。

## Spec 草案

### 存储

- 路径：`.ridge/graph.kuzu/`
- 节点：Project、File、Task、Person、Org、Concept、Tech、Source、Decision。
- 边：带 `evidence`、`source_path`、`confidence`、`updated_at`。

### 行为

- 夜间 RAG 后运行 graph agent。
- 只读取标准产物和 daily。
- 外部项目不入图谱。
- 用户通过自然语言纠错后再修正。

### 测试

- 内部项目文档可抽取节点。
- 外部项目文件不会入图谱。
- 关系保存短摘录证据。
- Kuzu 目录进入备份清单。
