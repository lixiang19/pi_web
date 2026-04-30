---
workflow: 对比分析
task: 对比 @tintinweb/pi-subagents 与项目内 task 子代理的功能差异
state_path: 文档/功能开发/2026-04-28_子代理系统对比分析_状态.json
---

# 子代理系统对比分析：@tintinweb/pi-subagents vs 项目 task

- 日期：2026-04-28
- 关联方案：[内嵌子代理运行时方案](./2026-04-11_内嵌子代理运行时_方案.md)

## 1. 背景

项目当前在 `packages/server/src/subagents.ts` 中实现了 `task` / `steer_subagent` / `get_subagent_result` 三个工具驱动的子代理系统。社区中存在一个成熟的 Pi 扩展 `@tintinweb/pi-subagents`（v0.5.2），功能定位相同但实现深度不同。本文档记录两者的功能差异，为后续迭代提供参照。

## 2. 共同能力

两者共享以下核心能力：

| 能力              |      pi-subagents      |       项目 task       |
| ----------------- | :--------------------: | :-------------------: |
| 启动子代理        |      `Agent` 工具      |      `task` 工具      |
| 前台/后台执行     |  `run_in_background`   |  `run_in_background`  |
| 中途转向          |    `steer_subagent`    |   `steer_subagent`    |
| 获取结果          | `get_subagent_result`  | `get_subagent_result` |
| 继承父会话上下文  |   `inherit_context`    |   `inherit_context`   |
| 自定义模型        | `model`（fuzzy 匹配）  |  `model`（精确指定）  |
| thinking 级别     |      off ~ xhigh       |      off ~ xhigh      |
| 最大轮次限制      | `max_turns` + 优雅关闭 | `max_turns`（硬中止） |
| 自定义 agent 类型 |   `.pi/agents/*.md`    |   `.pi/agents/*.md`   |
| skill 预加载      |  `skills` frontmatter  | `skills` frontmatter  |

## 3. 项目 task 独有能力

### 3.1 细粒度权限系统

项目实现了 `AgentPermission`，支持 per-tool `allow/ask/deny` + glob 路径模式匹配：

```yaml
permission:
  read: allow
  edit:
    "src/**": allow
    "*": ask
  bash: deny
```

pi-subagents 只有 `tools`（白名单）+ `disallowed_tools`（黑名单）的粗粒度控制。

### 3.2 交互式权限审批

`createPermissionGateExtension` 在 `tool_call` 事件上拦截，子代理执行时可动态弹窗请求用户批准：

```ts
requestPermission?: (request) => Promise<'once' | 'always' | 'reject'>
```

pi-subagents 无此机制，权限完全由配置决定。

### 3.3 Agent Mode 区分

- `primary`：仅主会话可用
- `task`：专供子代理调用
- `all`：两者皆可

`task` 工具会拒绝 `mode: 'primary'` 的 agent，防止子代理滥用主会话专属 agent。

### 3.4 资源隔离感知

项目通过 `isPiResourceIsolationEnabled()` 控制 agent 目录搜索范围，在隔离模式下不搜索全局 `~/.pi/`，增强多租户安全性。

## 4. @tintinweb/pi-subagents 独有能力

### 4.1 并发队列

- 可配置并发上限（默认 4）
- 超出自动排队，运行中完成一个则启动下一个
- 项目 task 无并发控制，同时启动大量子代理不受限制

### 4.2 优雅关闭（Graceful Max Turns）

到达 `max_turns` 时的三阶段关闭：

1. 注入 "Wrap up immediately" 转向消息
2. 给予最多 5 轮宽限期完成收尾
3. 宽限期过后才硬中止

项目 task 到达 `max_turns` 直接 `session.abort()`，输出可能被截断。

### 4.3 会话恢复（Resume）

`resume` 参数可恢复之前完成的子代理会话，保留完整对话上下文继续工作。

### 4.4 Git Worktree 隔离

`isolation: worktree` 在独立 git worktree 中运行子代理：

- 自动创建临时 worktree
- 完成后如有变更，自动提交到 `pi-agent-<id>` 分支
- 无变更则自动清理

### 4.5 持久化 Agent 记忆

三种 scope 的跨会话记忆：

| Scope     | 位置                              | 用途                   |
| --------- | --------------------------------- | ---------------------- |
| `project` | `.pi/agent-memory/<agent>/`       | 团队共享（可提交）     |
| `local`   | `.pi/agent-memory-local/<agent>/` | 机器专属（gitignored） |
| `user`    | `~/.pi/agent-memory/<agent>/`     | 全局个人记忆           |

只读 agent 自动获得只读记忆访问，防止权限提升。

### 4.6 事件总线

```ts
pi.events.on('subagents:completed', (event) => { ... })
```

6 种生命周期事件：`created` / `started` / `completed` / `failed` / `steered` / `ready`

### 4.7 跨扩展 RPC

其他 Pi 扩展可通过事件总线编程调用：

- `subagents:rpc:ping` — 检测可用性
- `subagents:rpc:spawn` — 远程启动子代理
- `subagents:rpc:stop` — 远程停止子代理

标准化回复信封 + protocol versioning。

### 4.8 Group Join 通知策略

| 模式            | 行为                                    |
| --------------- | --------------------------------------- |
| `smart`（默认） | 同一轮启动 ≥2 个后台 agent 自动合并通知 |
| `async`         | 每个 agent 独立通知                     |
| `group`         | 强制合并，即使只有 1 个                 |

30s 超时 + 15s 二次批窗口，防止永远等待。

### 4.9 丰富的 UI

| 组件        | 功能                                                                 |
| ----------- | -------------------------------------------------------------------- |
| Live Widget | 编辑器上方持久显示：动画 spinner、实时工具活动、token 统计、状态图标 |
| 对话查看器  | `/agents` 打开实时滚动对话覆盖层，自动跟踪新内容                     |
| 管理 UI     | `/agents` 交互菜单：弹出(eject)、禁用、创建(手动/AI生成)、设置       |
| 样式化通知  | 后台完成渲染主题化通知框，非原始 XML                                 |

### 4.10 Prompt Mode

- `replace`：agent body 是完整系统提示（独立 agent）
- `append`：agent body 追加到父 prompt（"父双胞胎" agent）

项目 task 总是 `replace` 模式。

### 4.11 其他

| 能力           | 说明                                           |
| -------------- | ---------------------------------------------- |
| Fuzzy 模型选择 | `"haiku"` 自动解析为完整 model ID              |
| 大小写不敏感   | agent 类型名忽略大小写                         |
| Eject 机制     | 内置 agent 可"弹出"为 `.md` 文件自定义         |
| 输出文件       | 自动写入 `.pi/output/agent-*.jsonl` transcript |

## 5. 总结矩阵

| 维度           |         pi-subagents          |                    项目 task                     |
| -------------- | :---------------------------: | :----------------------------------------------: |
| **成熟度**     |       ⭐⭐⭐ 22 个版本        |                   ⭐ 核心可用                    |
| **权限精细度** |      ⭐ 粗粒度白/黑名单       | ⭐⭐⭐ per-tool allow/ask/deny + glob + 交互审批 |
| **并发控制**   |       ⭐⭐⭐ 可配置队列       |                      ⭐ 无                       |
| **优雅关闭**   |         ⭐⭐⭐ 三阶段         |                    ⭐ 硬中止                     |
| **会话恢复**   |         ⭐⭐⭐ resume         |                      ⭐ 无                       |
| **隔离**       |        ⭐⭐⭐ worktree        |                      ⭐ 无                       |
| **跨会话记忆** |        ⭐⭐⭐ 三 scope        |                      ⭐ 无                       |
| **可扩展性**   |     ⭐⭐⭐ 事件总线 + RPC     |                  ⭐ 无扩展接口                   |
| **通知策略**   |       ⭐⭐⭐ Group Join       |                   ⭐ 直接返回                    |
| **UI**         | ⭐⭐⭐ widget + viewer + 管理 |                   ⭐ 无专用 UI                   |
| **Agent Mode** |             ⭐ 无             |             ⭐⭐⭐ primary/task/all              |
| **资源隔离**   |             ⭐ 无             |               ⭐⭐⭐ 感知隔离模式                |

## 6. 迭代建议

基于对比，项目 task 的优势在**权限体系**，短板在**运行时管理与 UI**。建议按优先级分三步：

1. **高优**：优雅关闭 + 会话恢复 — 直接影响输出质量，且实现成本不高
2. **中优**：并发队列 + 事件总线 — 多子代理场景的稳定性和可扩展性保障
3. **低优**：Group Join + Worktree + 记忆 + UI — 锦上添花，按用户需求逐步引入

项目的细粒度权限和 Agent Mode 设计是架构层面的优势，pi-subagents 没有对应能力，应保持并强化。
