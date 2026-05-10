# 02 隐藏 ridge 目录与路径边界

## 目标

定义 `.ridge/` 的系统目录边界，防止临时数据、缓存和索引污染用户可见资产。

## 范围

- 管理 `.ridge/`。
- 规划 `.ridge/fleeting-attachments`。
- 规划 `.ridge/rag/`。
- 规划 `.ridge/graph.kuzu/`。
- 规划转换缓存和运行缓存目录。
- 普通文件界面不展示 `.ridge/` 为用户目录。

## 不做

- 不实现具体 RAG。
- 不实现 Kuzu schema。
- 不做隐藏 Git 版本管理实现。

## 验收

- `.ridge` 下内容不进入 RAG。
- `.ridge` 下内容不给 workspace MCP 读取。
- 临时附件不作为长期资产展示。
- Kuzu 进入备份但不进隐藏 Git。

## 关联设计

- `文档/项目设计/文件处理流程.md`
- `文档/项目设计/工作空间隐藏版本管理.md`
- `文档/项目设计/数据导出与备份恢复.md`

## Spec 提取点

- `.ridge` 子目录清单。
- 可见文件和隐藏系统文件判定。
- 备份和版本管理排除规则。

## Spec 草案

### 数据

- `.ridge/fleeting-attachments`
- `.ridge/rag`
- `.ridge/graph.kuzu`
- `.ridge/cache`
- `.ridge/runtime`

### 行为

- 文件树默认隐藏 `.ridge`。
- RAG、图谱和 workspace MCP 都必须排除 `.ridge`。
- 隐藏版本管理排除可重建缓存和临时文件。
- Kuzu 图谱可备份但不进隐藏 Git。

### 测试

- 文件树 API 不返回 `.ridge`。
- RAG 扫描跳过 `.ridge`。
- MCP 读取 `.ridge` 路径失败。
- 备份清单包含 Kuzu，排除 RAG cache。
