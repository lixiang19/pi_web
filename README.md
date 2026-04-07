# Pi Web

Pi Web 是一个面向 Web 与桌面端的 Pi 对话工作台，目标参考 openchamber 的跨端能力，但前端技术栈切换为 Vue、Tailwind 和 shadcn-vue。

## 当前结构

- `packages/web`: Vue 3 + Vite 前端，负责桌面与移动端自适应界面
- `packages/server`: 基于 `@mariozechner/pi-coding-agent` 的 Node API 桥接层
- `packages/desktop`: Tauri 桌面壳，复用 Web 前端

## 本地开发

```bash
npm install
npm run dev
```

默认启动：

- Web: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:3000`

## 桌面端开发

```bash
npm run dev:desktop
```

## 环境变量

- `PORT`: API 服务端口，默认 `3000`
- `PI_WORKSPACE_DIR`: Pi 会话默认工作目录，默认项目根目录

## 下一步

- 接入更多 Pi 会话能力，例如历史会话恢复、工具执行面板、计划模式和多代理流程
- 把桌面端从“复用 Web API”升级为真正的内嵌运行时/sidecar 模式