# Agent 权限与规划工具

## Agent 类型

第一版明确三类前台/运行系统 Agent：

- 默认助手；
- 任务 Agent；
- 闪念 Agent。

系统 Agent 作为内置 Agent 或默认模板存在，用户可以覆盖。

用户也可以新增和编辑自定义 Agent。

后台专用 Agent 另见 [后台 Agent 系统](./后台Agent系统.md)。

## Agent 发现与作用域

沿用 Pi 现有 Agent 发现机制。

来源：

- 内置默认 Agent；
- 用户级 Agent；
- 项目级 `.pi/agents`。

Agent mode 沿用：

- `primary`；
- `task`；
- `all`。

项目级 Agent 优先于用户级 Agent。

## 设备运行时配置

设备运行 Pi 时不覆盖设备真实 `~/.pi`。

服务器向设备下发完整 ridge runtime bundle。

不能依赖纯内存注入。

Pi 读取 Agent、Skill、脚本和资源时，需要真实文件系统路径。

实现原则：

- 服务器全局配置作为运行时基底；
- 服务器生成完整运行包；
- 桌面端把运行包物化到 ridge 管理目录；
- Pi 启动时通过运行时配置指向该运行包；
- 不污染用户本机真实 Pi 配置；
- 项目目录中的 `.pi` 资源仍从项目现场发现；
- 项目级资源覆盖服务器运行包中的全局资源。

运行包至少包含：

- 全局 Agent；
- 全局 Skill；
- 设备专属 Skill；
- MCP 配置；
- 工具配置；
- 权限配置；
- 模型配置；
- 启动上下文；
- 必要脚本和资源文件。

桌面端本地已有配置不参与合并。

服务器下发覆盖桌面本地 ridge 运行配置。

模型密钥由服务器注入，不要求桌面设备本机配置云模型密钥。

## Skill

Skill 沿用 Pi 资源发现机制。

来源：

- 服务器运行包中的全局 Skill；
- 服务器运行包中的设备专属 Skill；
- 项目级 `.pi/skills`。

项目级 Skill 优先于全局 Skill。

设备专属 Skill 由服务器管理和分发。

例如操作 Mac、操作 Chrome 的 Skill 只分发给符合条件的 Mac 桌面设备。

桌面端只负责执行，不负责选择或保留本地 Skill 配置。

## 权限模型

权限模型沿用当前 `allow / ask / deny` 规则。

权限键包括：

- `read`；
- `grep`；
- `find`；
- `ls`；
- `bash`；
- `edit`；
- `ask`；
- `task`；
- `subagent`。

Agent 工具权限边界受当前运行位置限制。

- 工作空间会话只能操作工作空间。
- 项目会话只能操作项目目录。
- 设备离线时不能运行该设备项目会话。

运行时用户选择 `always` 授权时，保留运行时授权规则。

全局权限通过服务器级 `~/.pi/agent/permissions.json` 配置。

- 没有 `permissions.json` 或没有配置某个权限键时，默认仍是开启。
- `default` / `defaults` 表示全局默认权限，可被 Agent 自己的 `permission` 显式覆盖。
- `locked` 表示全局硬拒绝，只接受 `deny`，优先于 Agent 权限和运行时 `always` 授权。
- 需要默认关闭任务规划工具时，配置 `default.task: deny`；需要使用规划工具的 Agent 再显式配置 `permission.task: allow`。
- 需要默认关闭子代理时，配置 `default.subagent: deny`；需要使用子代理的 Agent 再显式配置 `permission.subagent: allow`。
- 需要永远禁止读取的文件路径放入 `locked.read`。

## 规划工具

规划工具是正式任务系统写入工具。

它可以：

- 创建任务；
- 更新任务；
- 创建里程碑；
- 更新里程碑；
- 移动任务到里程碑；
- 设置阻塞；
- 设置审核中。

它不能：

- 把任务改为完成；
- 把里程碑改为完成。

规划工具默认所有 Agent 都可用；如果全局 `default.task` 配置为 `deny`，则只有显式 `permission.task: allow` 的 Agent 可用。

规划工具纳入 `task` 权限，按 Agent 权限规则决定 `allow / ask / deny`。

## Todo 工具

todo 是 Pi 自定义工具，不属于正式任务系统。

- 任何会话都可使用。
- 内容保存在当前 Pi 会话内。
- 不需要权限审批。
- 不自动创建正式任务或里程碑。

## 子代理

保留现有 subagent 能力。

- 子代理主工具名为 `subagent`。
- 子代理主工具权限键为 `subagent`。
- 辅助工具 `steer_subagent`、`get_subagent_result` 不单独生成权限审批，可用性跟随 `subagent` 主工具。
- 子代理是真实持久子会话。
- 子代理使用自己的 Agent 配置。
- 子代理权限仍受 Agent 权限和运行位置约束。
