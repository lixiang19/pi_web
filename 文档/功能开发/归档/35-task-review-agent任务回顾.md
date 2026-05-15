# 35 task review agent 任务回顾

## 目标

实现 task review agent，定期或由用户触发回顾任务和里程碑。

## 范围

- 扫描任务。
- 扫描里程碑。
- 读取任务绑定的处理会话状态。
- 读取最近 daily。
- 发现过期、阻塞、可拆分、可推进、需确认完成、里程碑风险和不一致。
- 输出建议到通知中心和任务页。

## 不做

- 不自动完成任务。
- 不自动执行任务。
- 不直接批量修改任务。

## 验收

- 建议必须用户确认后才写入正式任务或里程碑。
- 可建议标记阻塞、拆分、调整优先级、推进下一步、确认完成。
- task review 不直接修改任务；接受建议时由通知中心事务 claim 后再写正式对象。

## 关联设计

- `文档/项目设计/后台Agent系统.md`
- `文档/项目设计/任务里程碑与处理会话.md`

## Spec 提取点

- task review 输入。
- 建议 schema。
- 接受建议动作。

## Spec 草案

### 输入

- 任务列表。
- 里程碑列表。
- 任务绑定处理会话（`workspace_tasks.processing_session_id` + `sessions`），无绑定时才读取处理会话索引。
- 最近 daily。

### 输出

- suggestion_type
- related_task_id
- title
- reason
- proposed_action

### 行为

- 只生成建议。
- 建议进入通知中心。
- 用户接受后才调用任务 API。

### 测试

- 过期任务产生提醒建议。
- blocked 太久产生推进建议。
- 建议不会直接修改任务。
- 接受建议后任务变更。

## 实现记录（2026-05-15）

- 后端新增 `packages/server/src/task-review.ts`：
  - 扫描 `workspace_tasks`、`workspace_milestones`、任务绑定处理会话、`session_index` 和最近 `记忆/daily/**/*.md`。
  - 识别过期任务、长期阻塞、审核待确认、处理会话长期无进展、任务与 daily 不一致、可拆分任务、里程碑延期风险。
  - 只写 `notification_events` 的 `task_review.suggestion`，不直接修改任务或里程碑。
  - 写入 payload 时同时保留展示字段（`suggestionType`、`relatedTaskId`、`relatedMilestoneId`、`reason`、`proposedAction`）和通知中心可执行的 `payload.suggestion`。
- 后端新增手动触发入口：
  - `POST /api/workspace/tasks/review` 入队 `task.review`。
  - `createTaskReviewWorkers` 处理队列并写通知。
  - `createTaskReviewScheduler` 每 6 小时入队一次 scheduled review，依赖队列的同一 workspace 活跃任务去重。
- 前端任务页：
  - `TaskView.vue` 增加「任务回顾」按钮。
  - 任务/里程碑详情中显示关联回顾建议，并可直接接受或拒绝。
  - 触发回顾后短周期自动刷新建议列表，覆盖后台 worker 异步写入后的可见性。
  - 接受建议后刷新任务列表和建议列表，并重新指向最新任务/里程碑详情对象。
- 通知中心沿用既有 `accept_suggestion`/`reject_suggestion` 契约；正式对象仍只在用户接受建议后通过任务系统写入。
- 审查修复：
  - 长期无进展检测以 `workspace_tasks.processing_session_id` 绑定的 `sessions` 记录为优先真源；任务没有绑定处理会话时，才读取最新未归档 `session_index` 记录。
  - `accept_suggestion` 在事务内先 claim 非终态通知，再执行建议写入；重复接受不会重复创建任务或里程碑。
  - 任务页建议动作成功后向工作台发出 `notificationsUpdated`，同步左侧通知徽标。

## 验证

- `pnpm --filter @pi/server test -- src/__tests__/task-review.test.ts`
- `pnpm --filter @pi/web test -- src/components/workspace/__tests__/TaskView.test.ts`
