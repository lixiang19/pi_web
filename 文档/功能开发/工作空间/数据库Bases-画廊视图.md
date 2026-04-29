# 数据库 Bases — 画廊视图

> 状态：设计阶段
> 优先级：P1
> 拆自：数据库Bases细化.md

## 1. 概述

画廊视图以卡片网格形式展示数据。每行渲染为一张独立卡片，适合浏览型场景（如项目展示、知识库浏览）。

## 2. 组件结构

```html
<GalleryView>
  <div class="p-4">
    <div
      class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3"
    >
      <GalleryCard v-for="row in displayRows" :key="row.id" :row="row" />
    </div>
  </div>
</GalleryView>
```

## 3. GalleryCard — 画廊卡片

```
components/workspace/bases/GalleryView/GalleryCard.vue
```

### 3.1 Props

```ts
interface GalleryCardProps {
  row: BaseRow;
  titleCol: BaseColumn; // 标题列（默认首列）
  coverCol?: BaseColumn; // 封面列（可选，file 类型列）
  visibleColumns: BaseColumn[];
  size: "small" | "medium" | "large";
}
```

### 3.2 卡片布局

```
┌─────────────────────────┐
│                         │
│  ┌───────────────────┐  │
│  │                   │  │  ← 封面区（可选）
│  │    [封面图片]     │  │
│  │                   │  │
│  └───────────────────┘  │
│                         │
│  标题内容                │  ← 标题（首列值）
│                         │
│  状态: 进行中            │  ← 其他可见列 KV 对
│  截止日期: 2026-05-01   │
│                         │
└─────────────────────────┘
```

### 3.3 三种尺寸

| 尺寸   | 列数（默认） | 卡片内容                    |
| ------ | ------------ | --------------------------- |
| small  | 4-5 列       | 仅标题                      |
| medium | 3-4 列       | 标题 + 最多 2 列 KV         |
| large  | 2-3 列       | 标题 + 全部可见列 KV + 封面 |

## 4. 交互设计

### 4.1 当前交互（静态卡片）

- hover 显示阴影提升 `hover:shadow-sm`
- 文件引用行首列可点击打开文件

### 4.2 未来交互（可扩展）

| 交互         | 触发     | 行为                                |
| ------------ | -------- | ----------------------------------- |
| 双击卡片     | 双击     | 切换到表格视图并定位该行            |
| 右键菜单     | 右键     | 删除行 / 复制 / 导出                |
| 卡片拖拽排序 | 拖拽     | 手动排序（需新增 `row.order` 字段） |
| 内联编辑     | 点击字段 | 直接在卡片上编辑 KV 字段            |

## 5. 封面列

### 5.1 封面列选择

- 视图配置中 `galleryCoverColumn` 指定
- 仅 `file` 类型列可作为封面列
- 若未指定，卡片不显示封面区

### 5.2 封面渲染

```ts
// 从 file 列的值获取文件路径，渲染缩略图
const coverUrl = computed(() => {
  const cellVal = row.cells[coverCol.id];
  if (!cellVal) return null;
  // 调用 getFileBlobUrl API
  return getFileBlobUrl(String(cellVal), workspaceDir);
});
```

### 5.3 支持的封面格式

- 图片文件：jpg/png/gif/webp/svg
- 非图片文件：显示文件类型图标（FileIcon + 文件名）

## 6. 排序与过滤

- 排序：根据 `activeView.sort`，在网格顺序中体现
- 过滤：隐藏不匹配的卡片

## 7. 性能

- 默认使用 CSS Grid 布局，无需虚拟滚动
- 若卡片数 > 200，建议配合搜索/过滤使用
- 封面图片使用懒加载 `loading="lazy"`

## 8. 相关文档

- 数据库Bases-总体架构.md
- 数据库Bases-数据模型.md
- 数据库Bases-视图系统.md
