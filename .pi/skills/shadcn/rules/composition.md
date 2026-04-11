# 组件组合规则

## 核心原则

1. 优先使用项目现有 UI 组件组合，不要回退成手写样式 div
2. 弹层、卡片、头像、分隔线、加载态等常见结构应保持语义完整
3. 先看项目已有实现，再决定新增组件的组合方式

---

## 分组型组件

像 `Select`、菜单、命令面板这类组件，条目应放在正确的分组容器里，而不是随手平铺。

如果当前项目组件实现要求 `Group` 容器，就必须遵守，不要偷懒省略。

---

## 弹层结构

`Dialog` / `Sheet` / `Drawer` 一类弹层，至少要保证：

- 有明确标题
- 有必要时补描述
- 主内容区与操作区分开

**示例：**

```vue
<DialogContent>
  <DialogHeader>
    <DialogTitle>编辑资料</DialogTitle>
    <DialogDescription>更新个人信息</DialogDescription>
  </DialogHeader>

  <!-- 主内容 -->

  <DialogFooter>
    <Button variant="outline">取消</Button>
    <Button>保存</Button>
  </DialogFooter>
</DialogContent>
```

---

## Card 结构

优先使用完整卡片结构：

- `CardHeader`
- `CardTitle`
- `CardDescription`
- `CardContent`
- `CardFooter`

不要把所有内容全部粗暴塞到一个区域里。

---

## Avatar

头像组件要有 fallback，避免图片加载失败时直接塌陷或空白。

---

## 分隔与加载态

- 分隔优先使用 `Separator`，不要随手写 `<hr>` 或边框占位 div
- 加载态优先使用 `Skeleton`，不要自己堆一堆临时骨架样式

---

## 状态展示

- 状态、小标签、数量变化优先使用已有 `Badge` / Alert / Callout 语义组件
- 不要每次都手写一套圆角背景 + 原始颜色 span

---

## Toast / 提示反馈

如果项目已经接入统一 toast 方案，就继续用统一方案，不要在业务组件里临时造新的提示机制。
