# Pi Web 项目记忆

> 只记决策和教训，代码/文档能查到的不记。控制在 10-15 条以内。

## 架构决策
- [Pi SDK] 只能用 SDK 模式，禁止 RPC（官方限制，无替代方案）
- [Pi SDK] 权限控制必须在服务端 `tool_call` 事件 gate，前端禁止做权限判断
- [Pi SDK] Agent 配置通过 `resourceLoader.appendSystemPromptOverride` 注入，不要自己拼
- [前后端分离] server 负责 runtime + 权限，web 只做投影消费，禁止在 Web 层伪造会话语义

## 规范与教训
- [主题规范] 禁止硬编码颜色值（`bg-[#hex]`、`text-amber-500` 等），必须用 shadcn 主题变量（暗色模式会失效）
- [透明度] 用 `/95`、`/80`、`/20` 后缀（如 `bg-popover/95`），不用 `bg-white/[0.x]` 语法
- [布局模式] 工作台采用三段式 flex 布局：Header(shrink-0) + MessageArea(flex-1) + Composer(shrink-0)
- [双Agent检查] 检查阶段两个 agent 必须互不可见结果，避免自查盲区
- [构建问题] 项目有遗留类型错误（vue-router 依赖、未使用变量），修改前先确认构建状态
