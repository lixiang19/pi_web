# 69 external_directory 权限对齐

## 目标

对齐 OpenCode `external_directory` 权限语义：当 Agent 工具访问当前会话 `cwd` 之外的路径时，先经过独立权限审批。

## 需求来源

- OpenCode 权限文档：`external_directory` 用于允许工具访问启动工作目录之外的路径。
- 默认行为：外部目录访问默认为 `ask`。
- 已授权外部目录继续叠加普通工具权限，例如保留读取，同时用 `edit` 规则阻止修改。

## 实现

- 新增逻辑权限键 `external_directory`，同步 server 类型、协议类型、runtime bundle `permissions.json` schema。
- `compileAgentPermission` 在未配置时注入默认规则 `{ "*": "ask" }`。
- `createPermissionGateExtension` 在普通工具权限前先检测外部路径；命中后先处理 `external_directory`。
- 路径类规则支持 `~` 和 `$HOME` 开头的模式，便于对外部目录配置 `read` / `edit` 规则。
- 外部路径检测覆盖路径输入工具和常见 `bash` 路径参数。

## 验收

- 外部路径默认需要审批。
- `~/...` 配置可允许指定外部目录。
- 已允许外部目录后，`edit` 仍可通过路径规则拒绝修改。
- `cwd` 内部路径不触发 `external_directory`。
- 根目录 `npm run check` 已通过，文档已归档。
