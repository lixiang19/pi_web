# 样式规则

参见 [customization.md](../customization.md) 了解主题变量、Tailwind 注册和自定义颜色。

## 核心原则

1. **先用语义 token，再谈局部覆盖**
2. **在 Vue 模板里使用 `class`，不是 `className`**
3. **布局优先 `gap-*`，不要堆 `space-x-*` / `space-y-*`**
4. **等宽高优先 `size-*`**
5. **优先 `truncate`，不要手写整套文本截断类**
6. **不要用原始颜色值破坏主题系统**
7. **不要在组件里写大量 `dark:*` 去绕开变量体系**

---

## 语义颜色

**错误：**

```vue
<div class="bg-blue-500 text-white">
  <p class="text-gray-600">Secondary text</p>
</div>
```

**正确：**

```vue
<div class="bg-primary text-primary-foreground">
  <p class="text-muted-foreground">Secondary text</p>
</div>
```

---

## 状态颜色

成功、失败、警告、次要信息等状态，优先用：

- `text-destructive`
- 主题里定义的自定义 token
- 项目已有的 Badge / Alert / Callout 语义组件

不要直接写：

- `text-green-500`
- `bg-red-100`
- `text-emerald-600`

除非设计系统已经明确允许。

---

## 布局间距

**错误：**

```vue
<div class="space-y-4">
  <Input />
  <Input />
</div>
```

**正确：**

```vue
<div class="flex flex-col gap-4">
  <Input />
  <Input />
</div>
```

---

## 等宽高

**错误：**

```vue
<Avatar class="w-10 h-10" />
```

**正确：**

```vue
<Avatar class="size-10" />
```

---

## 深色模式

**错误思路：** 在组件里散落大量 `dark:bg-*`、`dark:text-*` 试图硬改主题。

**正确思路：**

- 让明暗主题由全局 CSS 变量驱动
- 组件里写 `bg-background`、`text-foreground`、`text-muted-foreground` 这类语义类

---

## 条件类名

如果项目已有 `cn()` / `clsx` / `tailwind-merge` 封装，优先使用统一工具，不要在每个组件里重复拼接复杂字符串。
