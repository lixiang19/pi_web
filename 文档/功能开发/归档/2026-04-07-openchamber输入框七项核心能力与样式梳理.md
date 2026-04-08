# openchamber 输入框七项核心能力与样式梳理

## 文档目标

- 梳理 openchamber 输入框在真实代码中的七项核心能力。
- 把“功能实现入口”和“UI 样式组织方式”拆开记录，避免只抄视觉不抄结构。
- 给 `pi_web` 的输入框文档补充源码依据，明确哪些值得借鉴，哪些不应照搬。

---

## 一、七项核心能力总览

| 能力 | openchamber 状态 | 关键入口 | 对 `pi_web` 的意义 |
| --- | --- | --- | --- |
| 输入及发送 | 已完整实现 | `ChatInput.tsx` | 必须借鉴整体编排方式 |
| 模型选取 | 已完整实现 | `ModelControls.tsx` | 应借鉴控制条结构 |
| 思考能力选取 | 已完整实现 | `ModelControls.tsx` | 应补到当前输入区 |
| agent 选取 | 已完整实现 | `ChatInput.tsx` + agent store | 当前项目已接入底座，但 UI 仍然偏弱 |
| prompt 快速发送 | 已完整实现 | `CommandAutocomplete.tsx` | 当前项目应从硬编码 quick prompt 升级到 catalog |
| skill 选取与发送 | 已完整实现 | `SkillAutocomplete.tsx` | 当前项目仍为空白 |
| Pi 命令选择与发送 | 已完整实现 | `CommandAutocomplete.tsx` | 当前项目仍为空白 |

---

## 二、关键实现入口

## 1. 输入与发送

核心文件：

- `packages/ui/src/components/chat/ChatInput.tsx`

关键事实：

- `handleSubmit()` 负责发送编排，不只是提交 textarea 文本。
- 发送前会处理：
  - queue
  - `@agent` 提及
  - inline file mention
  - synthetic parts
  - slash command 分支
- 这说明 openchamber 的输入区本质是编排器，而不是一个简单表单。

## 2. 模型与 thinking

核心文件：

- `packages/ui/src/components/chat/ModelControls.tsx`

关键事实：

- 模型和 thinking 被放在同一组控制器里。
- thinking 级别固定为六档：
  - `off`
  - `minimal`
  - `low`
  - `medium`
  - `high`
  - `xhigh`
- 模型能力标签也一起显示：
  - `tool_call`
  - `reasoning`

结论：

- thinking 不应该在 `pi_web` 里被当成后补字段，它就是输入控制核心之一。

## 3. agent 选择

核心文件：

- `packages/ui/src/components/chat/ChatInput.tsx`
- `packages/ui/src/lib/messages/agentMentions.ts`

关键事实：

- openchamber 同时支持：
  - 显式 agent 选择
  - 文本里的 `@agent`
- `handleSubmit()` 会在发送前解析 `@agent`，并提取第一处有效命中。
- 这让 agent 既是控制器状态，也是文本语义的一部分。

## 4. prompt 快速发送

核心文件：

- `packages/ui/src/components/chat/CommandAutocomplete.tsx`
- `packages/web/server/index.js`

关键事实：

- prompt 不是写死按钮，而是放进 `/` 资源选择器里。
- `CommandAutocomplete` 里会从 `piClient.listCommands()` 拉取 catalog。
- 服务端同时有 prompt templates API。

结论：

- openchamber 的 prompt 快发本质上是“资源发现 + 快速注入”，不是几颗静态按钮。

## 5. skill 选取与发送

核心文件：

- `packages/ui/src/components/chat/SkillAutocomplete.tsx`
- `packages/ui/src/stores/useSkillsStore.ts`

关键事实：

- skill 通过 `/` 触发。
- SkillAutocomplete 会即时加载 skills，并按 scope 排序：
  - `project`
  - `user/global`
- 选择 skill 后，会把 `/skill-name` 注入输入区。

## 6. Pi 命令选择与发送

核心文件：

- `packages/ui/src/components/chat/CommandAutocomplete.tsx`

关键事实：

- 命令列表里既有动态 catalog，也混入了 openchamber 本地内置命令：
  - `undo`
  - `redo`
  - `timeline`
- 选择命令后，会把 `/${command}` 放回输入区，再由 `handleSubmit()` 判断是否走本地命令分支。

结论：

- 这部分不能原样照抄到 `pi_web`，因为其中一部分是 openchamber 私有命令，不是 Pi 通用能力。

---

## 三、UI 与样式组织方式

## 1. 控制层次

openchamber 值得借鉴的是层次，而不是具体配色。

它的输入区实际包含：

1. 控制层
   - 模型
   - thinking
   - agent
2. 辅助入口层
   - prompt 入口
   - quick actions
3. 输入层
   - textarea
   - autocomplete overlay
4. 动作层
   - send / stop

也就是说，真正成熟的输入区不是“一行控件”，而是一个小型工作台。

## 2. 自动完成浮层

openchamber 的浮层特征：

- 从输入区上方弹出
- 宽度按能力切换
  - command 更宽
  - skill 更窄
- 支持键盘：
  - `ArrowUp/ArrowDown`
  - `Enter`
  - `Tab`
  - `Esc`

这类交互方式值得保留，但不需要把它的 files / agents / prompts 三 tab 全量照搬。

## 3. prompt chips

openchamber 还有 quick action / shortcut 一类轻量入口。

可借鉴点：

- chips 作为辅助入口
- 点击后快速填入输入区或直接发送

不该照搬点：

- queue 相关快捷动作
- 和附件、权限、任务状态强绑定的按钮

---

## 四、哪些值得借鉴

## 应借鉴

- 输入区是编排器，不是普通 textarea
- 模型、thinking、agent 是同一组输入控制能力
- `/` 统一资源选择器很适合承载 prompt / skill / command
- `@agent` 应在发送前解析并归一
- send / stop 应是同一主按钮状态切换

## 需要改写后再借鉴

- prompt chips
  - 改成真实 prompt catalog，而不是手写常量
- 命令选择器
  - 只保留 Pi 命令，不保留 openchamber 本地命令
- skill 选择器
  - 保留结构，但资源来源改成当前项目自己的桥接 API

## 不应照搬

- queue mode
- shell mode
- files / agents / prompts 大一统自动完成面板
- openchamber 本地 undo / redo / timeline 命令
- 附件与输入编排深度耦合的工作流

---

## 五、对 `pi_web` 的直接结论

当前 `pi_web` 输入区最缺的不是视觉，而是能力结构。

应该优先补：

1. 模型、thinking、agent 三联控制
2. `/` 资源选择器
3. prompt / skill / command catalog
4. `@agent` 发送前归一

不应该优先补：

1. queue
2. shell mode
3. files autocomplete
4. openchamber 私有命令

因此，`pi_web` 的输入区对标 openchamber 时，正确做法是：

- 借鉴结构
- 借鉴状态分层
- 借鉴资源选择方式
- 不照抄它的私有工作流

---

## 六、与当前仓库的差距

当前 `pi_web` 已有：

- 文本输入与发送
- 模型选择
- agent 选择
- 静态 quick prompt 按钮

当前 `pi_web` 缺失：

- thinking level 选择
- prompt catalog
- skill catalog
- command catalog
- `/` 资源选择器
- 统一的输入编排状态模型

这就是本轮补文档的核心原因：

- 现有文档还没有把这几项纳入“输入框最重要功能”集合里。