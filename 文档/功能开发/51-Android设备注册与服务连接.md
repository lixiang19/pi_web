# 51 Android 设备注册与服务连接

## 目标

让 Android App 能安全连接 ridge 服务端，注册为 `device_type=android` 设备，并建立第一版在线状态。

## 范围

- 设置页保存 ridge 服务地址。
- Android 设备注册，服务端记录 `device_type=android`。
- 设备 token 仅首次返回明文，数据库继续只保存 `token_hash`。
- 移动端安全保存 token。
- App 启动后执行 REST 心跳。
- 设备能力记录移动端能力：`mobile_capture`、`camera`、`microphone`。

## 不做

- 不启用 `skill_android`。
- 不给 Android 下发 runtime bundle。
- 不做局域网自动扫描。
- 不做用户账号系统。
- 不做桌面设备管理 UI。

## 依赖

- 任务 50 Android 移动端工程骨架。
- `文档/模块梳理/设备模型与在线状态.md`
- `文档/模块梳理/runtime-bundle与设备专属Skill.md`

## TDD 与验证

先写测试：

- 服务端接受 `device_type=android` 注册。
- 注册后数据库只有 `token_hash`，不保存明文 token。
- Android 心跳必须带 token，错误 token 返回 401。
- Android capability 不触发 runtime bundle skill 分发。
- 移动端未配置服务地址时不能注册。
- 移动端注册成功后 token 被持久化，重新启动可继续心跳。

再实现：

- 服务端设备类型和 capability 校验。
- 移动端服务地址配置、注册、token 存储、心跳。

## 验收标准

- 真机输入 VPS ridge 地址后可注册设备。
- 服务端设备列表可看到 Android 设备。
- token 错误时所有受保护接口返回 401。
- App 重启后无需重新注册即可心跳。
- Android 设备不收到 runtime bundle。
- 修改 `.ts` / `.vue` / `.js` 后根目录 `npm run check` 通过。

