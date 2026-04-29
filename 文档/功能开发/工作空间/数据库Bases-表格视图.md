# 数据库 Bases — 表格视图

> 状态：设计阶段
> 优先级：P0
> 拆自：数据库Bases细化.md

## 1. 概述

表格视图是数据库的默认视图。数据以行列网格形式展示，支持：

- 列头排序（单列）
- 行内编辑（双击进入）
- 列管理（新增/删除/重命名）
- 行管理（新增/删除）
- 行 hover 样式

## 2. 组件结构

```html
<TableView>
  <div class="table-container flex-1 overflow-auto">
    <table class="w-full border-collapse text-sm">
      <!-- thead sticky top-0 -->
      <thead>
        <tr>
          <th v-for="col in visibleColumns" class="group/col">
            <ColHeader :col="col" />
          </th>
          <th class="w-10" />
          <!-- 行操作占位列 -->
        </tr>
      </thead>
      <!-- tbody -->
      <tbody>
        <tr v-for="row in displayRows" class="group">
          <td v-for="col in visibleColumns">
            <CellRenderer :row="row" :col="col" />
          </td>
          <td><RowActions :row="row" /></td>
        </tr>
      </tbody>
      <!-- tfoot -->
      <tfoot>
        <tr>
          <td :colspan="visibleColumns.length + 1">
            <AddRowButton />
          </td>
        </tr>
      </tfoot>
    </table>
  </div>
</TableView>
```

## 3. 子组件拆分

### 3.1 ColHeader — 列头

```
components/workspace/bases/TableView/ColHeader.vue
```

**Props**：`col: BaseColumn`, `sort: SortConfig | null`, `editing: boolean`

**功能**：

- 显示列名 + 类型标签（小字）
- 双击 → 列名编辑模式
- 点击 → 切换排序（无 → 升 → 降 → 无）
- hover → 显示删除按钮（Trash2 图标）
- 排序指示箭头（↑↓）

**排序状态指示**：

```
无排序：列名无变化
升序：列名后 ↑
降序：列名后 ↓
```

### 3.2 CellRenderer — 单元格渲染器

```
components/workspace/bases/TableView/CellRenderer.vue
```

**Props**：`row: BaseRow`, `col: BaseColumn`, `editing: boolean`

**功能**：根据列类型渲染不同组件

| 列类型      | 渲染组件        | 行为                                   |
| ----------- | --------------- | -------------------------------------- |
| text        | TextCell        | 双击编辑，blur/enter 保存              |
| number      | NumberCell      | 双击编辑，type=number，blur/enter 保存 |
| date        | DateCell        | 双击打开 DatePicker（可选）            |
| select      | SelectCell      | Select 下拉，即时保存                  |
| multiselect | MultiSelectCell | 多选标签，即时保存                     |
| checkbox    | CheckboxCell    | 点击切换，即时保存                     |
| file        | FileCell        | 显示文件名，可点击打开                 |

### 3.3 单元格组件

```
components/workspace/bases/TableView/cells/
├── TextCell.vue
├── NumberCell.vue
├── DateCell.vue
├── SelectCell.vue
├── MultiSelectCell.vue
├── CheckboxCell.vue
└── FileCell.vue
```

### 3.4 RowActions — 行操作

```
components/workspace/bases/TableView/RowActions.vue
```

- hover → 显示删除按钮
- 独立行可以删除
- 文件引用行删除只是从数据库移除引用，不删原文件

### 3.5 AddRowButton — 新增行按钮

tfoot 中始终显示。

- 点击 → `addRow()` → 自动进入首列编辑状态
- 新行插入到列表末尾

## 4. 排序逻辑

### 4.1 当前实现（已可用）

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
    if (col.type === "number") {
      cmp = (Number(va) || 0) - (Number(vb) || 0);
    } else {
      cmp = String(va).localeCompare(String(vb), "zh-CN");
    }
    return sort.direction === "desc" ? -cmp : cmp;
  });
  return rows;
});
```

### 4.2 排序状态机

```
null → [click] → asc → [click] → desc → [click] → null
```

### 4.3 排序指示器

```ts
const sortIndicator = (colId: string) => {
  const sort = activeView.value?.sort;
  if (sort?.column !== colId) return "";
  return sort.direction === "asc" ? " ↑" : " ↓";
};
```

## 5. 行内编辑

### 5.1 编辑状态管理

```ts
// useBaseData 中
const editingCell = ref<{ rowId: string; colId: string } | null>(null);
const editValue = ref("");

const startEdit = (rowId: string, colId: string, currentValue: unknown) => {
  editingCell.value = { rowId, colId };
  editValue.value = currentValue != null ? String(currentValue) : "";
};

const commitEdit = () => {
  // 类型转换 + 保存
  // editingCell = null
};

const cancelEdit = () => {
  editingCell.value = null;
};
```

### 5.2 编辑触发方式

| 列类型   | 触发方式                  | 保存时机     |
| -------- | ------------------------- | ------------ |
| text     | 双击                      | blur / enter |
| number   | 双击                      | blur / enter |
| date     | 双击（未来用 DatePicker） | 选择日期     |
| select   | 点击                      | 选择后即时   |
| checkbox | 点击                      | 即时         |
| file     | 不可编辑                  | —            |

### 5.3 特殊规则

- **新增行**：自动进入首列编辑状态
- **文件引用行**：首列显示可点击的文件名链接，不可编辑
- **Tab 切换**：未来支持 Tab 移动编辑焦点到下一个单元格

## 6. 列管理

### 6.1 新增列

```
+ 添加列 按钮 → DropdownMenu
  ├── 文本列
  ├── 选择列
  ├── 数字列
  ├── 日期列
  ├── 复选框列
  └── 多选列
```

### 6.2 删除列

列头 hover → Trash2 按钮 → 确认？（当前设计无确认，直接删）

建议：**无确认直接删**，因为数据还在 .base 文件中（只是列定义移除，对应 cell 数据虽孤立但不会丢）。

### 6.3 列头重命名

列头双击 → Input 替换 span → blur/enter 保存 → esc 取消。

实现已在 ColumnHeader 组件中。

## 7. 性能考虑

### 7.1 大量行（500+）

- 启用虚拟滚动
- 使用 `@tanstack/vue-virtual` 或手写 IntersectionObserver
- 非虚拟模式仍然可用（100 行以内性能足够）

### 7.2 大量列（20+）

- 水平滚动
- Sticky 首列（名称列固定左侧）

### 7.3 排序性能

- computed 中做浅拷贝 + 排序，不修改原数据
- 1000 行 × 20 列的排序 < 5ms，无需优化

## 8. 状态保持

### 8.1 编辑态

- 切换视图后编辑态丢失（可接受）
- 新增行编辑态在内部保持

### 8.2 滚动位置

- 切换视图回来后滚动到顶部（可接受，未来可优化）

## 9. 相关文档

- 数据库Bases-总体架构.md
- 数据库Bases-数据模型.md
- 数据库Bases-视图系统.md
- 数据库Bases-排序过滤.md
