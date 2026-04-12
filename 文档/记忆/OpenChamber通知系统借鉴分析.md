# OpenChamber 通知系统借鉴分析

> 参考项目：`/Users/lixiang/Documents/myCode/openchamber/packages`
> 分析日期：2026-04-11

---

## 一、OpenChamber 通知系统全景

OpenChamber 实现了一套**三层通知体系**，完美覆盖 Web、桌面端、PWA 三种运行环境：

| 层级 | 技术方案 | 运行环境 | 触发场景 |
|------|----------|----------|----------|
| **UI Toast 通知** | sonner 库 | 所有环境 | 用户操作反馈 |
| **桌面原生通知** | Tauri Notification API | Tauri 桌面端 | 后台任务完成 |
| **Web 推送通知** | Service Worker + Web Notification API | PWA/Web | 离线/后台状态 |

---

## 二、核心文件速查

### UI 层（packages/ui）

```
ui/src/components/ui/
├── sonner.tsx          # Toaster 组件封装（主题集成）
├── toast.ts            # 增强版 toast（自动按钮）
└── index.ts            # 统一导出

ui/src/lib/api/types.ts # NotificationPayload / NotificationsAPI 类型定义
```

### Web 层（packages/web）

```
web/src/api/
├── notifications.ts    # 双模式通知策略实现
└── index.ts           # API 组装

web/src/sw.ts          # Service Worker 推送通知
```

### 桌面层（packages/desktop）

```
desktop/src-tauri/src/main.rs  # Tauri 原生通知实现
```

---

## 三、值得抄的设计亮点

### 1. 【抄】增强版 Toast 封装 ✅

**文件**：`ui/src/components/ui/toast.ts`

```typescript
export const toast = {
  ...sonnerToast,
  
  // ✅ 成功/信息：自动加 OK 按钮
  success: (message, data) => sonnerToast.success(message, {
    ...data,
    action: data?.action || { label: 'OK', onClick: () => {} },
  }),
  
  // ✅ 错误/警告：自动加 Copy 按钮
  error: (message, data) => sonnerToast.error(message, {
    ...data,
    action: data?.action || {
      label: 'Copy',
      onClick: () => copyToClipboard(getToastCopyText(message, data)),
    },
  }),
}
```

**借鉴点**：
- 错误信息一键复制，提升调试效率
- 统一交互范式，减少用户思考

---

### 2. 【抄】运行时自适应通知策略 ✅

**文件**：`web/src/api/notifications.ts`

```typescript
export const createWebNotificationsAPI = (): NotificationsAPI => ({
  async notifyAgentCompletion(payload) {
    // 策略：优先原生，回退 Web
    return (await notifyWithTauri(payload)) || notifyWithWebAPI(payload);
  },
  
  canNotify: () => {
    // 检测 Tauri 环境
    const tauri = (window as any).__TAURI__;
    if (tauri?.core?.invoke) return true;
    
    // 检测 Web Notification 权限
    return typeof Notification !== 'undefined' 
      ? Notification.permission === 'granted' 
      : false;
  }
});
```

**借鉴点**：
- 运行时检测能力，一套代码适配多端
- 优先级策略：原生 > Web API

---

### 3. 【抄】防打扰模式设计 ✅

**文件**：`desktop/src-tauri/src/main.rs`

```rust
fn maybe_show_sidecar_notification(app: &tauri::AppHandle, payload: SidecarNotifyPayload) {
    // ✅ 仅在窗口隐藏时显示通知
    let require_hidden = payload.require_hidden.unwrap_or(false);
    if require_hidden {
        let any_focused = app
            .try_state::<WindowFocusState>()
            .map(|state| state.any_focused())
            .unwrap_or(false);
        if any_focused {
            return; // 窗口在前台，不打扰
        }
    }
    
    // macOS 专属：添加提示音
    #[cfg(target_os = "macos")]
    {
        builder = builder.sound("Glass");
    }
}
```

**借鉴点**：
- `require_hidden` 选项控制打扰级别
- 平台差异化处理（macOS 提示音）

---

### 4. 【抄】Service Worker 极简推送 ✅

**文件**：`web/src/sw.ts`

```typescript
self.addEventListener('push', (event) => {
    const payload = event.data?.json();
    
    await self.registration.showNotification(title, {
        body,
        icon: '/apple-touch-icon-180x180.png',
        badge: '/favicon-32.png',
        tag: payload.tag,  // ✅ 相同 tag 合并通知
        data: payload.data, // 附加跳转数据
    });
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = event.notification.data?.url ?? '/';
    event.waitUntil(self.clients.openWindow(url)); // ✅ 点击跳转
});
```

**借鉴点**：
- `tag` 字段合并重复通知
- 点击通知打开对应页面
- 默认图标配置规范

---

### 5. 【抄】类型定义与 API 契约 ✅

**文件**：`ui/src/lib/api/types.ts`

```typescript
export interface NotificationPayload {
  title?: string;
  body?: string;
  tag?: string;  // 用于去重/替换
}

export interface NotificationsAPI {
  notifyAgentCompletion(payload?: NotificationPayload): Promise<boolean>;
  canNotify?: () => boolean | Promise<boolean>;
}

// ✅ 嵌入 RuntimeAPIs 统一入口
export interface RuntimeAPIs {
  runtime: RuntimeDescriptor;
  notifications: NotificationsAPI;  // 统一访问
  // ...其他 API
}
```

**借鉴点**：
- 通过 `RuntimeAPIs` 统一所有运行时能力
- 可选方法 `canNotify` 用于权限预检

---

### 6. 【抄】Sonner 主题集成 ✅

**文件**：`ui/src/components/ui/sonner.tsx`

```typescript
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  
  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      style={{
        // ✅ CSS 变量映射到设计系统
        "--normal-bg": "var(--popover)",
        "--normal-text": "var(--popover-foreground)",
        "--error-bg": "var(--popover)",
        "--success-bg": "var(--popover)",
        // ...
      }}
    />
  );
};
```

**借鉴点**：
- Sonner 样式通过 CSS 变量完全可控
- 与主题系统无缝集成

---

## 四、ridge 项目借鉴方案

### 需要的依赖

```bash
# 安装 sonner（Vue 版）
cd packages/web
npm install sonner  # 或使用 shadcn-vue 的 toast 组件

# 若使用 shadcn-vue 官方方案
npx shadcn-vue add sonner
```

### 建议的文件结构

```
packages/web/src/
├── components/ui/
│   ├── sonner/          # 或使用 shadcn-vue 内置
│   └── toast.ts         # 增强版封装（抄）
├── lib/api/
│   └── types.ts         # 添加 NotificationsAPI 类型
├── api/
│   ├── notifications.ts # 双模式策略（抄）
│   └── index.ts         # 组装 API
└── sw.ts                # Service Worker 推送（抄）

packages/desktop/src-tauri/src/
└── main.rs              # Tauri 通知实现（抄）
```

### 快速实现清单

| 步骤 | 内容 | 优先级 |
|------|------|--------|
| 1 | 安装 sonner，封装 Toaster 组件 | 🔴 高 |
| 2 | 创建 `toast.ts` 增强版 | 🔴 高 |
| 3 | 定义 `NotificationsAPI` 类型 | 🔴 高 |
| 4 | 实现 `notifications.ts` 双模式策略 | 🟡 中 |
| 5 | Tauri 端添加 `desktop_notify` 命令 | 🟡 中 |
| 6 | 添加 Service Worker 推送支持 | 🟢 低 |

---

## 五、关键代码片段（可直接用）

### 类型定义

```typescript
// lib/api/types.ts
export interface NotificationPayload {
  title?: string;
  body?: string;
  tag?: string;
}

export interface NotificationsAPI {
  notify(payload?: NotificationPayload): Promise<boolean>;
  canNotify(): boolean | Promise<boolean>;
}
```

### 增强 Toast

```typescript
// components/ui/toast.ts
import { toast as sonnerToast } from 'sonner';

export const toast = {
  ...sonnerToast,
  success: (msg, data) => sonnerToast.success(msg, {
    action: data?.action || { label: 'OK', onClick: () => {} },
    ...data,
  }),
  error: (msg, data) => sonnerToast.error(msg, {
    action: data?.action || { label: '复制', onClick: () => copy(msg) },
    ...data,
  }),
};
```

### 双模式通知

```typescript
// api/notifications.ts
export const createNotificationsAPI = (): NotificationsAPI => ({
  async notify(payload) {
    // 优先 Tauri
    if (window.__TAURI__?.core?.invoke) {
      await window.__TAURI__.core.invoke('desktop_notify', { payload });
      return true;
    }
    // 回退 Web API
    if (Notification.permission === 'granted') {
      new Notification(payload?.title ?? 'ridge', { body: payload?.body });
      return true;
    }
    return false;
  },
  canNotify: () => {
    return !!(window.__TAURI__?.core?.invoke || 
             (typeof Notification !== 'undefined' && Notification.permission === 'granted'));
  }
});
```

---

## 六、注意事项

### 1. 权限申请时机

Web Notification 必须在用户交互后申请：

```typescript
// ✅ 正确：用户点击后申请
button.onclick = () => {
  Notification.requestPermission().then(permission => {
    if (permission === 'granted') { /* ... */ }
  });
};

// ❌ 错误：页面加载时申请（会被浏览器拦截）
```

### 2. Tauri 配置

`tauri.conf.json` 需添加权限：

```json
{
  "permissions": ["notification::default"]
}
```

### 3. Service Worker 注册

PWA 推送需要注册 SW：

```typescript
// main.ts
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
```

---

## 七、总结

OpenChamber 的通知系统设计值得全面借鉴：

1. **分层架构**：UI Toast + 桌面通知 + Web 推送，各司其职
2. **运行时自适应**：一套代码跑在 Web/桌面/PWA 三种环境
3. **细节打磨**：错误一键复制、防打扰模式、tag 合并通知
4. **类型完备**：通过 RuntimeAPIs 统一管理所有运行时能力

**建议 ridge 先实现前 3 项（Toast + 类型 + 双模式策略），PWA 推送可后续迭代。**
