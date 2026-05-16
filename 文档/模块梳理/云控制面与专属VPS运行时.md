# 云控制面与专属 VPS 运行时

## 职责

多用户商业化形态采用“中心控制面 + 每用户专属 VPS runtime”。中心控制面管理账号、VPS 生命周期、路由、升级、备份和计费；用户专属 VPS 继续运行当前单用户 ridge runtime。

## 边界

- 中心控制面是控制面，不是用户数据面。
- 用户 runtime 是数据面，保存 `~/.pi/ridge.db`、`~/ridge-workspace`、Pi session 文件、RAG、图谱、Memory、Wiki 和自动化状态。
- 每台 VPS 默认一个 owner，不在当前 runtime 内做共享数据库多租户。
- 中心控制面不读取 workspace 文件、不保存 Pi 原始会话正文、不做跨用户搜索。
- 中心控制面可以保存 runtime 元数据、健康状态、版本、供应商实例 ID、tunnel 状态和备份元数据。

## 运行拓扑

```text
browser
  -> cloud control plane
  -> authenticated tunnel/proxy
  -> user VPS ridge runtime
```

runtime 必须主动连接中心或通过受控 tunnel 暴露服务；禁止把 VPS 管理 API 裸露到公网后只依赖弱密码。

## 与现有模块关系

- `数据库与迁移`：用户 runtime 继续使用 `~/.pi/ridge.db`，不因为云化给现有业务表批量加 `user_id`。
- `工作空间初始化`：用户 runtime 继续初始化唯一 `~/ridge-workspace`。
- `ridge系统目录边界`：用户 runtime 内 `.ridge/` 规则不变，中心控制面不得绕过这些边界直接读文件。
- `设备模型与在线状态`：桌面设备仍是某个 runtime 的附属设备；中心控制面不直接调度桌面设备。
- `runtime-bundle与设备专属Skill`：bundle 仍由用户 runtime 生成，公网部署必须配置可信 public base URL。
- `workspace-MCP查读工具`：仍只服务当前 runtime 的 workspace，只允许设备 token 访问。

## 控制面最小数据

中心控制面最小保存：

- 用户账号与订阅状态。
- runtime 实例 ID、owner、供应商、区域、VPS ID。
- runtime 状态、版本、最近心跳、最近健康检查。
- tunnel ID 或连接状态。
- 备份元数据：时间、大小、checksum、加密状态、存储位置引用。

中心控制面禁止保存：

- workspace 文件内容。
- Pi session jsonl 正文。
- RAG chunk 内容。
- Kuzu 图谱内容。
- 用户模型 API key 明文。
- runtime 设备 token 明文。

## 请求转发规则

- 浏览器先登录中心控制面。
- 中心根据 `runtimeId` 校验 owner。
- 中心签发短期 runtime access token 或通过 tunnel 绑定身份。
- runtime 仍执行自己的鉴权，不能只信任中心。
- REST、SSE、WebSocket 都必须支持 request id 透传。
- runtime 离线时返回明确离线状态，不返回空 workspace 或伪造数据。

## 上线顺序

1. 先把当前 runtime 做成安全公网单用户部署。
2. 再做中心账号和 runtime 元数据。
3. 再接真实 VPS 创建和初始化。
4. 再做 tunnel/proxy，重点验证 SSE 和 WebSocket。
5. 最后做升级、备份、恢复、暂停、计费。

## 测试重点

- 中心用户不能访问他人的 runtime。
- 中心数据库不出现用户文件、会话正文、RAG chunk 或图谱内容。
- runtime 缺少生产密码或 public base URL 时拒绝公网危险配置。
- SSE 代理不断流。
- WebSocket 代理可用于终端和设备桥接。
- runtime 离线、升级中、暂停时 UI 和 API 都返回明确状态。
