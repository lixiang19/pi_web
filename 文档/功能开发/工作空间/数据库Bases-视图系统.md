# 数据库 Bases — 视图系统

> 状态：设计阶段
> 优先级：P1
> 拆自：数据库Bases细化.md

## 1. 视图生命周期

```
创建 (addView) → 激活 (switchView) → 配置 (updateViewConfig) → 重命名 → 删除 (deleteView)
```

## 2. 视图创建

### 2.1 创建入口

BaseViewShell 标题栏右侧 `+` 按钮 → DropdownMenu：

- 新建表格视图
- 新建看板视图
- 新建画廊视图
- 新建日历视图

### 2.2 创建时默认值

```ts
function createView(type: ViewType, columns: BaseColumn[]): BaseView {
  const id = `v${Date.now()}-${random()}`;
  const base: BaseView = {
    id,
    name: viewTypeNames[type], // "表格"/"看板"/"画廊"/"日历"
    type,
    sort: null,
    filters: [],
  };

  switch (type) {
    case "kanban":
      // 自动选择第一个 select 列作为分组列
      base.groupColumn = columns.find((c) => c.type === "select")?.id;
      break;
    case "calendar":
      // 自动选择第一个 date 列作为日期列
      base.calendarDateColumn = columns.find((c) => c.type === "date")?.id;
      break;
    case "gallery":
      base.galleryCardSize = "medium";
      break;
    case "table":
      base.tableRowHeight = "normal";
      break;
  }

  return base;
}
```

### 2.3 创建后行为

- 新视图自动成为 activeView
- `debouncedSave()`

## 3. 视图删除

### 3.1 删除条件

- 至少保留 1 个视图
- 最后一个视图不可删除

### 3.2 删除后行为

- 若 `activeViewId === deletedId`，切换为第一个视图
- `debouncedSave()`

### 3.3 UI 交互

视图标签 `group/` hover → 出现 `X` 按钮，点击即删（无需确认）。

## 4. 视图重命名

### 4.1 交互方式

**方案 A**：双击视图标签 → inline 编辑（与列头一致）

```
<span @dblclick="startRename(view.id)">{{ view.name }}</span>
<!-- 双击后 -->
<Input v-model="renameValue" @blur="commitRename" @keydown.enter="commitRename" />
```

**方案 B**：右键上下文菜单 → 重命名 → 弹窗

**推荐方案 A**，与列头重命名保持一致。同时保留方案 B 作为备选入口。

### 4.2 限制

- 视图名不为空
- 视图名不与其他视图冲突（建议允许同名但给用户提示）

## 5. 视图切换

### 5.1 当前实现

```ts
const switchView = (viewId: string) => {
  data.value.activeViewId = viewId;
  debouncedSave(); // 持久化上次活跃视图
};
```

### 5.2 可优化点

- **切换动画**：简单的 fade 过渡（150ms）
- **滚动位置保持**：每个视图独立记忆滚动位置（可选）

## 6. 视图配置面板

每个视图类型有独立配置项。通过标题栏齿轮图标或 `...` 菜单打开。

### 6.1 通用配置

| 配置项       | 说明                           |
| ------------ | ------------------------------ |
| 视图名称     | 重命名入口                     |
| 排序         | 排序列 + 升序/降序             |
| 隐藏列       | 勾选哪些列显示/隐藏            |
| 行高（表格） | compact / normal / comfortable |

### 6.2 看板专用

| 配置项     | 说明                                        |
| ---------- | ------------------------------------------- |
| 分组列     | 选择 dropdown，仅显示 select/multiselect 列 |
| 隐藏已归档 | 是否隐藏完成/已归档的行                     |

### 6.3 日历专用

| 配置项   | 说明                          |
| -------- | ----------------------------- |
| 日期列   | 选择 dropdown，仅显示 date 列 |
| 显示模式 | month / week                  |

### 6.4 画廊专用

| 配置项   | 说明                                  |
| -------- | ------------------------------------- |
| 卡片大小 | small / medium / large                |
| 封面列   | 选择列（可选），用于显示图片/内容预览 |

## 7. 组件化拆分

### 7.1 ViewSwitcher 组件

```
components/workspace/bases/ViewSwitcher.vue
```

职责：

- 渲染视图标签列表
- hover 显示删除按钮
- 双击重命名
- `+` 新建视图下拉
- 切换视图

### 7.2 配置面板组件

```
components/workspace/bases/ViewConfigPanel.vue
```

职责：

- Sheet/Popover 形式
- 按视图类型显示不同配置项
- 修改后自动保存

## 8. 相关文档

- 数据库Bases-总体架构.md
- 数据库Bases-数据模型.md
- 数据库Bases-表格视图.md
- 数据库Bases-看板视图.md
- 数据库Bases-画廊视图.md
- 数据库Bases-日历视图.md
