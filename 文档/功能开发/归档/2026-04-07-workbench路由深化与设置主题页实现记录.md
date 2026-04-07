# Workbench 路由深化与设置主题页实现记录

## 目标

- 继续消化单页工作台，把页面壳、导航、主题页、设置页、会话详情页真正落到 `vue-router` 上。
- 将 `useWorkbenchPage.ts` 中混合的会话派生状态与资源选择器状态继续拆分，避免新的页面继续把逻辑往一个 composable 里堆。
- 让主题系统不再只是启动时注入默认值，而是支持运行时切换并持久化。

## 实现结果

### 1. 共享页面壳与导航

- 新增 `packages/web/src/layouts/PlatformShell.vue`
- 路由升级为嵌套路由：
  - `/` -> 工作台
  - `/settings` -> 设置页
  - `/themes` -> 主题页
  - `/sessions/:sessionId` -> 会话详情页
- 共享壳统一承担背景、页面标题和顶部导航，页面不再重复实现同一套外框。

### 2. workbench 状态继续拆分

- 新增 `packages/web/src/composables/useWorkbenchSessionState.ts`
  - 会话标题
  - 草稿态判断
  - 目录根推导
  - 模型 / thinking / agent 下拉动作
  - 左侧会话导航动作
- 新增 `packages/web/src/composables/useWorkbenchResourcePicker.ts`
  - slash 触发器
  - prompt / skill / command 过滤
  - 资源注入
  - 资源目录刷新
- `useWorkbenchPage.ts` 收缩为组合层，不再自己承载所有细节。

### 3. 主题页与持久化

- 新增 `packages/web/src/pages/ThemesPage.vue`
- 新增 `packages/web/src/composables/useThemePreferences.ts`
- `packages/web/src/lib/theme.ts` 现在支持：
  - 读取已存储主题偏好
  - 应用主题时写回 localStorage
  - 启动时恢复用户上次选择

### 4. 新页面

- `packages/web/src/pages/SettingsPage.vue`
  - 汇总 SDK 版本、会话数、agent 数量、当前工作区与导航入口
- `packages/web/src/pages/SessionDetailPage.vue`
  - 聚焦单个会话的元信息、消息流和目录上下文

## 验证

- 执行 `cd packages/web && npm run check`
- 结果：`vue-tsc --noEmit` 通过

## 影响

- 路由层已经具备继续扩展页面的稳定外框，不需要再把设置、主题等能力塞回工作台首页。
- workbench 页面派生逻辑已经从“一个大 composable”转成“组合层 + 细分派生层”，后续继续拆输入区或会话详情时边界更清楚。
- 主题系统已经具备真实用户偏好语义，而不是每次刷新都回到默认主题。

## 后续建议

- 把会话详情页进一步扩展为只读/可编辑双模式，并接入更多 session 元数据。
- 给设置页继续接入 provider、agent 资源和工作区级偏好配置。