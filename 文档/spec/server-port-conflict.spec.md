# Server 端口占用处理 Spec

## 背景

开发环境默认 server 监听 `PORT || 3000`，web Vite proxy 固定转发到 `127.0.0.1:3000`。当 3000 已被残留 server 占用时，`httpServer.listen` 触发 `EADDRINUSE`，当前进程因未捕获 `error` event 直接崩溃，日志也误导为 ridge.db 初始化失败。

## 目标

- server 监听失败必须转为 `startServer()` rejection，不允许未捕获 error event。
- `EADDRINUSE` 必须输出明确端口占用提示。
- web proxy 必须与 server 使用同一个 `PORT` 环境变量，便于临时换端口。

## 验收

- 已占用端口时，监听 Promise 以 `EADDRINUSE` 失败。
- `npm run check` 通过。
- 临时端口可通过 `PORT=3001 npm run dev` 同时影响 server 和 web proxy。
