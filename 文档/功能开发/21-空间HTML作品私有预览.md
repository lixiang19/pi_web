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
- 空间作品进入隐藏版本管理。

## 关联设计

- `文档/项目设计/空间HTML作品.md`

## Spec 提取点

- 空间作品路径。
- 预览 API。
- iframe sandbox 配置。

## Spec 草案

### 路径

- `空间/<作品名>/index.html`

### API

- `GET /api/workspace/space`
- `GET /api/workspace/space/:id/preview-html`

### 行为

- 私有预览由主站读取 HTML。
- 前端使用 iframe `srcdoc` 渲染。
- iframe 必须 sandbox。
- 不生成公开 URL。

### 测试

- 点击空间作品打开预览标签。
- 返回 HTML 只能来自 `空间/`。
- iframe 无主站 cookie/API 权限。
- 同目录多文件资源第一版不保证可用。
