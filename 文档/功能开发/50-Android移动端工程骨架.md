# 50 Android 移动端工程骨架

## 目标

建立 ridge Android 第一版的 `Capacitor + Vue` 工程基础，形成移动端独立入口、主题、路由、构建和 APK 产物能力。

## 范围

- 新增 `packages/mobile`，使用 `Vue 3 + TypeScript + Vite + Capacitor`。
- 新增 Capacitor Android 工程。
- 移动端只保留底部三入口：捕捉、对话、任务。
- 增加必要设置页入口，但设置页只用于服务地址、设备注册状态和本地队列状态。
- 接入主题文件，支持明暗模式。
- 建立移动端 API client、设备存储、媒体草稿存储的基础目录。

## 不做

- 不复用桌面工作台布局。
- 不加入多标签、文件树、空间、终端、项目管理、RAG、Wiki、记忆、通知中心完整动作。
- 不在 Android 本机运行 pi agent。
- 不实现具体捕捉、对话、任务业务。

## 依赖

- `文档/项目设计/Android移动端第一版.md`
- `文档/功能开发/49-Android移动端第一版.md` 或同名总设计文档。

## TDD 与验证

先写测试：

- 移动端路由只暴露捕捉、对话、任务和必要设置。
- 底部导航点击能切换三个主入口。
- 主题切换后根节点 class 或 CSS 变量正确变化。
- API client 在未配置服务地址时返回明确错误。

再实现：

- `packages/mobile` 工程。
- Capacitor 配置和 Android 壳。
- 基础布局、主题、路由和空状态。

## 验收标准

- `packages/mobile` 可启动 Web dev server。
- Capacitor Android debug APK 可构建。
- 手机安装后首屏不是桌面工作台，而是移动端捕捉入口。
- 底部导航固定为捕捉、对话、任务。
- 设置页只显示移动端必要配置。
- 修改 `.ts` / `.vue` / `.js` 后根目录 `npm run check` 通过。

## 实现记录

- 已新增 `packages/mobile`，使用 `Vue 3 + TypeScript + Vite + Capacitor`，独立于桌面工作台。
- 已新增固定路由：捕捉、对话、任务、移动设置；底部导航只包含捕捉、对话、任务。
- 已接入 shadcn-vue Button 基础组件、主题文件、明暗模式切换、移动端 API client、设备注册存储和媒体草稿存储。
- 已生成根目录 `android/` Capacitor Android 工程，并通过 `cap sync android` 同步移动 Web 产物。
- 已将根目录 `npm run check` 的 typecheck 扩展到 `@pi/mobile`。

## 当前验证状态

- `pnpm --filter @pi/mobile test`：通过。
- `pnpm --filter @pi/mobile build`：通过。
- `pnpm --filter @pi/mobile exec cap add android`：通过。
- `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH" pnpm --filter @pi/mobile android:debug`：已推进到 Gradle Android 编译，但本机缺 Android SDK，报错 `SDK location not found`。
- Homebrew `android-commandlinetools` 和直接 `curl` 下载官方 `commandlinetools-mac-14742923_latest.zip` 均因 `dl.google.com` 连接重置失败；APK 产物构建剩余阻塞为本机 Android SDK 安装环境。
