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
