# 数据库 Bases — 后端 API

> 状态：设计阶段
> 优先级：P1
> 拆自：数据库Bases细化.md

## 1. API 总览

| 端点                         | 方法   | 说明              |
| ---------------------------- | ------ | ----------------- |
| `/api/workspace/base`        | GET    | 读取 .base 文件   |
| `/api/workspace/base`        | PUT    | 保存 .base 文件   |
| `/api/workspace/base/create` | POST   | 创建新 .base 文件 |
| `/api/workspace/base`        | DELETE | 删除 .base 文件   |

## 2. GET — 读取 Base

### 2.1 请求

```
GET /api/workspace/base?path=数据库/任务.base
```

### 2.2 响应

```json
{
  "name": "任务",
  "columns": [...],
  "sources": [],
  "rows": [
    {
      "id": "r001",
      "type": "independent",
      "cells": { "c001": "完成设计文档", "c002": "进行中" }
    },
    {
      "id": "r002",
      "type": "file",
      "path": "项目/调研.md",
      "cells": { "c001": "调研笔记", "c003": "2026-05-01" },
      "fileTitle": "调研"
    }
  ],
  "views": [...],
  "activeViewId": "v001"
}
```

### 2.3 后端处理

```ts
// packages/server/src/index.ts 约 2974 行
app.get("/api/workspace/base", async (req, res, next) => {
  const relPath = req.query.path;
  const fullPath = path.join(defaultWorkspaceDir, relPath);
  const content = await fs.readFile(fullPath, "utf-8");
  const baseData = JSON.parse(content);

  // 解析文件引用行：读取 frontmatter 合并到 cells
  for (const row of baseData.rows ?? []) {
    if (row.type === "file" && row.path) {
      const filePath = path.join(defaultWorkspaceDir, row.path);
      try {
        const fileContent = await fs.readFile(filePath, "utf-8");
        const fmMatch = fileContent.match(/^---\n([\s\S]*?)\n---/);
        if (fmMatch) {
          const fm = {};
          for (const line of fmMatch[1].split("\n")) {
            const kv = line.match(/^(\w[\w-]*)\s*:\s*(.+)/);
            if (kv) fm[kv[1]] = kv[2].trim();
          }
          row.cells = { ...row.cells, ...fm };
        }
        row.fileTitle = path.basename(row.path, ".md");
      } catch {
        row.fileTitle = path.basename(row.path);
      }
    }
  }

  res.json(baseData);
});
```

### 2.4 性能注意

当前文件引用行是**顺序 for 循环同步读取**，100 个文件行 = 100 次 fs.readFile。优化方案：

```ts
// 改为 Promise.all 并发
await Promise.all(
  baseData.rows
    .filter((r) => r.type === "file")
    .map(async (row) => {
      try {
        const content = await fs.readFile(fullPath, "utf-8");
        // ... 解析
      } catch {
        /* 文件不存在，忽略 */
      }
    }),
);
```

## 3. PUT — 保存 Base

### 3.1 请求

```
PUT /api/workspace/base
Content-Type: application/json

{
  "path": "数据库/任务.base",
  "data": {
    "name": "任务",
    "columns": [...],
    "rows": [
      {
        "id": "r001",
        "type": "independent",
        "cells": { "c001": "完成设计文档" }
      }
    ],
    "views": [...],
    "activeViewId": "v001"
  }
}
```

### 3.2 后端处理

```ts
app.put("/api/workspace/base", async (req, res, next) => {
  const { path: relPath, data } = req.body;
  const fullPath = path.join(defaultWorkspaceDir, relPath);

  // 剥离运行时添加的字段
  const cleanRows = (data.rows ?? []).map((row) => {
    const { fileTitle, fileData, ...rest } = row;
    return rest;
  });
  const saveData = { ...data, rows: cleanRows };

  await fs.writeFile(fullPath, JSON.stringify(saveData, null, 2), "utf-8");
  res.json({ ok: true });
});
```

### 3.3 写入策略

- 先写临时文件 → 再原子重命名（可选，防写入中断）
- 当前直接覆盖写入，风险可控（数据量小，写入快）

## 4. POST — 创建 Base

### 4.1 请求

```
POST /api/workspace/base/create
Content-Type: application/json

{
  "name": "新数据库",
  "folder": "数据库"  // 可选，默认 "数据库"
}
```

### 4.2 后端处理

```ts
app.post("/api/workspace/base/create", async (req, res, next) => {
  const { name, folder } = req.body;
  const baseName = name.endsWith(".base") ? name : `${name}.base`;
  const dir = folder
    ? path.join(defaultWorkspaceDir, folder)
    : path.join(defaultWorkspaceDir, "数据库");
  await fs.mkdir(dir, { recursive: true });
  const fullPath = path.join(dir, baseName);

  const defaultData = {
    name: name.replace(/\.base$/, ""),
    columns: [
      { id: colId(), name: "名称", type: "text" },
      {
        id: colId(),
        name: "状态",
        type: "select",
        options: ["待做", "进行中", "完成"],
      },
    ],
    sources: [],
    rows: [{ id: rowId(), type: "independent", cells: {} }],
    views: [
      { id: viewId(), name: "表格", type: "table", sort: null, filters: [] },
    ],
    activeViewId: viewId(),
  };

  await fs.writeFile(fullPath, JSON.stringify(defaultData, null, 2), "utf-8");
  res.json({
    path: path.relative(defaultWorkspaceDir, fullPath),
    data: defaultData,
  });
});
```

## 5. DELETE — 删除 Base

### 5.1 请求

```
DELETE /api/workspace/base?path=数据库/任务.base
```

### 5.2 响应

```json
{ "ok": true }
```

## 6. 错误处理

| 错误码 | 场景           | 消息               |
| ------ | -------------- | ------------------ |
| 400    | 缺少 path 参数 | "path is required" |
| 400    | 缺少 name 参数 | "name is required" |
| 500    | 文件读取失败   | 系统错误           |
| 500    | 文件写入失败   | 系统错误           |

## 7. 未来 API 扩展

| 端点                                 | 方法 | 说明                    |
| ------------------------------------ | ---- | ----------------------- |
| `/api/workspace/base/file-row`       | GET  | 刷新单个文件引用行      |
| `/api/workspace/base/batch`          | POST | 批量操作（导入 CSV 等） |
| `/api/workspace/base/export/:format` | GET  | 导出为 CSV/Markdown     |

## 8. 相关文档

- 数据库Bases-数据模型.md
- 数据库Bases-后存储与性能.md
