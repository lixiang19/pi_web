# 68-公网部署 Converter 认证门禁

## 背景

Python Converter 已经通过 `Authorization: Bearer <key>` 保护 `/v1` HTTP 接口，但当前默认 `RIDGE_CONVERTER_API_KEYS=dev-key`。本地开发可接受，公网部署不可接受，尤其 Docker 默认绑定 `0.0.0.0`。

## 目标

- 保留本地 loopback 开发默认 key。
- 绑定公网地址或 production 环境时，必须显式配置非默认 `RIDGE_CONVERTER_API_KEYS`。
- 配置错误必须在服务启动/创建 app 时失败，而不是等请求时才暴露。

## 验收

- 测试覆盖公网绑定 + 默认 key 拒绝启动。
- 测试覆盖公网绑定 + 显式 key 允许启动。
- README / env 示例 / 模块梳理更新公网部署说明。
