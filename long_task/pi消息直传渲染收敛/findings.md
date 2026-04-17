# 发现与决策
<!-- 
  内容：任务的知识库。存储你发现和决定的所有内容。
  目的：上下文窗口有限。此文件是你的“外部记忆”——持久且无限。
  时机：在任何发现之后更新，特别是在进行 2 次查看/浏览器/搜索操作之后（2步原则）。
-->

## 需求
<!-- 
  内容：用户要求的具体需求拆解。
  目的：使需求可见，确保不会遗忘正在构建的功能。
  时机：在第 1 阶段（需求与发现）填写。
  示例：
    - 命令行界面
    - 添加任务
    - 列出所有任务
    - 删除任务
    - Python 实现
-->
<!-- 从用户请求中捕获 -->
- 检查并继续完成“类型统一”和“Pi 消息直传渲染收敛”相关暂存改动
- 目标不是只让文件看起来重构过，而是要让 lint/typecheck 真正通过
- 需要覆盖仍在使用的旧入口 `usePiChat`，不能只修 `usePiChatCore/usePerSessionChat`

## 研究发现
<!-- 
  内容：通过网络搜索、阅读文档或探索发现的关键信息。
  目的：多模态内容（图像、浏览器结果）不会持久存在。请立即记录。
  时机：每进行 2 次查看/浏览器/搜索操作后，更新此部分（2步原则）。
  示例：
    - Python 的 argparse 模块支持子命令，实现简洁的 CLI 设计
    - JSON 模块可轻松处理文件持久化
    - 标准模式：python script.py <command> [args]
-->
<!-- 探索阶段的关键发现 -->
- 已新增 `packages/protocol/src/index.ts`，说明协议统一已经开始，但前端与服务端仍有旧定义残留
- `usePiChat`、`usePiChatCore`、`usePerSessionChat` 三者并存，且只有后两者较完整地切到 `UiConversationMessage`
- `SessionDetailPage.vue` 与 `useWorkbenchPage.ts` 仍直接依赖 `usePiChat`，所以旧入口不是死代码
- 当前暂存在消息渲染层已引入 `ProcessMessagesFold`、`ProcessMessageItem`、`ToolResultCard`，表明“过程消息折叠”方向已落地，但类型收尾未完成
- `session-snapshot.ts`、`usePerSessionChat.ts` 中直接把 `wrapUiConversationMessage` 传给 `map()`，会因为额外参数位置与 `Array.prototype.map` 签名不匹配而触发 TS 报错
- Vue 模板中 `v-for` 与 `v-if` 混用、以及多分支联合类型访问，是当前 `ToolResultCard.vue`、`ProcessMessageItem.vue` 类型错误的根因之一

## 技术决策
<!-- 
  内容：你做出的架构和实现选择及其原因。
  目的：你会忘记为什么选择某种技术或方法。此表保存了这些知识。
  时机：每当你做出重大技术选择时进行更新。
  示例：
    | 使用 JSON 存储 | 简单、人类可读、Python 内置支持 |
    | 使用带有子命令的 argparse | 简洁的 CLI：python todo.py add "task" |
-->
<!-- 决策及其依据 -->
| 决策 | 依据 |
|----------|-----------|
| 保留 `PiMessage` 作为协议层唯一消息实体 | 这是来自 Pi SDK 的真实结构，前后端都应该围绕它建模 |
| 单独引入 `UiConversationMessage` 只承载 `pending/localId` | 这两个字段纯属前端乐观态和渲染态元数据 |
| 增加包装辅助函数而不是在各处手写 `messages.map(...)` | 避免继续散落转换逻辑，降低再次混用旧类型的风险 |
| 对组件模板做 computed 收敛 | 让类型守卫发生在脚本层，而不是把联合类型判断留给模板推断 |

## 遇到的问题
<!-- 
  内容：你遇到的问题以及你如何解决它们的。
  目的：与 task_plan.md 中的错误类似，但侧重于更广泛的问题（不仅是代码错误）。
  时机：当你遇到阻塞或意外挑战时记录。
  示例：
    | 空文件导致 JSONDecodeError | 在 json.load() 之前增加了显式的空文件检查 |
-->
<!-- 错误及其解决方式 -->
| 问题 | 解决方案 |
|-------|------------|
| `usePiChat` 暂存版本本身仍保留 `ChatMessage`、`SessionSnapshot` 等旧签名 | 继续把旧入口一起改为 `UiConversationMessage` / `UiSessionSnapshot` |
| `createSession` / `updateSession` 返回协议层快照，而前端状态桶期望 UI 包装快照 | 新增统一包装函数，把 raw snapshot 转成 `UiSessionSnapshot` 后再入缓存 |

## 资源
<!-- 
  内容：你发现的有用的 URL、文件路径、API 参考、文档链接。
  目的：方便以后参考。不要在上下文中丢失重要链接。
  时机：发现有用资源时添加。
  示例：
    - Python argparse 文档：https://docs.python.org/3/library/argparse.html
    - 项目结构：src/main.py, src/utils.py
-->
<!-- URL、文件路径、API 参考 -->
- `packages/protocol/src/index.ts`
- `packages/web/src/lib/types.ts`
- `packages/web/src/lib/conversation.ts`
- `packages/web/src/composables/usePiChat.ts`
- `packages/web/src/composables/usePiChatCore.ts`
- `packages/web/src/composables/usePerSessionChat.ts`
- `packages/web/src/composables/session-snapshot.ts`
- `packages/web/src/components/workbench/chat/WorkbenchMessageStream.vue`
- `文档/模块梳理/中间对话区模块.md`
- `文档/模块梳理/Web工作台与Pi服务桥接模块.md`

## 视觉/浏览器发现
<!-- 
  内容：你从查看图像、PDF 或浏览器结果中了解到的信息。
  目的：关键 - 视觉/多模态内容不会持久存在于上下文中。必须以文本形式捕获。
  时机：在查看图像或浏览器结果后立即记录。不要等待！
  示例：
    - 截图显示登录表单有电子邮件和密码字段
    - 浏览器显示 API 返回带有 "status" 和 "data" 键的 JSON
-->
<!-- 关键：每 2 次查看/浏览器操作后更新 -->
<!-- 多模态内容必须立即以文本形式捕获 -->
- 当前没有浏览器/图片探索，本轮主要是代码与文档核对

---
<!-- 
  提醒：2步原则
  每进行 2 次查看/浏览器/搜索操作后，你必须更新此文件。
  这可以防止上下文重置时丢失视觉信息。
-->
*每 2 次查看/浏览器/搜索操作后更新此文件*
*这可以防止丢失视觉信息*
