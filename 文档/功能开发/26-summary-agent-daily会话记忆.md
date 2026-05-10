# 26 summary agent daily 会话记忆

## 目标

实现会话结束后 summary agent 追加 daily 会话记忆。

## 范围

- Pi 会话结束钩子。
- summary agent 后台任务。
- 只读本次会话记录。
- 写 `记忆/daily/YYYY/MM/YYYY-MM-DD.md`。
- 段标题包含时间、会话 ID 和一句标题。
- 每段写短摘要、关键决策、关键事实和产物。

## 不做

- 不生成单个会话摘要文件。
- 不整理旧 daily。
- 不使用 RAG 或图谱工具。

## 验收

- daily 按时间线追加。
- 过日后不改旧 daily。
- 工作空间产物写相对路径。
- 外部项目产物写项目名和项目内相对路径。

## 关联设计

- `文档/项目设计/记忆Wiki图谱与工作空间MCP.md`
- `文档/项目设计/后台Agent系统.md`

## Spec 提取点

- daily 文件格式。
- 会话结束触发。
- summary agent 权限。

## Spec 草案

### 文件格式

```md
# YYYY-MM-DD

## HH:mm session_id 标题

- 摘要：...
- 决策：...
- 产物：...
```

### 行为

- Pi 会话结束后创建 summary job。
- summary agent 只读本次会话。
- 写入当天 daily。
- 只追加，不整理旧段落。

### 测试

- 会话结束后生成当天 daily。
- 同一天多会话追加多个段落。
- 旧日期 daily 不被修改。
- 单会话摘要文件不会生成。
