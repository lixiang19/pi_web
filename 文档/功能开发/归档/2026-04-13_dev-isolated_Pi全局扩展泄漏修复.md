# dev:isolated Pi 全局扩展泄漏修复

- 状态：已完成
- 日期：2026-04-13
- Owner：AI / ridge

## 1. 问题

- `npm run dev:isolated` 目标是切断 `~/.pi/agent` 的全局资源，让平台只消费项目内 `.pi` 资源。
- 实际运行时，`/Users/lixiang/.pi/agent/extensions/guard.ts` 仍然在平台内生效，说明隔离没有真正作用到 Pi runtime。

## 2. 根因

- 服务端此前只把隔离目录传给了 `DefaultResourceLoader`。
- 主会话、恢复会话、临时 catalog 会话、子代理会话在调用 `createAgentSession()` 时，仍然使用 `SettingsManager.create(cwd)`。
- Pi runtime 扩展执行不只取决于资源扫描器，也取决于会话运行时持有的 `settingsManager`。两者作用域不一致时，隔离模式就会重新回落到全局 `~/.pi/agent`。

## 3. 修复

- 在 `packages/server/src/pi-resource-scope.ts` 收敛出唯一入口 `createPiAgentScopeSettingsManager(cwd)`。
- 让 `DefaultResourceLoader` 和 `createAgentSession()` 全部共用这一入口。
- 覆盖四条链路：
  - 主会话创建
  - 会话恢复
  - 临时 catalog 会话
  - 子代理会话

## 4. 结果

- `RIDGE_PI_ISOLATED=1` 时，运行时不再读取全局 `~/.pi/agent/extensions`。
- 项目级 `.pi` 资源保留。
- auth/models/sessions 仍然继续使用全局链路，不影响登录、模型注册和现有会话索引。

## 5. 验证

- 通过：`pnpm exec eslint packages/server/src/pi-resource-scope.ts packages/server/src/index.ts packages/server/src/subagents.ts`
- 通过：`pnpm --filter @pi/server exec tsc --noEmit -p tsconfig.json`

## 6. 结论

- Pi 资源隔离不能只做资源发现层。
- 只要 `createAgentSession()` 和 `DefaultResourceLoader` 不共享同一 `agentDir`，全局扩展就一定会漏回运行时。