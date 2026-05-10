# 后台 Agent 系统

## 定位

后台 Agent 是不占用主对话界面的专用 Agent。

它们由系统事件触发，负责整理、分析和维护工作空间长期资产。

后台 Agent 不向原会话追加消息。

后台 Agent 的结果落到文件、索引或 DB 状态。

需要用户处理的后台结果进入通知与建议中心。

## 第一版后台 Agent

第一版有六个后台 Agent：

| Agent | 触发时机 | 输出 |
| --- | --- | --- |
| fleeting agent | 闪念保存后 | 闪念处理建议 |
| summary agent | Pi 会话结束后 | `记忆/daily/YYYY/MM/YYYY-MM-DD.md` |
| memory agent | summary agent 后 | `记忆/MEMORY.md` |
| task review agent | 定期或用户触发 | 任务回顾建议 |
| graph agent | 每天 0 点夜间维护 | Kuzu 图谱 |
| wiki agent | graph agent 后 | `Wiki/` |

## 闪念 Agent

fleeting agent 只分析未处理闪念。

- 闪念保存后可触发。
- 不自动执行处理。
- 只生成一个最佳处理建议。
- 固定处理按钮仍然始终可用。
- 用户手动处理成功时，取消该闪念的后台分析。
- 闪念已处理或删除后，不再继续分析。

第一版分析内容：

- 文字内容；
- 图片内容。

PDF、Word、长文档等附件解析不在闪念 Agent 内决定。

## 会话结束链路

会话结束使用 Pi 生命周期钩子。

会话结束后串行运行：

1. summary agent；
2. memory agent。

summary agent 读取本次会话记录，写入当天 daily。

memory agent 读取当天 daily 和 `MEMORY.md`，维护全局长期记忆。

## 任务回顾 Agent

task review agent 负责回顾任务、里程碑和处理会话。

它不是任务执行者。

它不自动把任务或里程碑改为完成。

它可以提出：

- 过期任务；
- 长期阻塞任务；
- 需要用户确认完成的任务；
- 可以拆分的任务；
- 可以推进的下一步；
- 里程碑风险；
- 任务与最近 daily 之间的不一致。

task review agent 的输出是建议。

建议可以展示在通知与建议中心、任务页、工作空间主页或任务详情中。

用户确认后，才修改正式任务或里程碑。

## 夜间维护链路

每天 0 点运行工作空间维护链路。

顺序固定为：

1. RAG；
2. graph agent；
3. wiki agent。

RAG 不是 Agent，但它是夜间维护链路的第一步。

用户上传文件后立即更新 RAG。

普通文件变更、用户编辑 Markdown、后台 Agent 改写 Markdown，等待夜间维护或用户手动刷新索引。

## 运行记录

后台 Agent 运行状态进入 DB。

至少记录：

- Agent 类型；
- 触发来源；
- 关联对象 ID；
- 状态；
- 失败原因；
- 重试次数；
- 创建时间；
- 更新时间。

失败后自动有限重试。

失败不打断主对话。

失败需要用户知道或处理时，生成通知事件。

## 并发

同一个闪念只允许一个 fleeting agent 分析任务。

同一天的 summary agent 按 daily 文件串行。

同一工作空间的 memory agent 全局串行。

graph agent 和 wiki agent 按夜间链路串行。

task review agent 和其他后台 Agent 不并行修改同一任务。

## 模型配置

后台 Agent 使用独立模型配置。

用户可以在设置中为后台 Agent 配置模型。

第一版可以共用一个后台模型配置，不必为每个后台 Agent 单独配置。
