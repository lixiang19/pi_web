# 图标规则

## 基本原则

- 图标包必须与项目 `iconLibrary` 一致
- 当前是 **Vue 语境**，不要写 `lucide-react`
- 对于 lucide，优先使用当前项目已安装的 `lucide-vue-next`
- 没有证据时，不要臆测别的图标包导入路径

---

## 不要写死错误生态

**错误：**

```ts
import { CheckIcon } from "lucide-react"
```

**正确：**

```ts
import { Check } from "lucide-vue-next"
```

如果项目 `iconLibrary` 不是 lucide，就按项目真实依赖调整。

---

## 图标尺寸

- 优先让按钮、菜单项、输入控件等宿主组件控制图标尺寸
- 没有明确设计要求时，不要在图标上散落大量 `w-* h-*` / `size-*` 覆盖
- 如果确实需要自定义尺寸，先确认这不是因为组件结构写错了

---

## 传递方式

在 Vue 中，优先直接传组件引用，而不是传字符串 key 再做一层脆弱映射。

**不推荐：**

```ts
const iconMap = {
  check: Check,
}
```

```vue
<StatusBadge icon="check" />
```

**更推荐：**

```vue
<script setup lang="ts">
import type { Component } from "vue"
defineProps<{ icon: Component }>()
</script>

<template>
  <component :is="icon" />
</template>
```

这样更直接，也更适合 Vue 组件组合。
