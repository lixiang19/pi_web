# 2026-04-08 Stitch工作台主屏切换Light方案

## 任务目标

- 将当前 Stitch 主工作台从深色 editorial 方案切换为 light 方案。
- 保留三栏 Pi 工作台结构，不改变信息架构与功能语义。
- 保持 Pi 输入编排器、thinking、tool call / tool result、文件树等真实工作台特征。

## 编辑对象

- Stitch Project: `projects/13250914215537407992`
- 来源屏幕：`projects/13250914215537407992/screens/aaf0d89d200f43d3b8f621603e11c2aa`
- 来源标题：`Pi AI Workspace Main`

## 本次设计操作

- 使用 Stitch 对现有主屏进行定向编辑，而不是重新生成全新产品界面。
- 明确要求切换到 light mode，同时保留：
  - 左侧会话导航栏
  - 中间会话工作区
  - 底部悬浮式 composer workspace
  - 右侧文件树 / 上下文面板
- 明确禁止引入营销 Hero、KPI 卡片、图表和无关主功能。

## 结果产物

- 结果设计系统：`assets/da5e47db48224373a78db0d02d0a3317`
- 结果标题：`Lumina Synth`
- 新屏幕：`projects/13250914215537407992/screens/023fd22177ef45e7962eaf748aff04be`
- 新屏幕标题：`Pi AI Workspace Light`

## 视觉结论

- 当前主屏已切换为 light editorial workspace。
- 画布以冷静浅灰白表面为主，不是纯白后台。
- 左栏与右栏通过轻微 surface 层级区分，中栏仍是最舒适的阅读主舞台。
- composer 继续保持轻悬浮感与工作台属性。
- AI 响应、thinking、tool block 在浅色语境下仍保持层级区分。

## 后续建议

- 优先继续处理 active session 对比度，让左栏激活态更清晰。
- 第二步可以补资源选择器展开态，让 composer 的 prompt / skill / command 注入层更完整。
- 若后续进入代码落地阶段，应先从 `WorkbenchPage` 与相关 workbench/chat 组件开始映射。
