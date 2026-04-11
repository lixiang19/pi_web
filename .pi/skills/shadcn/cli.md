# shadcn-vue CLI 参考

配置文件来自 `components.json`。

> **重要：** 始终使用项目自己的执行器运行命令：`npx shadcn-vue@latest`、`pnpm dlx shadcn-vue@latest` 或 `bunx --bun shadcn-vue@latest`。
>
> **重要：** 只使用 CLI 真正支持的命令和参数。不要编造 `apply`、`search`、`view`、`docs`、`info --json` 之类不存在的能力。

## 目录

- 命令：create、init、add、diff、info、build、mcp init
- 模板：nuxt、vite、astro、laravel
- preset：reka-vega、reka-nova、reka-maia、reka-lyra、reka-mira、reka-luma
- 重初始化与主题切换

---

## 命令

### `create` — 创建新项目

```bash
npx shadcn-vue@latest create [name] [options]
```

用于创建新的 shadcn-vue 项目。

| 参数 | 简写 | 说明 |
| --- | --- | --- |
| `--cwd <cwd>` | `-c` | 工作目录 |
| `--yes` | `-y` | 跳过确认 |
| `--preset <preset>` | `-p` | preset，支持 `reka-*` 名称 |
| `--template <template>` | `-t` | 模板：`nuxt`、`vite`、`astro`、`laravel` |
| `--base <base>` | — | 组件底座，目前为 `reka` |
| `--style <style>` | — | 风格：`vega`、`nova`、`maia`、`lyra`、`mira` |
| `--icon-library <icon-library>` | — | 图标库：`lucide`、`tabler`、`hugeicons`、`phosphor`、`remixicon` |
| `--font <font>` | — | 字体 |
| `--base-color <base-color>` | `-b` | 基础色：`neutral`、`gray`、`zinc`、`stone`、`slate` |
| `--src-dir` / `--no-src-dir` | — | 是否使用 `src/` 目录 |
| `--rtl` | — | 开启 RTL |

### `init` — 初始化现有项目

```bash
npx shadcn-vue@latest init [components...] [options]
```

用于初始化现有项目，也可以在初始化阶段一并安装组件。

| 参数 | 简写 | 说明 |
| --- | --- | --- |
| `--preset <preset>` | `-p` | preset，支持 `reka-*` 名称 |
| `--template <template>` | `-t` | 模板：`nuxt`、`vite`、`astro`、`laravel` |
| `--base <base>` | — | 组件底座，目前为 `reka` |
| `--style <style>` | — | 风格：`vega`、`nova`、`maia`、`lyra`、`mira` |
| `--icon-library <icon-library>` | — | 图标库 |
| `--font <font>` | — | 字体 |
| `--base-color <base-color>` | `-b` | 基础色 |
| `--yes` | `-y` | 跳过确认 |
| `--defaults` | `-d` | 使用默认配置 |
| `--force` | `-f` | 强制覆盖现有配置 |
| `--cwd <cwd>` | `-c` | 工作目录 |
| `--silent` | `-s` | 静默输出 |
| `--src-dir` / `--no-src-dir` | — | 是否使用 `src/` |
| `--css-variables` / `--no-css-variables` | — | 是否使用 CSS 变量 |
| `--no-base-style` | — | 不安装基础样式 |

### `add` — 添加组件

```bash
npx shadcn-vue@latest add [components...] [options]
```

接受组件名、URL 或本地路径。

| 参数 | 简写 | 说明 |
| --- | --- | --- |
| `--yes` | `-y` | 跳过确认 |
| `--overwrite` | `-o` | 覆盖现有文件 |
| `--cwd <cwd>` | `-c` | 工作目录 |
| `--all` | `-a` | 添加所有组件 |
| `--path <path>` | `-p` | 指定目标路径 |
| `--silent` | `-s` | 静默输出 |
| `--css-variables` / `--no-css-variables` | — | 是否使用 CSS 变量 |

### `diff` — 查看与注册表的差异

```bash
npx shadcn-vue@latest diff [component]
```

用于检查某个组件与注册表内容的差异。它是 shadcn-vue 里真实存在的更新检查入口。

| 参数 | 简写 | 说明 |
| --- | --- | --- |
| `--yes` | `-y` | 跳过确认 |
| `--cwd <cwd>` | `-c` | 工作目录 |

### `info` — 查看项目信息

```bash
npx shadcn-vue@latest info
```

输出项目识别结果与 `components.json` 解析结果。**这是本技能第一步应该执行的命令。**

重点读取：

- `framework`
- `typescript`
- `isSrcDir`
- `tailwindConfigFile`
- `tailwindCssFile`
- `tailwindVersion`
- `aliasPrefix`
- `style`
- `iconLibrary`
- `aliases`
- `registries`
- `resolvedPaths`

> `info` **不支持** `--json`。

### `build` — 构建自定义 registry

```bash
npx shadcn-vue@latest build [registry] [options]
```

默认输入 `./registry.json`，默认输出 `./public/r`。

| 参数 | 简写 | 说明 |
| --- | --- | --- |
| `--output <path>` | `-o` | 输出目录 |
| `--cwd <cwd>` | `-c` | 工作目录 |

### `mcp init` — 初始化 MCP 配置

```bash
npx shadcn-vue@latest mcp init --client <client>
```

支持的 client：

- `claude`
- `cursor`
- `vscode`
- `codex`
- `opencode`

---

## 模板

| 值 | 说明 |
| --- | --- |
| `nuxt` | Nuxt 项目 |
| `vite` | Vite 项目 |
| `astro` | Astro 项目 |
| `laravel` | Laravel 项目 |

---

## preset

当前 CLI 可见 preset：

- `reka-vega`
- `reka-nova`
- `reka-maia`
- `reka-lyra`
- `reka-mira`
- `reka-luma`

常见示例：

```bash
# 初始化现有项目
npx shadcn-vue@latest init --preset reka-mira

# 强制重初始化
npx shadcn-vue@latest init --preset reka-nova --force

# 创建新项目
npx shadcn-vue@latest create my-app --template vite --preset reka-mira
```

---

## 主题切换与重初始化

shadcn-vue **没有** React 官方 shadcn CLI 的 `apply` 命令。

因此切换风格时遵循下面原则：

1. **如果只是调颜色/圆角/局部主题，优先直接改全局 CSS 变量**
2. **如果要整体换 preset，再执行 `init --preset <preset> --force`**
3. 执行前先确认用户是否接受覆盖现有配置
4. 执行后必须回读变更文件，不要假设 CLI 一定完全符合项目约定

---

## 不允许的错误做法

以下都属于错误：

```bash
npx shadcn@latest info --json
npx shadcn@latest add button
npx shadcn@latest apply --preset nova
npx shadcn@latest search @shadcn -q "sidebar"
npx shadcn@latest docs button
```

对于 shadcn-vue 项目，这些命令要么来自错误生态，要么在当前 CLI 中根本不存在。
