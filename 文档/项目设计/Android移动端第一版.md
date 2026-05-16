# 49 Android 移动端第一版

## 目标

用 `Capacitor + Vue` 实现 ridge Android 第一版。第一版定位为移动闪念捕捉、轻对话和任务查看端，不是桌面工作台的移动复刻。

## 产品定位

Android App 只承接移动场景中最有价值的三个动作：

1. 随手捕捉闪念。
2. 和 AI 做轻量对话。
3. 查看任务并做少量状态跟进。

第一版不提供完整桌面端能力，不在手机本机运行 pi agent，不管理项目、文件、RAG、Wiki、记忆或 runtime bundle。

## 技术路线

- 移动端框架：`Vue 3 + TypeScript + Vite + Capacitor`。
- Android 壳：Capacitor Android，负责原生权限、打包、签名和 App 生命周期。
- UI：移动端独立界面，复用 shadcn-vue 组件和主题变量，但不复用桌面工作台布局。
- 服务端：继续复用 `packages/server` 作为 API、设备、会话、任务和闪念真源。
- 构建环境：允许在低配 VPS 上写代码和构建 APK；真机负责安装验证，不要求 VPS 跑 Android 模拟器。

## 目录规划

```
packages/mobile/
  src/
    app/
    features/capture/
    features/chat/
    features/tasks/
    features/settings/
    lib/api/
    lib/device/
    lib/media/
    theme/

android/
  # Capacitor 生成的 Android 工程
```

`packages/mobile` 是移动端 Vue 应用真源。`android` 目录只保存 Capacitor 生成和必要的 Android 原生配置，避免把业务逻辑写进 Android 壳。

## 第一版范围

### 1. 捕捉

捕捉页是第一版核心入口。

必须支持：

- 文字闪念。
- 录音闪念。
- 拍照闪念。
- 从相册选择图片。
- 文字、录音、图片可组合保存为同一条闪念。
- 保存后进入现有 `fleeting_notes` 和 `fleeting_attachments` 生命周期。
- 上传失败时保留本地待发送草稿，不能丢失录音和图片。

实现路径：

- 拍照和相册使用 Capacitor Camera。
- 录音优先使用 Web `MediaRecorder`；如果 Android WebView 存在格式、权限或稳定性问题，再补一个薄的 Capacitor 原生录音插件。
- 本地待发送草稿使用 Capacitor Filesystem 或平台持久存储，保存文本、附件 URI、创建时间、失败原因和重试状态。

### 2. 对话

对话页只做普通 AI 对话，不承接桌面工作台。

必须支持：

- 新建普通会话。
- 发送文本消息。
- 附带移动端刚拍摄的图片或录音作为会话附件。
- 查看流式回复。
- 取消当前生成。
- 查看基础会话历史列表并继续会话。

不支持：

- 多标签工作台。
- 文件树、空间预览、终端。
- prompt/skill/extension command 资源面板。
- agent 配置页。
- 权限复杂管理面板。

### 3. 任务

任务页只做查看和轻操作。

必须支持：

- 查看任务列表，至少包含待办、进行中、审核中、已完成状态分组。
- 查看任务详情。
- 修改任务状态。
- 打开或继续任务处理会话入口。
- 能看到任务的基础项目信息和处理会话状态。

不支持：

- 看板拖拽。
- 里程碑管理。
- 项目绑定编辑。
- 批量操作。
- 任务回顾配置。

### 4. 设置

设置页只保留移动端必需项：

- ridge 服务地址。
- 当前 Android 设备注册状态。
- 重新注册设备。
- 网络连接状态。
- 本地待发送草稿数量。

不做桌面端完整设置页。

## 明确不做

第一版禁止加入以下能力：

- 文件管理。
- 项目注册或外部仓库管理。
- RAG 搜索。
- Wiki 管理。
- 记忆管理。
- 通知中心完整动作。
- 桌面设备管理。
- runtime bundle 管理。
- Android 本机运行 pi agent。
- Android 本机代码执行。
- 移动端完整工作台、多标签和复杂侧栏。

## 后端改造点

### 设备模型

- `device_type` 新增或允许 `android`。
- Android 设备注册仍返回一次性明文 token，数据库只保存 `token_hash`。
- Android 心跳可先走 REST，后续补 WebSocket 在线状态。
- Android capability 第一版只记录移动能力，例如：

```json
{
  "mobile_capture": true,
  "camera": true,
  "microphone": true
}
```

第一版不启用 `skill_android`，避免误把 Android 端纳入 runtime bundle 分发。

### 闪念 API

优先复用现有闪念 API：

- `POST /api/fleeting`
- `POST /api/fleeting/:noteId/attachments`
- `GET /api/fleeting/suggestions`

如移动端需要更稳定的原子提交，再新增窄接口：

```
POST /api/mobile/captures
```

该接口只负责一次性创建闪念并上传附件，内部仍写入 `fleeting_notes` 和 `fleeting_attachments`，不得另建一套移动端闪念模型。

### 会话 API

优先复用现有会话主线：

- `POST /api/sessions`
- `GET /api/sessions/:sessionId/messages`
- `POST /api/sessions/:sessionId/messages`
- `GET /api/sessions/:sessionId/events`
- `POST /api/sessions/:sessionId/cancel`

移动端普通会话必须走 server run location，不允许创建 desktop 会话或 task-only agent 会话。

### 任务 API

优先复用现有任务 API 和任务处理会话 API：

- 任务列表、详情、状态更新。
- `POST /api/workspace/tasks/:taskId/processing-session`
- `GET /api/workspace/tasks/:taskId/processing-session`

移动端只能做用户态任务状态修改；Agent 仍不能直接完成任务。

## 安全边界

- 服务地址必须显式配置，不自动扫描局域网。
- 所有移动端请求必须使用设备 token 或用户会话 token；第一版若无用户系统，使用 Android 设备 token。
- token 只保存在 Android 安全存储或 Capacitor 安全存储插件中，不写明文日志。
- 录音、图片上传前必须显示本地预览和删除入口。
- 上传失败不能静默吞掉，必须进入待发送队列。
- 移动端不得暴露 `.ridge`、外部项目路径、服务器文件路径或 runtime bundle 内容。
- 对公网 VPS 访问时必须使用 HTTPS 或 Tailscale/ZeroTier 私网。

## 测试策略

遵守项目 TDD 要求：先写测试，再实现。

### 服务端测试

- Android 设备注册、心跳和 token 校验。
- 移动端闪念创建后写入真实 `fleeting_notes`。
- 移动端附件上传后写入真实 `fleeting_attachments`，文件落在 `.ridge/fleeting-attachments/{noteId}/`。
- 移动端捕捉失败不产生半条闪念或孤儿附件。
- 移动端普通会话创建、发送、SSE 事件、取消复用既有主线。
- 移动端任务列表和状态更新遵守任务状态机。

### 移动端单元与组件测试

- 捕捉草稿创建、附件添加、附件删除、失败重试。
- 录音状态机：idle → recording → preview → uploading → done/failed。
- 拍照/相册结果转为附件草稿。
- 对话发送失败保留输入和附件。
- 任务状态更新失败回滚。

### E2E / 真机验收

- 真机配置 VPS ridge 地址并注册 Android 设备。
- 创建文字闪念成功。
- 录音保存为闪念附件成功。
- 拍照保存为闪念附件成功。
- 断网时录音和图片进入待发送，恢复网络后可重试成功。
- 新建普通对话并收到流式回复。
- 查看任务列表，打开详情并修改状态。

## 开发阶段

### 阶段 1：移动端工程骨架

验收：

- `packages/mobile` 可独立启动 Web dev server。
- Capacitor Android 工程可生成 debug APK。
- 移动端主题支持明暗模式。
- 底部三入口固定为：捕捉、对话、任务。
- 无桌面端侧栏、多标签和工作台入口。

### 阶段 2：服务连接与 Android 设备注册

验收：

- 设置页可保存 ridge 服务地址。
- Android 设备可注册为 `device_type=android`。
- 设备 token 可持久保存。
- App 启动后可心跳，服务端设备列表可看到在线状态。

### 阶段 3：闪念捕捉

验收：

- 文字闪念写入服务端。
- 录音附件写入 `.ridge/fleeting-attachments`。
- 拍照和相册图片附件写入 `.ridge/fleeting-attachments`。
- 失败草稿可本地保留和重试。
- 后端和移动端测试覆盖成功、失败、重试和附件删除。

### 阶段 4：轻对话

验收：

- 移动端可新建普通会话。
- 可发送文本和附件。
- 可查看 SSE 流式回复。
- 可取消当前生成。
- 失败不丢输入和附件。

### 阶段 5：任务查看和轻操作

验收：

- 可加载任务列表和详情。
- 可修改任务状态。
- 可打开或继续任务处理会话。
- 状态更新失败时本地回滚。

### 阶段 6：真机闭环与归档

验收：

- 真机完成捕捉、对话、任务三条主路径。
- 服务端测试、移动端测试和根目录 `npm run check` 通过。
- 文档更新到对应模块梳理。
- 本开发文档归档到 `文档/功能开发/归档/`。

## 完成标准

- Android 第一版只暴露捕捉、对话、任务和必要设置。
- 捕捉支持文字、录音、拍照、相册，并能进入现有闪念生命周期。
- 对话能完成普通会话收发和流式展示。
- 任务能查看详情和更新状态。
- 断网和上传失败不丢移动端采集内容。
- 不引入桌面功能搬运、不新增第二套闪念/任务/会话模型。
- 所有 `.ts` / `.vue` / `.js` 修改后根目录 `npm run check` 通过。
