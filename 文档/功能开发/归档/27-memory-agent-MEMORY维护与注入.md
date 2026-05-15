# 27 memory agent MEMORY 维护与注入

> 状态：已完成并归档（2026-05-15）

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

## 实现记录

- 后端模块：`packages/server/src/workspace-memory.ts`
- 后台 job：`memory.maintain`
- 后台模型：使用独立 settings `backgroundAgentModel` / `backgroundAgentThinkingLevel`，与前台临时模型选择隔离；设置页提供可见配置入口。
- 注入入口：`packages/server/src/session-context.ts` 的 `appendSystemPromptOverride`
- 显式命令入口：`POST /api/sessions/:sessionId/messages`
- 文件真源：`记忆/MEMORY.md` 与 `Wiki/index.md`
- 空内容规则：只有标题时不注入。
- 安全规则：服务端过滤 token、密码、私钥、密钥等敏感内容。

## 验收证据

- `pnpm --filter @pi/server test -- src/__tests__/workspace-memory.test.ts`
- `pnpm --filter @pi/server test -- src/__tests__/background-jobs.test.ts`
- `pnpm --filter @pi/web test -- src/pages/__tests__/WorkspacePage.test.ts`
- `pnpm --filter @pi/web test -- src/components/workspace/__tests__/SettingsTabContent.test.ts`
