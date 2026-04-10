# Pi 扩展示例目录梳理

## 目录概览

文档/examples 目录包含 **122 个文件**，涵盖以下核心类别：

```
文档/examples/
├── rpc-extension-ui.ts          # RPC 模式 TUI 客户端示例
├── sdk/                          # SDK 接入示例 (13个)
└── extensions/                     # 扩展插件示例 (40+个)
    ├── README.md                 # 扩展总览文档
    ├── plan-mode/                # 计划模式扩展
    ├── doom-overlay/             # DOOM 游戏覆盖层
    ├── subagent/                 # 子代理工具
    ├── custom-provider-*/        # 自定义 Provider 示例 (4个)
    ├── dynamic-resources/        # 动态资源加载
    ├── sandbox/                  # OS级沙箱
    └── with-deps/                # 带依赖的扩展示例
```

---

## 一、SDK 接入示例 (sdk/)

| 文件 | 说明 |
|------|------|
| `01-minimal.ts` | 最简 SDK 调用示例 |
| `02-custom-model.ts` | 自定义模型配置 |
| `03-custom-prompt.ts` | 自定义系统提示词 |
| `04-skills.ts` | Skill 使用示例 |
| `05-tools.ts` | 工具调用示例 |
| `06-extensions.ts` | 扩展加载示例 |
| `07-context-files.ts` | 上下文文件传递 |
| `08-prompt-templates.ts` | 提示词模板使用 |
| `09-api-keys-and-oauth.ts` | API Key 与 OAuth 配置 |
| `10-settings.ts` | 设置管理示例 |
| `11-sessions.ts` | 会话管理示例 |
| `12-full-control.ts` | 完整控制模式 |
| `13-session-runtime.ts` | 会话运行时控制 |

**用途**：展示如何通过 SDK 以编程方式调用 pi，适用于构建自定义客户端或集成到其他应用。

---

## 二、扩展插件示例分类

### 2.1 生命周期与安全 (Lifecycle & Safety)

| 扩展 | 核心功能 | 技术要点 |
|------|----------|----------|
| `permission-gate.ts` | 危险命令确认拦截 | 正则匹配 `rm -rf`, `sudo` 等，支持交互式确认 |
| `protected-paths.ts` | 保护敏感文件/目录 | 拦截 `.env`, `.git/`, `node_modules/` 的写入 |
| `dirty-repo-guard.ts` | 未提交变更保护 | 阻止在有未提交变更时切换会话 |
| `sandbox/` | OS 级沙箱 | 使用 `@anthropic-ai/sandbox-runtime` 实现进程隔离 |

### 2.2 自定义工具 (Custom Tools)

| 扩展 | 核心功能 | 技术要点 |
|------|----------|----------|
| `todo.ts` | Todo 列表管理 | **状态持久化 via `details`**，分支支持 |
| `hello.ts` | 最简工具示例 | 入门模板 |
| `question.ts` | 用户交互提问 | `ctx.ui.select()` 演示 |
| `questionnaire.ts` | 多问题表单 | Tab 导航 + 状态管理 |
| `tool-override.ts` | 工具行为覆盖 | 给内置工具添加日志/权限控制 |
| `dynamic-tools.ts` | 运行时注册工具 | `session_start` 钩子 + 运行时命令 |
| `built-in-tool-renderer.ts` | 内置工具渲染定制 | 自定义 `read`, `bash`, `edit`, `write` 的 UI |
| `minimal-mode.ts` | 极简模式 | 折叠模式下只显示工具调用 |
| `truncated-tool.ts` | 输出截断封装 | 50KB/2000行限制 |
| `antigravity-image-gen.ts` | 图片生成 | Google Antigravity API 集成 |
| `ssh.ts` | 远程 SSH 执行 | 可插拔操作模式 |
| `subagent/` | 子代理委派 | **核心扩展**：隔离上下文窗口的任务委派 |

### 2.3 命令与 UI (Commands & UI)

| 扩展 | 核心功能 | 技术要点 |
|------|----------|----------|
| `preset.ts` | 模型预设 | `--preset` 标志 + `/preset` 命令 |
| `plan-mode/` | 计划模式 | **Claude Code 风格**：只读探索 + 步骤跟踪 |
| `tools.ts` | 工具开关 | 交互式启用/禁用工具 |
| `handoff.ts` | 会话转交 | `/handoff <goal>` 转移上下文 |
| `qna.ts` | 问题提取 | `ctx.ui.setEditorText()` 演示 |
| `status-line.ts` | 状态行 | `ctx.ui.setStatus()` 显示进度 |
| `snake.ts` | 贪吃蛇游戏 | 键盘处理 + 会话持久化 |
| `send-user-message.ts` | 发送用户消息 | `pi.sendUserMessage()` API |
| `timed-confirm.ts` | 超时确认对话框 | AbortSignal 自动取消 |
| `rpc-demo.ts` | RPC UI 方法演示 | 配合 `rpc-extension-ui.ts` 使用 |
| `modal-editor.ts` | 模态编辑器 | Vim 风格自定义编辑器 |
| `rainbow-editor.ts` | 彩虹编辑器 | 动画文本效果 |
| `notify.ts` | 桌面通知 | OSC 777 协议 (Ghostty/iTerm2/WezTerm) |
| `titlebar-spinner.ts` | 标题栏加载动画 | Braille 旋转器 |
| `summarize.ts` | 会话摘要 | GPT-5.2 总结 + 临时 UI |
| `custom-footer.ts` | 自定义页脚 | Git 分支 + Token 统计 |
| `custom-header.ts` | 自定义页头 | 品牌定制 |
| `overlay-test.ts` | 覆盖层测试 | 锚点/边距/堆叠/溢出 |
| `doom-overlay/` | **DOOM 游戏** | **35 FPS 实时渲染**，WebAssembly |

### 2.4 Git 集成

| 扩展 | 核心功能 |
|------|----------|
| `git-checkpoint.ts` | 每轮自动 stash 检查点 |
| `auto-commit-on-exit.ts` | 退出时自动提交 |

### 2.5 系统提示词与压缩 (System Prompt & Compaction)

| 扩展 | 核心功能 |
|------|----------|
| `pirate.ts` | `systemPromptAppend` 动态修改系统提示词 |
| `claude-rules.ts` | 扫描 `.claude/rules/` 文件夹 |
| `custom-compaction.ts` | 自定义会话压缩策略 |
| `trigger-compact.ts` | 超过 100k tokens 自动触发压缩 |

### 2.6 系统集成

| 扩展 | 核心功能 |
|------|----------|
| `mac-system-theme.ts` | 与 macOS 深色/浅色模式同步 |

### 2.7 资源管理

| 扩展 | 核心功能 |
|------|----------|
| `dynamic-resources/` | 动态加载 skills, prompts, themes |

### 2.8 消息与通信

| 扩展 | 核心功能 |
|------|----------|
| `message-renderer.ts` | 自定义消息渲染 + 可展开详情 |
| `event-bus.ts` | 扩展间通信 `pi.events` |

### 2.9 会话元数据

| 扩展 | 核心功能 |
|------|----------|
| `session-name.ts` | `setSessionName` 命名会话 |
| `bookmark.ts` | `setLabel` 书签标记 |

### 2.10 自定义 Provider (Custom Providers)

| 扩展 | 说明 |
|------|------|
| `custom-provider-anthropic/` | Anthropic Provider + OAuth |
| `custom-provider-gitlab-duo/` | GitLab Duo (pi-ai 内置流代理) |
| `custom-provider-qwen-cli/` | 通义千问 CLI + OAuth 设备流 |

### 2.11 外部依赖

| 扩展 | 说明 |
|------|------|
| `with-deps/` | 带 package.json 的扩展示例 (jiti 模块解析) |
| `file-trigger.ts` | 监听触发文件并注入内容 |

---

## 三、重点扩展示例详解

### 3.1 Subagent - 子代理工具

**位置**: `extensions/subagent/`

**核心能力**:
- **三种模式**: Single / Parallel / Chain
- **隔离上下文**: 每个子代理独立进程，隔离上下文窗口
- **并发控制**: 最多 8 个并行任务，4 并发限制
- **代理发现**: 支持用户级 (`~/.pi/agent/agents/`) 和项目级 (`.pi/agents/`) 代理

**代码结构**:
```
subagent/
├── index.ts       # 主工具实现 (600+ 行)
├── agents.ts      # 代理发现逻辑
├── agents/        # 内置代理定义
│   ├── coder.md
│   ├── reviewer.md
│   └── ...
└── prompts/       # 提示词模板
```

**使用示例**:
```typescript
// 单任务模式
{ agent: "coder", task: "实现用户认证" }

// 并行模式
{ tasks: [
  { agent: "reviewer", task: "审查 api.ts" },
  { agent: "reviewer", task: "审查 auth.ts" }
]}

// 链式模式
{ chain: [
  { agent: "analyzer", task: "分析需求" },
  { agent: "coder", task: "基于分析实现: {previous}" }
]}
```

---

### 3.2 Plan Mode - 计划模式

**位置**: `extensions/plan-mode/`

**灵感来源**: Claude Code 的计划模式

**工作流程**:
1. **计划阶段 (Plan Mode)**: 只读工具 + Bash 白名单，安全分析代码
2. **执行阶段**: 恢复完整工具访问，执行计划步骤
3. **进度跟踪**: `[DONE:n]` 标记 + Widget 进度显示

**Bash 白名单示例**:
```
允许: cat, head, tail, grep, find, ls, git status/log/diff
阻止: rm, mv, cp, git add/commit, npm install, sudo
```

---

### 3.3 DOOM Overlay - 游戏覆盖层

**位置**: `extensions/doom-overlay/`

**技术亮点**:
- **35 FPS 实时渲染** 在半块字符上 (▀)
- WebAssembly 编译自 [doomgeneric](https://github.com/ozkl/doomgeneric)
- 自动下载 shareware WAD (~4MB)
- 使用 `width: "90%"`, `maxHeight: "80%"`, `anchor: "center"`

---

### 3.4 RPC Extension UI - 自定义 TUI

**位置**: `rpc-extension-ui.ts` (根目录)

**用途**: 演示如何构建基于 RPC 协议的自定义 TUI 客户端

**核心组件**:
- `OutputLog`: 输出日志区
- `LoadingIndicator`: 加载动画
- `PromptInput`: 用户输入
- `SelectDialog` / `InputDialog`: 扩展 UI 对话框

---

## 四、扩展开发关键模式

### 4.1 状态持久化 (通过 `details`)

```typescript
// 存储状态到 tool result details
return {
  content: [{ type: "text", text: "Done" }],
  details: { todos: [...todos], nextId },  // 分支支持
};

// 会话启动时重建状态
pi.on("session_start", async (_event, ctx) => {
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type === "message" && entry.message.toolName === "my_tool") {
      const details = entry.message.details;
      // 重建状态
    }
  }
});
```

### 4.2 StringEnum 参数类型

```typescript
import { StringEnum } from "@mariozechner/pi-ai";

// ✅ 正确 - Google API 兼容
action: StringEnum(["list", "add"] as const)

// ❌ 错误 - Google 不工作
action: Type.Union([Type.Literal("list"), Type.Literal("add")])
```

### 4.3 生命周期钩子

```typescript
pi.on("session_start", async (event, ctx) => { });
pi.on("session_tree", async (event, ctx) => { });
pi.on("tool_call", async (event, ctx) => { return { block: true, reason: "..." } });
pi.on("model_select", async (event, ctx) => { });
```

---

## 五、快速启动模板

### 最简扩展模板

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export default function (pi: ExtensionAPI) {
  // 1. 注册工具
  pi.registerTool({
    name: "greet",
    label: "Greeting",
    description: "Generate a greeting",
    parameters: Type.Object({
      name: Type.String({ description: "Name to greet" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      return {
        content: [{ type: "text", text: `Hello, ${params.name}!` }],
        details: {},
      };
    },
  });

  // 2. 注册命令
  pi.registerCommand("hello", {
    description: "Say hello",
    handler: async (args, ctx) => {
      ctx.ui.notify("Hello!", "info");
    },
  });

  // 3. 生命周期监听
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash" && event.input.command?.includes("rm -rf")) {
      const ok = await ctx.ui.confirm("Dangerous!", "Allow rm -rf?");
      if (!ok) return { block: true, reason: "Blocked by user" };
    }
  });
}
```

---

## 六、相关文档

| 文档 | 位置 |
|------|------|
| 扩展开发完整文档 | `/Users/lixiang/.local/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md` |
| TUI 组件文档 | `/Users/lixiang/.local/lib/node_modules/@mariozechner/pi-coding-agent/docs/tui.md` |
| 提示词模板文档 | `/Users/lixiang/.local/lib/node_modules/@mariozechner/pi-coding-agent/docs/prompt-templates.md` |
| 技能开发指南 | `.agents/skills/pi-extensions-dev/SKILL.md` |

---

## 总结

**文档/examples 目录** 是学习和开发 pi 扩展的核心资源：

1. **从简单开始**: `hello.ts`, `permission-gate.ts`
2. **学习状态管理**: `todo.ts` (最佳实践)
3. **掌握 UI 定制**: `custom-footer.ts`, `overlay-test.ts`
4. **探索高级功能**: `subagent/`, `plan-mode/`, `doom-overlay/`
5. **构建自定义客户端**: `sdk/` + `rpc-extension-ui.ts`
