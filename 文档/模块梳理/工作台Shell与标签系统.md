# 工作台 Shell 与标签系统

## 职责

工作台 Shell 负责左侧固定入口、工作空间会话入口、右侧标签栏和分屏标签生命周期。

## 入口

- `packages/web/src/pages/WorkspacePage.vue`
- `packages/web/src/composables/useSplitPanes.ts`
- `packages/web/src/components/workspace/split/`
- `packages/web/src/components/common/TabBar.vue`

## 标签类型

- `home`：空主页输入入口，首次发送后替换为会话标签。
- `conversation`：工作空间或后续项目会话标签。
- `singleton_feature`：闪念、搜索、通知、任务、文件、自动化、Skill、设置。
- `terminal`：终端标签，可多开。
- `space_preview`：空间 HTML 预览标签。
- `file`：普通文件预览或编辑标签。

## 固定入口

左侧固定入口顺序：

- 闪念
- 搜索
- 通知
- 任务
- 文件
- 终端
- 自动化
- Skill
- 设置

除终端外，固定入口都使用稳定 `feature:<id>` 标签 ID，重复点击只激活已有标签。
终端每次点击都会创建新终端实例和新标签。

## 会话规则

- 右侧标签栏加号创建新的 `home` 标签。
- 空 `home` 标签关闭不创建会话。
- `home` 首次提交后调用会话创建 API，并原地替换为 `conversation` 标签。
- 打开同一会话时，如果已有标签，只激活原标签，不创建重复标签。
- 关闭会话标签不删除会话。
