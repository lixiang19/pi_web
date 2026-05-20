# 任务15：Fleeting Agent 分析建议

## 目标

实现闪念（fleeting note）的后台 AI 分析建议系统。当用户创建闪念后，后台 agent 自动读取闪念内容（含附件），给出分类/任务/剪藏/删除建议。Agent 只建议，不自动执行，等用户确认。

## 依赖

- 任务12（闪念数据模型与 Web 入口）— 已完成
- 任务13（闪念临时附件生命周期）— 已完成
- 任务25（后台队列）— 已完成
- 任务08（任务里程碑数据模型）— 已完成（`workspace_tasks` / `workspace_milestones` 表已就位）

## 设计原则

1. **只建议不执行**：Agent 输出 `recommendation_type` + `recommendation_text` + `draft`，不自动处理闪念
2. **后台异步**：使用 `background_jobs` 队列，避免阻塞用户请求
3. **失败可重试**：最大重试3次，失败后写入 `last_error`，闪念保留
4. **幂等防并发**：同一闪念同一时间只能有一个分析 job 在运行（`UNIQUE INDEX`）
5. **LLM 轻量调用**：分析 prompt 简洁，不启动完整 Pi 会话，直接用 `ModelRegistry` 发一条 prompt

## DB Schema 变更

无需新建表，复用现有表：

- `fleeting_notes`：已有 `analysis_status`、`recommendation_type`、`recommendation_text`、`draft`、`requires_input`、`retry_count`、`last_error` 字段
- `background_jobs`：已有 `job_type = 'fleeting.analyze'` 的队列支持
- `notification_events`：分析失败时写入通知

## 状态流转

```
unanalyzed ──► analyzing ──► suggested
                 │              │
                 ▼              ▼
              failed(保留)   delete(删除闪念)
```

- `unanalyzed`：刚创建，未触发分析
- `analyzing`：后台 job 已认领，正在分析
- `suggested`：分析完成，建议已写入，前端展示给用户
- `failed`：分析失败（重试用尽），`last_error` 有值

## 后台工作流

### 1. 闪念创建时入队

`POST /api/fleeting` 和 `POST /api/fleeting/capture` 完成后：

```ts
backgroundJobQueue.enqueue({
  type: 'fleeting.analyze',
  relatedType: 'fleeting_note',
  relatedId: noteId,
  payload: { noteId },
  maxAttempts: 3,
  notifyOnFailure: true,
});
```

使用 `UNIQUE INDEX idx_background_jobs_active_related` 保证同一闪念不会同时有多个分析 job。

### 2. 后台 worker 认领并执行

服务器启动后启动一个定时轮询 worker（或复用 automation scheduler 的 tick 模式）：

```ts
const worker = createFleetingAnalysisWorker({
  db,
  jobQueue,
  modelRegistry,
  workspaceDir,
});
worker.start(); // 每 5 秒 claimNext
```

执行流程：

1. `claimNext('fleeting-worker')` 获取 `fleeting.analyze` job
2. 读取闪念内容 + 附件记录
3. 为附件构造正文上下文：文本/Markdown/JSON 等只读取前缀，PDF/Word/音频/图片等二进制附件通过 Python Converter 转 Markdown/转写/OCR，再按字符预算截断
4. 构造 analysis prompt，包含闪念内容、附件列表、截断后的附件正文
5. 读取 Pi `settings.json/models.json/auth.json`，解析默认服务商、模型、thinking level 和鉴权
6. 直接调用 `@mariozechner/pi-ai complete()`，`context.tools` 只包含 `fleeting_analysis_result`
7. 从 assistant `toolCall.arguments` 读取 `{ recommendationType, recommendationText, draft, requiresInput }`
8. 写入 `fleeting_notes`：`analysis_status = 'suggested'`
9. `jobQueue.complete(jobId)`

### 3. 失败处理

- 重试：由 `background_jobs` 自动管理（`retryCount < maxAttempts`）
- 最终失败：`jobQueue.fail()` 写入通知事件，闪念状态保持 `unanalyzed`，`last_error` 记录原因

## API 变更

### 新增路由

```
GET /api/fleeting/suggestions?status=unanalyzed|analyzing|suggested|failed
GET /api/fleeting/:noteId/analysis   (获取分析结果详情)
POST /api/fleeting/:noteId/analyze   (手动触发重新分析)
```

### 现有路由修改

- `POST /api/fleeting`：创建后自动入队分析 job
- `POST /api/fleeting/capture`：创建后自动入队分析 job
- `PATCH /api/fleeting/:noteId/analysis`：保持现有（agent 回调用）

## 前端变更

### InboxView.vue

- 已有 `recommendationLabel` 和 `handleSuggestion`
- 新增：显示分析失败状态（`failed`）和重试按钮
- 新增：显示分析中进度（已有 `analyzingCount` badge）
- 新增：手动重新分析按钮

### useInbox.ts

- 新增 `retryAnalysis(noteId)` 方法
- 新增 `refreshNote(noteId)` 单条刷新
- 轮询逻辑扩展：当有任何 `analyzing` 或 `failed` 状态时轮询

## Agent Prompt 设计

```
你是一个闪念整理助手。请分析以下用户闪念，给出最合适的处理建议。

可选建议类型：journal（写入日记）、clip（保存为剪藏）、task（创建任务）、delete（无价值删除）

闪念内容：
{content}

附件：{attachments_summary}

附件正文（转换或读取后，可能已截断）：
{attachment_contexts}

必须调用 `fleeting_analysis_result` 工具返回最终结构化结果；普通文本或 JSON 文本不作为有效分析结果。
```

## 安全与边界

1. **LLM 调用隔离**：使用轻量模型，不暴露完整 Pi 会话能力
2. **附件边界**：prompt 中只传附件名、mimeType、大小和按预算截断后的正文；不传原始文件、完整大文档或 base64
3. **频率限制**：同一闪念 5 分钟内不重复分析（`UNIQUE INDEX` + 重试间隔）
4. **文件大小限制**：大附件先通过 Converter 得到正文摘要源，再按单附件和总上下文预算截断

## 测试策略

### 后端测试

1. **enqueue job**：创建闪念后 background_jobs 表中应有 `fleeting.analyze` job
2. **claim & execute**：worker 能认领 job，更新闪念状态为 `suggested`
3. **retry**：失败 job 能重试，最终失败写入通知
4. **幂等**：同一闪念不会同时有两个 pending/running job
5. **结构化输出**：LLM 必须调用 `fleeting_analysis_result`，assistant 文本 JSON 会被拒绝并进入重试/失败路径

### 前端测试

1. **轮询**：创建闪念后 InboxView 自动轮询直到 `analysis_status` 变化
2. **失败展示**：`failed` 状态显示错误信息和重试按钮
3. **手动触发**：点击重新分析调用 `POST /:noteId/analyze`

## 验收标准

- [x] 创建闪念后自动入队后台分析 job（由 worker 异步执行）
- [x] 建议类型支持 journal/clip/task/delete
- [x] draft 内容可用（日记草稿/剪藏内容/任务描述）
- [x] 分析失败时保留闪念，显示错误信息和重试按钮
- [x] 后台 job 队列通过 `UNIQUE INDEX` 防重复
- [x] `npm run check` 通过（0 errors, 16 warnings 为既有遗留）
- [x] 后端测试覆盖 runner 入队、worker 执行、失败重试
- [x] 前端测试覆盖建议展示和失败重试

## 实现记录

### 后端新增文件

- `packages/server/src/fleeting-analysis.ts`：核心分析模块
  - `createFleetingAnalysisRunner()`：闪念创建时入队分析 job
  - `createFleetingAnalysisWorker()`：后台轮询 worker，每 5s claimNext
  - `runAnalysis()`：构造 prompt，直接调用 `@mariozechner/pi-ai complete()`，只开放 `fleeting_analysis_result` custom tool，并读取 assistant `toolCall.arguments`

### 后端修改文件

- `packages/server/src/routes/fleeting.ts`：
  - 新增 `GET /suggestions?status=`：按状态筛选闪念
  - 新增 `GET /:noteId/analysis`：获取分析详情
  - 新增 `POST /:noteId/analyze`：手动触发重新分析
  - `analysisRunner` 改为 `getAnalysisRunner()` 延迟获取
- `packages/server/src/index.ts`：
  - 引入 `createFleetingAnalysisRunner`、`createFleetingAnalysisWorker`
  - 启动时初始化 jobQueue、runner、worker
- `packages/server/src/db/index.ts`：导出 `RidgeDatabase` 类型（供 fleeting-analysis.ts 使用）

### 前端新增/修改

- `packages/web/src/lib/api.ts`：
  - 新增 `triggerFleetingAnalysis()`、`getFleetingAnalysis()`、`getFleetingSuggestions()`
  - `FleetingNote` 接口增加 `lastError?` 和 `retryCount?`
- `packages/web/src/composables/useInbox.ts`：
  - 新增 `retryAnalysis()` 方法
- `packages/web/src/components/workspace/InboxView.vue`：
  - 新增 `failed` 状态展示和错误信息
  - 新增"重新分析"按钮（`RefreshCw` 图标）

### 修复记录（2026-05-12 审查后）

| # | 问题 | 修复 |
|---|---|---|
| 1 | `analysisRunner` 在路由创建时被 `undefined` 缓存，后续永不触发分析 | 移除 `const analysisRunner = getAnalysisRunner?.()` 提前解构；改为每次请求时实时调用 `getAnalysisRunner?.()?.run(id)` |
| 2 | worker 解构漏了 `modelSpec`，运行时 `ReferenceError` | 在 `createFleetingAnalysisWorker` 解构中恢复 `modelSpec` |
| 3 | `claimNext()` 无 jobType 过滤，fleeting worker 会抢到并 fail 其他 job | 扩展 `claimNext(workerId, jobType?)` SQL 增加 `AND job_type = ?` 过滤；worker 调用 `claimNext("fleeting-worker", "fleeting.analyze")` |
| 4 | 失败状态未实现：`note` 始终写回 `unanalyzed`；`toPublicNote` 不返回 `lastError`/`retryCount` | worker 根据 `remainingAttempts` 区分：`>0` 写 `unanalyzed`，`=0` 写 `failed`；`toPublicNote` 新增 `lastError` 和 `retryCount` 字段 |
| 5 | 前端附件上传后 runner 已触发分析，AI 看不到附件 | 有附件时创建闪念先 `delayAnalysis`，通过 multipart 上传到 `.ridge/fleeting-attachments/<noteId>/` 后显式调用 `retryAnalysis(note.id)` 重新入队 |
| 6 | 测试未覆盖真实 worker 执行链路和 `getAnalysisRunner` 延迟获取 | 重写测试：mock `pi-ai complete()`、`ModelRegistry` 和 `getFleetingAttachments`；新增测试覆盖 worker 成功路径、settings 默认模型、失败重试、最终失败、非 fleeting job 隔离、路由延迟获取、列表返回失败字段 |
| 7 | 前端把文件/音频读成 base64 放进 JSON，PDF/Word/音频也不能直接进入模型 | Web 捕捉入口改为保留 `File[]` 并走 multipart 临时附件上传；worker 分析前调用 Converter 提取二进制附件正文，按预算截断后放入 prompt |

### 验证结果

- `npm run check`：0 errors / 16 warnings（既有遗留）
- `pnpm test`：server 218 passed / web 230 passed
