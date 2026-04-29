# 数据库 Bases — 排序与过滤系统

> 状态：设计阶段
> 优先级：P0
> 拆自：数据库Bases细化.md

## 1. 概述

排序和过滤是视图的核心配置，直接存储在 `BaseView.sort` 和 `BaseView.filters` 中，随 `.base` 文件持久化。每个视图有独立的排序/过滤配置。

## 2. 排序系统

### 2.1 单列排序（当前实现）

```ts
interface SortConfig {
  column: string; // 列 ID
  direction: "asc" | "desc";
}
```

### 2.2 排序状态机

```
null  →  升序(asc)  →  降序(desc)  →  null
```

列头点击循环触发。

### 2.3 排序算法

```ts
const sortedRows = computed(() => {
  const rows = [...data.value.rows];
  const sort = activeView.value?.sort;
  if (!sort) return rows;

  const col = data.value.columns.find((c) => c.id === sort.column);
  if (!col) return rows;

  rows.sort((a, b) => {
    const va = a.cells[col.id] ?? "";
    const vb = b.cells[col.id] ?? "";
    let cmp = 0;

    switch (col.type) {
      case "number":
        cmp = (Number(va) || 0) - (Number(vb) || 0);
        break;
      case "date":
        cmp =
          (new Date(String(va)).getTime() || 0) -
          (new Date(String(vb)).getTime() || 0);
        break;
      case "checkbox":
        cmp = (va ? 1 : 0) - (vb ? 1 : 0);
        break;
      default:
        cmp = String(va).localeCompare(String(vb), "zh-CN");
    }

    return sort.direction === "desc" ? -cmp : cmp;
  });
  return rows;
});
```

### 2.4 排序指示器

ColHeader 组件中：

- 当前排序列：显示 `↑` 或 `↓`
- 非排序列：无指示
- 点击切换

### 2.5 未来扩展：多列排序

```ts
// 从单列扩展为多列排序
interface SortConfig {
  sorts: Array<{ column: string; direction: "asc" | "desc" }>;
}
```

UI 变化：列头指示显示序号 "① ↑ ② ↓"。P2 优先级。

## 3. 过滤系统

### 3.1 过滤配置

```ts
interface FilterConfig {
  id: string; // 唯一 ID
  column: string; // 列 ID
  operator: FilterOperator;
  value: string | number;
}

type FilterOperator =
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

### 3.2 过滤算子详解

| 算子         | 说明       | 示例                    |
| ------------ | ---------- | ----------------------- |
| equals       | 精确匹配   | 状态 = "进行中"         |
| not_equals   | 不等于     | 优先级 ≠ "低"           |
| contains     | 文本包含   | 标题 包含 "设计"        |
| not_contains | 文本不包含 | 标题 不包含 "废弃"      |
| starts_with  | 开头匹配   | 文件名 以 "项目-" 开头  |
| ends_with    | 结尾匹配   | 文件名 以 ".md" 结尾    |
| greater_than | 大于       | 截止日期 > "2026-05-01" |
| less_than    | 小于       | 截止日期 < "2026-05-01" |
| is_empty     | 为空       | 备注 为空               |
| is_not_empty | 不为空     | 备注 不为空             |

### 3.3 过滤执行优先级

```
原数据 rows
  → 过滤（按 filters 数组顺序，AND 逻辑）
  → 排序
  → 分组（看板视图）
  → 展示
```

### 3.4 多个过滤器逻辑

**AND 逻辑**：所有 filter 条件必须同时满足。

示例：

```
过滤器1：状态 = "进行中"
过滤器2：优先级 = "高"
→ 显示"进行中"且"高优先级"的行
```

### 3.5 过滤 UI 设计

```
FilterBar.vue
├── 已激活过滤器标签（可删除）
│   ├── [状态 = 进行中 ×]
│   └── [优先级 = 高 ×]
└── + 添加过滤器 按钮
      → Popover/Sheet
        ├── 选择列 (Select)
        ├── 选择算子 (Select)
        └── 输入值 (Input / Select / DatePicker)
```

### 3.6 算子 vs 列类型适配

| 列类型   | 可用值输入组件            |
| -------- | ------------------------- |
| text     | Input                     |
| number   | Input[type=number]        |
| date     | DatePicker                |
| select   | Select（从 options 中选） |
| checkbox | "是/否"切换               |

### 3.7 `is_empty` / `is_not_empty` 的特殊处理

这两个算子不需要 `value` 字段，UI 中隐藏值输入。

## 4. 排序+过滤的 computed 链

```ts
// useBaseData 中
const filteredRows = computed(() => {
  const rows = data.value?.rows ?? [];
  const filters = activeView.value?.filters ?? [];
  if (filters.length === 0) return rows;
  return rows.filter((row) => filters.every((f) => evaluateFilter(row, f)));
});

const sortedRows = computed(() => {
  const rows = [...filteredRows.value];
  const sort = activeView.value?.sort;
  if (!sort) return rows;
  // ... 排序逻辑
  return rows;
});

// 最终展示用 sortedRows
```

## 5. 持久化

- 排序/过滤配置存储在 `BaseView` 中
- 切换视图时自动加载对应视图的排序/过滤
- 修改后 `debouncedSave()`

## 6. 性能

| 操作     | 数据量           | 预期耗时 | 策略          |
| -------- | ---------------- | -------- | ------------- |
| 过滤     | 1000行 × 5过滤器 | < 1ms    | computed 缓存 |
| 排序     | 1000行           | < 5ms    | computed 缓存 |
| 文本排序 | 10000行          | ~20ms    | 可接受        |

1000行以下无需特殊优化。

## 7. 相关文档

- 数据库Bases-总体架构.md
- 数据库Bases-数据模型.md
- 数据库Bases-表格视图.md
