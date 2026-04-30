# 会话 v-show LRU 池设计规格

> 删除右侧标签栏，改为 LRU 池保留最近 5 个对话，用 v-show 切换，无需重新加载。

---

## 1. 背景与动机

当前实现使用 `SessionTabBar`（顶部标签栏）+ `SessionTabContent`（标签内容）+ `useSessionTabs`（标签管理）来实现多会话切换。标签栏会随打开会话数增多而变宽，占用垂直空间，且标签的"关闭"概念与左侧列表的"删除/归档"语义重叠。

**核心问题：** 标签栏增加了 UI 复杂度但价值有限——用户已通过左侧 `SessionSidebar` 管理会话列表，标签栏只是冗余的二次导航。

**目标：** 删除标签栏，改用 LRU 池保留最近访问的 5 个已有会话（草稿不在池内），通过 `v-show` 切换实现零重载切换。

---

## 2. 核心概念

### 2.1 LRU 池（Least Recently Used）

- **池容量：** 5 个已有会话（不含草稿）
- **淘汰策略：** LRU — 当池满时，淘汰最早访问的会话
- **活跃会话：** 不做特殊保护，统一参与 LRU 淘汰
- **Streaming 保护：** 正在 streaming 的会话**禁止被淘汰**，必须等 streaming 结束后才可被淘汰
- **初始化：** 应用启动时池为空，用户每点击一个左侧会话，填入一个槽位，逐步填满

### 2.2 草稿会话

- **不占池槽位** — 草稿会话单独渲染，不属于 5 个 LRU 槽位
- **切换即丢失** — 用户从草稿切换到其他会话时，草稿中的未发送内容**直接丢失**，不做保存
- **新建即新草稿** — 每次点击左侧"新建对话"，都创建全新的空白草稿，不复用旧草稿
- **草稿发送后转正** — 草稿发送首条消息后，变成已有会话，自动进入 LRU 池

### 2.3 v-show 可见性

- 池中每个会话对应一个 `SessionTabContent` 实例，用 `v-show` 控制显示
- 右侧文件面板（`ProjectFilePanel`）与对话区同属 `SessionTabContent`，一起 v-show
- 草稿会话也有独立的 `SessionTabContent` 实例，v-show 控制显示

---

## 3. 删除范围

| 文件 / 组件 | 操作 | 说明 |
|---|---|---|
| `SessionTabBar.vue` | **删除** | 顶部标签栏 UI 不再需要 |
| `useSessionTabs.ts` | **重写** | 改为 LRU 池管理，移除 tab 关闭/标签栏相关逻辑 |
| `SessionTabArea.vue` | **重写** | 移除标签栏引用，改为 LRU 池 + v-show 渲染逻辑 |
| `SessionTabContent.vue` | **保留** | 内容不变，仍是每个会话的渲染容器 |
| `WorkbenchPage.vue` | **修改** | 适配新的 LRU 池接口，移除标签栏相关引用 |

### 3.1 `useSessionTabs.ts` 废弃 API

以下 API 在 LRU 模型下不再需要：

- `openDraftTab()` — 草稿不再通过标签打开，改为直接激活草稿视图
- `closeTab()` — 不需要主动关闭，LRU 自动淘汰
- `switchTab()` — 改为 `activateSession()`，由左侧列表点击触发
- `viewMode` / `setViewMode()` — 不再需要视图模式切换
- `tabStorage` / `activeTabStorage` — 不再持久化到 localStorage

---

## 4. 新数据结构

### 4.1 LRU 池条目

```typescript
interface LruPoolEntry {
  sessionId: string;       // 已有会话 ID（非草稿）
  lastAccessedAt: number;  // 最后访问时间戳，用于 LRU 排序
  isStreaming: boolean;     // 是否正在 streaming（受保护不可淘汰）
}
```

### 4.2 LRU 池状态

```typescript
interface LruPoolState {
  entries: LruPoolEntry[];       // 按 lastAccessedAt 降序排列（最近在前）
  activeSessionId: string | null; // 当前显示的已有会话 ID
  activeDraft: boolean;           // 当前是否在草稿视图
  readonly MAX_POOL_SIZE: 5;
}
```

---

## 5. 新 Composable：`useSessionLruPool`

> 替代 `useSessionTabs`，提供 LRU 池管理能力。

### 5.1 导出接口

```typescript
export function useSessionLruPool() {
  // ===== 状态 =====
  const pool: Ref<LruPoolEntry[]>;          // LRU 池条目（有序）
  const activeSessionId: ComputedRef<string | null>; // 当前活跃已有会话
  const isViewingDraft: ComputedRef<boolean>;         // 是否在草稿视图
  const currentViewId: ComputedRef<string | null>;    // 当前视图标识（sessionId 或 '__draft__'）

  // ===== 操作 =====

  /** 激活一个已有会话（从左侧列表点击），加入池或移到池首 */
  function activateSession(sessionId: string): void;

  /** 激活草稿视图（新建对话） */
  function activateDraft(): void;

  /** 更新会话 streaming 状态 */
  function setStreaming(sessionId: string, streaming: boolean): void;

  /** 当会话被删除时，从池中移除 */
  function removeSession(sessionId: string): void;

  /** 获取应被淘汰的会话 ID（池满时返回最早的、非 streaming 的） */
  function getEvictCandidate(): string | null;

  /** 判断某会话是否在池中 */
  function isInPool(sessionId: string): boolean;
}
```

### 5.2 `activateSession` 流程

```
用户点击左侧列表中的会话 X
│
├── X 已在池中？
│   └── 是 → 更新 lastAccessedAt，移到池首，activeSessionId = X
│
├── X 不在池中，池未满（< 5）？
│   └── 是 → 添加 X 到池首，activeSessionId = X
│
└── X 不在池中，池已满（= 5）？
    └── 找最早的、非 streaming 的条目 Y
        ├── 找到 → 淘汰 Y，添加 X 到池首，activeSessionId = X
        └── 未找到（全部在 streaming）→ 不淘汰，仍添加 X 到池（临时超出5），activeSessionId = X
            （等任一 streaming 结束后再淘汰最早的）
```

### 5.3 淘汰时的清理

淘汰一个会话时需要：
1. 该会话对应的 `SessionTabContent` 组件实例被 `v-if` 移除（销毁）
2. `usePerSessionChat` 的 `onBeforeUnmount` 自动断开 SSE
3. 全局缓存（`sessionCache`）中的快照**不清除**，保留用于下次快速恢复

---

## 6. 组件变更

### 6.1 `SessionTabArea.vue`（重写）

**之前：**
```vue
<SessionTabBar v-if="hasTabs" />
<div v-if="hasTabs">
  <div v-for="tab in openTabs" v-show="tab.id === activeTabId">
    <SessionTabContent ... />
  </div>
</div>
<WelcomeEmptyState v-else />
```

**之后：**
```vue
<template>
  <div class="flex h-full flex-col min-w-0 flex-1">
    <!-- 草稿视图 -->
    <div v-show="lru.isViewingDraft.value" class="flex-1 min-h-0">
      <SessionTabContent
        key="__draft__"
        tab-id="__draft__"
        session-id=""
        initial-cwd=""
        initial-parent-session-id=""
      />
    </div>

    <!-- LRU 池中的已有会话，v-show 切换 -->
    <div
      v-for="entry in lru.pool.value"
      :key="entry.sessionId"
      v-show="lru.activeSessionId.value === entry.sessionId && !lru.isViewingDraft.value"
      class="flex-1 min-h-0"
    >
      <SessionTabContent
        :tab-id="entry.sessionId"
        :session-id="entry.sessionId"
        initial-cwd=""
        initial-parent-session-id=""
      />
    </div>

    <!-- 无会话且无草稿时的欢迎页 -->
    <WelcomeEmptyState
      v-if="lru.pool.value.length === 0 && !lru.isViewingDraft.value"
      class="flex-1"
    />
  </div>
</template>
```

**关键变化：**
- 移除 `SessionTabBar` 引用
- 使用 `v-show` 控制池中会话的可见性
- 草稿单独一个 `SessionTabContent`，v-show 控制
- 使用 `lru.activeSessionId` 和 `lru.isViewingDraft` 判断当前视图

### 6.2 `SessionTabContent.vue`（小幅修改）

- `onMounted` 中：如果 `sessionId` 为空，调用 `chat.openSessionDraft()` 而非 `loadSession`
- 监听 `chat.sessionId` 而不是只看外部 `sessionId` prop；当草稿首发后内部 `resolvedSessionId` 变成正式会话 ID 时，再通知 LRU 池接管
- 移除 `useSessionTabs` 相关的 `updateTab` 调用，改为调用 `useSessionLruPool.setStreaming()`

### 6.3 `WorkbenchPage.vue`（修改）

- 移除 `useSessionTabs` 引用，改用 `useSessionLruPool`
- `handleSessionSelect` 改为调用 `lru.activateSession(sessionId)`
- `handleSessionCreate` 改为调用 `lru.activateDraft()`
- 移除 `handleRename` 中的 `updateTabsBySessionId` 调用

### 6.4 `SessionSidebar.vue`（修改）

- 添加 streaming 指示器：对正在 streaming 的会话节点显示动画小圆点
- 当前活跃会话（`activeSessionId`）高亮样式已存在，保持不变

---

## 7. SSE 连接策略

| 会话状态 | SSE 连接 | 说明 |
|---|---|---|
| 当前活跃会话 | ✅ 保持 | 前台显示，必须实时接收 |
| 池中非活跃会话 | ✅ 保持 | 5 个池内会话都保持 SSE，确保实时更新 |
| 被淘汰的会话 | ❌ 断开 | 组件销毁时 onBeforeUnmount 自动断开 |
| 草稿会话 | ❌ 无需 | 草稿没有 SSE（尚未发送消息） |

> **5 个 SSE 连接的代价可接受**：SSE 是长连接、低流量，5 个并发连接对浏览器和服务器压力很小。

---

## 8. 生命周期流程

### 8.1 应用启动

```
1. LRU 池为空，activeDraft = false
2. 显示 WelcomeEmptyState 欢迎页
3. 用户点击左侧"新建对话" → activateDraft()
4. 草稿 SessionTabContent 挂载，显示空白输入区
```

### 8.2 从草稿发送首条消息

```
1. 用户在草稿中输入并发送 → usePerSessionChat.submit()
2. submit() 内部调用 createSession() → 获得 sessionId
3. 草稿 SessionTabContent 的 sessionIdRef 更新为真实 ID
4. 通知 LRU 池：新会话加入池
5. LRU 池：isViewingDraft = false，activeSessionId = 新 ID
6. 草稿 SessionTabContent 被隐藏（v-show=false），新会话的 SessionTabContent 挂载并显示
```

### 8.3 切换已有会话

```
1. 用户在左侧列表点击会话 X
2. LRU 池：activateSession(X)
3. 如果 X 已在池中 → 更新访问时间，v-show 切换到 X
4. 如果 X 不在池中，池未满 → 加载 X，添加到池，v-show 切换
5. 如果 X 不在池中，池已满 → 淘汰最早的 idle 会话，加载 X，v-show 切换
6. 切换无 loading 状态，尽量无感（利用全局缓存 sessionCache）
```

### 8.5 删除会话

```
1. 用户在左侧列表删除会话 X
2. LRU 池：removeSession(X)
3. 如果 X 是当前活跃会话 → 切换到池中最近的会话，或回到欢迎页
4. 如果 X 正在 streaming → 先 abort，再删除
5. 对应 SessionTabContent 被 v-if 移除，自动清理
```

---

## 9. Streaming 保护机制

当 `activateSession` 需要淘汰但池中所有条目都在 streaming 时：

1. **临时超出池容量** — 新会话仍然加入池，池大小暂时为 6
2. **延迟淘汰** — 监听 streaming 状态变化，任一会话 streaming 结束后，如果池大小 > 5，淘汰最早的 idle 会话
3. **极限情况** — 5 个都在 streaming + 用户点击第 6 个，第 6 个也加入，池 = 6。等任一结束后淘汰最早的 idle

---

## 10. 不持久化策略

- **LRU 池不持久化到 localStorage** — 每次刷新/重启后池为空
- **草稿不持久化** — 切换走即丢失
- **全局缓存 `sessionCache` 仍在内存中** — 但刷新后也清空
- **理由：** 简化实现，避免过期状态问题，5 个槽位很快就能通过用户操作重新填满

---

## 11. 需要删除的代码

| 目标 | 操作 |
|---|---|
| `SessionTabBar.vue` | 删除文件 |
| `useSessionTabs.ts` | 删除文件，替换为 `useSessionLruPool.ts` |
| `WorkbenchPage.vue` 中对 `useSessionTabs` 的引用 | 替换为 `useSessionLruPool` |
| `usePerSessionChat.ts` 中对 `useSessionTabs` 的引用 | 替换为 `useSessionLruPool` |
| `SessionTabContent.vue` 中对 `useSessionTabs` 的引用 | 替换为 `useSessionLruPool` |
| localStorage key `pi-web.session-tabs.v1` | 不再写入，自然过期 |
| localStorage key `pi-web.session-tabs.active.v1` | 不再写入，自然过期 |

---

## 12. 左侧列表 Streaming 指示器

在 `SessionSidebarSessionNode.vue` 中，为正在 streaming 的会话节点添加视觉指示：

- **位置：** 会话标题左侧，类似原标签栏的脉冲小圆点
- **样式：** 与原标签栏的 `.streaming-indicator` 一致（蓝色脉冲动画）
- **条件：** 当 `session.status === 'streaming'` 时显示
- **数据来源：** `core.sessions` 中每个 `SessionSummary` 已包含 `status` 字段

---

## 13. 实现顺序

1. **创建 `useSessionLruPool.ts`** — LRU 池核心逻辑
2. **重写 `SessionTabArea.vue`** — v-show 渲染逻辑
3. **修改 `SessionTabContent.vue`** — 适配 LRU 池，移除 useSessionTabs
4. **修改 `WorkbenchPage.vue`** — 替换 useSessionTabs 为 useSessionLruPool
5. **修改 `SessionSidebarSessionNode.vue`** — 添加 streaming 指示器
6. **删除 `SessionTabBar.vue`** — 移除标签栏
7. **删除 `useSessionTabs.ts`** — 清理旧代码
8. **运行 eslint + tsc 检查**
9. **更新 `文档/模块梳理/中间对话区模块.md`**

---

## 14. 池外会话点击的完整数据流分析（核心问题）

当用户点击左侧列表中一个**不在 LRU 池中**的会话时，涉及淘汰、加载、SSE 重连三条链路交织，必须仔细处理。

### 14.1 完整事件链

```
用户点击左侧列表中会话 X（不在池中）
│
├─① LRU 池决策
│   ├── 池未满 → 直接添加 X 到池首
│   └── 池已满 → 淘汰最早的 idle 会话 Y
│       ├── 从 pool entries 移除 Y
│       ├── Vue 响应式触发：Y 的 v-if 容器变为 false
│       ├── SessionTabContent(Y) 的 onBeforeUnmount → disconnectStream(Y)
│       └── sessionCache 中 Y 的快照 **不清除**
│
├─② Vue 渲染更新（同一 tick）
│   ├── pool entries 变化 → 新增 entry(X)
│   ├── X 的 v-if 容器变为 true → SessionTabContent(X) 挂载
│   ├── activeSessionId 更新 → X 的 v-show 变为 true
│   └── 原活跃会话 Z 的 v-show 变为 false（组件保留）
│
├─③ SessionTabContent(X) 的 onMounted
│   ├── 调用 usePerSessionChat(sessionIdRef=X, tabIdRef=X)
│   ├── 调用 chat.loadSession(X)
│   │   ├── 情况A: sessionCache 有 X 的快照 → 直接用缓存
│   │   │   ├── applySnapshotToSession(cachedSnapshot)
│   │   │   │   ├── messages.value = 缓存中的消息（可能过时！）
│   │   │   │   └── connectStream(X)  ← 建立新 SSE 连接
│   │   │   └── 等待 SSE 的第一个 snapshot 事件...
│   │   │
│   │   └── 情况B: sessionCache 无 X 的快照 → 网络请求
│   │       ├── await core.hydrateSession(X) → GET /api/sessions/X/hydrate
│   │       ├── applySnapshotToSession(freshSnapshot)
│   │       │   ├── messages.value = 最新消息
│   │       │   └── connectStream(X)
│   │       └── hydration 完成后 refreshAgents + refreshResources
│   │
│   └── SSE 连接建立后的服务端行为
│       ├── GET /api/sessions/X/stream
│       ├── ensureSessionRecord(X) → 服务端激活会话
│       │   ├── 如果已在内存 → 直接用
│       │   └── 如果不在内存 → 从 sessionFile 重新加载（100-300ms）
│       └── 立即发送 { type: "snapshot", messages: [...], ... } ← 完整快照！
│
└─④ 前端收到 SSE snapshot 事件
    ├── applyStreamSnapshotEvent → 完全替换 messages
    ├── messages.value = 最新消息列表
    └── UI 更新为最新状态
```

### 14.2 三种场景的体验分析

| 场景 | 触发条件 | 首次渲染内容 | SSE snapshot 到达后 | 用户体验 |
|---|---|---|---|---|
| **A: 缓存命中** | 会话之前在池中、被淘汰、但缓存未清 | 过时的缓存消息 | 替换为最新消息 | ⚠️ **短暂闪烁**：先显示旧消息，50-200ms 后跳到最新 |
| **B: 缓存未命中** | 会话从未加载过（首次点击） | 空白（messages=[]） | hydrate API 返回后才渲染 | ⚠️ **空白期**：200-500ms 空白，然后显示内容 |
| **C: 池内切换** | 会话已在池中（v-show 切换） | 保留在 DOM 中的最新消息 | 无需 SSE 重连（已连接） | ✅ **零延迟**，瞬间切换 |

### 14.3 场景A的闪烁问题详细分析

**根因：** `loadSession` 优先使用缓存，而缓存快照在 SSE 断开后不会更新。

**闪烁表现：**
- 如果淘汰期间有新消息产生：先显示 N 条消息 → 突然变成 N+M 条（新消息追加在底部）
- 如果淘汰期间 streaming 结束：先显示 streaming 状态 → 突然变成 idle
- 如果淘汰期间有 interactiveRequests 变化：先显示/不显示弹窗 → 突然变化

**严重程度：** 取决于淘汰时长和会话活跃程度
- 淘汰 1-2 秒后重新点击：几乎无差异
- 淘汰 10+ 秒后重新点击、且会话有新消息：可见闪烁

**解决方案（推荐方案D）：**

> **方案D: 缓存快速展示 + SSE 静默修正**
>
> 1. 保留缓存逻辑：先展示缓存快照（比空白好）
> 2. SSE snapshot 到达时，不做特殊处理，直接替换（当前逻辑已是如此）
> 3. 视觉上，新消息追加在底部是自然的，不会造成严重闪烁
> 4. 如果会话状态从 streaming → idle，这个变化也是自然的
>
> **权衡：** 短暂闪烁 vs 空白等待，闪烁更可接受

**备选方案（不推荐）：**

| 方案 | 描述 | 优点 | 缺点 |
|---|---|---|---|
| A: 跳过缓存直接 hydrate | 非池会话 loadSession 时不用缓存 | 无闪烁 | 每次多一个网络请求（200-500ms 空白） |
| B: 缓存+缓冲 | 用缓存展示，但 SSE snapshot 到达前加 transition | 无闪烁 | 复杂度高，需要消息 diff 算法 |
| C: 淘汰时清缓存 | 淘汰时删除 sessionCache 条目 | 简单，无闪烁 | 失去缓存快速恢复能力 |

### 14.4 场景B的空白期问题详细分析

**根因：** 首次加载会话需要网络请求 + 服务端可能需要从磁盘恢复会话。

**空白期组成：**
1. `ensureSessionRecord` → 服务端从 sessionFile 加载（如果不在内存中）
2. `GET /api/sessions/X/hydrate` → 服务端构建完整快照
3. 网络传输延迟

**总延迟：** 200ms（热会话）~ 800ms（冷会话需从磁盘加载）

**解决方案：**

1. **预取策略（已有）**：`prefetchNeighborSessions` 已预取当前会话的前后邻居
2. **点击预加载**：左侧列表 hover 时触发 `handlePrefetch`，提前 hydrate
3. **过渡动画**：加载期间显示淡入淡出过渡，而非突兀的空白
4. **利用缓存中的 Summary**：即使无快照，sessions 列表有 title/status，可在加载期间显示会话标题骨架屏

### 14.5 usePerSessionChat 的 SSE 管理必须修改

**当前代码（问题所在）：**
```typescript
// usePerSessionChat.ts 中当前的 SSE 管理
watch(activeTabId, (newActiveId) => {
  if (newActiveId === tabIdRef.value) {
    // 本标签变为活动 → 重连 SSE（仅 streaming 时）
    if (sessionIdRef.value && (status.value === "streaming" || ...)) {
      connectStream(sessionIdRef.value);
    }
  } else if (eventSource) {
    // 本标签变为非活动 → 断开 SSE ❌ 这在新模型下不对！
    disconnectStream();
  }
});
```

**问题：** 当前逻辑在标签变为非活动时断开 SSE。但在 LRU 池模型下，池内非活跃会话需要保持 SSE 连接以接收实时更新。

**修改方案：**
```typescript
// 新的 SSE 管理策略
// 池内会话：始终保持 SSE 连接（无论是否活跃）
// 淘汰会话：onBeforeUnmount 自动断开
// 草稿会话：无 SSE

// 不再 watch activeTabId 来断开 SSE
// SSE 仅在以下情况断开：
// 1. 组件 onBeforeUnmount（被淘汰/删除）
// 2. 手动调用 disconnectStream
// 3. SSE onerror 自动断开
```

### 14.6 服务端 ensureSessionRecord 的资源考量

5 个 SSE 连接意味着服务端最多同时维护 5 个活跃的 `SessionRecord`。每个 record 持有：
- Pi AgentSession 实例（含对话历史）
- 资源加载器
- settings 管理器
- SSE 客户端集合

**影响：**
- 内存：每个 SessionRecord 估计占用 5-50MB（取决于对话长度）
- 5 个并发：25-250MB 服务端内存，可接受
- 注意：SSE 连接仅用于推送事件，不占用 CPU（除非正在 streaming）

---

## 15. 风险与注意事项

| 风险 | 缓解措施 |
|---|---|
| 池外会话点击后短暂闪烁（缓存→SSE修正） | 方案D：接受短暂闪烁，比空白等待体验更好 |
| 池外会话首次点击的空白期 | hover 预取 + 过渡动画 + 骨架屏标题 |
| 5 个 SSE 连接的服务端资源 | 每个 5-50MB，5 个并发可接受 |
| 5 个 SessionTabContent 实例的内存 | 每个实例主要是消息列表，现代浏览器可承受 |
| 全部 streaming 时池超出 5 个 | 临时允许超出，streaming 结束后立即淘汰 |
| 草稿丢失导致用户不满 | 当前版本明确以“一次性草稿”换取状态简单；若未来调整，必须重新设计而不是恢复旧 localStorage 补丁 |
| usePerSessionChat 的 SSE 断开逻辑需修改 | 移除 activeTabId watch 中的 disconnectStream，改为仅 onBeforeUnmount 断开 |
| v-show 导致隐藏组件仍占 DOM | 这正是目标——保留 DOM 以实现零重载切换 |
| 服务端冷会话加载延迟 | prefetch + ensureSessionRecord 的 disk I/O 不可控，接受 200-800ms 延迟 |
