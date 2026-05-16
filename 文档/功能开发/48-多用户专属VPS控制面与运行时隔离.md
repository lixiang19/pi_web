# 48 多用户专属 VPS 控制面与运行时隔离

## 目标

把 ridge 从单机个人工作台扩展为云端可售卖形态：中心后端负责账号、VPS 生命周期、路由和运维；每个用户拥有独立 VPS，VPS 上继续运行单用户 ridge runtime，用户数据、工作空间、会话、RAG、图谱和自动化都留在自己的 VPS 内。

## 核心判断

这是“控制面 + 单用户运行时”的架构，不是传统共享数据库多租户 SaaS。

- 中心后端不保存用户 workspace 文件。
- 中心后端不保存 Pi 原始会话正文。
- 用户 runtime 继续使用 `~/.pi/ridge.db` 和 `~/ridge-workspace`。
- 每台 VPS 默认只服务一个 owner。
- 第一版不做团队协作、不做一个 runtime 多用户、不做跨用户搜索。

## 架构

```text
浏览器
  |
  | HTTPS / WebSocket / SSE
  v
中心控制面 ridge-cloud
  - 账号、登录、订阅、计费
  - 用户 -> VPS/runtime 实例映射
  - VPS 创建、销毁、暂停、升级
  - runtime 健康检查、版本、反向代理
  - 短期访问 token 签发
  |
  | outbound tunnel / mTLS / agent websocket
  v
用户专属 VPS ridge-runtime
  - 当前 packages/server
  - 当前 packages/web 静态前端或 runtime 内部前端
  - Pi runtime / agent / skills / sessions
  - ~/.pi/ridge.db
  - ~/ridge-workspace
```

## 产品边界

### 中心控制面负责

- 用户注册、登录、密码重置、订阅状态。
- 购买或分配 VPS。
- 记录 runtime 实例状态：创建中、初始化中、在线、离线、升级中、暂停、错误。
- 分发 runtime 版本。
- 代理浏览器到用户 runtime 的请求。
- 生成短期 runtime 访问票据。
- 触发备份、恢复、升级、重启。
- 展示实例健康状态和运维错误。

### 用户 runtime 负责

- AI 会话、任务、闪念、文件、空间、RAG、Wiki、Memory、图谱。
- 真实 Pi session 文件和 SSE/runtime 事件。
- `~/.pi/ridge.db` 产品层结构化数据。
- `~/ridge-workspace` 用户可见工作空间。
- `.ridge/` 系统缓存、图谱、runtime 缓存。
- 用户 API key、模型配置、agent/skill/runtime bundle。

### 禁止

- 禁止中心后端直接读取用户 workspace。
- 禁止中心后端把会话正文同步入中心数据库。
- 禁止在现有 runtime 表里先批量加 `user_id` 伪装多租户。
- 禁止让每台 VPS 直接裸露公网管理端口。
- 禁止用共享文件目录或共享 SQLite 承载多个用户。

## 阶段计划

### 阶段 0：云化边界冻结

产物：

- 本文档。
- `文档/模块梳理/云控制面与专属VPS运行时.md`。
- `文档/记忆/MEMORY.md` 新增架构决策。

验收：

- 文档明确中心控制面和用户 runtime 的职责。
- 文档明确不做共享数据库多租户。
- 文档明确用户数据面不进入中心后端。

### 阶段 1：runtime 云部署硬化

目标：当前单用户 server 可以安全跑在公网 VPS 上。

改造：

- 生产环境必须配置 `RIDGE_ADMIN_PASSWORD`，缺失拒绝启动。
- 必须配置 `RIDGE_PUBLIC_BASE_URL`，公网 Host header 不作为可信 origin。
- 所有 `/api/*`、终端 WebSocket、设备 WebSocket、runtime bundle、workspace MCP 统一鉴权。
- 登录 cookie 使用 `HttpOnly`、`Secure`、`SameSite=Lax/Strict`，并区分本地开发和生产。
- 增加 `/api/runtime/health`，返回版本、DB、workspace、Pi runtime、后台任务、磁盘空间的最小健康状态。
- 增加 `/api/runtime/about`，返回 runtime id、owner 标识、版本、workspaceDir、dataDir，不返回秘密。

测试：

- 未配置生产密码时 server 启动失败。
- 未登录访问 `/api/*`、WebSocket、bundle、MCP 均失败。
- 配置非法 public base URL 时 runtime bundle 失败。
- health 在 DB/workspace 缺失时返回明确错误。

验收：

- 一台 VPS 单独部署后可完整使用当前 ridge。
- 浏览器刷新、SSE、终端、设备 WS、runtime bundle 都通过鉴权。

### 阶段 2：中心控制面最小模型

目标：中心后端知道用户拥有哪些 runtime，但不接触 runtime 数据。

新增中心表：

- `cloud_users`
  - `id`
  - `email`
  - `password_hash`
  - `created_at`
  - `status`
- `cloud_runtime_instances`
  - `id`
  - `user_id`
  - `provider`
  - `region`
  - `vps_id`
  - `runtime_url`
  - `tunnel_id`
  - `runtime_version`
  - `status`
  - `last_seen_at`
  - `created_at`
  - `updated_at`
- `cloud_runtime_tokens`
  - `id`
  - `runtime_id`
  - `token_hash`
  - `purpose`
  - `expires_at`
  - `created_at`

新增中心 API：

- `POST /cloud/auth/login`
- `GET /cloud/me`
- `GET /cloud/runtimes`
- `POST /cloud/runtimes`
- `GET /cloud/runtimes/:runtimeId`
- `POST /cloud/runtimes/:runtimeId/restart`
- `POST /cloud/runtimes/:runtimeId/upgrade`

测试：

- 用户只能看到自己的 runtime。
- 中心 token 只保存 hash。
- runtime 状态更新必须校验 runtime 身份。
- 中心 API 不返回用户 workspace 路径以外的敏感环境变量。

验收：

- 用户登录中心后能看到自己的 VPS runtime 状态。
- 中心数据库没有 workspace 文件、会话正文、RAG chunk、图谱数据。

### 阶段 3：VPS 供应商适配器

目标：先接入一个供应商，跑通真实购买/创建/初始化。

接口：

```ts
interface VpsProvider {
  createInstance(input: CreateInstanceInput): Promise<CreatedInstance>;
  getInstance(id: string): Promise<InstanceStatus>;
  rebootInstance(id: string): Promise<void>;
  destroyInstance(id: string): Promise<void>;
}
```

第一版只实现一个 provider，其他 provider 不做抽象预留 UI。

初始化流程：

1. 中心创建 `cloud_runtime_instances(status='creating')`。
2. 调 provider 创建 VPS。
3. cloud-init 安装 Node、pnpm、ridge runtime 包、systemd service。
4. 写入 runtime bootstrap token。
5. runtime 首次启动后主动连中心注册。
6. 中心状态变为 `online`。

测试：

- provider adapter 使用契约测试和 fake provider。
- 创建失败时实例状态进入 `error`，保留错误码。
- 重复创建请求不会生成多个未归属 VPS。
- runtime 首次注册 token 只能使用一次。

验收：

- 从中心点击创建后，真实生成一台 VPS，并能打开 ridge。
- 创建失败能在 UI 看到真实原因。

### 阶段 4：安全连接与代理

目标：浏览器访问中心域名，中心把请求安全转发到用户 runtime。

优先方案：

- runtime 主动向中心建立 outbound tunnel。
- 中心不要求 VPS 暴露公网管理 API。
- 每个浏览器请求由中心校验用户身份，再附带短期 runtime access token 转发。

必须支持：

- REST API。
- SSE：`GET /api/sessions/:sessionId/events`。
- WebSocket：终端、设备、runtime bridge。
- 大文件上传下载：备份包、附件、工作空间文件。
- request id 贯穿中心和 runtime 日志。

代理规则：

- `/app/:runtimeId/*` 转发到指定 runtime。
- 中心只做鉴权、限流、审计和转发。
- 中心不解析会话正文和文件内容。
- runtime 再做自己的 owner/token 鉴权，不能只信中心。

测试：

- 非 owner 访问 runtime 返回 403。
- SSE 代理不断流，能收到 assistant/runtime 增量事件。
- WebSocket 代理能建立终端连接并收发数据。
- 上传中断返回明确错误，不留下半写入记录。
- runtime 离线时 UI 显示离线，不伪造空数据。

验收：

- 用户通过中心域名完整使用自己的 ridge，不需要知道 VPS IP。
- SSE 和终端 WebSocket 在代理后仍可用。

### 阶段 5：runtime 升级、备份与恢复

目标：每个用户 runtime 可以被安全运维。

升级：

- 中心记录目标版本。
- runtime 拉取 bundle 或镜像。
- 升级前触发本机备份。
- systemd 滚动重启。
- health 通过后标记成功。
- 失败时保留旧版本或进入人工处理状态。

备份：

- 复用当前 `GET /api/workspace/backup` 的语义。
- 备份文件默认保存在用户 VPS。
- 可选加密同步到对象存储。
- 中心只保存备份元数据，不保存明文内容。

恢复：

- runtime 内部执行整包恢复。
- 恢复前自动创建 pre-restore 快照。
- 恢复后标记 RAG/图谱等可重建索引状态。

测试：

- 升级前备份失败则不升级。
- 升级失败不会破坏当前 runtime。
- 恢复失败能回滚原 DB 和 workspace。
- 中心备份列表不泄露备份内容。

验收：

- 可以对单个用户 runtime 做版本升级和回滚。
- 用户能下载/恢复自己的备份。

### 阶段 6：计费、暂停与释放

目标：把 VPS 成本接入产品状态。

状态：

- `trial`
- `active`
- `past_due`
- `suspended`
- `cancelled`

规则：

- `past_due`：允许只读访问和备份下载。
- `suspended`：runtime 停止 AI/自动化/后台任务，保留数据。
- `cancelled`：进入保留期，允许备份导出。
- 超过保留期后销毁 VPS 前必须有最后备份策略。

测试：

- 订阅失效不会立刻删除数据。
- 暂停状态下不能新建 AI 会话和自动化运行。
- 备份下载仍可用。

验收：

- 成本控制与用户数据安全都有明确状态机。

## 代码组织建议

短期不把 cloud control plane 混进当前 runtime 主流程。

推荐：

```text
packages/server              当前单用户 runtime server
packages/web                 当前 runtime web
packages/cloud-server        新增中心控制面
packages/cloud-web           新增中心控制面 UI，可后续复用组件
packages/cloud-protocol      中心与 runtime 通信协议
packages/runtime-agent       runtime 侧注册、心跳、tunnel、升级 agent
```

如果第一版为了速度共用一个仓库，也要保持运行进程分离：

- `ridge-runtime`：用户 VPS 上运行。
- `ridge-cloud`：中心后端运行。

## UI 计划

中心 UI：

- 登录页。
- 我的 runtime 列表。
- 创建 VPS。
- runtime 状态详情。
- 打开工作台。
- 升级、重启、备份、恢复。
- 账单与订阅。

runtime UI：

- 当前工作台 UI 基本不变。
- 设置页增加“云实例状态”只读区：实例 ID、版本、连接状态、最近备份。
- 不在工作台里显示其他用户或其他 runtime。

## 风险与对应策略

- VPS 成本高：第一版按高级个人工作台定价，不走低价共享 SaaS。
- 长连接复杂：阶段 4 必须把 SSE/WebSocket 作为验收核心，不允许只测 REST。
- 运维复杂：阶段 5 前不得大规模开放购买。
- 供应商锁定：先只接一个 provider，把 provider contract 写清楚，等跑通再扩展。
- 数据安全：中心不进数据面，runtime 双重鉴权，备份默认用户侧。

## 第一轮真实里程碑

1. 完成阶段 1，让当前 ridge 可以作为安全单用户公网 runtime 部署。
2. 完成阶段 2，用 fake runtime 做中心账号和实例状态。
3. 完成阶段 3，接一个真实 VPS provider，能创建并初始化 runtime。
4. 完成阶段 4，中心代理真实打开用户 runtime，SSE 和 WebSocket 通过。
5. 小范围 dogfood：只给内部账号创建 VPS，不接正式计费。

## 完成定义

- 用户可以从中心创建自己的 ridge VPS。
- 创建完成后能从中心打开工作台。
- 工作台所有用户数据只存在该 VPS 的 `~/.pi/ridge.db` 和 `~/ridge-workspace`。
- AI 会话、任务、文件、RAG、图谱、终端、自动化能在代理后正常运行。
- 中心控制面只能看到实例元数据和健康状态。
- runtime 可备份、恢复、升级、暂停。
