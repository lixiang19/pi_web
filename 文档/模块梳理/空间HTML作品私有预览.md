# 空间 HTML 作品私有预览

## 职责

空间模块负责列出工作空间 `空间/` 下的单文件 HTML 作品，并在 ridge 工作台内做私有预览。

## 入口

- 服务端：`packages/server/src/routes/workspace-space.ts`
- 前端 API：`packages/web/src/lib/api.ts`
- 前端状态：`packages/web/src/composables/useWorkspaceSpace.ts`
- 列表组件：`packages/web/src/components/workspace/SpaceView.vue`
- 预览组件：`packages/web/src/components/workspace/SpacePreviewTab.vue`
- 工作台接线：`packages/web/src/pages/WorkspacePage.vue`

## 路径契约

- 空间根目录固定为工作空间一级目录 `空间/`。
- 第一版作品路径固定为 `空间/<作品名>/index.html`。
- API 访问时自动确保 `空间/` 存在。
- 列表只枚举 `空间/` 一级子目录，且只有普通文件 `index.html` 存在时才返回作品。
- 作品 ID 由服务端用作品目录名生成，前端不传任意文件路径作为预览目标。
- 服务端读取前必须做 `ensureWithinRoot`、`.ridge` 系统目录边界和 realpath 边界检查，符号链接越界到工作空间外、`空间/` 外或隐藏 `.ridge` 段会被拒绝。

## API

- `GET /api/workspace/space`
  - 返回 `{ root, works }`。
  - `works` 按 `index.html` 修改时间倒序。
- `GET /api/workspace/space/:id/preview-html`
  - 返回 `{ id, name, indexPath, html }`。
  - 只读取对应作品目录下的 `index.html`。
  - 缺失 `index.html` 返回 404。
  - HTML 读取上限为 10 MB，避免把异常大文件塞进 `srcdoc`。

## 前端行为

- 左侧固定入口「空间」打开 `feature:space` 单例标签。
- 点击作品后打开 `space:<indexPath>` 标签。
- 同一作品重复点击只激活既有预览标签。
- 预览标签只展示 HTML，不提供公开 URL；编辑走普通文件能力。
- 文件预览区域打开 `空间/<作品名>/index.html` 时使用 `WorkspaceTextFileEditor` 做文本编辑保存。

## 安全边界

- 私有预览不生成公开 URL，也不提供静态文件访问路径。
- iframe 使用 `srcdoc` 和 `sandbox="allow-scripts"`。
- sandbox 不包含 `allow-same-origin`，预览文档没有主站同源权限，不能读取主站 cookie。
- CSP 必须在用户 HTML 的任何 active content 前生效：`default-src 'none'`、`connect-src 'none'`、`form-action 'none'`、`base-uri 'none'`、`navigate-to 'none'`，禁止 ridge API 调用、表单提交、导航和外联请求。
- 为保留便利性，允许 `script-src 'unsafe-inline'` 和 `style-src 'unsafe-inline'`，支持单文件 HTML 的内联交互脚本和样式。
- 第一版只允许内联资源以及 `data:`/`blob:` 图片、媒体、字体；不读取同目录 assets 或其他工作空间文件。

## 隐藏版本管理关系

- 空间作品是工作空间可见文件，不放入 `.ridge/` 或临时目录。
- 私有预览 API 仍只负责读取和预览。
- 空间 `index.html` 保存走 `PUT /api/files/content`，保存后写入 RAG immediate pending 并创建隐藏版本点。
- “空间作品进入隐藏版本管理”由工作空间级隐藏版本管理覆盖 `空间/` 目录，不由预览 API 生成保存点。
