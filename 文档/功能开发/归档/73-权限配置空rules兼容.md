# 73 权限配置空 rules 兼容

## 背景

本机 `~/.pi/agent/permissions.json` 可能只有旧占位内容：

```json
{
  "rules": []
}
```

旧解析器只接受 `default`、`defaults`、`locked` 三个顶层 key，导致后台 Agent 加载全局权限时抛出 `Unsupported global permissions config key: rules`，闪念分析随即失败。

## 改动

- `loadGlobalPermissionConfig()` 兼容空的顶层 `rules: []`，语义等同于无全局权限配置。
- 非空 `rules` 仍保持拒绝，避免未知规则数组被静默忽略。
- runtime bundle 的 `permissions.json` schema 同步允许空 `rules: []`。
- 修正 `mapToolToLogicalPermission()`：只有 `subagent` 主工具映射到 `subagent` 权限，`steer_subagent` 和 `get_subagent_result` 不单独生成权限审批；工具移除逻辑仍随 `subagent: deny` 移除三者。

## 验证

- `pnpm --filter @pi/server exec vitest run src/__tests__/planning-tools.test.ts`

