# openchamber 风格整体布局与左侧会话列表

## 任务目标

- 参考 openchamber 重做首屏工作台布局，不再使用展示页式结构。
- 左侧实现对话列表，并让结构、分组思路、数据来源都向 openchamber 靠拢。
- 保持当前项目只通过 Pi SDK 驱动会话，不引入 RPC 模式。

## 本次实现

### 整体布局

- 将 Web 首页改为三栏工作台结构：左侧会话栏、中间主对话区、右侧上下文状态区。
- 顶部增加工作台级信息条，统一展示 SDK 版本、工作目录、会话数量和当前状态。
- 中间区域保留主会话面板定位，继续承载消息流、模型切换和输入区。

### 左侧会话列表

- 左栏不再直接平铺 sessions，而是参考 openchamber 的 session sidebar，按工作目录做项目级聚合。
- 增加“活动中”“最近会话”“项目分组”三个层级，避免列表只有单一时间排序。
- 增加搜索、项目组折叠、当前会话高亮、新建会话入口。

### 数据来源

- 数据仍来自当前服务端的真实接口：`GET /api/sessions`、`GET /api/sessions/:sessionId`。
- 前端在 `usePiChat` 中维护统一的 sessions 摘要，再按 `cwd` 在界面层派生出分组结果。
- 新建会话改成显式动作，避免只能依赖“首条消息隐式建会话”。

## 涉及文件

- `packages/web/src/App.vue`
- `packages/web/src/composables/usePiChat.ts`

## 验证结果

- `npm run check --workspace @pi/web` 通过。
- `npm run build --workspace @pi/web` 通过。

## 后续建议

- 继续补齐项目级会话折叠状态持久化。
- 将右侧上下文区扩展为计划、上下文、工具执行三类面板。
- 在服务端补会话持久化后，把左栏进一步对齐 openchamber 的历史管理能力。