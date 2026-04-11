---
name: shadcn-vue
description: 仅用于 shadcn-vue / Vue 项目。负责初始化、添加组件、查看项目信息、主题定制、注册表构建与 MCP 配置。禁止在该技能中使用官方 React 的 shadcn CLI。
user-invocable: false
allowed-tools: Bash(npx shadcn-vue@latest *), Bash(pnpm dlx shadcn-vue@latest *), Bash(bunx --bun shadcn-vue@latest *)
---

# shadcn-vue

该技能**只适用于 shadcn-vue**。

- 这是 **Vue + shadcn-vue + Reka UI** 语境。
- **禁止**使用官方 React CLI：`npx shadcn@latest ...`
- **必须**使用：`npx shadcn-vue@latest ...`

> **重要：** 所有 CLI 命令都要使用项目自己的包管理器执行器：`npx shadcn-vue@latest`、`pnpm dlx shadcn-vue@latest` 或 `bunx --bun shadcn-vue@latest`。示例默认使用 `npx shadcn-vue@latest`。

## 当前项目上下文

```bash
!`npx shadcn-vue@latest info`
```

`info` 输出是**纯文本项目摘要**，不是 `--json`。先读取它，再决定组件路径、Tailwind 文件、图标库与样式风格。

## 核心原则

1. **先确认这是 shadcn-vue 项目。** 重点看 `components.json` 的 schema、`info` 输出、Vue 目录结构。
2. **先读取项目真实路径。** 只使用 `aliases` / `resolvedPaths` 里的路径，不要手写猜测导入。
3. **只使用 shadcn-vue 已支持的命令。** 不要虚构 `apply`、`search`、`view`、`docs`、`info --json` 之类不存在的命令。
4. **先查已安装组件，再决定 add。** 不要重复添加，也不要引用项目里还没安装的 UI 组件。
5. **优先修改主题变量，不要硬写颜色。** 主题入口是 `tailwindCssFile` 对应的全局 CSS 文件。
6. **新增组件后必须复查生成结果。** 检查导入路径、Vue 图标包、Tailwind 类、SFC 结构、是否符合当前项目约定。

## 关键规则

### 1. CLI 规则

只允许使用 shadcn-vue 实际存在的命令：

- `create`
- `init`
- `add`
- `diff`
- `info`
- `build`
- `mcp init`

**禁止继续沿用官方 shadcn 的命令心智：**

- 不要用 `npx shadcn@latest ...`
- 不要用 `apply`
- 不要用 `search`
- 不要用 `view`
- 不要用 `docs`
- 不要用 `info --json`

### 2. 样式规则

- 在 Vue 模板里使用 `class`，不是 `className`
- 间距优先 `gap-*`，不要继续堆 `space-x-*` / `space-y-*`
- 等宽高优先 `size-*`
- 截断优先 `truncate`
- 颜色优先语义 token：`bg-background`、`text-foreground`、`text-muted-foreground`、`text-destructive`
- 不要在组件里硬写原始颜色值去替代主题系统
- 不要手写一堆 `dark:` 覆盖去绕开 CSS 变量

### 3. 组件规则

- 优先使用已存在的 `src/components/ui` 组件，而不是自己重新造基础组件
- `Dialog` / `Sheet` / `Drawer` 一类弹层必须补齐标题与描述结构
- `Avatar` 要有 fallback
- `Card` 尽量使用完整组合结构，不要把所有内容都塞进同一个内容区
- 新增组件后，必须回读文件，确认没有遗留 React 用法、错误导入或错误图标包

### 4. 图标规则

- 图标包必须与项目 `iconLibrary` 一致
- 在 Vue 项目里，不要写 `lucide-react`
- 对于 lucide，优先使用当前项目已经安装的 Vue 包，例如 `lucide-vue-next`
- 不要把图标字符串 key 当作运行时映射的唯一来源，优先直接传组件引用

## 重点字段

运行 `npx shadcn-vue@latest info` 后，重点关注：

- `framework`
- `typescript`
- `isSrcDir`
- `tailwindVersion`
- `tailwindConfigFile`
- `tailwindCssFile`
- `aliasPrefix`
- `style`
- `iconLibrary`
- `aliases`
- `registries`
- `resolvedPaths`

## 工作流

1. **读取项目上下文**：先跑 `npx shadcn-vue@latest info`
2. **检查现有 UI 组件目录**：确认哪些组件已经存在
3. **再执行 `add` 或 `diff`**
4. **回读新增文件**：检查是否存在错误路径、错误图标导入、Vue 语法问题
5. **需要换主题时优先改 CSS 变量**，必要时再重新 `init --preset ... --force`
6. **最终做项目级检查**：至少跑类型检查 / lint / 构建检查（按项目约定）

## 快速参考

```bash
# 查看项目信息
npx shadcn-vue@latest info

# 初始化现有项目
npx shadcn-vue@latest init

# 以 preset 初始化/重初始化
npx shadcn-vue@latest init --preset reka-mira --force

# 创建新项目
npx shadcn-vue@latest create my-app --template vite --preset reka-mira

# 添加组件
npx shadcn-vue@latest add button card dialog sidebar

# 查看某个组件与注册表差异
npx shadcn-vue@latest diff button

# 构建自定义 registry
npx shadcn-vue@latest build

# 初始化 MCP 配置
npx shadcn-vue@latest mcp init --client codex
```

## 主题与 preset

当前已知 preset 风格名称来自 shadcn-vue CLI：

- `reka-vega`
- `reka-nova`
- `reka-maia`
- `reka-lyra`
- `reka-mira`
- `reka-luma`

切换 preset 时：

- 先和用户确认是否允许覆盖现有配置
- 如果只是改主题颜色，优先直接编辑全局 CSS 变量
- 如果确实要整体重初始化，再使用 `init --preset <preset> --force`
- **不要**再使用 React CLI 里的 `apply`

## 组件文档策略

shadcn-vue 没有官方 shadcn CLI 那套 `docs/search/view` 命令工作流。

因此：

- 组件 API 以 **shadcn-vue 官网文档** 与项目现有源码为准
- 注册表/安装相关信息以 `add`、`diff`、`build`、`mcp` 为准
- 不要伪造不存在的“先 docs 后 add”流程

## 明确禁止

以下做法都视为错误：

- 把 Vue 项目当成 React `shadcn/ui` 项目处理
- 看到 `components.json` 就默认执行 `npx shadcn@latest ...`
- 给 shadcn-vue 项目写 React 专属术语：`isRSC`、`className`、`lucide-react`
- 在没有证据的情况下编造 CLI 参数或命令
- 不检查生成文件，直接假设 CLI 输出一定正确
