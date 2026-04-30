# 文件树功能自动化测试 Spec

## A. 文件树浏览

### A1 加载根目录

- 触发：GET /api/files/tree?root={workspaceDir}
- 预期：200，返回 `{ root, directory, entries[] }`
- entries 按 目录优先→名称字母序 排列
- 边界：root 为空 → 400 "File root is required"

### A2 展开目录

- 触发：GET /api/files/tree?root={root}&path={subDirPath}
- 预期：200，返回该目录的 entries
- 边界：path 不是目录 → 400 "Requested path is not a directory"

### A3 折叠目录

- 前端行为：从 expandedDirectories 移除路径，visibleNodes 不再包含其子节点
- 无 API 调用

### A4 展示加载状态

- isRootLoading=true 且 nodes=[] → 显示旋转 LoaderCircle + "加载中..."
- isLoading(path)=true → 子目录右侧显示旋转 LoaderCircle

### A5 展示空目录

- 展开的目录无子条目 → 显示斜体灰色 "空文件夹"

### A6 刷新树

- 清空 childrenByDirectory → expandedDirectories=[root] → loadDirectory(root, {force:true})
- 刷新按钮在加载时旋转动画

### A7 展示错误

- error 非空 → 红色边框卡片显示错误信息

## B. 文件操作

### B1 点击文件

- emit select(entry) → WorkspacePage 打开文件预览+标签页

### B2 行内重命名

- 触发：右键菜单"重命名" / startRename(entry)
- 行为：文件名处显示 input，自动选中扩展名前部分
- Enter → confirmRename → emit rename
- Escape → 取消，恢复原显示
- blur → confirmRename（等同 Enter）
- 边界：空名称 → 不 emit；与原名相同 → 不 emit

### B3 重命名提交（API）

- PATCH /api/files/entries/path
- body: { root, path, name }
- 预期：200，返回 { entry: FileTreeEntry }
- 边界：name 含 / 或 \ → 400；目标已存在 → 409

### B4 删除

- 触发：右键菜单"删除" → AlertDialog 弹出
- 确认 → emit delete(entry) → trashFileEntry → refreshTree
- 取消 → 关闭对话框

### B5 删除提交（API）

- DELETE /api/files/entries?root={root}&path={path}
- 预期：200，返回 { root, path, trashedAt }
- 行为：移到系统回收站（trash 库）

### B6 新建文件夹（树内）

- 触发：右键目录 → "新建文件夹"
- 行为：目录子节点末尾出现行内编辑行，默认名"未命名文件夹"
- Enter → emit create-folder({ parentPath, name })
- Escape → 取消
- blur → 等同 Enter

### B7 新建文件夹提交（API）

- POST /api/files/entries
- body: { root, directory, name, kind: "directory" }
- 预期：201，返回 { entry: FileTreeEntry }

### B8 新建笔记（工具栏）

- POST /api/notes
- body: { path: "笔记/未命名.md" }
- 预期：201，返回 { name, path, relativePath, size, updatedAt }
- 创建后 refreshTree + 打开文件

### B9 新建日记

- POST /api/notes
- body: { path: "日记/YYYY/MM/YYYY-MM-DD.md" }
- 预期：201

### B10 新建文件夹（工具栏）

- POST /api/notes/folder
- body: { path: "未命名文件夹" }
- 预期：201，返回 { name, path, relativePath }

### B11 新建 Canvas

- POST /api/files/create
- body: { path: "canvas/未命名.canvas", content: "{}" }
- 预期：201

### B12 新建 Base

- POST /api/workspace/base/create
- body: { name: "新数据库" }
- 预期：201

## C. 收藏

### C1 添加收藏

- 点击文件星标按钮 → favoritesStore.add → 琥珀色常显

### C2 取消收藏

- 点击已收藏星标 → favoritesStore.remove → 星标变淡

### C3 收藏 Tab 展示

- 切换到收藏 Tab → 显示收藏文件列表
- 空列表 → 图标 + "暂无收藏" + "在文件树中点击星标添加"

### C4 点击收藏文件

- emit select → 打开文件

## D. 搜索

### D1 搜索文件（API）

- GET /api/files/search?root={root}&q={query}&limit=50
- 预期：200，返回 { entries[] }
- 递归搜索文件名（大小写不敏感），最大深度 10
- 边界：q 为空 → Zod 校验失败 400；limit > 100 → 限制为 100

### D2 搜索防抖

- 前端 300ms 防抖后才调用 API
- 输入为空 → 清空结果，显示 "输入关键词搜索文件"

### D3 搜索无结果

- "未找到匹配文件"

### D4 搜索加载中

- 旋转 LoaderCircle

### D5 点击搜索结果

- emit select → 打开文件

## E. 最近文件

### E1 获取最近文件（API）

- GET /api/workspace/recent-files?root={root}&limit=20
- 预期：200，返回 { files[] }
- 递归遍历，按 modifiedAt 降序，上限 50

### E2 最近文件 Tab 展示

- 空列表 → "暂无最近文件"
- 加载中 → 旋转 LoaderCircle

### E3 点击最近文件

- emit select → 打开文件

## F. 图标映射

### F1 文件图标

- .md/.markdown → FileText
- .canvas → BookOpen
- .base → CheckSquare
- .png/.jpg/.jpeg/.gif/.svg/.webp/.ico/.bmp → FileImage
- .mp4/.mov/.avi/.mkv → FileVideo
- .mp3/.wav/.ogg/.flac → FileAudio
- .ts/.tsx/.js/.jsx/.vue/.py/.rs/.go/.java/.c/.cpp/.h/.css/.scss/.html/.json/.yaml/.yml/.toml/.sh/.sql → FileCode2
- 其他 → File

### F2 目录图标

- 展开 → FolderOpen
- 折叠 → Folder

## G. 右键菜单

### G1 文件右键菜单项

- 重命名
- 删除（destructive 色）
- 分隔线
- 收藏/取消收藏

### G2 目录右键菜单项

- 新建文件夹
- 重命名
- 删除（destructive 色）

---

## 覆盖率报告（2026-04-29）

### 后端测试 — 5 文件 / 51 用例

| 文件 | 用例 | 类型 |
|------|------|------|
| file-manager.test.ts | 4 | 内部方法单元 |
| file-tree-api.test.ts | 7 | 内部方法单元 |
| file-ops-api.test.ts | 9 | 内部方法单元 |
| notes-api.test.ts | 1 | 构造验证 |
| file-tree-http.test.ts | 30 | HTTP 集成测试 |

### 前端测试 — 3 文件 / 34 用例

| 文件 | 用例 | 类型 |
|------|------|------|
| useFileIcons.test.ts | 11 | 单元测试 |
| useFileTreeData.test.ts | 8 | composable 测试 |
| FileTreePanel.test.ts | 14 | 组件测试 |

### Spec 覆盖率

| Spec 类 | 功能点 | 已覆盖 | 覆盖率 |
|---------|--------|--------|--------|
| A.文件树浏览 | 8 | 8 | 100% |
| B.文件操作 | 12 | 10 | 83% |
| C.收藏 | 4 | 4 | 100% |
| D.搜索 | 5 | 5 | 100% |
| E.最近文件 | 3 | 3 | 100% |
| F.图标 | 2 | 2 | 100% |
| G.右键菜单 | 2 | 2 | 100% |
| **合计** | **36** | **34** | **94%** |

### 未覆盖（2个）
- B4: 删除 AlertDialog UI 交互（需 Dialog 渲染环境）
- B6: 新建文件夹行内编辑 UI 交互（需 Input 渲染 + 事件模拟）

### 补充覆盖（B4 + B6）

- B4 删除 AlertDialog：2 个组件测试（handleDelete 触发 AlertDialog / 确认后 emit delete）
- B6 新建文件夹行内编辑：3 个组件测试（startCreateFolder 显示输入框 / Enter 确认 emit / Escape 取消无 emit）

**Spec 覆盖率：36/36 = 100%**
