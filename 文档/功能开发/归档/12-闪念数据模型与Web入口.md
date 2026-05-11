# 12 闪念数据模型与 Web 入口

## 目标

实现闪念 DB 和 Web 端闪念入口。

## 范围

- `fleeting_notes`。
- 文字闪念。
- Web 附件上传入口。
- 状态：待处理、处理中。
- 分析状态：未分析、分析中、已建议、分析失败。
- 闪念列表。

## 不做

- 捕获阶段不分类。
- 捕获阶段不选择项目。
- 捕获阶段不打标签。

## 验收

- 闪念保存后只进入临时队列。
- 未处理闪念不进入 RAG。
- 分析失败不打扰用户。
- 固定处理按钮始终可用。

## 关联设计

- `文档/项目设计/闪念系统与桌面采集.md`

## Spec 提取点

- `fleeting_notes` 字段。
- Web 创建接口。
- 状态机。

## Spec 草案

### 数据

- `id`
- `type`
- `content`
- `status`
- `analysis_status`
- `suggestion`
- `created_at`
- `updated_at`

### API

- `GET /api/workspace/fleeting`
- `POST /api/workspace/fleeting`
- `PATCH /api/workspace/fleeting/:id`
- `DELETE /api/workspace/fleeting/:id`

### 行为

- 创建时不要求项目。
- 创建时不进入 RAG。
- 分析失败不改变主状态。

### 测试

- Web 文字闪念创建成功。
- 创建 payload 带项目字段时忽略或拒绝。
- 新闪念默认待处理、未分析。
- 删除闪念触发临时附件清理检查。

## 完成记录

### 已实现内容

- 数据库：`fleeting_notes` 新增 `type`（默认 'text'）、`suggestion`；`status` 默认修正为 'pending'，`analysis_status` 默认修正为 'unanalyzed'；schema version 8；v8 migration 负责旧数据修复（`active→pending`，`pending→unanalyzed`）；`CORE_TABLE_COLUMNS` 同步 repair columns。
- API：`GET/POST/PATCH/DELETE /api/workspace/fleeting`（保留 `/api/fleeting` 兼容）；`POST` strict 拒绝未声明字段（如 projectId）；`PATCH` 支持 content/status/analysisStatus/suggestion 并验证枚举；`DELETE` 触发临时附件清理（多层路径安全检查）。
- 状态机：主状态 `pending/processing`；分析状态 `unanalyzed/analyzing/suggested/failed`；分析失败不改主 status。
- 前端：API 切到 `/api/workspace/fleeting`；`InboxView.vue` 标题改“闪念”；附件上传入口（真实 file input，展示待接入状态）；固定按钮始终可用；`failed` 展示但不打扰；轮询限定为 `unanalyzed/analyzing`。

### 测试代码

- `fleeting-api.test.ts`：新增 strict payload 拒绝、PATCH 状态机、分析失败、枚举校验、DELETE 附件清理、安全边界。
- `useInbox.test.ts`：新增 `failed` 不轮询、`suggestion` 搜索覆盖。
- `InboxView.test.ts`：新增附件入口、固定按钮始终可用、`failed` 展示、标题改“闪念”。
- `FleetingCaptureButton.test.ts`：新增广播事件测试。
- `ridge-db-migration.test.ts`：新增 `fleeting_notes` 字段断言（type, suggestion, status, analysis_status）。
- `useRecentActivity.test.ts`：补齐 `makeMomentItem()` 的 `type`/`suggestion` 字段。

### 验证记录

- **本次因 worktree 暂无法运行自动化测试，按用户明确指示未执行 `npm/pnpm/vitest/playwright` 等命令；测试代码已新增/更新，待环境恢复后补跑。**
