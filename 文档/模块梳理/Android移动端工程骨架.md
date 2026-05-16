# Android 移动端工程骨架

## 职责边界

- `packages/mobile` 是 ridge Android 第一版的 Vue/TypeScript 真源，负责移动端捕捉、轻对话、任务和必要设置入口。
- `android/` 是 Capacitor 生成的 Android 壳，只保存原生打包配置和同步后的 Web 产物，不承载业务逻辑。
- 移动端不复用桌面工作台布局，不引入多标签、文件树、终端、空间、RAG、Wiki 或项目管理入口。

## 入口与路由

- 路由真源：`packages/mobile/src/router/routes.ts`。
- 允许路由固定为：
  - `/`：捕捉
  - `/chat`：对话
  - `/tasks`：任务
  - `/settings`：移动设置
- 底部导航只绑定捕捉、对话、任务三个主入口；设置通过顶部设置按钮进入。

## 主题

- 移动端使用独立主题入口 `packages/mobile/src/style.css`。
- 构建期语义变量在 `src/theme/theme-contract.css`，运行时变量在 `src/theme/default.css`。
- 明暗模式由 `src/theme/mobile-theme.ts` 统一切换根节点 `.dark`，并持久化到 `localStorage`。

## 本地基础存储

- 服务地址：`src/lib/api/mobile-api-client.ts`，未配置时抛出 `MOBILE_SERVICE_URL_MISSING`，禁止静默请求。
- Android 设备注册状态：`src/lib/device/device-storage.ts`，保存 deviceId、一次性返回 token 和设备名。
- 设备连接：`src/lib/device/android-device-client.ts` 使用保存的服务地址注册 `deviceType=android`，capability 固定为 `mobile_capture`、`camera`、`microphone`；注册成功后持久化 token，App 启动时已有注册状态则执行 REST 心跳。
- 媒体草稿队列：`src/lib/media/media-draft-storage.ts`，保存失败待重试捕捉草稿、附件 URI、文件名、MIME、大小和 base64 内容；删除附件只影响该附件，不清空文字或其他附件。
- 附件转换：`src/lib/media/capture-attachment.ts` 把录音、拍照和相册 `File` 转为本地待上传附件，`recorder` 产物为 `audio`，`camera/gallery` 产物为 `photo`。
- 录音状态：`src/lib/media/recording-state.ts` 固定为 `idle -> recording -> preview -> uploading -> done/failed`，预览录音可删除并回到 `idle`。
- 移动捕捉提交：`src/lib/media/mobile-capture-submitter.ts` 使用已保存 Android 注册信息向服务端提交，提交中先写本地 `uploading` 草稿，成功删除，失败改为 `failed` 并保留可重试草稿。
- 轻对话 API：`src/lib/chat/mobile-chat-api-client.ts` 复用 `/api/sessions`、`/messages`、`/attachments` 和 `/cancel`，所有请求带 Android Bearer token；附件由本地 base64 草稿转回 `File` 后通过现有会话附件接口上传。
- 轻对话 SSE：`src/lib/chat/mobile-chat-sse.ts` 订阅 `/api/sessions/:sessionId/events?token=<android-token>`，合并 `snapshot/status/message_start/message_end/error` 到移动端消息流。
- 轻对话状态：`src/lib/chat/mobile-chat-store.ts` 管理基础会话列表、当前会话、消息流、发送状态、错误和 composer；`src/lib/chat/mobile-chat-draft-storage.ts` 在发送失败或 SSE error 时保留文本与附件草稿，最终 assistant 消息到达后清空本次待发送草稿。

## 服务连接

- 设置页保存 ridge 服务地址并触发 Android 设备注册/重新注册。
- 未配置服务地址时禁止注册和心跳，直接抛出 `MOBILE_SERVICE_URL_MISSING`。
- 移动端只消费设备注册与心跳 API；不请求 runtime bundle，不启用 `skill_android`。
- 移动捕捉消费 `POST /api/mobile/captures`，请求体包含 `deviceId`、`token`、文字和附件 base64；服务端只接受 Android 设备 token。
- `POST /api/mobile/captures` 内部写现有 `fleeting_notes` 和 `fleeting_attachments`，附件目录固定为 `.ridge/fleeting-attachments/{noteId}/`，并触发现有 fleeting analysis；失败时清理已创建的闪念和临时附件。
- 移动轻对话不新增移动端会话模型；Android token 创建会话时，服务端默认使用 `~/ridge-workspace` 对应的当前默认工作空间，固定为普通 server 会话，不允许移动端传服务器路径、桌面项目、分叉或 task-only agent。

## 构建与验证

- Web dev server：`npm run dev --workspace @pi/mobile`，默认端口 `5176`。
- Web build：`npm run build --workspace @pi/mobile`。
- Capacitor 同步：`npm run cap:sync --workspace @pi/mobile`。
- Android debug APK：`npm run android:debug --workspace @pi/mobile`。
- 根目录 `npm run check` 已包含 `@pi/mobile` 的 `vue-tsc` 检查。
- 任务 52 验收覆盖 `task52-mobile-capture.test.ts`、移动端媒体草稿/转换/状态机/提交器测试和 `CapturePage.test.ts`。
- 任务 53 验收覆盖 `task53-mobile-chat.test.ts`、`mobile-chat-api-client.test.ts`、`mobile-chat-sse.test.ts`、`mobile-chat-store.test.ts` 和 `ChatPage.test.ts`。

## 当前环境注意

- 本机已安装 Homebrew `openjdk@17`，运行 Android 构建时可临时设置：

```bash
JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH" npm run android:debug --workspace @pi/mobile
```

- Android SDK command-line tools 仍需本机可下载并安装；没有 `ANDROID_HOME` 或 `android/local.properties` 时 Gradle 会停在 SDK location not found。
