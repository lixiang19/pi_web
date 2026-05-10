# 27 memory agent MEMORY 维护与注入

## 目标

实现 `记忆/MEMORY.md` 自动维护和会话启动注入。

## 范围

- memory agent 后台任务。
- 读取当天 daily 和 `MEMORY.md`。
- 维护短小全局长期记忆。
- 新事实覆盖旧事实。
- 明确“记住”立即写入。
- 明确“忘掉”立即改写。
- Pi 启动钩子注入 `MEMORY.md` 和 `Wiki/index.md`。

## 不做

- 不拆 `USER.md`。
- MEMORY 不分区。
- MEMORY 不写来源。
- 不写入 token、密码、私钥等敏感信息。

## 验收

- MEMORY 使用自然短句。
- 超长时优先删除旧弱记忆。
- 空内容不注入。
- 注入包含“记忆可能过时，当前事实优先”提醒。

## 关联设计

- `文档/项目设计/记忆Wiki图谱与工作空间MCP.md`

## Spec 提取点

- MEMORY 文件格式。
- memory agent 输入输出。
- 注入 XML 块格式。

## Spec 草案

### 文件格式

```md
# MEMORY

- 短句记忆。
- 短句记忆。
```

### 注入

```xml
<ridge_memory>
...
</ridge_memory>
<ridge_wiki_index>
...
</ridge_wiki_index>
```

### 行为

- memory agent 读取当天 daily 和当前 MEMORY。
- 冲突时新事实覆盖旧事实。
- 明确记住/忘掉立即触发更新。
- 启动时空文件不注入。

### 测试

- MEMORY 超长时删除旧弱记忆。
- token/密码/私钥不会写入。
- 当前用户话语优先于旧记忆。
- 修改 MEMORY 后下一次会话立即生效。
