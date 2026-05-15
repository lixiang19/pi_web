# 21 空间 HTML 作品私有预览

## 目标

实现 `空间/` HTML 作品和私有预览。

## 范围

- 创建 `空间/`。
- AI 保存 `空间/<作品名>/index.html`。
- 空间作品列表。
- 点击打开空间预览标签。
- 主站后端读取 HTML。
- iframe `srcdoc` 渲染。
- iframe sandbox。

## 不做

- 第一版不做公开发布。
- 第一版私有作品只支持单文件 HTML。
- 空间预览不提供编辑器。
- 私有预览不读取工作空间文件。

## 验收

- 私有作品不生成独立访问 URL。
- HTML 不能调用 ridge API。
- HTML 不能获取主站登录态。
- 空间作品进入隐藏版本管理：本任务不新增保存链路；空间作品作为工作空间可见文件，依赖后续/现有工作空间隐藏版本管理覆盖 `空间/` 目录，不能由预览 API 单独证明。

## 关联设计

- `文档/项目设计/空间HTML作品.md`

## Spec 提取点

- 空间作品路径。
- 预览 API。
- iframe sandbox 配置。

## Spec 草案

### 路径

- `空间/<作品名>/index.html`
- 启动和接口访问时自动确保 `空间/` 存在。
- 作品 ID 由服务端根据作品目录名生成，前端不得提交任意文件路径作为预览目标。
- 第一版只枚举 `空间/` 的一级子目录；只有存在普通文件 `index.html` 的目录才算作品。
- 路径解析必须同时做词法边界、`.ridge` 系统目录边界和 realpath 边界检查；符号链接到工作空间外、`.ridge/` 或非 `空间/` 目录的内容不能被读取。

### API

- `GET /api/workspace/space`
- `GET /api/workspace/space/:id/preview-html`
- 直接请求缺失 `index.html` 的作品 ID 必须返回 404，不得变成 500。

返回形态：

```ts
interface SpaceWorkItem {
  id: string;
  name: string;
  path: string;
  indexPath: string;
  size: number;
  modifiedAt: number;
}

interface SpacePreviewHtmlResponse {
  id: string;
  name: string;
  indexPath: string;
  html: string;
}
```

### 行为

- 私有预览由主站读取 HTML。
- 前端使用 iframe `srcdoc` 渲染。
- iframe 必须 sandbox。
- 不生成公开 URL。
- 点击左侧「空间」入口打开作品列表；点击作品在工作台中打开 `space_preview` 标签。
- 同一作品重复点击只激活已有预览标签。
- 预览页只展示，不提供编辑器；需要编辑时走普通文件能力。

### 测试

- 点击空间作品打开预览标签。
- 返回 HTML 只能来自 `空间/`。
- iframe 无主站 cookie/API 权限。
- 同目录多文件资源第一版不保证可用。

### 安全与便利性取舍

- 保留便利性：空间预览允许单文件 HTML 内联 CSS 和内联 JS，支持原型、图表、交互 demo 的本地交互。
- 安全默认：iframe 使用 `sandbox="allow-scripts"`，不授予 `allow-same-origin`，因此预览文档是 opaque origin，不能获取主站同源权限或 cookie。
- API 防护：在任何用户 HTML active content 前注入 CSP，`default-src 'none'`、`connect-src 'none'`、`form-action 'none'`、`base-uri 'none'`、`navigate-to 'none'`，即使内联 JS 运行也不能调用 ridge API 或发起外联请求。
- 资源边界：第一版只支持内联资源和 `data:`/`blob:` 图片、媒体、字体；不读取工作空间文件，不提供公开静态访问 URL。

### 实现步骤

1. 先补测试：
   - 服务端集成测试覆盖列表、读取 HTML、非 `空间/` id 拒绝、缺 `index.html` 不出现在列表、直接读取缺 `index.html` 返回 404、`.ridge` 和符号链接越界拒绝。
   - 前端组件测试覆盖作品列表加载、错误/空状态、点击打开预览标签。
   - 预览组件测试覆盖 iframe `srcdoc`、`sandbox="allow-scripts"`、CSP 禁止 `connect-src`、CSP 早于用户脚本和不包含 `allow-same-origin`。
2. 实现服务端：
   - 新增 `workspace-space` router。
   - 在 `index.ts` 注册 router。
   - 在 `@pi/protocol` 增加空间作品类型。
3. 实现前端：
   - 新增 API 方法与 `useWorkspaceSpace`。
   - 新增 `SpaceView` 和 `SpacePreviewTab`。
   - 工作台左侧增加「空间」固定入口，替换原占位 `space_preview` 渲染。
4. 文档收尾：
   - 更新 `文档/模块梳理/工作台Shell与标签系统.md`。
   - 新增或更新空间模块梳理。
   - 更新 `文档/记忆/MEMORY.md`。
   - 完成后归档本任务文档。
