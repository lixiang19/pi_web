# 项目的根本目的
对pi进行包装、自定义、封装、成为一个ai工作平台

# ⚠️ 顶级要求（强制遵循）

1. **语言要求**：所有回答与文档内容必须使用**中文**
2. 编辑代码时不要任何的兼容，对的就是对的。旧的需要改的就是错误，禁止任何的保留和兼容
3. 架构设计指南：简单不冗余，任何时候的修改都不要打补丁，即使麻烦复杂也要从根本上解决问题，bug的出现可能是架构问题，要询问用户是否更改设计，禁止使用兜底、if、检测、延迟等方案解决bug
4. 解决bug时眼光要在全链路，bug的体现一般都在前端，但是根源却在后端。要从根源着手修改
5. 文档文件夹下的md文档是最重要的
# 前端架构
- 文件不能太大，积极拆分文件、拆分组件
# 核心约束
✅ Tauri只打包 - 不做任何功能开发
✅ Node当服务层 - 提供API和持久化
✅ 界面纯前端 - 文件选择用Web原生方式

# 品牌与数据
- **品牌名**：ridge
- **数据目录**：`~/.ridge/` - 用户数据存储位置


# 开发
- 参考/Users/admin/Documents/GitHub/openchamber 不断的从此项目中取功能灵感。但是具体代码和样式不要抄
- 多使用网络搜索和git搜索@mariozechner/pi-coding-agent
- 多读取@mariozechner/pi-coding-agent的源码
- 多使用pi-extensions进行学习pi的插件开发
- pi本身支持各种各样的能力，比如会话持久化、各种插件钩子，不要自己去伪造、mock、模拟，先探索pi的实现
# 界面开发
- 必须使用https://www.shadcn-vue.com/组件库，禁止自己实现基础组件
- 必须使用主题文件，且支持明暗两种模式。
# 文档/功能开发
- 新任务需要在文档/功能开发 目录下新建md文档，完成后放入 文档/功能开发/归档。
# 文档/记忆
- 在开发过程中的经验总结（成功点+改进点+阻塞点）更新 `文档/记忆` 目录下的记忆文档,优先更新MEMORY.md
# 模块梳理的要求
！！！开始修改前先读取根目录 `文档/模块梳理/` 目录，并只在涉及模块职责、接口契约、主流程、配置边界、数据结构变化时更新对应模块梳理文档
- 模块梳理文件夹在按照大的功能模块梳理出现有的功能，写成md文档，且应该在AGENTS.md的模块梳理文档目录同步
- 在任务完成后，应该新建或编辑模块梳理的文档
- 文档应该使用较长的中文名称方便识别
- 文档不应该细分，应当宽泛
- 仅当代码事实已经改变模块认知时才更新文档；局部样式、坐标、文案、小范围实现细节不强制更新模块梳理


## 输出格式（必须是 Markdown）

<文档/模块梳理的文档格式要求>

## 文档的要求格式

# <MODULE_NAME> Module Codemap

## Responsibility

- 用 4–8 条 bullet 说明模块的职责边界（做什么/不做什么）
- 点出它服务的对象（用户、CI、运行时、上层模块等）

## Design

### Architecture Pattern

- 用“分层/管道/插件式/DDD”等你从代码中观察到的模式命名
- 给出一张 ASCII 架构图，类似示例的方框+箭头
- 说明每层的职责、入口/出口、跨层调用方式

### Key Abstractions

按示例风格，至少给出 3 类抽象（如果代码确实存在），每类包括：

- 抽象名称（类型/接口/类/约定）
- 代码片段（尽量短，只贴关键字段/方法，TypeScript 用 ```ts）
- 解释它代表的概念、持有的数据、被谁创建/消费
- 关联文件与依据（path:line 或 path:function/type）

建议优先覆盖：

1. 配置抽象（Config / Options / Schema）
2. 核心领域对象或流程输入（InstallConfig / Context / State）
3. 结果/错误抽象（Result / Error / Diagnostics）
4. 资源抽象（Skill / Provider / Preset / Task）

### Design Patterns

列出你从代码中“确实看见”的模式（至少 3 条），每条包含：

- 模式名（例如 Atomic write、JSONC 解析、优先级回退、权限模型、幂等写入等）
- 在本项目里的实现方式（点名函数/文件）
- 为什么这么做（从代码行为推断，避免空泛）

## Flow

至少给出 2–4 个“端到端流程”。每个流程必须包含：

- 场景一句话（例如 Installation Flow / Config Detection Flow / Model Mapping Flow）
- 一张 ASCII 流程图（带步骤编号、函数名、文件名）
- 每步做什么、输入输出是什么、关键分支条件是什么
- 如果存在交互模式（TUI/非交互），要像示例一样拆开写

（如果这是 CLI 模块，优先输出：安装流程、配置检测流程、模型映射流程、技能安装流程；
如果不是 CLI 模块，改成该模块最核心的 2–4 条业务流程。）

## Integration

### External Dependencies

输出一个表格（Markdown table）：
| Module/File | Dependency | Purpose |

- 仅写你在 package.json / import / require / spawn 命令里看到的真实依赖
- 命令行依赖（tmux/git/opencode/npx 等）也算外部依赖

### Internal Dependencies

给出模块内依赖关系树（像示例那样用缩进箭头），要求：

- 入口 -> orchestrator -> 子模块/工具
- 如果有 barrel 文件（index.ts / xxx-manager.ts），标出来

### Configuration Files

如果模块读写配置，列出：
| File | Location | Purpose |

- 路径要与代码一致（例如 ~/.config/... 或 repo 内模板文件）
- 说明谁写入/谁读取/何时生效

### Consumers

列出谁在用这个模块（最终用户命令、上层模块、CI、运行时等），要能从代码/文档/命令路由推出来。

### Data Flow Summary

用一个简洁的 ASCII 图总结数据如何流动（Input -> Transform -> Output），类似示例。

## Key Files Reference

输出一个表格：
| File | Lines | Purpose |

- Lines：给出文件总行数（尽量真实统计）；做不到就写 `unknown`
- Purpose：一句话说明文件的定位
- 只列最关键的 8–15 个文件，按重要性排序
</模块梳理的文档格式要求>

# pi的要求
只允许使用sdk的接入，禁止rpc模式