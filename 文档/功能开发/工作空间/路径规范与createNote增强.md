# 路径规范与 createNote 增强

> 状态：✅ 已修复
> 优先级：P0 — 影响所有子功能

## 问题

1. **路径混乱**：有些地方用绝对路径，有些用相对路径，没有统一规范
2. **`createNote` API 不支持指定子目录**：只能创建到 workspace 根目录

### 当前路径使用现状

| 调用方                               | 路径类型                     | 正确性 |
| ------------------------------------ | ---------------------------- | ------ |
| `preview.openFile()`                 | 绝对路径                     | ✅     |
| `handleSelectFile` 的 entry.path     | 绝对路径                     | ✅     |
| `CalendarView` emit open-file        | 相对路径                     | ❌     |
| `DashboardView` emit open-file       | 绝对路径（来自 recentFiles） | ✅     |
| `handleCreateJournal` 的 journalPath | 绝对路径                     | ✅     |
| `createNote(name)`                   | 只接收文件名                 | ❌     |
| `InboxView.handleCapture`            | 传了相对路径但 API 忽略      | ❌     |

### createNote 当前签名

```ts
// 前端
export function createNote(name: string) { ... }
// 后端
app.post("/api/notes", (req) => { const { name } = req.body; ... })
```

只创建到 workspace 根目录，无法指定子目录。

## 修复方案

### 1. 路径规范

**规则**：前端内部统一用绝对路径（`workspaceDir + 相对路径`），只在调后端 API 时 strip 掉 `workspaceDir` 前缀转为相对路径。

### 2. createNote 增强

后端 `POST /api/notes` 增加 `path` 字段：

```json
// 请求
{ "name": "闪念_20260428_1530", "path": "收件箱/闪念_20260428_1530.md" }

// 无 path 时回退到旧行为（workspace 根目录）
{ "name": "新笔记" }
```

### 3. CalendarView 路径修正

emit open-file 时拼接绝对路径：`${workspaceDir}/日记/${year}/${month}/${dateStr}.md`

## 验收标准

- [x] createNote 支持指定 path 参数创建到子目录
- [x] handleCreateJournal 用 createNote({ path }) 创建到正确路径
- [x] handleCreateNote('收件箱') 创建到收件箱子目录
- [x] InboxView 闪念捕捉创建到收件箱子目录
- [x] CalendarView emit 的 open-file 路径为绝对路径
- [x] 所有子目录不存在时自动创建（后端 mkdir recursive）
