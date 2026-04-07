# Agent 扩展能力 Spec 与 YAML 全集

## 文档目标

- 将 agent 能力从输入框文档中彻底拆出，成为独立模块设计。
- 参考 `openchamber` 当前 Pi-native agent 扩展实现，定义本项目必须完整支持的 agent 能力。
- 明确 agent 的：
  - 文件布局
  - 发现规则
  - YAML frontmatter 全字段
  - 运行时注入语义
  - 服务端接口
  - 前端消费方式
  - 里程碑与任务拆分

## 结论先行

本项目的 agent 不是“输入框上的一个下拉框”，而是 **Pi 扩展资源系统的一类一等资源**。

因此 agent 必须一次性做完整闭环，至少同时覆盖：

1. agent 文件发现
2. YAML frontmatter 解析与校验
3. user / project 两级覆盖规则
4. 主会话 agent 选择与切换
5. task agent 调度
6. `permission` 编译与运行时 gate
7. 输入框 `@agent` 和显式选择联动
8. 配置读写 API
9. 前端编辑与列表展示

如果只做 UI 选择器，不做后端发现、YAML 解析、运行时注入和权限 gate，这个 agent 系统就是假的，不能接受。

---

## 一、设计边界

### 1. 基本原则

- 只走 SDK，不走 RPC。
- 只采用 Pi-native agent 子集，不继续兼容 OpenCode 那套旧 agent schema。
- YAML 参数必须完整支持，不允许“只支持一半字段”。
- 未知字段不做静默忽略，直接报错，避免配置漂移。
- agent 的执行语义必须在服务端真正生效，不能停留在前端展示。

### 2. 参考依据

本 spec 主要依据以下 `openchamber` 代码事实：

- `packages/web/server/lib/pi/agents.js`
- `packages/web/server/lib/pi/agents.test.js`
- `packages/web/server/lib/pi/permissions.js`
- `packages/web/server/lib/pi/sdk-host.js`
- `packages/web/server/lib/pi/extensions/task.js`
- `packages/web/server/lib/pi/DOCUMENTATION.md`
- `packages/ui/src/stores/useAgentsStore.ts`
- `packages/ui/src/components/sections/agents/AgentsPage.tsx`

### 3. 本项目当前现状

当前 `pi_web` 只有：

- Pi session 的 SDK 桥接
- provider / model 列表
- prompt 发送
- 基础 session 流式消息

当前还没有：

- agent 发现系统
- agent YAML frontmatter 解析
- agent 配置读写 API
- agent 运行时注入
- agent 权限编译与 gate

所以 agent 本轮必须作为独立能力建设，不能假设仓库里已有现成底座。

---

## 二、总体架构

agent 能力应拆成四层：

```text
+---------------------------------------------------+
| Web UI                                            |
| - Agent 列表                                      |
| - Agent 编辑页                                    |
| - 输入框 Agent 选择 / @agent                      |
+--------------------------+------------------------+
                           |
                           v
+---------------------------------------------------+
| Server Config / Discovery Layer                   |
| - 发现 ~/.pi/agent/agents                         |
| - 发现最近 .pi/agents                             |
| - 解析 .md frontmatter                            |
| - 校验 YAML 参数                                  |
| - 提供 CRUD / list / detail API                   |
+--------------------------+------------------------+
                           |
                           v
+---------------------------------------------------+
| Runtime Apply Layer                               |
| - 选中 agent 后刷新 session                       |
| - 注入 system prompt                              |
| - 应用 model / thinking / steps                   |
| - 编译 permission -> active tools + gate          |
+--------------------------+------------------------+
                           |
                           v
+---------------------------------------------------+
| Pi SDK / Extensions                               |
| - createAgentSession()                            |
| - DefaultResourceLoader                           |
| - extensionFactories                              |
| - tool_call permission gate                       |
| - task tool                                       |
+---------------------------------------------------+
```

### 架构原则

- YAML 是声明式配置源。
- 运行时永远消费“解析后的 agent 配置对象”，不直接在执行时临时读文件。
- 权限策略不能只影响 UI，必须进入运行时 gate。
- 主会话 agent 和 task agent 共用同一份发现与解析逻辑。

---

## 三、文件布局与发现规则

## 1. 支持的目录

### 用户级 agent 目录

- `~/.pi/agent/agents`

### 项目级 agent 目录

- 从当前 `cwd` 向上查找最近的：`.pi/agents`

## 2. 支持的文件类型

- 仅支持 `.md`
- 每个 agent 一个 `.md` 文件
- frontmatter 使用 YAML
- 正文为 markdown body prompt

## 3. 发现顺序与覆盖规则

发现规则必须与 openchamber 当前实现保持一致：

1. 先读用户级目录
2. 再读最近项目级目录
3. 若同名 agent 同时存在：
   - 项目级覆盖用户级
4. discovery 结果最终按 `name` 排序

## 4. 名称来源规则

agent 最终 `name` 规则：

1. 若 YAML 中存在 `name`，优先使用它
2. 否则回退为文件名去掉 `.md`

### 约束

- 本项目写入 agent 文件时，`name` 必须与文件名 stem 一致
- 不允许出现：
  - 文件名是 `planner.md`
  - YAML `name: code-reviewer`
- 这种双重真相必须直接报错

## 5. 启用规则

- `enabled: false` 的 agent 不参与 discovery 结果
- 不进入主会话 agent 列表
- 不进入 task agent 列表
- 不允许被输入框 `@agent` 选中

## 6. 异常处理规则

- YAML frontmatter 解析失败：跳过该 agent，并记录错误
- `permission` 非法：跳过该 agent，并记录错误
- 其他 agent 不受影响
- discovery 不因为单个坏文件整体失败

---

## 四、YAML Frontmatter 全字段定义

下面这些字段必须完整支持。

## 1. 完整字段表

| 字段 | 类型 | 是否支持 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `name` | `string` | 必须支持 | 文件名 stem | agent 稳定标识 |
| `description` | `string` | 必须支持 | `""` | agent 描述 |
| `display_name` | `string` | 必须支持 | 无 | UI 展示名 |
| `mode` | `primary \| task \| all` | 必须支持 | `all` | agent 使用模式 |
| `model` | `string` | 必须支持 | 无 | 指定 provider/model |
| `thinking` | `off \| minimal \| low \| medium \| high \| xhigh` | 必须支持 | 无 | 思考强度 |
| `steps` | `integer >= 1` | 必须支持 | 无上限 | turn budget |
| `enabled` | `boolean` | 必须支持 | `true` | 是否启用 |
| `permission` | `object` | 必须支持 | 无 | 工具与编辑权限策略 |
| markdown body | `string` | 必须支持 | `""` | system prompt 正文 |

## 2. 不属于 YAML 的字段

下面这些不是 YAML frontmatter 字段，但会在 API 和运行时对象中出现：

- `scope`
  - `user` 或 `project`
  - 由目录来源决定，不从 YAML 读取
- `source`
  - 文件绝对路径
- `sourceScope`
  - `user` 或 `project`
- `systemPrompt`
  - markdown body 解析后的结果

## 3. mode 取值语义

### `primary`

- 允许在主会话中选择
- 不允许被 task tool 调用

### `task`

- 不允许在主会话中选择
- 允许被 task tool 调用

### `all`

- 同时允许主会话选择和 task tool 调用

### 非法值

- 任何不在 `primary/task/all` 集合内的值都视为非法
- discovery 时直接回退默认值不是最佳做法
- 本项目写入时必须阻止非法值保存

## 4. thinking 取值语义

必须完整支持以下值：

- `off`
- `minimal`
- `low`
- `medium`
- `high`
- `xhigh`

非法值：

- 读取时可视为未设置
- 写入时必须直接校验失败

## 5. steps 取值语义

- 必须是正整数
- `>= 1`
- 字符串数字可归一化为整数
- `0`、负数、小数、空字符串都非法

## 6. enabled 取值语义

支持：

- `true`
- `false`
- 字符串 `"true"` / `"false"`

默认值：

- 未配置时为 `true`

## 7. model 取值语义

- 采用 `provider/model` 形式
- 例如：`anthropic/claude-sonnet-4-5`
- 若配置存在但目标模型不可解析：
  - 不能静默假装成功
  - 应在应用阶段给出明确错误或回退策略

## 8. description 与 display_name

### `description`

- 供：
  - 列表展示
  - 输入框 agent 选择说明
  - task tool 可调用 agent 摘要
- discovery 阶段允许为空字符串
- 但创建 / 更新 API 必须要求非空

### `display_name`

- 纯 UI 展示名
- 不影响稳定标识
- 不参与覆盖判断
- 不参与 task tool 名称匹配

## 9. markdown body prompt

frontmatter 之后的正文即 agent prompt：

```md
---
description: 负责规划大型改造
mode: primary
thinking: high
---
你是一个严谨的架构规划 agent。
先建立边界，再拆任务，再输出验收标准。
```

规则：

- 正文读取后需要 `trim()`
- 运行时对象中映射为 `systemPrompt`
- 创建 / 更新 API 必须支持编辑正文
- 写入文件时必须保留 frontmatter + 空行 + 正文 的结构

---

## 五、permission 全量支持规则

`permission` 是本 spec 最容易被做残的部分，必须一次做全。

## 1. 支持的简单权限键

以下键只接受简单值：

- `read`
- `grep`
- `find`
- `ls`
- `bash`
- `question`
- `task`

其值只能是：

- `allow`
- `deny`

## 2. 支持的编辑权限键

编辑权限逻辑键：

- `edit`

兼容写法别名：

- `write`

### 语义

- `write` 在解析时统一折叠成 `edit`
- 外部只保留一份逻辑结果：`permission.edit`

## 3. edit 支持两种写法

### 简单值

```yaml
permission:
  edit: deny
```

或

```yaml
permission:
  edit: allow
```

### 规则对象

```yaml
permission:
  edit:
    "*": deny
    "**/*.md": allow
```

## 4. edit 规则对象限制

- 必须是对象
- key 是 workspace-relative glob 模式
- value 只能是 `allow` 或 `deny`
- 必须显式包含 `"*"` 兜底规则
- pattern 不能是绝对路径
- pattern 不能包含 `..`
- 空对象非法

## 5. permission 非法条件

下面任一情况都必须报错：

- 出现未知权限键
- 简单权限键不是 `allow/deny`
- `edit` 规则对象为空
- `edit` 规则对象没有 `"*"`
- `edit` 规则 pattern 非 workspace-relative
- `edit` 规则包含 `..`

## 6. permission 运行时语义

### 第一层：active tools 裁剪

- `permission.edit = deny` 时
  - 直接从 active tools 中移除 `edit`、`write`
- 其他简单权限为 `deny` 时
  - 对应工具从 active tools 中移除

### 第二层：tool_call gate

当 `permission.edit` 是规则对象时：

- `edit` / `write` 不能直接移除
- 必须保留工具
- 在 `tool_call` 时根据目标 path 做精确拦截

### 目标路径规则

- 提取工具输入中的 `path`
- 归一化为相对当前 `cwd` 的路径
- 若路径越出工作区，直接阻断
- 采用“最后匹配优先”决定 allow / deny

## 7. permission 示例

### 全禁止编辑

```yaml
permission:
  bash: deny
  edit: deny
```

### 只允许 Markdown

```yaml
permission:
  bash: deny
  edit:
    "*": deny
    "**/*.md": allow
```

### 允许读，禁止 task

```yaml
permission:
  read: allow
  grep: allow
  find: allow
  ls: allow
  task: deny
```

---

## 六、YAML Schema 规范

建议本项目将 agent YAML 固化为下面这份 schema 约束。

```yaml
---
name: planner
description: 负责复杂任务拆解与实施计划
display_name: 规划者
mode: primary
model: anthropic/claude-sonnet-4-5
thinking: high
steps: 12
enabled: true
permission:
  bash: deny
  task: allow
  edit:
    "*": deny
    "**/*.md": allow
---
你是一个严谨的规划 agent。
先收敛边界，再拆里程碑，再给验收标准。
```

## 1. 写入规范

- 所有支持字段都可以出现在 frontmatter 中
- 不支持的字段禁止写入
- frontmatter 后必须空一行
- 正文使用 markdown body
- 文件编码统一 UTF-8

## 2. 文件命名规范

- 文件名建议与 `name` 一致
- 统一使用：`<name>.md`
- `name` 只允许：
  - 小写字母
  - 数字
  - `-`
- 空格创建时统一转 `-`

## 3. 未知字段策略

本项目必须更严格：

- openchamber 当前 discovery 对未知字段不消费
- 但本项目配置保存时不能默默接受未知字段
- 创建 / 更新 API 一律拒绝未知字段

原因：

- 避免 YAML 漂移
- 避免用户误以为某个字段已经生效
- 避免未来兼容泥潭

---

## 七、运行时应用语义

## 1. 主会话 agent 应用链路

当用户在主会话选中 agent 时，服务端必须执行：

1. 发现当前 `cwd` 下所有 agent
2. 校验目标 agent 是否存在
3. 过滤掉 `mode = task` 的 agent
4. 比较 agent 配置签名
5. 若签名变化，执行 session reload
6. 编译 permission
7. 调用 `setActiveToolsByName()`
8. 应用 `model`
9. 应用 `thinking`
10. 建立 `steps` turn budget
11. 注入正文 `systemPrompt`
12. 附加当前可用 task agent 摘要

### 错误规则

- 选中的 agent 不存在：直接报错，并返回当前可用 agent 名单
- 不允许静默回退到默认 agent

## 2. task agent 应用链路

task tool 调用 agent 时，必须执行：

1. 发现所有 agent
2. 只保留 `mode = task/all`
3. 校验请求 agent 是否存在
4. 为该 task 单独创建 Pi session
5. 将 markdown body prompt 作为 `appendSystemPrompt`
6. 编译 permission，并注入 gate extension
7. 应用 model / thinking / steps
8. 运行 task
9. 返回输出与 task metadata

## 3. steps 运行时语义

- `steps` 表示 turn budget
- 每个 `turn_end` 递增 `usedTurns`
- 超过预算时中止 session
- 不能只写在 YAML 里但运行时不执行

## 4. systemPrompt 语义

正文 prompt 不能只是“读出来给 UI 看”，必须进入 Pi 系统提示链路。

对于主会话与 task agent，都应保证：

- markdown body -> `systemPrompt`
- `systemPrompt` 真正影响会话行为

---

## 八、前端与输入框联动规则

## 1. 输入框只展示可用于主会话的 agent

输入框 agent 选择器只能展示：

- `primary`
- `all`

禁止展示：

- `task`

## 2. `@agent` 选择规则

输入框 `@agent` 规则：

- 只匹配当前可用于主会话的 agent
- 只取第一处有效匹配
- 命中后形成最终 `selectedAgent`
- 未命中时按普通文本处理

## 3. 会话级 agent 记忆

- 每个 session 记住最近一次选择的 agent
- 切回该 session 时恢复
- 但恢复前必须校验该 agent 仍然存在且可用

## 4. 输入框和显式选择优先级

建议固定规则：

1. 文本内第一处有效 `@agent`
2. 输入框当前显式选择 agent
3. session 最近 agent
4. 无 agent

不能在不同入口各用各的规则。

---

## 九、服务端 API Spec

本项目建议新增以下 API。

## 1. 列表接口

### `GET /api/agents`

查询参数：

- `cwd?: string`

返回：

```ts
interface AgentSummary {
  name: string
  description: string
  mode: 'primary' | 'task' | 'all'
  scope: 'user' | 'project'
  source: string
  displayName?: string
  model?: string
  thinking?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
  steps?: number
  permission?: PermissionConfig
  enabled?: boolean
}
```

## 2. 详情接口

### `GET /api/config/agents/:name`

查询参数：

- `cwd?: string`

返回建议：

```ts
interface AgentDetail {
  name: string
  scope: 'user' | 'project'
  description: string
  display_name?: string
  mode: 'primary' | 'task' | 'all'
  model?: string | null
  thinking?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
  steps?: number
  enabled: boolean
  permission?: PermissionConfig
  prompt: string
  source: string
}
```

## 3. 创建接口

### `POST /api/config/agents/:name`

请求体：

```ts
interface CreateAgentPayload {
  description: string
  display_name?: string
  mode?: 'primary' | 'task' | 'all'
  model?: string | null
  thinking?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
  steps?: number
  enabled?: boolean
  permission?: PermissionConfig
  prompt?: string
  scope: 'user' | 'project'
  name?: string
}
```

规则：

- `scope` 创建时必填
- `name` 若存在，必须与路径参数一致
- `description` 必填
- `prompt` 必填

## 4. 更新接口

### `PUT /api/config/agents/:name`

请求体与创建接口相同，但：

- `scope` 可不传
- 未传字段表示保持不变
- 若改名，必须走专门 rename，不允许在 update 中偷偷改 `name`

## 5. 删除接口

### `DELETE /api/config/agents/:name`

查询参数：

- `scope: 'user' | 'project'`
- `cwd?: string`

规则：

- 必须精确删除对应 scope 的源文件
- 不能因为同名 user/project 冲突而误删另一份

---

## 十、错误码与校验规则

建议统一错误码：

- `INVALID_AGENT_NAME`
- `INVALID_AGENT_FRONTMATTER`
- `UNKNOWN_AGENT_FIELD`
- `INVALID_AGENT_MODE`
- `INVALID_AGENT_THINKING`
- `INVALID_AGENT_STEPS`
- `INVALID_AGENT_PERMISSION_SCHEMA`
- `MISSING_EDIT_FALLBACK_RULE`
- `INVALID_PERMISSION_PATTERN`
- `AGENT_NOT_FOUND`
- `AGENT_NAME_CONFLICT`
- `AGENT_SCOPE_REQUIRED`
- `AGENT_PROMPT_REQUIRED`
- `AGENT_DESCRIPTION_REQUIRED`

### 校验原则

- 所有错误都要返回明确原因
- 禁止“保存成功但运行时不生效”
- 禁止“默默忽略一个字段”

---

## 十一、里程碑

## M1：Discovery 与 YAML 解析落地

### 目标

建立稳定的 agent 资源发现与解析系统。

### 交付

- user / project 两级 agent 目录扫描
- `.md` frontmatter 解析
- YAML 全字段校验
- 同名覆盖规则
- discovery 测试

### 任务

- 新增 `packages/server/src/agents.js`
- 新增 `packages/server/src/agent-permissions.js`
- 实现 `discoverAgents(cwd)`
- 实现 frontmatter 解析与归一化
- 实现 permission normalize
- 补 discovery 单测

## M2：Agent 配置 CRUD 与文件写入

### 目标

让 agent 成为可编辑配置资源，而不是只读能力。

### 交付

- 列表接口
- 详情接口
- 创建 / 更新 / 删除接口
- frontmatter 序列化写回
- 错误码与严格校验

### 任务

- 设计 agent 文件写入器
- 设计 frontmatter 序列化器
- 增加 `/api/agents`
- 增加 `/api/config/agents/:name`
- 增加严格字段校验
- 补写 API 测试

## M3：主会话 agent 运行时注入

### 目标

让主会话真的能“使用 agent”。

### 交付

- session 选择 agent
- agent 切换触发 reload
- 应用 model / thinking / steps
- 应用正文 systemPrompt
- active tools 与 permission gate 生效

### 任务

- 在 session record 中增加 selectedAgentConfig
- 增加 agent 配置签名比较
- 增加 permission compile + setActiveToolsByName
- 增加 turn budget 计数
- 增加 selected agent 错误处理

## M4：输入框与 `@agent` 联动

### 目标

让输入框成为 agent 的真实入口。

### 交付

- 输入框 agent 选择器
- `@agent` 解析
- session 级 agent 记忆
- 发送 payload 带 agent

### 任务

- 扩展输入框状态模型
- 新增主会话可选 agent 列表接口消费
- 实现 `@agent` 最小解析器
- 定义优先级规则
- 补输入交互测试

## M5：Task Agent 与 Permission Gate 完整落地

### 目标

让 agent 系统真正完整，而不是只支持主会话。

### 交付

- task tool 只调用 `task/all`
- task agent 独立 session 执行
- permission gate 在主会话和 task 会话统一生效
- task metadata 返回

### 任务

- 实现 task agent prompt 注入
- 实现 task agent model / thinking / steps 应用
- 统一 permission gate extension
- 增加 task tool 返回摘要与 metadata
- 增加 task agent 端到端测试

---

## 十二、任务清单

## 服务端

- 实现 agent 目录定位与向上查找最近 `.pi/agents`
- 实现 `.md` frontmatter 解析
- 实现 YAML 全字段校验
- 实现 permission 规则编译
- 实现 active tools 裁剪
- 实现 `tool_call` gate extension
- 实现 agent 列表与详情 API
- 实现 create / update / delete API
- 实现主会话 agent 选择应用
- 实现 task agent 执行链路

## 前端

- 实现 agent 列表展示
- 实现 agent 编辑页
- 实现输入框 agent 选择器
- 实现 `@agent` 最小识别
- 实现 session 级 agent 记忆
- 实现 mode 区分展示
- 实现 permission 编辑 UI

## 测试

- discovery 测试
- YAML 校验测试
- permission 规则测试
- API 测试
- 主会话 agent 应用测试
- task agent 调用测试
- 输入框 `@agent` 测试

---

## 十三、验收标准

### Discovery 验收

- 能发现 `~/.pi/agent/agents`
- 能发现最近 `.pi/agents`
- 同名 project agent 能覆盖 user agent
- `enabled: false` 不出现在结果中
- 坏 YAML 不影响其他 agent

### YAML 验收

- 上文列出的所有字段都能被正确读取
- 未知字段会被拒绝
- `permission.edit` 规则对象必须带 `"*"`
- `write` 能正确折叠到 `edit`

### 运行时验收

- 主会话选中 `primary/all` agent 后真正生效
- `mode = task` 不能出现在主会话选择列表
- task tool 只能调用 `task/all`
- `model`、`thinking`、`steps`、正文 prompt 都真正影响会话
- `permission` 不只是展示，能真正阻断工具调用

### 输入框验收

- 输入框可显示可选 agent
- `@agent` 能识别第一处有效匹配
- 会话切换后 agent 记忆可恢复
- 发送时 agent 真正进入服务端执行链路

---

## 十四、明确不做

本 spec 明确不接受以下做法：

- 只做前端下拉框，不做服务端 discovery
- 只把 agent 名字透传，不做运行时注入
- 只做 `mode/model`，不做 `permission`
- 只支持一半 YAML 字段
- 继续兼容 OpenCode 历史 agent schema
- 用 RPC 假装支持 agent
- 未知字段静默忽略
- `permission` 只影响 UI，不影响 tool_call

## 结论

本项目的 agent 必须按 `openchamber` 当前 Pi-native 实现的完整链路来做，但要比它更严格：

- **字段必须支持全**
- **未知字段必须报错**
- **permission 必须真正生效**
- **主会话与 task 会话必须共用同一套 agent 资源系统**

只有这样，输入框里的 agent、task 工具里的 agent、服务端运行时里的 agent 才会是同一个系统，而不是三套互相对不上的假能力。