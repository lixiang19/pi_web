# Pi 插件功能全面梳理

> 基于 `@mariozechner/pi-coding-agent` 官方示例目录分析
> 共 **58 个独立插件** + **6 个复合插件目录**

---

## 目录结构

```
文档/examples/extensions/
├── README.md                      # 官方扩展开发指南
├── rpc-demo.ts                    # RPC UI 方法演示
│
├── 📁 Lifecycle & Safety (生命周期与安全)
│   ├── permission-gate.ts         # 危险命令拦截
│   ├── protected-paths.ts         # 敏感路径保护
│   ├── confirm-destructive.ts     # 破坏性操作确认
│   ├── dirty-repo-guard.ts        # 未提交变更保护
│   └── git-checkpoint.ts          # Git 检查点
│
├── 📁 Custom Tools (自定义工具)
│   ├── todo.ts                    # Todo 列表管理 (状态持久化最佳实践)
│   ├── hello.ts                   # 最简工具模板
│   ├── question.ts                # 单问题选择器 (自定义 UI)
│   ├── questionnaire.ts           # 多问题表单
│   ├── dynamic-tools.ts           # 运行时工具注册
│   ├── truncated-tool.ts          # 输出截断封装
│   ├── antigravity-image-gen.ts   # 图片生成
│   ├── ssh.ts                     # SSH 远程执行
│   ├── space-invaders.ts          # 太空侵略者游戏
│   ├── snake.ts                   # 贪吃蛇游戏
│   └── subagent/                  # 子代理委派 (核心)
│
├── 📁 Tool Override (工具覆盖)
│   ├── tool-override.ts           # 内置工具覆盖示例
│   ├── built-in-tool-renderer.ts  # 内置工具渲染定制
│   ├── minimal-mode.ts            # 极简模式渲染
│   └── inline-bash.ts             # 行内 Bash 扩展
│
├── 📁 Commands & UI (命令与界面)
│   ├── commands.ts                # 命令列表展示
│   ├── preset.ts                  # 模型预设切换
│   ├── handoff.ts                 # 会话上下文转交
│   ├── qna.ts                     # Q&A 提取器
│   ├── status-line.ts             # 状态行显示
│   ├── widget-placement.ts        # 控件位置测试
│   ├── hidden-thinking-label.ts   # 思考标签定制
│   ├── model-status.ts            # 模型状态显示
│   ├── send-user-message.ts       # 发送用户消息
│   ├── timed-confirm.ts           # 超时确认对话框
│   ├── modal-editor.ts            # 模态编辑器
│   ├── rainbow-editor.ts          # 彩虹动画编辑器
│   ├── notify.ts                  # 桌面通知
│   ├── titlebar-spinner.ts        # 标题栏加载动画
│   ├── summarize.ts               # 会话摘要
│   ├── custom-footer.ts            # 自定义页脚
│   ├── custom-header.ts            # 自定义页头
│   ├── overlay-test.ts            # 覆盖层测试
│   ├── overlay-qa-tests.ts        # 覆盖层 QA 测试
│   ├── doom-overlay/              # DOOM 游戏 (35 FPS)
│   ├── shutdown-command.ts        # 关闭命令
│   ├── reload-runtime.ts          # 运行时重载
│   └── interactive-shell.ts       # 交互式 Shell
│
├── 📁 Session Management (会话管理)
│   ├── session-name.ts            # 会话命名
│   ├── bookmark.ts                # 书签标记
│   ├── event-bus.ts               # 扩展间事件通信
│   └── message-renderer.ts        # 自定义消息渲染
│
├── 📁 System Prompt (系统提示词)
│   ├── pirate.ts                  # 海盗模式 (动态系统提示)
│   ├── claude-rules.ts            # .claude/rules 规则加载
│   └── system-prompt-header.ts    # 系统提示词头部定制
│
├── 📁 Compaction (会话压缩)
│   ├── custom-compaction.ts       # 自定义压缩策略
│   └── trigger-compact.ts         # 自动触发压缩
│
├── 📁 System Integration (系统集成)
│   └── mac-system-theme.ts        # macOS 主题同步
│
├── 📁 Resources (资源管理)
│   └── dynamic-resources/         # 动态资源加载
│
├── 📁 Custom Providers (自定义 Provider)
│   ├── custom-provider-anthropic/ # Anthropic + OAuth
│   ├── custom-provider-gitlab-duo/# GitLab Duo
│   └── custom-provider-qwen-cli/  # 通义千问 CLI
│
└── 📁 Dependencies (依赖管理)
    ├── with-deps/                 # 带依赖的扩展
    ├── file-trigger.ts            # 文件触发器
    └── bash-spawn-hook.ts         # Bash 派生钩子
```

---

## 一、生命周期与安全类插件 (5个)

### 1.1 permission-gate.ts - 危险命令拦截
```typescript
// 功能：拦截 rm -rf, sudo, chmod/chown 777 等危险命令
// 触发点：tool_call 事件
// 模式：正则匹配 + 交互确认
const dangerousPatterns = [/rm\s+(-rf?|--recursive)/i, /sudo\b/i, /(chmod|chown)\b.*777/i];
```

### 1.2 protected-paths.ts - 敏感路径保护
```typescript
// 功能：阻止写入 .env, .git/, node_modules/ 等敏感路径
// 触发点：write/edit 工具调用
const protectedPaths = [".env", ".git/", "node_modules/"];
```

### 1.3 confirm-destructive.ts - 破坏性操作确认
```typescript
// 功能：在 clear/switch/fork 会话前确认
// 触发点：session_before_switch / session_before_fork
// 检测：是否存在未保存的用户消息
```

### 1.4 dirty-repo-guard.ts - 未提交变更保护
```typescript
// 功能：检测 git 工作区是否有未提交变更
// 触发点：session_before_switch / session_before_fork
// 机制：git status --porcelain 检测
```

### 1.5 git-checkpoint.ts - Git 检查点
```typescript
// 功能：每轮创建 git stash 检查点，fork 时可恢复代码状态
// 触发点：turn_start (创建) / session_before_fork (恢复)
// 存储：Map<entryId, stashRef>
```

---

## 二、自定义工具类插件 (11个)

### 2.1 todo.ts - **状态持久化最佳实践**
```typescript
// 核心模式：
// 1. 状态存储在 tool result details 中
// 2. 通过 session_start / session_tree 重建状态
// 3. 支持分支切换（fork 后状态自动正确）

interface TodoDetails {
  action: "list" | "add" | "toggle" | "clear";
  todos: Todo[];
  nextId: number;
  error?: string;
}

// 关键方法：从会话分支重建状态
const reconstructState = (ctx: ExtensionContext) => {
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type === "message" && entry.message.toolName === "todo") {
      const details = entry.message.details as TodoDetails;
      // 重建状态...
    }
  }
};
```

### 2.2 hello.ts - 最简工具模板
```typescript
// 入门模板：defineTool + registerTool
import { defineTool } from "@mariozechner/pi-coding-agent";
const helloTool = defineTool({ name, label, description, parameters, execute });
pi.registerTool(helloTool);
```

### 2.3 question.ts - 单问题选择器
```typescript
// 功能：带选项列表的自定义 UI 问题
// 特性：
// - 上下箭头选择
// - "Type something" 选项进入编辑模式
// - Escape 返回/取消
// - 完整自定义渲染 renderCall / renderResult
```

### 2.4 questionnaire.ts - 多问题表单
```typescript
// 功能：Tab 导航的多问题表单
// UI：选项列表 + 内联编辑器 + Tab 切换
```

### 2.5 dynamic-tools.ts - 运行时工具注册
```typescript
// 功能：在 session_start 或通过命令动态注册工具
// 场景：按需加载工具，条件注册
```

### 2.6 truncated-tool.ts - 输出截断封装
```typescript
// 功能：封装 ripgrep，自动截断 50KB/2000行
// 模式：工具包装器
```

### 2.7 antigravity-image-gen.ts - 图片生成
```typescript
// 功能：Google Antigravity 图片生成
// 特性：
// - 自动下载图片
// - 可选保存到磁盘
// - 显示生成进度
```

### 2.8 ssh.ts - SSH 远程执行
```typescript
// 功能：将所有工具操作委托到远程机器
// 用法：pi -e ./ssh.ts --ssh user@host:/path
// 实现：createRemoteReadOps / createRemoteWriteOps / createRemoteEditOps / createRemoteBashOps
```

### 2.9 snake.ts - 贪吃蛇游戏
```typescript
// 功能：完整游戏，支持键盘控制 (WASD/方向键)
// 特性：
// - 100ms tick 定时器
// - 游戏状态持久化 (ESC 暂停)
// - 高分记录
// - 彩色渲染 (ANSI)
```

### 2.10 space-invaders.ts - 太空侵略者游戏
```typescript
// 功能：经典街机游戏
// 实现：自定义 TUI 组件 + 键盘处理 + 游戏循环
```

### 2.11 subagent/ - **子代理委派（核心）**
```typescript
// 功能：将任务委派给专门的子代理，隔离上下文窗口
// 模式：
// - Single: { agent: "name", task: "..." }
// - Parallel: { tasks: [{ agent, task }, ...] }
// - Chain: { chain: [{ agent, task }, ...] }

// 并发控制：
const MAX_PARALLEL_TASKS = 8;
const MAX_CONCURRENCY = 4;

// 代理发现：
// - 用户级: ~/.pi/agent/agents/
// - 项目级: .pi/agents/
```

---

## 三、工具覆盖类插件 (4个)

### 3.1 tool-override.ts - 内置工具覆盖
```typescript
// 功能：覆盖内置 read 工具，添加审计日志和敏感文件拦截
// 机制：注册同名工具即可覆盖
// 特性：
// - 访问日志 ~/.pi/agent/read-access.log
// - 拦截 .env, secrets.*, credentials.*, .ssh/, .aws/, .gnupg/
// - 复用内置渲染（不定义 renderCall/renderResult）
```

### 3.2 built-in-tool-renderer.ts - 内置工具渲染定制
```typescript
// 功能：自定义 read, bash, edit, write 的紧凑渲染
// 场景：简化显示，保持原始行为
```

### 3.3 minimal-mode.ts - 极简模式
```typescript
// 功能：折叠模式下只显示工具调用，不显示输出
// 场景：减少视觉干扰
```

### 3.4 inline-bash.ts - 行内 Bash 扩展
```typescript
// 功能：将 !{command} 模式展开为 bash 工具调用
// 触发点：input 事件转换
```

---

## 四、命令与界面类插件 (20个)

### 4.1 commands.ts - 命令列表展示
```typescript
// 功能：/commands 命令列出所有可用 slash 命令
// 分组：Extensions / Prompts / Skills
// 附加：显示命令源文件路径
```

### 4.2 preset.ts - **模型预设切换**
```typescript
// 功能：定义命名预设，配置模型/思考级别/工具/系统提示
// 配置位置：
// - ~/.pi/agent/presets.json (全局)
// - .pi/presets.json (项目级，优先级高)
//
// 用法：
// - pi --preset plan (启动时)
// - /preset (交互选择)
// - /preset implement (直接切换)
// - Ctrl+Shift+U (循环切换)
//
// 预设结构：
interface Preset {
  provider?: string;           // "anthropic" | "openai"
  model?: string;              // "claude-sonnet-4-5"
  thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  tools?: string[];            // ["read", "bash", "edit"]
  instructions?: string;       // 追加到系统提示词
}
```

### 4.3 handoff.ts - **会话上下文转交**
```typescript
// 功能：将会话上下文提取并转交给新会话
// 用法：/handoff <目标>
// 流程：
// 1. 获取当前分支所有消息
// 2. 使用 LLM 生成转交提示词
// 3. 创建新会话 (parentSession 追踪)
// 4. 加载生成的提示词到编辑器
```

### 4.4 qna.ts - Q&A 提取器
```typescript
// 功能：从最后一条助手消息提取问题到编辑器
// 用法：/qna
// 流程：
// 1. 获取最后 assistant 消息
// 2. 使用 GPT-5.2 提取问题
// 3. 显示加载动画
// 4. 结果加载到编辑器
```

### 4.5 status-line.ts - 状态行显示
```typescript
// 功能：在页脚显示轮次进度
// API：ctx.ui.setStatus(key, text)
```

### 4.6 widget-placement.ts - 控件位置测试
```typescript
// 功能：测试控件在编辑器上方/下方的放置
// API：ctx.ui.setWidget(key, placement, lines)
```

### 4.7 hidden-thinking-label.ts - 思考标签定制
```typescript
// 功能：自定义折叠思考内容的标签
// API：ctx.ui.setHiddenThinkingLabel(label)
```

### 4.8 model-status.ts - 模型状态显示
```typescript
// 功能：模型切换时在状态栏显示
// 触发点：model_select 事件
```

### 4.9 send-user-message.ts - 发送用户消息
```typescript
// 功能：演示 pi.sendUserMessage() API
// 场景：扩展向会话注入消息
```

### 4.10 timed-confirm.ts - 超时确认对话框
```typescript
// 功能：演示 AbortSignal 超时取消
// API：ctx.ui.confirm() / ctx.ui.select() 支持 AbortSignal
```

### 4.11 modal-editor.ts - 模态编辑器
```typescript
// 功能：Vim 风格的模态编辑器
// API：ctx.ui.setEditorComponent()
```

### 4.12 rainbow-editor.ts - 彩虹动画编辑器
```typescript
// 功能：动画彩虹文本效果
// 实现：自定义编辑器组件 + 动画循环
```

### 4.13 notify.ts - **桌面通知**
```typescript
// 功能：代理完成时发送桌面通知
// 协议支持：
// - OSC 777: Ghostty, iTerm2, WezTerm, rxvt-unicode
// - OSC 99: Kitty
// - Windows toast: Windows Terminal (WSL)
// 触发点：agent_end
```

### 4.14 titlebar-spinner.ts - **标题栏加载动画**
```typescript
// 功能：代理工作时在标题栏显示 Braille 旋转动画
// 动画帧：["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
// 间隔：80ms
// 格式：{frame} π - {session} - {cwd}
```

### 4.15 summarize.ts - **会话摘要**
```typescript
// 功能：使用 GPT-5.2 生成会话摘要
// 用法：/summarize
// 输出：自定义 UI 显示结构化摘要
```

### 4.16 custom-footer.ts - 自定义页脚
```typescript
// 功能：显示 Git 分支和 Token 统计
// API：ctx.ui.setFooter()
```

### 4.17 custom-header.ts - 自定义页头
```typescript
// 功能：自定义页头内容
// API：ctx.ui.setHeader()
```

### 4.18 doom-overlay/ - **DOOM 游戏**
```typescript
// 功能：在覆盖层运行 DOOM 游戏，35 FPS
// 技术：
// - WebAssembly (doomgeneric)
// - 半块字符渲染 (▀) + 24位颜色
// - 宽高比 3.2:1
// - 自动下载 shareware WAD (~4MB)
// 控制：WASD/方向键移动，Shift跑，F/Ctrl开火，Space使用，1-7武器
// 用法：pi --extension ./doom-overlay，然后 /doom-overlay
```

### 4.19 shutdown-command.ts - 关闭命令
```typescript
// 功能：/quit 命令关闭 pi
// API：ctx.shutdown()
```

### 4.20 reload-runtime.ts - 运行时重载
```typescript
// 功能：/reload-runtime 命令安全重载运行时
// 命令：reload_runtime 工具
```

---

## 五、会话管理类插件 (4个)

### 5.1 session-name.ts - 会话命名
```typescript
// 功能：为会话设置名称，显示在会话选择器
// API：pi.setSessionName(name)
```

### 5.2 bookmark.ts - 书签标记
```typescript
// 功能：为条目添加标签，便于 /tree 导航
// 命令：/bookmark [label] / /unbookmark
// API：pi.setLabel(entryId, label)
```

### 5.3 event-bus.ts - 扩展间事件通信
```typescript
// 功能：扩展间通过事件总线通信
// API：
// - pi.events.emit(event, data)
// - pi.events.on(event, handler)
```

### 5.4 message-renderer.ts - 自定义消息渲染
```typescript
// 功能：自定义消息类型的渲染方式
// API：pi.registerMessageRenderer(customType, renderer)
// 特性：支持展开/折叠状态，主题颜色
```

---

## 六、系统提示词类插件 (3个)

### 6.1 pirate.ts - 动态系统提示词
```typescript
// 功能：/pirate 切换海盗模式
// 机制：before_agent_start 钩子追加系统提示词
// 示例效果：助手用海盗语说话
```

### 6.2 claude-rules.ts - .claude/rules 规则加载
```typescript
// 功能：扫描项目 .claude/rules/ 目录，将规则列表加入系统提示
// 结构：
// .claude/rules/
// ├── testing.md
// ├── api-design.md
// └── frontend/
//     └── components.md
// 最佳实践：单文件单主题，条件规则用 paths frontmatter
```

### 6.3 system-prompt-header.ts - 系统提示词头部定制
```typescript
// 功能：自定义系统提示词头部内容
```

---

## 七、会话压缩类插件 (2个)

### 7.1 custom-compaction.ts - **自定义压缩策略**
```typescript
// 功能：用 Gemini Flash 生成完整会话摘要，替代默认压缩
// 触发点：session_before_compact
// 优势：
// - 更便宜的模型做摘要
// - 完整会话摘要（非保留最后20k tokens）
// - 包含决策、技术细节、当前状态、后续步骤
```

### 7.2 trigger-compact.ts - 自动触发压缩
```typescript
// 功能：超过 100k tokens 自动触发压缩
// 触发点：turn_end
// 命令：/trigger-compact [自定义指令]
```

---

## 八、系统集成类插件 (1个)

### 8.1 mac-system-theme.ts - macOS 主题同步
```typescript
// 功能：同步 pi 主题与 macOS 深色/浅色模式
// 机制：osascript 查询 + 2秒轮询
// API：ctx.ui.setTheme("dark" | "light")
```

---

## 九、资源管理类插件 (1个)

### 9.1 dynamic-resources/ - 动态资源加载
```typescript
// 功能：使用 resources_discover 钩子动态加载 skills/prompts/themes
// 场景：按需加载扩展资源
```

---

## 十、自定义 Provider 类插件 (3个)

| 目录 | Provider | 特性 |
|------|----------|------|
| custom-provider-anthropic/ | Anthropic | OAuth 支持，自定义流实现 |
| custom-provider-gitlab-duo/ | GitLab Duo | pi-ai 内置流代理 |
| custom-provider-qwen-cli/ | 通义千问 CLI | OAuth 设备流，OpenAI 兼容模型 |

---

## 十一、依赖与工具类插件 (3个)

### 11.1 with-deps/ - 带依赖的扩展
```typescript
// 功能：展示如何构建带 package.json 的扩展
// 机制：jiti 模块解析
```

### 11.2 file-trigger.ts - 文件触发器
```typescript
// 功能：监听 /tmp/agent-trigger.txt，注入内容到会话
// 机制：fs.watch + pi.sendMessage({ triggerTurn: true })
// 用途：外部系统向代理发送指令
```

### 11.3 bash-spawn-hook.ts - Bash 派生钩子
```typescript
// 功能：bash 命令派生时自定义处理
// 触发点：bash_spawn 事件
```

---

## 十二、核心扩展详解

### 12.1 Subagent - 子代理委派

**能力矩阵**:

| 模式 | 描述 | 并发 |
|------|------|------|
| Single | 单任务单代理 | - |
| Parallel | 多任务并行 | 最多8个任务，4并发 |
| Chain | 顺序链式，{previous} 占位符 | 顺序执行 |

**代理发现顺序**:
1. 用户级: `~/.pi/agent/agents/`
2. 项目级: `.pi/agents/` (需确认)

**典型用例**:
```typescript
// 代码审查并行
{ tasks: [
  { agent: "reviewer", task: "审查 api.ts" },
  { agent: "reviewer", task: "审查 auth.ts" }
]}

// 分析→编码链式
{ chain: [
  { agent: "analyzer", task: "分析需求" },
  { agent: "coder", task: "基于分析实现: {previous}" }
]}
```

### 12.2 Plan Mode - 计划模式

**两阶段工作流**:
1. **Plan Mode** (只读)
   - 可用工具: read, bash(白名单), grep, find, ls, question
   - Bash 白名单: cat, head, tail, grep, find, ls, git status/log/diff
   - 禁止: rm, mv, cp, git add/commit, npm install, sudo

2. **Execution Mode** (执行)
   - 恢复完整工具访问
   - 按步骤执行
   - `[DONE:n]` 标记进度

### 12.3 Preset - 预设系统

**典型预设**:
```json
{
  "plan": {
    "provider": "openai-codex",
    "model": "gpt-5.2-codex",
    "thinkingLevel": "high",
    "tools": ["read", "grep", "find", "ls"],
    "instructions": "PLANNING MODE: DO NOT make changes..."
  },
  "implement": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-5",
    "thinkingLevel": "high",
    "tools": ["read", "bash", "edit", "write"],
    "instructions": "IMPLEMENTATION MODE: Keep scope tight..."
  }
}
```

---

## 十三、扩展开发核心 API

### 13.1 生命周期钩子

```typescript
pi.on("session_start", async (event, ctx) => {});
pi.on("session_tree", async (event, ctx) => {});      // 分支导航
pi.on("session_shutdown", async (event, ctx) => {});
pi.on("session_before_switch", async (event, ctx) => { return { cancel: true }; });
pi.on("session_before_fork", async (event, ctx) => { return { cancel: true }; });
pi.on("turn_start", async (event, ctx) => {});
pi.on("turn_end", async (event, ctx) => {});
pi.on("tool_call", async (event, ctx) => { return { block: true, reason: "..." }; });
pi.on("tool_result", async (event, ctx) => {});
pi.on("agent_start", async (event, ctx) => {});
pi.on("agent_end", async (event, ctx) => {});
pi.on("before_agent_start", async (event) => { return { systemPrompt: "..." }; });
pi.on("session_before_compact", async (event, ctx) => { return { compaction: {...} }; });
pi.on("model_select", async (event, ctx) => {});
pi.on("bash_spawn", async (event, ctx) => { return { operations: {...} }; });
pi.on("user_bash", async (event, ctx) => { return { operations: {...} }; });
pi.on("resources_discover", async (event, ctx) => {});
```

### 13.2 UI API

```typescript
// 基础交互
ctx.ui.notify(message, type: "info" | "warning" | "error");
ctx.ui.confirm(title, message): Promise<boolean>;
ctx.ui.select(title, options): Promise<string | undefined>;
ctx.ui.input(title, placeholder?): Promise<string | undefined>;
ctx.ui.editor(title, prefill?): Promise<string | undefined>;

// 自定义组件
ctx.ui.custom<T>((tui, theme, kb, done) => Component): Promise<T>;

// 状态设置
ctx.ui.setStatus(key, text);
ctx.ui.setWidget(key, placement, lines);
ctx.ui.setHeader(text);
ctx.ui.setFooter(text);
ctx.ui.setTitle(title);
ctx.ui.setEditorText(text);
ctx.ui.setHiddenThinkingLabel(label);
ctx.ui.setTheme("dark" | "light");
ctx.ui.setEditorComponent(component);
```

### 13.3 工具注册

```typescript
pi.registerTool({
  name: string;
  label: string;
  description: string;
  parameters: JSONSchema;
  async execute(toolCallId, params, signal, onUpdate, ctx): ToolResult;
  renderCall?(args, theme, context): Component;
  renderResult?(result, options, theme, context): Component;
});

// 覆盖内置工具：注册同名即可
```

### 13.4 命令注册

```typescript
pi.registerCommand(name, {
  description: string;
  getArgumentCompletions?(prefix): CompletionItem[] | null;
  handler: async (args, ctx) => {};
});
```

### 13.5 会话管理

```typescript
ctx.sessionManager.getEntries();      // 所有条目
ctx.sessionManager.getBranch();       // 当前分支条目
ctx.sessionManager.getLeafEntry();    // 最新条目
ctx.sessionManager.getLabel(entryId); // 获取标签

pi.setLabel(entryId, label);
pi.setSessionName(name);
pi.appendEntry(customType, data);
pi.sendMessage(message, { triggerTurn? });
pi.exec(command, args): Promise<{ stdout, stderr, code }>;

// 新建会话
ctx.newSession({ parentSession? }): Promise<{ sessionFile, cancelled }>;
```

### 13.6 模型与工具

```typescript
// 模型
pi.setModel(model): Promise<boolean>;
pi.setThinkingLevel(level);
ctx.modelRegistry.find(provider, model);
ctx.modelRegistry.getApiKeyAndHeaders(model);
ctx.getContextUsage(): { tokens, percentage };

// 工具
pi.getAllTools(): ToolInfo[];
pi.getActiveTools(): string[];
pi.setActiveTools(toolNames);
```

### 13.7 压缩

```typescript
ctx.compact({
  customInstructions?: string;
  onComplete?: () => void;
  onError?: (error) => void;
});
```

---

## 十四、最佳实践总结

### 14.1 状态持久化

```typescript
// ✅ 正确：通过 details 存储状态，支持分支
return {
  content: [...],
  details: { todos: [...], nextId }  // 分支支持
};

// ❌ 错误：使用外部文件或全局变量
```

### 14.2 参数类型定义

```typescript
import { StringEnum } from "@mariozechner/pi-ai";

// ✅ 正确：Google API 兼容
action: StringEnum(["list", "add"] as const)

// ❌ 错误：Google 不支持
action: Type.Union([Type.Literal("list"), Type.Literal("add")])
```

### 14.3 安全拦截

```typescript
pi.on("tool_call", async (event, ctx) => {
  if (event.toolName === "bash" && isDangerous(event.input.command)) {
    if (!ctx.hasUI) {
      return { block: true, reason: "No UI for confirmation" };
    }
    const ok = await ctx.ui.confirm("Dangerous", "Allow?");
    if (!ok) return { block: true, reason: "Blocked by user" };
  }
});
```

### 14.4 自定义渲染

```typescript
renderCall(args, theme, context) {
  return new Text(theme.fg("toolTitle", theme.bold("name ")) + theme.fg("dim", args.param), 0, 0);
}

renderResult(result, { expanded }, theme, context) {
  // expanded: 是否展开状态
  // 返回 Text / Container / Box 等组件
}
```

---

## 十五、快速参考：常用插件选择

| 需求 | 推荐插件 |
|------|----------|
| 学习扩展开发 | hello.ts → todo.ts |
| 危险命令拦截 | permission-gate.ts |
| 代码审查工作流 | plan-mode/ + subagent/ |
| 任务并行化 | subagent/ (parallel 模式) |
| 远程开发 | ssh.ts |
| 会话管理优化 | handoff.ts + bookmark.ts |
| 桌面通知 | notify.ts |
| 主题同步 | mac-system-theme.ts |
| 自定义压缩 | custom-compaction.ts |
| 预设切换 | preset.ts |
