# 数据库 Bases — 数据模型

> 状态：设计阶段
> 优先级：P1
> 拆自：数据库Bases细化.md

## 1. 数据模型总览

```
BaseData（一个 .base 文件）
├── name: string                  # 数据库名称
├── columns: BaseColumn[]         # 列定义
├── rows: BaseRow[]               # 行数据
├── views: BaseView[]             # 视图配置
├── activeViewId: string          # 当前活跃视图
└── sources: Source[]             # 数据来源
```

## 2. BaseColumn — 列定义

### 2.1 类型枚举

| 类型     | 标识          | 存储格式                 |
| -------- | ------------- | ------------------------ |
| 文本     | `text`        | string                   |
| 数字     | `number`      | number                   |
| 日期     | `date`        | ISO string `YYYY-MM-DD`  |
| 选择     | `select`      | string（单选）           |
| 多选     | `multiselect` | string[]（逗号分隔存储） |
| 复选框   | `checkbox`    | boolean                  |
| 文件引用 | `file`        | string（文件路径）       |

### 2.2 TypeScript 定义

```ts
export type ColumnType =
  | "text"
  | "number"
  | "date"
  | "select"
  | "multiselect"
  | "checkbox"
  | "file";

export interface BaseColumn {
  id: string; // 唯一标识，如 c{timestamp}-{random}
  name: string; // 列名（可编辑）
  type: ColumnType;
  options?: string[]; // select/multiselect 的选项列表
  width?: number; // 列宽（px），undefined = auto
  hidden?: boolean; // 是否隐藏
  description?: string; // 列描述（tooltip）
}
```

### 2.3 列校验规则

| 类型        | 空值默认 | 编辑组件           |
| ----------- | -------- | ------------------ |
| text        | `""`     | Input              |
| number      | `0`      | Input[type=number] |
| date        | `""`     | DatePicker         |
| select      | `""`     | Select             |
| multiselect | `""`     | MultiSelect        |
| checkbox    | `false`  | Checkbox           |
| file        | `""`     | FilePicker         |

## 3. BaseRow — 行定义

### 3.1 行类型

| 类型     | 标识          | 说明                      |
| -------- | ------------- | ------------------------- |
| 独立行   | `independent` | 手动创建的行              |
| 文件引用 | `file`        | 引用文件系统中的 .md 文件 |

### 3.2 TypeScript 定义

```ts
export type RowType = "independent" | "file";

export interface BaseRow {
  id: string; // 唯一标识，如 r{timestamp}-{random}
  type: RowType;
  cells: Record<string, unknown>; // key=column.id, value=单元格值
  // 文件引用行的额外字段
  path?: string; // 文件路径（相对 workspace）
  fileTitle?: string; // 文件名（不含扩展名，运行时解析）
  fileData?: Record<string, unknown>; // frontmatter 解析结果（运行时）
}
```

### 3.3 文件引用行解析规则

后端在 `GET /api/workspace/base` 中：

1. 遍历 `rows`，找到 `type === "file"` 的行
2. 读取文件内容 → 解析 YAML frontmatter
3. 将 frontmatter KV 合并到 `row.cells`
4. 设置 `fileTitle = path.basename(row.path, ".md")`
5. `fileData` 仅在页面展示时使用，不回写

**保存时剥离** `fileTitle` 和 `fileData`，不写入 .base 文件。

## 4. BaseView — 视图配置

### 4.1 视图类型

| 类型 | 标识       | 说明         |
| ---- | ---------- | ------------ |
| 表格 | `table`    | 经典表格视图 |
| 看板 | `kanban`   | 按列分组看板 |
| 画廊 | `gallery`  | 卡片网格     |
| 日历 | `calendar` | 月/周日历    |

### 4.2 TypeScript 定义

```ts
export type ViewType = "table" | "kanban" | "gallery" | "calendar";

export interface BaseView {
  id: string; // 唯一标识，如 v{timestamp}-{random}
  name: string; // 视图名称
  type: ViewType;
  // 排序
  sort: SortConfig | null;
  // 过滤
  filters: FilterConfig[];
  // 分组（看板专用）
  groupColumn?: string; // select/multiselect 列 ID
  // 日历配置（日历专用）
  calendarDateColumn?: string; // date 列 ID
  calendarMode?: "month" | "week";
  // 画廊配置（画廊专用）
  galleryCoverColumn?: string; // 封面列 ID
  galleryCardSize?: "small" | "medium" | "large";
  // 表格配置（表格专用）
  tableRowHeight?: "compact" | "normal" | "comfortable";
}
```

### 4.3 视图唯一性约束

- 每个视图 ID 唯一
- `activeViewId` 必须指向存在的视图
- 删除视图时若只剩一个则不允许删除

## 5. SortConfig — 排序配置

```ts
export interface SortConfig {
  column: string; // 排序列 ID
  direction: "asc" | "desc";
}
```

**当前单列排序**。未来可扩展为多列排序 `SortConfig[]`。

## 6. FilterConfig — 过滤配置

```ts
export interface FilterConfig {
  id: string; // 过滤器 ID
  column: string; // 过滤列 ID
  operator: FilterOperator;
  value: string | number;
}

export type FilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "greater_than"
  | "less_than"
  | "is_empty"
  | "is_not_empty";
```

### 6.1 过滤算子 vs 列类型兼容矩阵

| 算子         | text | number | date | select | checkbox |
| ------------ | ---- | ------ | ---- | ------ | -------- |
| equals       | ✅   | ✅     | ✅   | ✅     | ✅       |
| not_equals   | ✅   | ✅     | ✅   | ✅     | ✅       |
| contains     | ✅   | ❌     | ❌   | ❌     | ❌       |
| greater_than | ❌   | ✅     | ✅   | ❌     | ❌       |
| less_than    | ❌   | ✅     | ✅   | ❌     | ❌       |
| is_empty     | ✅   | ✅     | ✅   | ✅     | ✅       |

## 7. Source — 数据来源

```ts
export interface Source {
  type: "folder" | "manual";
  path: string; // 来源路径
}
```

**source 用于跟踪哪些文件/文件夹被引用**。当前 `.base` 文件中已预留 `sources` 字段，但功能尚未实现。

## 8. 存储格式

### 8.1 文件命名

`.base` 文件存储在 `~/.pi/{workspace}/数据库/` 目录下。

```
数据库/
├── 任务.base
├── 项目.base
└── 书籍库.base
```

### 8.2 .base 文件内容（JSON）

```json
{
  "name": "任务",
  "columns": [
    { "id": "c001", "name": "名称", "type": "text" },
    {
      "id": "c002",
      "name": "状态",
      "type": "select",
      "options": ["待做", "进行中", "完成"]
    },
    { "id": "c003", "name": "截止日期", "type": "date" }
  ],
  "sources": [],
  "rows": [
    {
      "id": "r001",
      "type": "independent",
      "cells": {
        "c001": "完成设计文档",
        "c002": "进行中",
        "c003": "2026-05-01"
      }
    },
    {
      "id": "r002",
      "type": "file",
      "path": "项目/调研笔记.md",
      "cells": {}
    }
  ],
  "views": [
    {
      "id": "v001",
      "name": "表格",
      "type": "table",
      "sort": null,
      "filters": []
    }
  ],
  "activeViewId": "v001"
}
```

## 9. 相关文档

- 数据库Bases-总体架构.md
- 数据库Bases-视图系统.md
- 数据库Bases-后存储与性能.md
