# 数据库 Bases — 日历视图

> 状态：设计阶段
> 优先级：P1
> 拆自：数据库Bases细化.md

## 1. 概述

日历视图以月历或周历形式展示数据，需要至少一个 `date` 类型列作为日期来源。行按日期分组显示。

## 2. 两种模式

| 模式   | 适用场景           | 粒度 |
| ------ | ------------------ | ---- |
| 月视图 | 月度规划、日程概览 | 天   |
| 周视图 | 周计划、详细日程   | 天   |

默认月视图。

## 3. 组件结构

```html
<CalendarView>
  <div class="flex-1 flex flex-col overflow-hidden">
    <!-- 导航栏 -->
    <CalendarNav v-model:year="year" v-model:month="month" :mode="mode" />

    <!-- 周视图 -->
    <WeekView v-if="mode === 'week'" :year :month :week :rows="calendarRows" />

    <!-- 月视图 -->
    <MonthView v-else :year :month :rows="calendarRows" />
  </div>
</CalendarView>
```

## 4. 月视图设计

### 4.1 布局

```
        2026年 5月          ←  ←  →  (月导航)

  一   二   三   四   五   六   日
                        1    2    3
  4    5    6    7    8    9   10
 11   12   13   14   15   16   17
 18   19   20   21   22   23   24
 25   26   27   28   29   30   31
```

### 4.2 日期格子

每个日期格显示：

- 日期数字（小字）
- 该日期下的行缩略（最多 3 条，超出显示 "+N"）

```
┌───────────┐
│  15       │
│  □ 设计方案 │
│  □ 代码审查 │
│  +1 更多   │
└───────────┘
```

### 4.3 交互

| 交互       | 行为                               |
| ---------- | ---------------------------------- |
| 点击日期格 | 侧边弹出该日所有行列表             |
| 点击行缩略 | 打开行详情（或切换到表格视图定位） |
| 点击 "+N"  | 展开显示该日全部行                 |

## 5. 周视图设计

### 5.1 布局

```
        5月11日 — 5月17日    ←  ←  →  (周导航)

  ┌──────────┬──────────┬──────────┬─── ...
  │ 周一 11  │ 周二 12  │ 周三 13  │ ...
  │          │          │          │
  │ 设计方案  │ 代码审查  │ □ 周会   │
  │ □ 晨会   │          │ □ 1v1   │
  │          │          │          │
  └──────────┴──────────┴──────────┴─── ...
```

### 5.2 全天 vs 时间段

- 如果 date 列值仅含日期（YYYY-MM-DD），视为全天事件
- 如果含时间（YYYY-MM-DD HH:mm），按时间排序

## 6. 日期列解析

### 6.1 日期值格式

支持以下格式自动解析：

| 格式       | 示例                  |
| ---------- | --------------------- |
| ISO        | `2026-05-15`          |
| ISO + 时间 | `2026-05-15T14:30:00` |
| 中文       | `2026年5月15日`       |
| 时间戳     | `1715731200000`       |

使用 `Date.parse()` 兜底。

### 6.2 日期列选择

- 创建日历视图时，自动选择第一个 `date` 列
- 无 date 列时显示引导提示："需要一个日期列才能显示日历视图"

## 7. 日历行数据

```ts
const calendarRowsByDate = computed(() => {
  if (!data.value || !dateColumn.value) return {};

  const map: Record<string, BaseRow[]> = {};
  for (const row of data.value.rows) {
    const dateVal = String(row.cells[dateColumn.value!.id] ?? "");
    if (!dateVal) continue;

    // 标准化为 YYYY-MM-DD
    const parsed = new Date(dateVal);
    if (isNaN(parsed.getTime())) continue;
    const key = parsed.toISOString().slice(0, 10);

    if (!map[key]) map[key] = [];
    map[key].push(row);
  }
  return map;
});
```

## 8. 导航

### 8.1 月导航

```
← 2026年 5月 →
```

- `←` `→` 切换月份
- 点击年月文字 → DatePicker 快速跳转
- 点击"今天"回到当前月

### 8.2 周导航

```
← 5月11日 — 5月17日 →
```

- `←` `→` 切换周
- 点击日期范围 → DatePicker 跳转
- 点击"今天"回到当前周

## 9. 配置项

| 配置               | 默认值         | 说明               |
| ------------------ | -------------- | ------------------ |
| calendarDateColumn | 第一个 date 列 | 日期来源列         |
| calendarMode       | `"month"`      | month / week       |
| firstDayOfWeek     | `1`            | 周一 = 1，周日 = 0 |

## 10. 当前实现 vs 改进

### 现有实现（已可用）

- 按日期分组列表（非日历网格）
- 日期列自动检测
- 排序后的日期列表

### 设计改进

- 真正的月历/周历网格 UI
- 日期格内行缩略
- 导航切换
- 周视图

## 11. 相关文档

- 数据库Bases-总体架构.md
- 数据库Bases-数据模型.md
- 数据库Bases-视图系统.md
