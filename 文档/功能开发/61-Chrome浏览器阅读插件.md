# 61 Chrome 浏览器阅读插件

## 目标

参考 WisMe 的“浏览器中安静记录真实阅读、再沉淀为个人知识”的思路，但接入 ridge 现有闭环：浏览器只做采集设备，URL 先进入闪念，再由闪念处理、Python 转化服务、RAG、图谱、Wiki 和后台 Agent 继续沉淀。

## 已实现范围

- 新增 `browser` 设备类型。
- `browser` 设备只允许 `browser_capture`、`silent_reading_capture` 能力。
- `browser` 设备使用设备 token 注册、心跳和采集。
- `browser` 设备不接收 runtime bundle。
- 新增 `POST /api/browser/captures`。
- 浏览器采集写入 `fleeting_notes`，`content` 只保存脱敏后的 URL，`capture_type=browser_page`。
- 服务端保存 URL 前删除 `token`、`secret`、`password`、`utm_*` 等敏感或跟踪 query。
- Chrome 插件包在 `packages/browser-extension`。
- 插件支持连接 ridge、自动保存认真读过的页面、手动保存当前页、域名排除和离线队列重试。
- 闪念处理为剪藏时，如果闪念内容是 URL，Node 后端调用 Python Converter 的 `document.markdown` + `markitdown`，把网页转成 Markdown。
- 转换成功后写入 `剪藏/<标题>.md`，创建 `clips` 记录，触发 RAG 索引，并把原闪念标记为已处理。
- 转换失败时保留原闪念，不写入剪藏文件。

## 插件规则

自动保存只在满足真实阅读信号时触发：

- 停留不少于 45 秒且滚动比例不少于 35%；或
- 同一路径访问不少于 3 次且本次停留不少于 15 秒。

插件不采集：

- 网页正文；
- 摘录文本；
- 表单输入；
- cookie；
- keystroke；
- 鼠标轨迹；
- incognito 默认数据。

## 文件

- `packages/browser-extension/public/manifest.json`
- `packages/browser-extension/src/background.ts`
- `packages/browser-extension/src/content.ts`
- `packages/browser-extension/src/popup.ts`
- `packages/server/src/routes/browser-captures.ts`
- `packages/server/src/routes/fleeting.ts`
- `packages/server/src/__tests__/browser-captures.test.ts`
- `packages/server/src/__tests__/fleeting-api.test.ts`
- `services/converter/src/ridge_converter/input_sources.py`
- `services/converter/tests/test_api_contract.py`

## 验收

- `cd packages/server && pnpm exec vitest run src/__tests__/browser-captures.test.ts src/__tests__/fleeting-api.test.ts`
- `cd services/converter && uv run --extra dev pytest tests/test_api_contract.py`
- `pnpm --filter @pi/browser-extension test`
- `pnpm --filter @pi/browser-extension check`
- `pnpm --filter @pi/browser-extension build`
- `npm run build --workspace @pi/server`
- `npm run check`

## 后续

- 加浏览器端安装和连接指引。
- 在设置页展示浏览器设备状态和最近采集时间。
- 做一次真实 Chrome 加载 `packages/browser-extension/dist` 的端到端验收。
