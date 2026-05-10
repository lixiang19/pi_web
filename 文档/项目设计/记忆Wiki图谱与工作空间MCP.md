# 记忆、Wiki、图谱与工作空间 MCP

## 根原则

ridge 的长期知识优先落成 Markdown。

只有特殊结构化对象进入数据库或专用存储。

- 记忆是 Markdown。
- Wiki 是 Markdown。
- 每日会话记忆是 Markdown。
- 图谱是结构化索引，使用 Kuzu。
- RAG 是可重建索引。

记忆模拟一个人的连续记忆，不按项目拆分。

项目只作为记忆里的自然上下文出现。

## 核心文件

工作空间新增两个可见目录：

```txt
记忆/
Wiki/
```

核心文件：

```txt
记忆/MEMORY.md
记忆/daily/YYYY/MM/YYYY-MM-DD.md
Wiki/index.md
```

`MEMORY.md` 是全局长期记忆。

- 只有一份。
- 不拆 `USER.md`。
- 使用自然短句。
- 不分区。
- 控制在很短长度。
- 按重要性排序。
- 不写来源。
- 新事实覆盖旧事实。
- 禁止写入 token、密码、私钥等敏感信息。

`daily` 是每日会话记忆。

- 长期保留。
- 按日期存放。
- 按时间线追加。
- 每个会话段标题包含时间、会话 ID 和一句标题。
- 每段只写短摘要、关键决策、关键事实和产物。
- 工作空间产物写相对路径。
- 外部项目产物写项目名和项目内相对路径。
- 过日后不改旧 daily。

`Wiki/index.md` 是轻量 Wiki 的入口。

- 由 Wiki Agent 维护。
- 和 `MEMORY.md` 一起固定注入。
- 只保留少量核心入口。

新工作空间初始化时自动创建：

```txt
记忆/MEMORY.md
Wiki/index.md
```

初始内容只有标题。

空文件不注入。

## 注入

Pi 会话启动时通过钩子注入：

- `记忆/MEMORY.md`；
- `Wiki/index.md`。

注入使用清晰 XML 块。

注入内容不带来源。

注入总长度使用短预算。

注入时带提醒：

- 记忆可能过时；
- 当前用户最新话语和当前文件事实优先。

桌面本机项目会话也必须在线连接服务器。

启动桌面项目 Agent 时，服务器生成 ridge runtime bundle。

bundle 中包含最新 `MEMORY.md`、`Wiki/index.md` 和注入配置。

桌面端物化 bundle 后启动本地 Pi。

服务器不可达时，桌面项目 Agent 禁止启动。

## 会话结束后台 Agent

会话结束优先使用 Pi 生命周期钩子。

会话结束后只运行：

- summary agent；
- memory agent。

summary agent：

- 只读本次会话记录；
- 拥有文件工具；
- 只写 `记忆/daily`；
- 按时间和会话 ID 追加当天 daily。

memory agent：

- 读取 `记忆/MEMORY.md`；
- 读取当天 daily；
- 不直接读原始会话；
- 不使用 RAG 或图谱工具；
- 每次会话后都运行；
- 自己决定是否改写 `MEMORY.md`；
- 必须把 `MEMORY.md` 控制在长度预算内；
- 超长时优先删除旧弱记忆。

明确说“记住”时，立即写入 `MEMORY.md`。

明确说“忘掉”或“别再记这个”时，立即改写 `MEMORY.md`。

临时状态、当前进度、一次性命令、刚改过的文件、短期调试结论禁止进入 `MEMORY.md`。

用户手动编辑 `MEMORY.md` 后，当前文件就是新真源。

下一次会话启动立即读取最新文件注入。

用户手动删除的记忆，如果后续事实反复证明仍成立，可能被重新学习。

## 后台任务

summary agent 和 memory agent 是后台专用 Agent。

后台 Agent 模型独立配置。

后台 Agent 运行状态进入 DB。

至少记录：

- 类型；
- 关联会话 ID；
- 状态；
- 失败原因；
- 重试次数；
- 创建时间；
- 更新时间。

失败后自动有限重试。

同一天的 summary agent 按 daily 文件串行。

同一工作空间的 memory agent 全局串行。

memory agent 无变更时，只在 DB 记录任务成功，不改文件。

## RAG 关系

`记忆/MEMORY.md` 进入 RAG。

`记忆/daily` 进入 RAG。

`Wiki/` 进入 RAG。

但 `MEMORY.md` 和 `daily` 修改后不立即更新 RAG，等待夜间索引。

`MEMORY.md` 的最新内容由 Pi 钩子直接读取，不依赖 RAG。

AI 不需要专门的 `memory_search` 工具。

daily 通过 RAG 或文件搜索按需找回。

原始会话历史通过 Pi 会话检索工具找回。

Pi 会话检索默认只查当前运行设备可查的会话。

## Wiki

Wiki 采用 LLM Wiki 思路。

Wiki 不是第二个文件库，也不是 RAG 的替代。

Wiki Agent 从来源合成少量 canonical Markdown 页面。

来源包括：

- 工作空间 Markdown；
- 记忆；
- daily；
- RAG 结果；
- 图谱；
- 正式附件转换产物。

Wiki 目录为：

```txt
Wiki/
```

`Wiki/index.md` 是固定入口。

Wiki Agent 可以新增、改写、删除低价值或过时页面。

隐藏版本管理负责恢复。

用户也可以像普通 Markdown 一样打开和编辑 Wiki 文件。

AI 后续维护时以当前文件为准。

## 图谱

图谱是结构化理解层。

图谱服务两个目标：

- AI 召回和规划；
- 用户可视化浏览。

第一版不做巨大图谱画布。

先做当前对象的一到两跳邻接图。

图谱真源使用 Kuzu。

存储位置：

```txt
~/ridge-workspace/.ridge/graph.kuzu/
```

图谱进入服务器完整备份。

图谱不进入隐藏 Git 版本管理。

图谱来源：

- 工作空间 Markdown；
- 正式附件转换产物；
- 内部项目文档；
- daily 会话记忆。

外部项目不进入图谱。

外部项目会话产生的稳定经验可以进入 daily 和 `MEMORY.md`，但不进入图谱。

图谱实体第一版包含：

- 项目；
- 文件；
- 任务；
- 人物；
- 组织；
- 概念；
- 技术；
- 资料；
- 决策。

图谱关系保存来源和短摘录证据。

用户不直接手动编辑图谱。

用户通过自然语言纠错，由 AI 后续修正图谱。

## 夜间维护

每天 0 点运行工作空间维护任务。

顺序固定为：

1. RAG；
2. 图谱；
3. Wiki。

RAG 更新策略：

- 用户上传文件立即索引；
- 普通文件变更、用户编辑 Markdown、后台 Agent 改写 Markdown，夜间统一索引；
- 用户可以手动触发立即更新索引。

上传后只立即更新 RAG。

图谱和 Wiki 等夜间维护。

## 工作空间 MCP

本机项目 Agent 需要访问服务器工作空间时，通过服务器 workspace MCP。

第一版工具：

- `rag_search`；
- `graph_search`；
- `file_search`；
- `read_workspace_file`。

MCP 只允许查和读，不允许写。

认证使用桌面设备令牌。

权限模型是同账号全读。

`read_workspace_file` 可以读取工作空间全部可见文件。

正式 `附件/` 是可见长期资产，允许读取。

隐藏目录不可读。

闪念临时附件、会话临时上传、处理中附件不可读。

MCP 检索结果返回：

- 片段；
- 标题；
- 路径或 URL；
- 更新时间；
- 来源类型；
- 相关分数。

MCP 配置包含在服务器下发的 ridge runtime bundle 中。

桌面端不写用户真实 `~/.pi`，不写外部项目 `.pi`。
