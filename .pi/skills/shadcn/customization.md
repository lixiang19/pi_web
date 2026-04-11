# 主题定制与样式修改

shadcn-vue 组件依赖语义化 CSS 变量。**优先改变量，不要在组件里硬编码颜色。**

## 目录

- 主题变量如何生效
- 深色模式
- 如何切换 preset
- 如何添加自定义颜色
- 圆角与设计 token
- 如何检查组件更新

---

## 主题变量如何生效

整体链路：

1. 在全局 CSS 中定义变量（亮色 / 暗色）
2. Tailwind 把变量映射成工具类，例如 `bg-primary`、`text-muted-foreground`
3. 组件使用这些工具类
4. 你修改变量后，引用这些 token 的组件会一起更新

因此，**不要在业务组件里到处补丁式覆盖颜色**。

---

## 深色模式

深色模式应由全局主题类或应用级主题方案统一驱动。核心原则：

- 用 CSS 变量承接明暗主题
- 在组件内优先写语义 token，而不是一堆原始 `dark:*` 颜色值
- 如果项目已经有自己的主题切换机制，沿用项目现有方案

---

## 如何切换 preset

shadcn-vue 没有 `apply` 命令。

如果用户确实要整体切换风格，可用重新初始化方式：

```bash
# 重新初始化为某个 preset（会覆盖配置）
npx shadcn-vue@latest init --preset reka-nova --force

# 另一个示例
npx shadcn-vue@latest init --preset reka-mira --force
```

执行前必须确认：

1. 用户是否接受覆盖现有配置
2. 是否真的需要整体换 preset
3. 能否只通过修改全局 CSS 变量解决

如果只是改主题色、圆角、局部视觉风格，**优先直接编辑全局 CSS**。

---

## 如何找到全局 CSS 文件

先执行：

```bash
npx shadcn-vue@latest info
```

然后读取其中的：

- `tailwindCssFile`
- `tailwindVersion`

全局主题变量应始终写在 `tailwindCssFile` 指向的文件中。

---

## 添加自定义颜色

### 1）先在全局 CSS 里定义变量

```css
:root {
  --warning: oklch(0.84 0.16 84);
  --warning-foreground: oklch(0.28 0.07 46);
}

.dark {
  --warning: oklch(0.41 0.11 46);
  --warning-foreground: oklch(0.99 0.02 95);
}
```

### 2）注册到 Tailwind

如果 `tailwindVersion` 是 `v4`：

```css
@theme inline {
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
}
```

如果 `tailwindVersion` 是 `v3`，则在 `tailwind.config.js/ts` 中注册扩展颜色。

### 3）在组件里使用语义类

```vue
<div class="bg-warning text-warning-foreground">
  Warning
</div>
```

---

## 圆角与设计 token

- 全局圆角一般由 `--radius` 一类变量控制
- 组件应尽量复用同一套 token
- 不要在不同组件里散落大量局部 `rounded-*` 覆盖，除非那是明确的设计要求

---

## 组件定制顺序

当你要改组件外观时，优先级如下：

1. **先用组件已有 variant / size / state 能力**
2. **再用语义 token**
3. **再改全局 CSS 变量**
4. **最后才考虑修改组件源码**

目标是：**从设计系统根部改，不要在叶子节点到处打补丁。**

---

## 检查组件更新

shadcn-vue 里更新检查用 `diff`：

```bash
npx shadcn-vue@latest diff button
```

适用场景：

- 想看本地组件与注册表之间的差异
- 准备更新某个组件前先了解影响
- 想确认自定义改动是否已经偏离上游过多

> 不要再写 React CLI 那套 `add --diff`、`view`、`apply` 工作流。当前技能只认 shadcn-vue 的真实命令。
