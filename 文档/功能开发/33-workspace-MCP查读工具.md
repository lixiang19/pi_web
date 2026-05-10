# 33 workspace MCP 查读工具

## 目标

实现服务器 workspace MCP，供桌面本机项目 Agent 查读云端工作空间。

## 范围

- `rag_search`。
- `graph_search`。
- `file_search`。
- `read_workspace_file`。
- 设备令牌认证。
- 同账号全读。
- MCP 配置进入 runtime bundle。

## 不做

- MCP 不允许写。
- 不读取隐藏目录。
- 不读取临时附件。
- 不读取会话临时上传。

## 验收

- `read_workspace_file` 可读取全部可见文件和正式附件。
- 检索结果返回片段、标题、路径或 URL、更新时间、来源类型、相关分数。
- 外部项目文件不通过 workspace MCP 暴露。
- MCP 不写用户真实 `~/.pi` 或外部项目 `.pi`。

## 关联设计

- `文档/项目设计/记忆Wiki图谱与工作空间MCP.md`

## Spec 提取点

- MCP tool schema。
- 认证和权限。
- 可读路径判定。

## Spec 草案

### Tools

- `rag_search(query, filters)`
- `graph_search(query, filters)`
- `file_search(query, filters)`
- `read_workspace_file(path)`

### 行为

- 使用设备令牌认证。
- 同账号全读工作空间可见文件。
- 不允许写入。
- 不读取隐藏目录和临时文件。

### 测试

- 读取 `笔记/a.md` 成功。
- 读取 `.ridge/x` 失败。
- `rag_search` 返回片段和来源。
- 写入类 MCP 工具不存在。
