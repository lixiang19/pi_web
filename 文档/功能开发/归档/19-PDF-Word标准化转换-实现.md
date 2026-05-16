# 19 PDF Word 标准化转换 — 实现文档（已归档历史版本）

> **⚠️ 状态：已归档（2026-05-13）**
> 
> 此文档描述的是**旧版纯 JavaScript 自研转换栈**的实现，已于任务 41 迁移为调用独立 Python 通用转化服务。
> 当前正式实现见 `41-Python通用转化服务契约消费实现.md`。

---

## 历史目标

实现 PDF、Word 文件的标准化转换流程，作为 ridge 知识资产化的核心环节。

## 历史范围

1. 上传 PDF/Word 后自动触发后台转换任务；
2. ~~纯 JavaScript 实现，不引入 Python 或外部服务依赖；~~ → 已迁移至 Python 服务
3. 生成四类产物：
   - `<name>.md` — Markdown 正文
   - `<name>.assets/` — 提取的图片资源
   - `<name>.metadata.json` — 元数据
   - `.originals/<original>` — 原文件归档
4. 转换失败保留原文件并记录状态（`convert_failed`）；
5. 用户编辑过的 Markdown 不会被自动覆盖，重新转换需手动确认；
6. 集成现有 `file_processing_status` 状态机和 `background_jobs` 队列。

## 已废弃的技术方案

### 旧依赖（仅保留在 `file-converter.ts` 供历史参考）

- ~~`@pdf2md/core@0.2.0` — 纯 JS PDF 到 Markdown~~
- ~~`mammoth@1.9.0` — Word `.docx` 到 HTML~~
- ~~`turndown@7.2.0` — HTML 到 Markdown~~

### 旧模块

1. ~~`file-converter.ts` — 本地 JS 转换实现~~ → 仅保留为历史参考，不用于业务路径
2. ~~`file-conversion-worker.ts` — 本地 worker 调用 `convertFileToStandard`~~ → 已重写为 Python 服务调用

## 迁移后状态

- **当前转换路径**：ridge Node 后端 → HTTP 调用独立 Python 通用转化服务 → 产物下载 → `writeArtifactsToWorkspace` 落盘
- **旧本地 JS 转换栈**：`file-converter.ts` 保留但不用于任何业务代码
- **产物结构不变**：仍生成 `.md`、`.assets/`、`.metadata.json`、`.originals/`

## 关联模块

- `文件处理状态模块契约.md` — 状态机已就绪
- `background-jobs.ts` — 队列基础设施
- `file-manager.ts` — 文件系统边界
- `41-Python通用转化服务契约消费实现.md` — 当前正式实现

## 验收标准（历史）

- [x] `npm run check` 通过
- [x] 测试全部通过
- [x] 文档归档
