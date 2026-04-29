# 数据库 Bases — 列类型系统

> 状态：设计阶段
> 优先级：P1
> 拆自：数据库Bases细化.md

## 1. 列类型一览

| 类型   | 标识        | 存储值            | 编辑组件           | 默认值  |
| ------ | ----------- | ----------------- | ------------------ | ------- |
| 文本   | text        | string            | Input              | `""`    |
| 数字   | number      | number            | Input[type=number] | `0`     |
| 日期   | date        | ISO string        | DatePicker         | `""`    |
| 选择   | select      | string            | Select             | `""`    |
| 多选   | multiselect | string (逗号分隔) | MultiSelect        | `""`    |
| 复选框 | checkbox    | boolean           | Checkbox           | `false` |
| 文件   | file        | string (路径)     | FilePicker         | `""`    |

## 2. 各类型详细设计

### 2.1 文本（text）

**存储**：`row.cells[colId] = "hello"`

**编辑**：双击 → Input → blur/enter 保存 → esc 取消

**排序**：`localeCompare("zh-CN")`

**过滤**：contains, not_contains, starts_with, ends_with, equals, not_equals, is_empty, is_not_empty

### 2.2 数字（number）

**存储**：`row.cells[colId] = 42`（number 类型，非字符串）

**编辑**：双击 → Input[type=number] → blur/enter 保存

**排序**：数值比较 `(Number(va) || 0) - (Number(vb) || 0)`

**过滤**：equals, not_equals, greater_than, less_than, is_empty, is_not_empty

**特殊处理**：

- 空值显示 `"—"`
- 输入非数字时保存为 0
- 支持小数

### 2.3 日期（date）

**存储**：`row.cells[colId] = "2026-05-15"`（ISO 字符串）

**编辑**：双击 → DatePicker → 选择后保存

**排序**：`new Date(va).getTime() - new Date(vb).getTime()`

**过滤**：equals, greater_than, less_than, is_empty, is_not_empty

**显示格式**：`2026-05-15` → `5月15日`（友好格式）

**DatePicker 实现**：使用 shadcn-vue 的 DatePicker 组件（Popover + Calendar）

### 2.4 选择（select）

**存储**：`row.cells[colId] = "进行中"`（单选字符串）

**编辑**：点击 → Select 下拉 → 选择后即时保存

**排序**：按选项在 `options` 数组中的位置排序？还是字母排序？

**推荐**：按选项在 `options` 中的顺序排序（符合用户预期）。

```ts
if (col.type === "select" && col.options) {
  cmp = col.options.indexOf(String(va)) - col.options.indexOf(String(vb));
}
```

**过滤**：equals, not_equals, is_empty, is_not_empty

**选项管理**：

- 列配置中 `options` 数组
- 编辑选项：在 ColHeader 右键菜单中"编辑选项"
- 重命名选项：会影响所有使用该选项的行

### 2.5 多选（multiselect）

**存储**：`row.cells[colId] = "标签1,标签2"`（逗号分隔字符串）

**编辑**：点击 → 多选组件 → 即时保存

**多选组件**：基于 shadcn Combobox 或 Checkbox 列表实现

**显示**：标签形式（Badge）横向排列

**过滤**：contains（标签1 包含在选中的标签中）

**排序**：不适用（多选用 equals/contains 过滤）

### 2.6 复选框（checkbox）

**存储**：`row.cells[colId] = true` 或 `false`

**编辑**：点击直接切换，即时保存

**排序**：`(va ? 1 : 0) - (vb ? 1 : 0)`，未勾选排前面

**过滤**：equals（true/false）

**显示**：原生 `<input type="checkbox">`

### 2.7 文件引用（file）

**存储**：`row.cells[colId] = "项目/笔记.md"`（相对路径）

**编辑**：不可直接编辑。通过选择器选择文件。

**排序**：字符串排序

**显示**：文件名链接，可点击打开

**文件选择器**：点击单元格 → 打开文件浏览器 → 选择文件 → 自动填入路径

## 3. 列属性

### 3.1 通用属性

| 属性   | 类型       | 说明                      |
| ------ | ---------- | ------------------------- |
| id     | string     | 唯一 ID，不可变           |
| name   | string     | 列名，可编辑              |
| type   | ColumnType | 列类型，创建后不可变      |
| width  | number?    | 列宽 px，undefined = auto |
| hidden | boolean?   | 是否隐藏                  |

### 3.2 类型特有属性

| 属性    | 适用类型            | 说明       |
| ------- | ------------------- | ---------- |
| options | select, multiselect | 可选值列表 |

## 4. 列操作

### 4.1 创建列

```
+ 添加列 → Dropdown
  ├── 文本列
  ├── 数字列
  ├── 日期列
  ├── 选择列
  ├── 多选列
  ├── 复选框列
  └── 文件引用列
```

创建后列名默认为类型名（"文本"/"数字"...），用户双击重命名。

### 4.2 编辑列

- **重命名**：双击列名
- **编辑选项**（select/multiselect）：右键列头 → "编辑选项" → Sheet 弹出
- **调整列宽**：拖动列右边界（可选，P2）
- **隐藏列**：右键列头 → "隐藏列"

### 4.3 删除列

- 列头 hover → Trash2 按钮
- 删除后，所有行中该列数据丢失
- 数据不可恢复（.base 文件可手动恢复）

### 4.4 列类型不可变

创建后列类型不能更改。如需更改类型 → 新建列 + 手动迁移数据 + 删除旧列。

## 5. 选项管理（select/multiselect）

### 5.1 选项编辑 UI

Sheet 弹出层：

```
┌──────────────────────┐
│  编辑选项 - "状态"    │
│                      │
│  ┌────────────────┐  │
│  │ 待做       ×   │  │
│  │ 进行中     ×   │  │
│  │ 完成       ×   │  │
│  └────────────────┘  │
│                      │
│  [+ 添加选项]        │
└──────────────────────┘
```

### 5.2 删除选项

删除选项后，所有使用该选项的行值变为空 `""`。不产生孤儿数据。

### 5.3 重命名选项

修改 `options` 数组中对应值，同时扫描所有行更新 cell 值。

## 6. 相关文档

- 数据库Bases-数据模型.md
- 数据库Bases-排序过滤.md
