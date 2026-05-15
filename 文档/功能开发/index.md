## 功能状态矩阵

> **图例**：✅ = 已实现且有测试/验收证据；◐ = 部分实现/当前工作树证据但未完整验收；⚠️ = 仅入口/占位或未合并待验证；- = 未实现。

| 功能 | 导航入口 | API | DB | 前端 | 测试 | E2E | 归档 |
|------|------|------|------|------|------|------|------|
| 00 工作空间初始化 | ✅ | ✅ | ✅ | ✅ | ✅ | - | - |
| 01 ridge DB 基础表与迁移框架 | - | ✅ | ✅ | - | ✅ | - | - |
| 02 隐藏 ridge 目录与路径边界 | - | ✅ | ✅ | - | ✅ | - | - |
| 03 工作台 Shell 与标签系统 | ✅ | - | - | ✅ | ✅ | - | - |
| 04 左侧导航固定入口与会话列表 | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ |
| 05 工作空间主页与会话创建 | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ |
| 06 会话索引归档与只读状态 | ✅ | ✅ | ✅ | ✅ | ✅ | - | - |
| 07 会话界面与右侧工作侧栏 | ✅ | - | - | ✅ | ✅ | ✅ | ✅ |
| 08 任务里程碑数据模型 | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ |
| 09 任务列表详情与状态流转 | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ |
| 10 任务处理会话与任务 Agent | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 11 规划工具与完成确认边界 | - | ✅ | - | - | ✅ | - | ✅ |
| 12 闪念数据模型与 Web 入口 | ✅ | ✅ | ✅ | ✅ | ✅ | - | - |
| 13 闪念临时附件生命周期 | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ |
| 14 桌面采集入口 | - | - | - | - | - | - | - |
| 15 fleeting agent 分析建议 | ✅ | ✅ | ✅ | ✅ | ✅ | - | - |
| 16 闪念处理为正式对象 | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ |
| 17 文件页与正式附件目录 | ⚠️ | - | - | - | - | - | - |
| 18 文件处理状态与临时文件边界 | - | ✅ | ✅ | ✅ | ✅ | - | ✅ |
| 19 PDF Word 标准化转换 | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ |
| 20 音频图片 Markdown 处理 | - | - | - | - | - | - | - |
| 21 空间 HTML 作品私有预览 | ✅ | ✅ | - | ✅ | ✅ | - | ◐ |
| 22 RAG 标准产物索引与 chunk | - | ✅ | ✅ | - | ✅ | - | ✅ |
| 23 RAG 更新删除移动规则 | - | ✅ | ✅ | - | ✅ | - | ✅ |
| 24 全局搜索资产导航器 | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ |
| 25 后台任务队列与重试 | - | - | - | - | - | - | - |
| 26 summary agent daily 会话记忆 | - | ✅ | ✅ | ✅ | ✅ | - | ✅ |
| 27 memory agent MEMORY 维护与注入 | - | ✅ | ✅ | - | ✅ | - | ✅ |
| 28 Kuzu 图谱存储与抽取 | - | ✅ | ✅ | - | ✅ | - | ✅ |
| 29 Wiki 夜间维护与 index 注入 | - | - | - | - | - | - | - |
| 30 项目注册与内部项目外部仓库 | - | - | - | - | - | - | - |
| 31 设备注册在线状态与调度 | - | - | - | - | - | - | - |
| 32 runtime bundle 与设备专属 Skill | - | - | - | - | - | - | - |
| 33 workspace MCP 查读工具 | - | ✅ | ✅ | - | ✅ | - | ✅ |
| 34 通知与建议中心 | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ |
| 35 task review agent 任务回顾 | - | - | - | - | - | - | - |
| 36 自动化规则运行与跳过 | ◐ | ◐ | ◐ | ◐ | - | - | - |
| 37 备份恢复设置主题收尾 | ◐ | - | - | ◐ | - | - | - |
| 38 AI 对话主线闭环 | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ | ✅ |

### 真实实现口径（2026-05-12）

以下按**当前工作树静态证据**记录，未验证/未合并的其他 worktree 实现不标为已完成：

- **13 闪念临时附件生命周期**：后端 `fleeting-attachments.ts` 含 store/get/delete/migrate；`fleeting.ts` 含上传/列表/清理/迁移全链路；前端 `InboxView.vue` 渲染附件列表（图标+文件名+大小）及附件处理按钮。`fleeting_attachments` 表在 migration v8。已标 ✅。
- **16 闪念处理为正式对象**：`routes/fleeting.ts` 已实现 `process/journal`、`process/clip`、`process/task`、`process/milestone`、`process/attachment` 全部五种处理路径。task 和 milestone 支持 `projectId` 参数，所有 process 路由使用 `db.transaction()` 包裹目标创建 + 闪念删除。附件迁移在事务外执行，失败时闪念保留。`fleeting-api.test.ts` 覆盖全部处理路径、失败保留、项目选择等场景。前端 `InboxView.vue` 提供任务/里程碑/剪藏/附件/日记处理按钮和对话框，`useInbox.ts` 封装处理函数。已标 ✅。
- **22 RAG 标准产物索引与 chunk**：`rag-indexer.ts` 已按 Markdown 标题、段落、表格、代码块切 chunk，并读取 `.metadata.json`；空间 `index.html` 作为 HTML 标准源进入 RAG；`search_chunks` 保存 `source_path`、`heading_path`、`content_hash`、`file_type`、`embedding_id`、`embedding_vector`、行号等来源定位字段；检索使用精确文本召回 + 本地 embedding 相似度；外部路径、`.ridge`、`.originals`、realpath 越界 symlink 不进入 RAG。`rag-standard-indexer.test.ts` 覆盖结构化 chunk、metadata、embedding、hash skip、空间 HTML、外部路径/符号链接排除和来源定位。
- **23 RAG 更新删除移动规则**：Markdown 上传同步索引；普通 Markdown 编辑写 `refresh_policy=deferred` 并保留旧 chunk；RAG worker 每天 03:00 运行 deferred 夜间入口，显式 `rag.index` job 按 manual 重建；`POST /api/workspace/rag/refresh` 手动立即重建且校验 realpath 边界；删除文件/目录清理 RAG 表；移动/改名更新 RAG metadata；索引失败写 `notification_events`。`rag-standard-indexer.test.ts`、`rag-worker-e2e.test.ts` 和 `rag-consumer.test.ts` 覆盖手动刷新、夜间刷新、删除、移动、失败通知和默认工作空间消费链路。
- **24 全局搜索资产导航器**：左侧固定「搜索」入口已接入 `WorkspaceSearchView.vue` 单例标签；`GET /api/workspace/search` 聚合文件、任务、里程碑、项目、会话索引、记忆、Wiki、空间、RAG，支持类型/时间/目录/项目筛选和索引状态展示；项目筛选会保留项目内 file/RAG 结果；结果可打开文件、项目主页、任务页、会话、空间预览，并可手动刷新 RAG。`workspace-search-api.test.ts` 覆盖聚合、类型筛选、项目内 file/RAG、目录边界筛选、缺失空间入口、符号链接越界和外部项目文件内容排除。图谱节点依赖 Task 28 Kuzu 图谱存储，当前搜索不暴露 `graph` 占位类型。
- **26 summary agent daily 会话记忆**：`POST /api/sessions/:sessionId/end` 结束会话并排队 `summary.daily`；关闭会话 tab 会调用该入口；summary agent 只读 session 文件，服务端追加 `记忆/daily/YYYY/MM/YYYY-MM-DD.md`，不生成单会话摘要文件；同一 daily date 串行写入，不同 session 不误去重。`workspace-memory.test.ts` 与 `background-jobs.test.ts` 覆盖。
- **27 memory agent MEMORY 维护与注入**：`memory.maintain` 在 summary 后维护 `记忆/MEMORY.md`；消息入口支持显式“记住/忘掉”立即改写；服务端过滤敏感信息；新会话启动和 resource reload 注入 `MEMORY.md` 与 `Wiki/index.md` XML 块，空文件不注入，并包含“记忆可能过时，当前用户最新话语和当前文件事实优先”提醒。`workspace-memory.test.ts` 覆盖。
- **28 Kuzu 图谱存储与抽取**：`graph-store.ts` 使用 Kuzu Node.js 客户端写入 `.ridge/graph.kuzu/database.kuzu`，初始化写 `.ridge/graph.kuzu/schema.cypher`；schema 包含 Project/File/Task/Person/Org/Concept/Tech/Source/Decision 节点和带 `evidence/source_path/confidence/updated_at` 的 EvidenceRelation，证据统一截断为 80 字以内。`graph-agent.ts` 只从已索引 Markdown 标准产物、daily 和内部项目 Markdown 收集输入，排除外部项目、`.ridge`、`.originals` 和非 Markdown 原件；直接读取来源前校验 `realpath`，防止内部项目根目录符号链接越界；`rag-worker.ts` 夜间链路在 deferred RAG 后触发 graph runner；`POST /api/workspace/graph/corrections` 支持用户自然语言纠错后由 graph agent 写回，并有 HTTP 集成测试。`GET /api/workspace/backup` 生成真实备份 ZIP，包含 `.ridge/graph.kuzu`，排除可重建缓存并跳过符号链接；隐藏 Git exclude 包含 `.ridge`。测试覆盖真实 Kuzu 写入读回、graph store/schema/纠错、source 边界与 symlink 防护、夜间顺序、纠错 API、备份 ZIP/API、隐藏 Git exclude 和初始化 schema 文件。
- **34 通知与建议中心**：左侧「通知」固定入口已接入 `NotificationCenterView.vue`，展示未处理数、筛选、列表和动作；`GET /api/notifications` 与 `POST /api/notifications/:eventId/actions` 支持忽略、标记已处理、重试、接受/拒绝建议、打开关联对象。`notification_events` 扩展 source/related/actions/handled 字段；文件处理失败、RAG 失败、后台任务最终失败写入关联对象和动作。新增通知 API 与前端组件测试，并通过全量测试。
- **36 自动化规则运行与跳过**：`automation_rules` CRUD、调度器、手动 run API、UI 已有，但 `automation_runs` 无业务写入，跳过记录/失败通知/运行历史未闭环。只能标为自动化规则 CRUD/调度部分完成。
- **37 备份恢复设置主题收尾**：设置页真实实现只有主题/明暗模式、退出、偏好；没有备份恢复、数据路径、错误边界。只能标“设置基础部分完成”。
- **17 文件页与正式附件目录**：左侧导航“文件”入口存在，`WorkspacePage.vue` 中已接入 `FilesView.vue` 真实文件页（文件树浏览、状态展示、文件预览），不再是占位。但上传功能走 `uploadFiles` API、`FilesView` 本身无上传按钮，附件管理（移动/重命名）未在前端完整实现。
- **18 文件处理状态与临时文件边界**：`PATCH /status`、`POST /retry` API 完整实现，含状态流转校验、原子通知、错误可见。上传自动注册 pending、删除同步清理、.ridge 严格隔离均已实现且有测试覆盖。
- **21 空间 HTML 作品私有预览**：左侧「空间」入口已接入真实 `SpaceView`，服务端提供 `GET /api/workspace/space` 与 `GET /api/workspace/space/:id/preview-html`；只读取 `空间/<作品名>/index.html`，路径有 `.ridge`、词法和 realpath 越界防护，缺失 `index.html` 返回 404。预览使用 `srcdoc` + `sandbox="allow-scripts"`，无 `allow-same-origin`，并确保 CSP 早于用户 HTML active content，禁止 ridge API/外联请求。已有服务端集成测试、前端组件测试和工作台接线测试。隐藏版本管理依赖工作空间级能力，本任务不新增保存/版本点链路，因此归档项保留为部分完成。
- **插件与扩展能力真实状态**：
  - **已真实接入**：Agent 注册/发现/选择（`/api/agents`、HomePage/WorkspaceChatTab agent 选择）、自动化规则（作为定时创建普通会话并发送消息的规则系统）、Pi resource catalog 后端可列 prompts/skills/extension commands（`/api/resources`、`buildResourceCatalog`）。
  - **未在当前工作空间主会话 UI 中完整接入**：Skill 独立功能页仍占位；`WorkspaceChatTab` 当前给 `WorkbenchChatPanel` 传 `commands=[]`、`prompts=[]`、`skills=[]`，因此主工作空间会话的资源选择器/Skill 注入没有真正可用；runtime bundle 已包含 workspace MCP 配置，但设备专属 Skill 物化和主会话资源选择器仍未完整接入。
  - **旧 `SessionTabContent` 有 resourcePicker 接入，但当前工作空间主界面走 `WorkspaceChatTab`**，不能把旧组件能力当作当前真实可用功能。

> **注**："✅" = 已实现且有测试/验收证据；"◐" = 部分实现/当前工作树证据但未完整验收；"⚠️" = 仅入口/占位或未合并待验证；"-" = 尚未实现或仅存在占位。归档需所有维度通过后方可标记。
