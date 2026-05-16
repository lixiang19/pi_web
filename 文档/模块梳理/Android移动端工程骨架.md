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
- 媒体草稿队列：`src/lib/media/media-draft-storage.ts`，保存失败待重试捕捉草稿及附件 URI。

## 服务连接

- 设置页保存 ridge 服务地址并触发 Android 设备注册/重新注册。
- 未配置服务地址时禁止注册和心跳，直接抛出 `MOBILE_SERVICE_URL_MISSING`。
- 移动端只消费设备注册与心跳 API；不请求 runtime bundle，不启用 `skill_android`。

## 构建与验证

- Web dev server：`npm run dev --workspace @pi/mobile`，默认端口 `5176`。
- Web build：`npm run build --workspace @pi/mobile`。
- Capacitor 同步：`npm run cap:sync --workspace @pi/mobile`。
- Android debug APK：`npm run android:debug --workspace @pi/mobile`。
- 根目录 `npm run check` 已包含 `@pi/mobile` 的 `vue-tsc` 检查。

## 当前环境注意

- 本机已安装 Homebrew `openjdk@17`，运行 Android 构建时可临时设置：

```bash
JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH" npm run android:debug --workspace @pi/mobile
```

- Android SDK command-line tools 仍需本机可下载并安装；没有 `ANDROID_HOME` 或 `android/local.properties` 时 Gradle 会停在 SDK location not found。
