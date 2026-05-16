# 53 Android 轻对话

## 目标

实现 Android 端普通 AI 对话能力，覆盖新建会话、发送消息、附件、流式回复和取消生成。

## 范围

- 新建普通 server 会话。
- 查看基础会话历史列表。
- 继续已有普通会话。
- 发送文本消息。
- 发送图片或录音附件。
- 订阅 SSE 流式回复。
- 取消当前生成。
- 发送失败时保留输入和附件草稿。

## 不做

- 不创建 desktop 会话。
- 不创建 task-only agent 会话。
- 不提供多标签工作台。
- 不提供 prompt、skill、extension command 资源面板。
- 不提供复杂 ask/permission 管理面板；第一版只做必要展示和明确不可处理提示。

## 依赖

- 任务 50 Android 移动端工程骨架。
- 任务 51 Android 设备注册与服务连接。
- 任务 52 Android 闪念捕捉中的附件草稿能力。
- `文档/模块梳理/AI对话主线闭环.md`

## TDD 与验证

先写测试：

- 移动端创建会话默认 `run_location=server`。
- 移动端不能请求 desktop 会话。
- 发送文本调用现有 `POST /api/sessions/:sessionId/messages`。
- SSE 事件能合并到移动端消息流。
- 取消生成调用唯一 cancel 入口。
- 发送失败保留 composer 内容和附件。

再实现：

- 移动端会话列表。
- 移动端 chat store。
- SSE client。
- Composer 和附件发送。
- 取消生成按钮。

## 验收标准

- 真机可新建普通对话。
- 真机可发送文本并收到流式回复。
- 真机可附带移动端图片或录音发送。
- 真机可取消当前生成。
- 网络失败后输入和附件不丢。
- 服务端不新增第二套移动端会话模型。
- 修改 `.ts` / `.vue` / `.js` 后根目录 `npm run check` 通过。

