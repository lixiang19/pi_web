# 32 runtime bundle 与设备专属 Skill（已归档）

## 状态

已完成并纳入 V2 阶段 3 桌面端与本机项目上线闭环。

联合实现与测试证据见：

- `文档/功能开发/归档/45-V2阶段3桌面端与本机项目上线闭环.md`
- `文档/功能开发/归档/30-31-32-联合开发计划.md`

## 目标

实现服务器下发完整 ridge runtime bundle，保证桌面本机 Pi 运行一致。

## 范围

- 服务器生成 runtime bundle。
- 桌面端物化到 ridge 管理目录。
- 全局 Agent。
- 全局 Skill。
- 设备专属 Skill。
- MCP 配置。
- 工具配置。
- 权限配置。
- 模型配置。
- 启动上下文。
- 必要脚本和资源。

## 不做

- 不依赖纯内存注入。
- 不读取用户真实 `~/.pi` 作为 ridge 全局配置。
- 桌面本地配置不参与合并。

## 验收

- Pi 能 read 到 Skill 原始文件。
- 服务器下发覆盖桌面本地 ridge 运行配置。
- Mac-only/Chrome Skill 由服务器按设备分发。
- 项目 `.pi/agents`、`.pi/skills` 仍可覆盖全局资源。

## 关联设计

- `文档/项目设计/Agent权限与规划工具.md`
- `文档/项目设计/桌面端工作台与本机AI.md`

## Spec 提取点

- bundle manifest。
- 物化目录。
- 版本和覆盖策略。

## Spec 草案

### Manifest

- bundle_id
- device_id
- version
- agents
- skills
- mcp
- tools
- permissions
- model_config
- startup_context

### 行为

- 服务器生成完整 bundle。
- 桌面物化到 ridge 管理目录。
- 启动 Pi 时指向 bundle 文件路径。
- 桌面本地 ridge 配置被服务器覆盖。

### 测试

- Skill 原始文件可被 Pi read。
- Mac-only Skill 只下发给 Mac 设备。
- 项目 `.pi/skills` 覆盖全局 Skill。
- 不读取用户真实 `~/.pi` 作为 ridge 全局配置。
