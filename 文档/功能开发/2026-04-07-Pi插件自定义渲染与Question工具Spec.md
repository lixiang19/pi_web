# Pi 插件自定义渲染与 Question 工具 Spec

## 文档目标

- 单独定义 Web 工作台里“Pi 插件自定义渲染”这条能力线，不再和输入框、agent 选择混写。
- 以 openchamber 当前真实代码为依据，梳理 Web 模式到底支持哪些 Pi 插件 UI 契约，哪些明确不支持。
- 把 `question` 工具作为第一优先级能力单独拆开，因为它是 openchamber 当前唯一真正打通的阻塞式交互契约。
- 产出一份可直接执行的设计文档，包含：
  - openchamber 事实梳理
  - Web 渲染边界
  - `question` 工具协议
  - 里程碑与任务
  - 明确不做项

---

## 一、结论先行

openchamber 在 Web 模式里并没有支持 Pi 原生的通用 `ctx.ui.custom()`。

它当前真正成立的“插件渲染”只有三层：

1. 阻塞式交互层：只支持原生 `question` 请求，并由 `QuestionCard` 直接渲染。
2. 消息工具渲染层：工具调用和工具结果被投影成消息 part，由前端工具渲染器按 `toolName` 决定怎么显示。
3. 弱 UI 事件层：`notify`、`setStatus`、`setWidget` 会被桥接成 Web 事件，但其中只有 `notify` 是明确可用的，`status/widget` 仍属于延后支持。

这意味着当前项目如果要做“自定义 Pi 插件渲染”，正确方向不是去模拟 Pi TUI，而是先承认 Web 宿主当前只应该支持一套 Web-native 的插件交互契约。

这个契约里，第一阶段最值得做的只有：

- `question` 工具
- 工具消息的自定义显示
- 必要时为 `status/widget` 预留协议

不应该一开始就去做：

- 通用 `ctx.ui.custom()`
- 通用 `ctx.ui.input/select/confirm/editor`
- 任意扩展直接往前端挂自定义组件

---

## 二、openchamber 已有事实

## 1. Web 宿主明确只支持 `question`

关键结论直接写在：

- `packages/web/server/lib/pi/DOCUMENTATION.md`

代码事实是：

- Web 产品只支持一种阻塞式交互契约：`question`
- `ctx.ui.input()`、`ctx.ui.select()`、`ctx.ui.confirm()`、`ctx.ui.editor()` 在 Web host 里明确抛错
- `ctx.ui.custom()` 也明确抛错：`Pi custom UI is not supported in the web host yet`

也就是说，openchamber 的 Web 模式没有做“Pi 所有 UI 能力的浏览器版适配”，而是主动收缩成一个产品化子集。

## 2. `question` 是 runtime 里的 blocking interactive request

在：

- `packages/web/server/lib/pi/sdk-host.js`

openchamber 会把交互请求收敛到：

- `createInteractiveRequest(record, 'question', payload)`

然后：

- 写入 `record.interactiveRequests`
- 进入 `interactiveRequestIndex`
- 通过 `pi_ui_event` 发给前端

这说明 `question` 的本质不是“消息里插一条提示”，而是 session runtime 上真正挂起的交互请求。

## 3. `question` 工具是专门定义的 Web 契约

在：

- `packages/web/server/lib/pi/extensions/question.js`

openchamber 专门定义了一个 `question` tool：

- 工具名：`question`
- 参数：`questions[]`
- 每个问题支持：
  - `header`
  - `question`
  - `options`
  - `multiple`
  - `allowCustom`

执行时：

- 不是直接调用 `ctx.ui.input/select/confirm`
- 而是调用 `createInteractiveRequest('question', payload)`

这说明 openchamber 的策略是：

- 不去支持通用旧 UI API
- 而是专门提供一个 Web 产品自己能完整渲染的 `question` 工具契约

## 4. `question` 回答后，返回给模型的是结构化文本结果

`packages/web/server/lib/pi/extensions/question.js` 里最终会把用户答案拼成：

```text
User has answered your questions:
"Q1"="A1"
"Q2"="A2"
You can now proceed.
```

同时 `details` 里还会保留：

- `questions`
- `answer`
- `cancelled`

这说明 openchamber 走的是双轨：

- 给模型一份可读文本
- 给前端一份结构化 `details`

## 5. 前端 `QuestionCard` 是 question 契约专属组件

在：

- `packages/ui/src/components/chat/QuestionCard.tsx`

可以看到它直接基于 `PiInteractiveRequestViewState` 渲染：

- 多问题 tabs
- 每题可选项
- 单选 / 多选
- 自定义文本输入
- Summary tab
- Submit / Dismiss

并通过 store 调用：

- `respondToQuestion(sessionId, requestId, answers)`
- `rejectQuestion(sessionId, requestId)`

这说明 openchamber 并没有“通用扩展 UI 容器”，而是为 `question` 做了一个专用 Web 卡片。

## 6. question 回答链路是完整闭环

openchamber 的 question 闭环是：

1. 模型调用 `question` 工具
2. 服务端创建 `interactive_request`
3. 前端渲染 `QuestionCard`
4. 用户提交答案
5. 前端通过 runtime client 调 `POST /requests/:id/respond`
6. 服务端恢复 session 执行
7. `question` 工具把答案转成工具结果文本返回给模型

这是一条完整的 runtime 闭环，不是 UI 层的临时交互。

## 7. 工具结果渲染走的是消息渲染系统

在：

- `packages/ui/src/components/chat/message/parts/DOCUMENTATION.md`
- `packages/ui/src/components/chat/message/parts/ToolPart.tsx`
- `packages/ui/src/components/chat/message/parts/toolPresentation.tsx`

openchamber 的工具消息渲染是另一套系统：

- `bash/edit/write/question/task` 走 expandable tool row
- 其他工具更多走 static/grouped row
- 图标映射由 `toolPresentation.tsx` 统一维护

对于 `question` 工具：

- 折叠态描述显示 `Asked N questions`
- 展开态会尝试解析工具输出，按 Q/A summary 方式展示

也就是说，`question` 在 openchamber 里有两层可见 UI：

1. 阻塞时的 `QuestionCard`
2. 完成后的 `ToolPart` 结果展示

## 8. `notify`、`setStatus`、`setWidget` 被桥接，但不是主路径

在：

- `packages/web/server/lib/pi/bridge-schema.js`
- `packages/web/server/lib/pi/sdk-host.js`

可以看到 Web host 会把下面这些事件桥接出来：

- `notify`
- `setStatus`
- `setWidget`
- `setTitle`
- `set_editor_text`

但 openchamber 自己给它们的支持等级并不一样：

- `notify`：passive，可用
- `setStatus`：deferred
- `setWidget`：deferred
- `setTitle` / `set_editor_text`：unsupported

这说明 openchamber 当前并没有把 widget/status 做成第一等产品能力，只是先保留桥接口。

---

## 三、对当前项目的核心设计判断

## 1. 当前项目不能做通用 Pi Custom UI

Pi SDK 在 TUI 环境里当然支持更丰富的 UI API，但 Web 工作台不是 TUI。

既然 openchamber 当前事实是：

- `ctx.ui.custom()` 不支持
- 通用 `input/select/confirm/editor` 也不支持

那当前项目就不应该先承诺“自定义 Pi 插件渲染 = 任意 Pi UI API 浏览器化”。

正确说法应该是：

- Web 模式只支持一套受控的插件渲染契约

## 2. 第一阶段唯一应做实的 blocking contract 就是 `question`

原因：

- 它已经被 openchamber 验证可行
- 它能覆盖真实工作流中的“需要用户补信息”场景
- 它比通用 UI API 更容易稳定
- 它能自然嵌入消息流，不会把架构拖散

## 3. “自定义插件渲染”应拆成两层而不是一层

当前项目应该明确拆开：

### A. 交互渲染层

- 负责阻塞式卡片
- 第一阶段只支持 `question`

### B. 工具结果渲染层

- 负责消息流里的 tool row
- 通过 `toolName + details` 决定展示方式
- question/task/bash/edit 等可以有专用 renderer
- 未知工具走通用 fallback renderer

如果这两层不拆开，后面很容易把“插件 UI”和“工具结果显示”混成一锅。

## 4. `status/widget` 只能作为延后能力

openchamber 自己都把这两项标成 deferred。

所以当前项目不要在第一阶段里承诺：

- 扩展能随便往页面塞 widget
- 扩展能实时挂各种自定义状态面板

这些能力如果以后要做，前提是：

- 先定义清楚 Web 布局插槽
- 先定义 widget 生命周期
- 先定义严格的数据结构

---

## 四、当前项目的目标范围

## 要做

### A. 定义 Web 插件渲染契约

- 只允许 Web 自己明确支持的桥接方法进入前端
- 第一阶段先固定：
  - `question`
  - 工具结果渲染
- 不允许“扩展能调用什么，前端就都想办法接什么”

### B. 建立 `question` 工具完整链路

- 服务端定义 `question` tool
- session runtime 能保存 pending interactive request
- 前端能渲染 `QuestionCard`
- 用户回答后能回写给 runtime
- 工具结果能进入消息流并可回看

### C. 建立工具结果渲染分层

- expandable tools
- static/grouped tools
- fallback tool renderer
- 图标与标题映射集中管理

### D. 为后续 `status/widget` 预留协议，但不承诺落地

- 允许服务端桥接 `setStatus/setWidget`
- 允许前端 state 模型里先留结构
- 但第一阶段不强行渲染成正式产品能力

---

## 五、明确不做

## 1. 不做通用 `ctx.ui.custom()` Web 适配

不做：

- 任意扩展自定义 TUI 组件转 Web 组件
- 通用 `ctx.ui.custom()` 桥接协议
- 前端动态挂载任意扩展组件

原因：

- openchamber 当前也没有做
- 成本极高
- 会把 Web host 做成弱约束的运行容器

## 2. 不做通用 `ctx.ui.input/select/confirm/editor`

原因：

- openchamber 明确把它们判为 unsupported
- 当前更合理的产品化替代就是 `question` 工具

## 3. 不做任意插件 widget 面板注入

不做：

- 插件直接在消息区外部挂任意卡片
- 插件直接侵入顶部、输入区、侧栏布局

原因：

- 这会先把页面结构搞乱，再倒逼协议兜底
- 应该等 Web 插槽模型明确后再谈

---

## 六、Spec

## 1. Web 插件渲染分层模型

建议当前项目固定为：

```ts
type PiWebPluginRenderLayer =
  | 'interactive-request'
  | 'tool-part'
  | 'passive-ui-event'
```

### `interactive-request`

- 当前只支持 `question`
- 会阻塞当前 agent 流程
- 需要用户明确回答或 dismiss

### `tool-part`

- 表示工具调用和工具结果在消息流里的展示
- 由 `toolName` 决定是专用 renderer 还是 fallback

### `passive-ui-event`

- `notify`
- `setStatus`
- `setWidget`
- 当前最多做轻量桥接，不承诺完整 UI

## 2. `question` 工具契约

建议沿用 openchamber 已验证的最小结构：

```ts
interface QuestionOption {
  label: string
  description?: string
}

interface QuestionItem {
  header?: string
  question: string
  options?: QuestionOption[]
  multiple?: boolean
  allowCustom?: boolean
}

interface QuestionToolParams {
  questions: QuestionItem[]
}
```

### 规则

- `questions` 至少一项
- `question` 文本不能为空
- `options` 为空时默认允许自由回答
- `options` 非空时，只有 `allowCustom = true` 才允许自由输入
- `multiple = true` 时，回答结构必须允许多选

## 3. `question` 前端状态模型

```ts
interface PiInteractiveRequestViewState {
  id: string
  sessionId: string
  method: 'question'
  title: string
  message: string
  questions?: QuestionItem[]
  createdAt: number
}
```

说明：

- 当前不要把 interactive request 扩成多种 method
- 只保留 `question`
- 其他类型一律视为 unsupported，不进入统一卡片渲染

## 4. `question` 回答协议

建议沿用 openchamber 的回答格式：

- 单题单选：`string[]`
- 多题：`string[][]`

服务端接口应保证：

- 提交回答后移除 pending request
- 拒绝后也移除 pending request
- runtime 恢复执行

## 5. 工具结果渲染协议

当前项目建议建立统一描述对象：

```ts
interface ToolRenderState {
  toolName: string
  input: unknown
  details?: unknown
  outputText?: string
  isError: boolean
  status: 'running' | 'completed' | 'error'
}
```

然后固定规则：

- `question`：专用 renderer
- `task`：专用 renderer
- `edit/write/apply_patch`：专用 renderer
- 其他：generic renderer

## 6. `status/widget` 协议边界

若后续保留桥接，则结构应该先严格受控：

```ts
interface PiStatusEntry {
  key: string
  text: string
}

interface PiWidgetEntry {
  key: string
  content: string[]
  placement: string
  bordered: boolean
}
```

但当前阶段不承诺：

- placement 的完整布局语义
- 多 widget 排序
- widget 生命周期动画

---

## 七、里程碑

## M1：Question 工具协议落地

### 目标

先把唯一值得支持的 blocking 交互做实。

### 交付结果

- question tool 服务端定义
- interactive request 存储与回复
- QuestionCard 渲染
- question 结果回写消息流

### 任务

- 定义 `question` 参数 schema
- 在 session runtime 中保存 pending request
- 定义回答/拒绝接口
- 前端建立 `QuestionCard`
- 为 `question` 增加 tool result renderer

## M2：工具消息自定义渲染分层

### 目标

把“插件渲染”从 question 扩到可控的工具结果显示层。

### 交付结果

- toolName -> renderer 映射
- 图标和标题集中管理
- expandable / static / fallback 三类渲染路径

### 任务

- 设计工具渲染分类器
- 设计通用 tool renderer props
- 增加 question/task/edit 等专用 renderer
- 增加 generic fallback renderer

## M3：Passive UI Event 预留

### 目标

只给 status/widget 留协议，不把它们提前做成复杂产品。

### 交付结果

- 可桥接 `notify`
- state 模型中预留 `statusEntries/widgets`
- 明确 unsupported/deferred 列表

### 任务

- 定义事件 catalog
- 桥接 `notify`
- 桥接 `setStatus/setWidget` 的最小数据结构
- 不强制落正式 UI

---

## 八、任务清单

## 服务端任务

- 增加 `question` tool 定义
- 增加 interactive request runtime 存储
- 增加回答 / 拒绝接口
- 为 session snapshot 补 interactiveRequests 字段
- 设计 `statusEntries/widgets` 预留结构

## 前端任务

- 新建 `QuestionCard`
- 在消息区插入 interactive request 区块
- 增加 toolName 渲染分层
- 增加 `question` 工具专用结果渲染
- 未知工具走 fallback renderer

## 研究任务

- 持续核对 Pi SDK 对 `ctx.ui.*` 的边界
- 持续核对 openchamber 对 `setStatus/setWidget` 的后续演进
- 持续核对工具结果渲染是否需要更多 metadata 契约

---

## 九、关键设计决策

## 决策 1：Web 不支持通用 Pi Custom UI

理由：

- openchamber 当前也未支持
- 产品边界不稳定
- 会把 Web host 做成难以维护的泛化容器

## 决策 2：Question 是唯一 blocking contract

理由：

- 覆盖真实澄清场景
- 交互结构清晰
- 最容易稳定落地

## 决策 3：插件渲染分为“交互请求”和“工具结果”两层

理由：

- 一个是 runtime 阻塞输入
- 一个是消息回放展示
- 两者生命周期完全不同

## 决策 4：status/widget 只预留，不抢先产品化

理由：

- openchamber 自己也未完全落地
- 当前优先级远低于 question

---

## 十、验收标准

### M1 验收

- question tool 能真实发起阻塞式请求
- 前端能渲染 question 卡片
- 用户能提交或 dismiss
- 模型能拿到问题答案继续执行
- question 工具执行结果能在消息流回看

### M2 验收

- 工具渲染路径明确区分 expandable / static / fallback
- question、task、edit 等有专用显示
- 未知工具不会导致消息区崩坏

### M3 验收

- `notify` 可桥接
- `status/widget` 有明确数据结构
- unsupported/deferred 列表写死，不靠猜测兜底

---

## 结论

“自定义 Pi 插件渲染”在 Web 模式里，不能理解成“把 Pi 所有 TUI UI API 都搬进浏览器”。

openchamber 当前给出的真实答案更克制，也更可执行：

- 阻塞式交互只做 `question`
- 工具结果显示走消息渲染系统
- `status/widget` 只做桥接预留
- 通用 custom UI 暂不支持

当前项目如果沿着这条线走，插件渲染能力会是可控增长的；如果一开始就追求通用 Web host，最后大概率会回到一堆不稳定的兼容逻辑里。