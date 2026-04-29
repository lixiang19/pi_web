# 数据库 Bases — 后存储与性能

> 状态：设计阶段
> 优先级：P0
> 拆自：数据库Bases细化.md

## 1. 存储架构

### 1.1 文件位置

```
~/.pi/{workspace}/数据库/
├── 任务.base
├── 项目.base
└── 书籍库.base
```

### 1.2 .base 文件格式

纯 JSON 文本文件，UTF-8 编码，2 空格缩进。不压缩不混淆，用户可直接用文本编辑器修改。

### 1.3 读写路径

```
前端 BaseViewShell
  → GET /api/workspace/base?path=数据库/任务.base
    → 后端 fs.readFile → JSON.parse → 解析 file row frontmatter → 返回
  → PUT /api/workspace/base { path, data }
    → 后端 剥离 fileTitle/fileData → JSON.stringify → fs.writeFile
```

## 2. 保存策略

### 2.1 防抖保存

```ts
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const debouncedSave = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 1000); // 1秒防抖
};
```

- 快速连续操作（如快速输入）只触发一次保存
- 1秒无操作后自动保存
- `isSaving` 指示器显示"保存中..."

### 2.2 显式保存

除了防抖，以下场景触发即时保存：

- 页面/标签关闭前（beforeunload）
- 切换视图时

### 2.3 脏标记优化（可选）

```ts
const isDirty = ref(false);

// 任何变更操作时设为 true
const markDirty = () => {
  isDirty.value = true;
  debouncedSave();
};

// 切换视图前检查
watch(activeViewId, (newId, oldId) => {
  if (isDirty.value && oldId) {
    save(); // 即时保存
    isDirty.value = false;
  }
});
```

## 3. 并发与冲突

### 3.1 场景

- 同一 .base 文件被两个标签页同时打开
- 外部工具（如 vim）修改 .base 文件

### 3.2 当前策略

**最后写入胜出（Last Write Wins）**。不做冲突检测。

### 3.3 未来可选方案

- 读取时存储 `mtime`
- 保存时检查 `mtime` 是否变化
- 若变化 → 提示用户"文件已被外部修改，是否覆盖？"

## 4. 性能策略

### 4.1 前端 computed 缓存

```ts
// 所有派生数据用 computed，自动依赖追踪
const activeView = computed(() => ...);
const sortedRows = computed(() => ...);
const kanbanGroups = computed(() => ...);
```

Vue 的 computed 自动缓存，依赖不变时不重新计算。

### 4.2 1000行基准

| 操作            | 行数        | 耗时   | 结论            |
| --------------- | ----------- | ------ | --------------- |
| JSON.parse      | 1000行      | ~5ms   | ✅              |
| computed sort   | 1000行      | ~3ms   | ✅              |
| computed filter | 1000行      | ~2ms   | ✅              |
| DOM 渲染        | 1000行×10列 | ~200ms | ⚠️ 需要虚拟滚动 |

### 4.3 虚拟滚动

**阈值**：行数 > 500 时启用虚拟滚动。

**方案**：`@tanstack/vue-virtual`

```ts
import { useVirtualizer } from "@tanstack/vue-virtual";

const rowVirtualizer = useVirtualizer({
  count: sortedRows.value.length,
  getScrollElement: () => containerRef.value,
  estimateSize: () => 40, // 行高预估 40px
  overscan: 10,
});
```

只在表格视图中启用，其他视图（看板/画廊/日历）行数通常不超过 200，不需要。

### 4.4 文件引用行性能

当前后端在每次 `GET /api/workspace/base` 时遍历所有 `type === "file"` 的行读取文件。

**问题**：100 个文件引用行 = 100 次 fs.readFile。

**优化方案**：

- **前端缓存**：fileTitle 和 fileData 在前端用 Map 缓存，只首次加载时请求后端
- **增量更新**：后端增加 `GET /api/workspace/base/file-row?path=...` 单独刷新单个文件行
- **批量读取**：后端用 `Promise.all` 并发读取文件（当前是顺序 for 循环）

### 4.5 保存大小

- 1000行 × 10列 的 .base 文件 ≈ 150KB
- 读写时间：读取 ~10ms，写入 ~20ms（SSD）
- 1秒防抖足够

## 5. 内存管理

### 5.1 BaseData in memory

```ts
data.value = {
  name: "任务",
  columns: [...],    // ~20 columns × 200 bytes = 4KB
  rows: [...],       // ~1000 rows × 500 bytes = 500KB
  views: [...],      // ~5 views × 300 bytes = 1.5KB
  activeViewId: "...",
  sources: [],
};
// 总计 ~500KB in memory，完全可接受
```

### 5.2 标签页切换

- 切换到其他标签页时，data 保持在内存中（composable 未销毁）
- 只有当标签页被关闭时释放
- workspacePage 关闭时全部释放

## 6. 后端 API 设计

### 6.1 现有端点

| 端点                         | 方法   | 说明              |
| ---------------------------- | ------ | ----------------- |
| `/api/workspace/base`        | GET    | 读取 .base 文件   |
| `/api/workspace/base`        | PUT    | 保存 .base 文件   |
| `/api/workspace/base/create` | POST   | 创建新 .base 文件 |
| `/api/workspace/base`        | DELETE | 删除 .base 文件   |

### 6.2 未来端点

| 端点                           | 方法 | 说明               |
| ------------------------------ | ---- | ------------------ |
| `/api/workspace/base/file-row` | GET  | 刷新单个文件引用行 |

## 7. 相关文档

- 数据库Bases-总体架构.md
- 数据库Bases-数据模型.md
- 数据库Bases-表格视图.md
