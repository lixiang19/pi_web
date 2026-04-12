# permission 审批对齐 opencode

## 背景
- 现有 `packages/server/src/agent-permissions.ts` 只支持 `allow/deny`
- 现有 `ask` 工具是问卷，不是权限审批
- 目标：对齐 opencode permission 设计，引入 `ask` 动作与 `once/always/reject` 运行时审批

## 已确认决策
- 配置层：`allow | ask | deny`
- 运行时审批：`once | always | reject`
- `always` 只在当前会话有效，不持久化
- `always` 白名单按当前工具输入生成最小建议模式
- 审批不是工具，只是正常工具调用前拦截层
- 前端新增独立 `PermissionRequestCard`
- 审批历史不单独保留
- 第一阶段覆盖现有整套 permission：简单权限 + `edit/write` 路径规则
- 规则对象未命中时默认 `allow`

## 实现摘要
### 服务端
- `AgentPermission` / `PermissionRule` / `CompiledPermissionPolicy` 升级到 `allow/ask/deny`
- 为所有 permission key 编译规则数组，未命中默认 `allow`
- `createPermissionGateExtension()` 从仅拦截 edit，升级为统一拦截全部 permission key
- 新增会话级 `pendingPermissionRecords` 与 `runtimePermissionRules`
- 新增 `permissionRequests` 快照字段
- 新增接口：`POST /api/sessions/:sessionId/permissions/:requestId/respond`

### 前端
- 新增 `PermissionInteractiveRequest`
- `usePiChat` 新增 `permissionRequests` 与 `respondToPendingPermission()`
- 新增 `PermissionRequestCard.vue`
- `WorkbenchMessageStream` / `WorkbenchChatPanel` / `WorkbenchPage` / `SessionDetailPage` 接入权限审批卡片

## 验证
- `npm run lint`
- `npm run check --workspace @pi/web`
- `npm run build --workspace @pi/server`

## 后续建议
- 如需更细粒度 bash 模式，可把命令前缀提炼成独立解析器
- 如需跨会话记住 always，再单独设计持久化层，不要污染当前会话态
