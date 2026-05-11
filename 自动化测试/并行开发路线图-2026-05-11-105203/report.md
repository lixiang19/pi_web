# 并行开发路线图 页面验收报告

- **验收功能点**：并行开发路线图静态页面
- **页面 URL**：http://localhost:8765/并行开发路线图.html
- **执行时间**：2026-05-11 10:52:03
- **页面路径**：文档/开发进展/并行开发路线图.html

---

## 1. 页面可打开且标题正确

- **操作**：`playwright-cli open http://localhost:8765/并行开发路线图.html`
- **结果**：页面成功打开，URL 为 `http://localhost:8765/%E5%B9%B6%E8%A1%8C%E5%BC%80%E5%8F%91%E8%B7%AF%E7%BA%BF%E5%9B%BE.html`
- **Title**：`05 之后并行开发路线图` ✅

## 2. 控制台 JavaScript Error 检查

- **操作**：`playwright-cli console`
- **结果**：仅 1 条 `[ERROR] Failed to load resource: the server responded with a status of 404 (File not found)`，为 favicon.ico 缺失，无业务 JS 错误 ✅

## 3. 顶部状态文字可见

Snapshot 验证顶部 paragraph 包含：
- `00–05、25 已完成` (ref=e6)
- `6 条并行线收敛` (ref=e7)
- `00–05 基座已完成`、`25 后台队列已完成`、`06–37 并行推进中`、`更新时间：2026-05-11`

✅ 通过

## 4. “先开工推荐批次”只推荐 06、08、12、17、18、30

Snapshot 中 batch-card 节点确认：
- e19/e20: `06` 会话索引归档与只读状态
- e23/e24: `08` 任务里程碑数据模型
- e27/e28: `12` 闪念数据模型与 Web 入口
- e31/e32: `17` 文件页与正式附件目录
- e35/e36: `18` 文件处理状态与临时文件边界
- e39/e40: `30` 项目注册与内部外部项目

共 6 个，无其他编号。✅ 通过

## 5. 点击“第一批”筛选后泳道任务节点只显示 06、08、12、17、18、30

- **操作**：`playwright-cli click e48`（按钮“第一批”）
- **Snapshot 验证**：
  - A 会话线：基座 + 06 ✅
  - B 任务线：基座 + 08 ✅
  - C 闪念采集线：基座 + 12 ✅
  - D 文件空间线：基座 + 17 + 18 ✅
  - E 项目设备线：基座 + 30 ✅
  - F 知识/通知/收尾：基座 ✅
  - 13 未出现在任何泳道中 ✅

## 6. 点击“闪念线”筛选后显示 12、13、14、15、16，并能看到“13 与 14 的关系”

- **操作**：`playwright-cli click e51`（按钮“闪念线”）
- **Snapshot 验证**：
  - C 闪念采集线泳道显示：基座 + 12 + 13 + 14 + 15 + 16 ✅
  - 其他泳道仅保留基座 ✅
  - 页面下方“闪念线 12–16 详解”区域可见 ✅
  - 包含 strong 文本：`13 与 14 的关系` (ref=e270) ✅
  - 包含 13/14 关系解释段落 (ref=e271) ✅

## 7. 点击 13 和 14 任务节点，详情面板显示对应说明

### 点击 13
- **操作**：`playwright-cli click e378`
- **详情面板** (ref=e415)：
  - 标题：`13 闪念临时附件生命周期` (ref=e416)
  - 描述：`附件先写入 .ridge/fleeting-attachments。未处理成功前：不进 RAG、不进文件树、不给 MCP。处理成功后迁移到附件/。` (ref=e417)
  - 依赖：`依赖 12 闪念模型 + 02 .ridge 边界` (ref=e418)
  - 包含 `.ridge/fleeting-attachments`、不进 RAG/文件树/MCP ✅

### 点击 14
- **操作**：`playwright-cli click e383`
- **详情面板** (ref=e415)：
  - 标题：`14 桌面采集入口` (ref=e420)
  - 描述：`桌面菜单栏采集：文字、截图、文件、剪贴板、选区、浏览器网址、录音。统一上传到服务器变成闪念。` (ref=e417)
  - 依赖：`依赖 12 API + 31 桌面在线能力` (ref=e418)
  - 包含菜单栏/截图/文件/剪贴板/浏览器网址/录音并上传到服务器变成闪念 ✅

## 8. 页面源码/DOM 中不包含 `scrollIntoView`

- **源码检查**：`grep -c "scrollIntoView" 文档/开发进展/并行开发路线图.html` → `0`
- **DOM 检查**：`playwright-cli eval "document.documentElement.outerHTML" | grep -c "scrollIntoView"` → `0`
- ✅ 通过

---

## playwright-cli 命令摘要

```
playwright-cli open http://localhost:8765/并行开发路线图.html
playwright-cli snapshot --boxes
playwright-cli console
playwright-cli screenshot --filename=自动化测试/.../screenshots/01-initial.png
playwright-cli click e48          # 第一批筛选
playwright-cli snapshot --boxes
playwright-cli screenshot --filename=自动化测试/.../screenshots/02-first-batch-filter.png
playwright-cli click e51          # 闪念线筛选
playwright-cli snapshot --boxes
playwright-cli screenshot --filename=自动化测试/.../screenshots/03-fleeting-line-filter.png
playwright-cli click e378         # 点击节点 13
playwright-cli screenshot --filename=自动化测试/.../screenshots/04-click-13.png
playwright-cli click e383         # 点击节点 14
playwright-cli screenshot --filename=自动化测试/.../screenshots/05-click-14.png
playwright-cli close
```

---

## 截图清单

| 序号 | 文件名 | 说明 |
|------|--------|------|
| 1 | screenshots/01-initial.png | 初始页面 |
| 2 | screenshots/02-first-batch-filter.png | 点击“第一批”筛选后 |
| 3 | screenshots/03-fleeting-line-filter.png | 点击“闪念线”筛选后 |
| 4 | screenshots/04-click-13.png | 点击节点 13 后详情面板 |
| 5 | screenshots/05-click-14.png | 点击节点 14 后详情面板 |

---

## Snapshot 清单

| 序号 | 文件名 | 说明 |
|------|--------|------|
| 1 | snapshots/01-initial.yml | 初始页面状态 |
| 2 | snapshots/02-after-first-batch.yml | 第一批筛选后状态 |
| 3 | snapshots/03-after-fleeting-line.yml | 闪念线筛选后状态 |
| 4 | snapshots/04-click-13.yml | 点击节点 13 后状态 |
| 5 | snapshots/05-click-14.yml | 点击节点 14 后状态 |

---

## Console 结果

- 总消息数：1
- Errors：1（仅 favicon.ico 404，非业务错误）
- Warnings：0
- 无严重 JavaScript 错误 ✅

---

## e2e 文件

- **路径**：packages/web/e2e/parallel-dev-roadmap.spec.ts
- **说明**：固化本次真实跑通的页面验收路径

## e2e 运行

```bash
cd packages/web && npx playwright test e2e/parallel-dev-roadmap.spec.ts
```

**结果**：通过 ✅（7 passed, 3.8s）

---

## 最终结论

**通过**

全部 8 项验收重点均满足：
1. ✅ 页面标题为“05 之后并行开发路线图”
2. ✅ 控制台无业务 JS 错误
3. ✅ 顶部可见“00–05、25 已完成”和“6 条并行线收敛”
4. ✅ 先开工推荐批次只包含 06、08、12、17、18、30
5. ✅ 第一批筛选后泳道只显示 06、08、12、17、18、30（基座保留，无 13）
6. ✅ 闪念线筛选后显示 12、13、14、15、16，且可见“13 与 14 的关系”解释区
7. ✅ 点击 13/14 详情面板包含对应说明
8. ✅ 页面源码/DOM 不包含 `scrollIntoView`
