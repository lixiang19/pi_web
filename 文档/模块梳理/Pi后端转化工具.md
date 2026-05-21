# Pi 后端转化工具

## 职责

为 Pi Agent 会话提供显式转换工具，让 Agent 可调用 ridge Python Converter，将工作空间文件转为 Markdown。工具只做调用与结果返回，不在 Node 内自研 PDF/图片/音频解析，也不替代文件处理队列的落盘、归档、状态机职责。

## 入口

- `packages/server/src/conversion-tools.ts`
  - `createConversionToolExecutors({ workspaceDir })`：可单测的执行器工厂。
  - `createConversionToolsExtension(workspaceDir)`：注册 Pi Extension。
- `packages/server/src/session-context.ts`
  - `createSessionResourceLoader` 在 `extensionFactories` 中注册 `createConversionToolsExtension(deps.defaultWorkspaceDir)`。
- `packages/server/src/agent-permissions.ts`
  - `convert_file_to_markdown` 映射为 `read` 权限。
  - `read: deny` 时移除转换工具。

## 工具清单

| 工具名 | 功能 | 输入边界 | 输出 |
|--------|------|----------|------|
| `convert_file_to_markdown` | 转换工作空间内文件，自动按扩展名推断 task，可传 `task/engine/model/language/prompt` | `path` 必须解析在 workspace 内，且必须是文件 | Markdown 正文 + job/artifact details |

## 边界

- 转换工具直接读取 `app_settings` 中的 `python_converter_base_url` / `python_converter_api_key`；未配置时明确报错。
- 文件工具不接收 workspace 外路径，也不读取 `.ridge` 等隐藏系统目录之外的文件处理契约。
- 工具返回 Markdown 给 Agent，不写 workspace 文件；若要写正式产物，仍走文件处理队列或由 Agent 后续显式写入。旧的闪念人工剪藏动作已移除。
- URL 网页内容提取不再走 Python Converter；见 `Exa网页内容工具.md`。

## 测试覆盖

- `packages/server/src/__tests__/conversion-tools.test.ts`
  - 文件转换调用 Python Converter 并返回 Markdown。
  - workspace 越界路径拒绝。
  - 权限映射为 `read`，`read: deny` 移除工具。
