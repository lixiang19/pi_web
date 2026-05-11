# Pi Web

Pi Web 是一个面向 Web 与桌面端的 Pi 对话工作台，目标参考 openchamber 的跨端能力，但前端技术栈切换为 Vue、Tailwind 和 shadcn-vue。

## 当前结构

- `packages/web`: Vue 3 + Vite 前端，负责桌面与移动端自适应界面
- `packages/server`: 基于 `@mariozechner/pi-coding-agent` 的 Node API 桥接层
- `packages/desktop`: Tauri 桌面壳，复用 Web 前端

## 本地开发

```bash
pnpm install
pnpm run dev
```

> 本仓库锁定 `pnpm`，且 `better-sqlite3`、`node-pty` 这类原生依赖依赖 `pnpm.onlyBuiltDependencies` 执行构建脚本；不要再用 `npm install`。

默认启动：

- Web: `http://127.0.0.1:80`
- API: `http://127.0.0.1:3000`
- 默认工作空间: `~/ridge-workspace`

## 桌面端开发

```bash
npm run dev:desktop
```

## 环境变量

- `PORT`: API 服务端口，默认 `3000`
- `RIDGE_ADMIN_PASSWORD`: 管理员登录密码
  - **生产环境（`NODE_ENV=production`）必须配置**，未配置时服务拒绝启动
  - 非 production/test 环境若未配置，默认使用 `ridge-admin`（仅用于本地开发）
  - 测试环境通过 `vi.stubEnv` 或进程环境变量设置，避免与开发/生产冲突

- 接入更多 Pi 会话能力，例如历史会话恢复、工具执行面板、计划模式和多代理流程
- 把桌面端从“复用 Web API”升级为真正的内嵌运行时/sidecar 模式
