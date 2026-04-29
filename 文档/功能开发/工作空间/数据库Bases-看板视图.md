# 数据库 Bases — 看板视图

> 状态：设计阶段
> 优先级：P1
> 拆自：数据库Bases细化.md

## 1. 概述

看板视图以列分组方式展示数据，每列代表一个 select/multiselect 选项值。当前实现仅做静态分组，不支持拖拽。

## 2. 组件结构

```html
<KanbanView>
  <div class="flex gap-3 h-full overflow-x-auto p-4">
    <!-- 分组列 -->
    <div v-for="group in groups" class="kanban-column">
      <div class="column-header">
        <span>{{ group.name }}</span>
        <span class="count">{{ group.rows.length }}</span>
      </div>
      <div class="column-body">
        <KanbanCard v-for="row in group.rows" :row="row" />
      </div>
    </div>
    <!-- 未分组列 -->
    <div v-if="ungrouped.length > 0" class="kanban-column dashed">...</div>
  </div>
</KanbanView>
```

## 3. 子组件

### 3.1 KanbanColumn — 看板列

```
components/workspace/bases/KanbanView/KanbanColumn.vue
```

**Props**：`name: string`, `rows: BaseRow[]`, `color?: string`

**功能**：

- 列头显示组名 + 行数
- 卡片垂直排列
- 虚线边框（未分组列）
- 允许拖入

### 3.2 KanbanCard — 看板卡片

```
components/workspace/bases/KanbanView/KanbanCard.vue
```

**Props**：`row: BaseRow`, `titleCol: BaseColumn`

**功能**：

- 显示首列内容 + 其他可见列的 KV 对
- 独立行的首列：显示 `cells[firstCol.id]`
- 文件引用行的首列：显示 fileTitle，可点击打开
- hover 效果（shadcn card hover 样式）
- 支持拖拽（未来）

## 4. 分组逻辑

### 4.1 分组列选择

看板视图创建时，自动选择第一个 `select` 列作为分组列。
用户可在配置面板中切换分组列（仅 `select`/`multiselect` 类型可选）。

### 4.2 分组计算

```ts
const kanbanGroups = computed(() => {
  const groupCol = data.value.columns.find(
    (c) => c.id === activeView.value?.groupColumn,
  );
  if (!groupCol || !groupCol.options) return [];

  const groups: Record<string, BaseRow[]> = {};
  for (const opt of groupCol.options) {
    groups[opt] = [];
  }

  // multiselect：行可能出现在多个组中
  for (const row of sortedAndFilteredRows.value) {
    const val = row.cells[groupCol.id];
    if (!val || val === "") {
      ungrouped.push(row);
      continue;
    }
    if (groupCol.type === "multiselect") {
      const selected = String(val)
        .split(",")
        .map((s) => s.trim());
      for (const s of selected) {
        if (groups[s]) groups[s].push(row);
      }
    } else {
      const key = String(val);
      if (groups[key]) {
        groups[key].push(row);
      } else {
        ungrouped.push(row);
      }
    }
  }

  return groups;
});
```

### 4.3 排序与过滤在看板中

- 视图的 `sort` 和 `filters` 在看板视图中同样生效
- 先过滤 → 再排序 → 再分组

## 5. 拖拽设计（后续迭代）

### 5.1 核心交互

- 拖动卡片从一个列到另一个列
- 释放后更新该行的 select 列值
- 即时保存

### 5.2 技术选型

| 方案                        | 优点     | 缺点                 |
| --------------------------- | -------- | -------------------- |
| HTML5 Drag API              | 零依赖   | 移动端支持差，无动画 |
| `@vueuse/core` useDraggable | 轻量     | 需要自己实现 drop 区 |
| `vue-draggable-plus`        | 完整方案 | 额外依赖             |

**推荐 HTML5 Drag API**，移动端暂不需要。实现时：

- `draggable="true"` 在 KanbanCard 上
- `@dragover.prevent` + `@drop` 在 KanbanColumn 上
- `dragstart` 时存储 rowId 到 dataTransfer
- `drop` 时更新 cell 值

### 5.3 视觉反馈

| 时机         | 视觉                            |
| ------------ | ------------------------------- |
| 拖拽中       | 原卡片半透明 `opacity-50`       |
| 悬停有效目标 | 目标列边框高亮 `border-primary` |
| 释放成功     | 卡片滑入新位置                  |

## 6. 配置项

| 配置          | 默认值           | 说明         |
| ------------- | ---------------- | ------------ |
| groupColumn   | 第一个 select 列 | 分组依据列   |
| hideEmpty     | false            | 是否隐藏空组 |
| maxCardHeight | 无限制           | 卡片内容截断 |

## 7. 相关文档

- 数据库Bases-总体架构.md
- 数据库Bases-数据模型.md
- 数据库Bases-视图系统.md
- 数据库Bases-表格视图.md
