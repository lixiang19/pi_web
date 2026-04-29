# 数据库 Bases — 总体架构

> 状态：设计阶段
> 优先级：P1
> 拆自：数据库Bases细化.md

## 1. 目标

打造一个类 Notion 数据库的工作空间数据管理工具。支持多视图（表格/看板/画廊/日历）、多列类型、排序过滤、文件引用行。

## 2. 架构分层

```
WorkspacePage.vue
  └── 文件标签页 .base 文件
        └── BaseViewShell.vue          ← 新建：Shell 容器
              ├── 标题栏 + 视图切换器    （inline）
              ├── 列管理下拉             （inline）
              └── 视图内容区（动态组件）
                    ├── TableView.vue     ← 拆出：表格视图
                    ├── KanbanView.vue    ← 拆出：看板视图
                    ├── GalleryView.vue   ← 拆出：画廊视图
                    └── CalendarView.vue  ← 拆出：日历视图
```

### 2.1 组件职责

| 组件          | 路径                                           | 职责                               |
| ------------- | ---------------------------------------------- | ---------------------------------- |
| BaseViewShell | `components/workspace/bases/BaseViewShell.vue` | 加载数据、标题栏、视图切换、列管理 |
| TableView     | `components/workspace/bases/TableView.vue`     | 表格渲染、行内编辑、列头排序       |
| KanbanView    | `components/workspace/bases/KanbanView.vue`    | 看板分组、卡片渲染、拖拽           |
| GalleryView   | `components/workspace/bases/GalleryView.vue`   | 画廊卡片网格、封面、交互           |
| CalendarView  | `components/workspace/bases/CalendarView.vue`  | 月/周日历、日期分组                |

### 2.2 Composable

| Composable  | 路径                         | 职责                                                        |
| ----------- | ---------------------------- | ----------------------------------------------------------- |
| useBaseData | `composables/useBaseData.ts` | 加载/保存 BaseData、状态管理、乐观更新、provide/inject 共享 |

### 2.3 目录结构

```
components/workspace/bases/
  ├── BaseViewShell.vue
  ├── TableView.vue
  ├── KanbanView.vue
  ├── GalleryView.vue
  ├── CalendarView.vue
  ├── cells/                    ← 单元格渲染组件
  │   ├── TextCell.vue
  │   ├── NumberCell.vue
  │   ├── SelectCell.vue
  │   ├── DateCell.vue
  │   └── CheckboxCell.vue
  └── FilterBar.vue            ← 过滤器 UI
```

## 3. 状态管理

### 3.1 useBaseData

```ts
// composables/useBaseData.ts
export function useBaseData(filePath: Ref<string>) {
  const data = ref<BaseData | null>(null);
  const isLoading = ref(false);
  const error = ref("");
  const isSaving = ref(false);

  // 加载
  const load = async () => { ... };

  // 保存（防抖 1s）
  const save = async () => { ... };
  const debouncedSave = () => { ... };  // 防抖

  // 数据变更方法（均自动 debouncedSave）
  const addRow = () => { ... };
  const deleteRow = (rowId: string) => { ... };
  const updateCell = (rowId: string, colId: string, value: unknown) => { ... };
  const addColumn = (type: ColumnType) => { ... };
  const deleteColumn = (colId: string) => { ... };
  const renameColumn = (colId: string, name: string) => { ... };
  const addView = (type: ViewType) => { ... };
  const deleteView = (viewId: string) => { ... };
  const renameView = (viewId: string, name: string) => { ... };
  const switchView = (viewId: string) => { ... };
  const updateViewConfig = (viewId: string, config: Partial<BaseView>) => { ... };

  // 乐观更新
  const optimisticUpdate = <T>(mutation: () => T, rollback: () => void) => { ... };

  return {
    data, isLoading, error, isSaving,
    load, save, debouncedSave,
    addRow, deleteRow, updateCell,
    addColumn, deleteColumn, renameColumn,
    addView, deleteView, renameView, switchView, updateViewConfig,
    optimisticUpdate
  };
}
```

### 3.2 Provide/Inject 模式

```ts
// WorkspacePage.vue 中：
provideWorkspaceBaseData(filePath); // 类似 provideWorkspaceTasks

// BaseViewShell.vue 中：
const baseData = injectWorkspaceBaseData();
```

## 4. 当前代码迁移路径

### 阶段 1：提取 useBaseData（不改行为）

- 从 BaseView.vue 提取所有数据逻辑到 useBaseData.ts
- BaseView.vue 改为调用 composable

### 阶段 2：拆分视图组件（不改行为）

- 创建 TableView.vue、KanbanView.vue、GalleryView.vue、CalendarView.vue
- BaseViewShell.vue 作为容器，用动态组件 `<component :is="viewComponent">`

### 阶段 3：逐个视图增强

- 各视图独立开发，不再相互影响

## 5. 性能策略

| 策略           | 说明                                                 |
| -------------- | ---------------------------------------------------- |
| 防抖保存       | 1s 防抖，减少 I/O 频率                               |
| computed 缓存  | sortedRows、kanbanGroups 等用 computed               |
| 大表格虚拟滚动 | 500+ 行时启用虚拟列表                                |
| 文件行缓存     | fileTitle + frontmatter 在 load 时解析，不重复读文件 |
| 视图懒渲染     | 只渲染 activeView，切换时切换组件                    |

## 6. 相关文档

- 数据库Bases-数据模型.md — 列类型、行类型、视图配置
- 数据库Bases-视图系统.md — 视图 CRUD、切换、配置
- 数据库Bases-表格视图.md — 表格渲染、编辑、排序
- 数据库Bases-看板视图.md — 看板分组、拖拽
- 数据库Bases-画廊视图.md — 画廊卡片
- 数据库Bases-日历视图.md — 月/周历
- 数据库Bases-排序过滤.md — 排序、过滤系统
- 数据库Bases-后存储与性能.md — 存储格式、IO 优化
