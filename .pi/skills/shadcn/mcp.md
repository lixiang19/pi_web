# shadcn-vue MCP

shadcn-vue CLI 提供了 MCP 配置初始化能力。

## 初始化

```bash
npx shadcn-vue@latest mcp init --client <client>
```

可选 client：

- `claude`
- `cursor`
- `vscode`
- `codex`
- `opencode`

## 建议流程

1. 先在项目目录下运行 `npx shadcn-vue@latest info`
2. 确认 `components.json`、`aliases`、`resolvedPaths`、`tailwindCssFile`
3. 再执行 `mcp init --client <client>` 生成对应 MCP 配置
4. 生成后回读配置文件，确认路径与客户端位置正确

## 说明

- 这个能力属于 **shadcn-vue**，不是 React 官方 `shadcn` CLI
- 当前技能只确认 `mcp init` 是真实可用命令
- 项目配置判断仍然以 `npx shadcn-vue@latest info` 为准
- 不要在这里继续引用 `npx shadcn@latest info` 或 `ui.shadcn.com` 那套官方 React CLI 工作流
