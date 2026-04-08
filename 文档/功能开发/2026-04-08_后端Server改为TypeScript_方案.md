---
workflow: 完整工作流智能体
task: 将后端Server改为TypeScript实现
created: 2026-04-08
current_stage: 用户审查
stages:
  探索:
    status: done
    summary: "分析了9个JS源文件共1600+行代码，使用Express+Zod架构，依赖Pi SDK"
  澄清:
    status: done
    summary: "严格模式+完整类型定义+tsx快速开发"
  计划:
    status: done
    summary: "制定4个里程碑计划，M1基础设施->M2工具函数->M3核心模块->M4主入口"
  执行:
    status: done
    summary: "完成全部9个文件的TS迁移，添加完整的SDK类型声明"
  检查:
    status: done
    summary: "tsc --noEmit 零错误，build 通过"
  用户审查:
    status: in_progress
    summary: ""
  归档:
    status: pending
    summary: ""
  反思:
    status: pending
    summary: ""
---

# 后端Server改为TypeScript 方案

- 状态：草案
- 日期：2026-04-08
- Owner：AI Agent
- 目标版本：v0.2.0

## 1. 背景与问题

- 背景：当前后端使用纯 JavaScript 开发，缺乏类型检查，在重构和维护时容易引入运行时错误
- 现象/痛点：
  - SDK 返回的数据结构没有类型提示，使用时需要反复查文档
  - 函数参数没有校验，容易传错类型
  - 新功能开发时缺少 IDE 智能提示
- 成功定义：所有源文件改为 `.ts`，`tsc --noEmit` 零错误，保持原有功能不变

## 2. 目标与非目标

- 目标：
  - 所有 9 个 JS 文件迁移为 TS
  - 编写 Pi SDK 的类型声明
  - 严格模式类型检查通过
  - 开发体验：tsx watch 热重载
- 非目标：
  - 不改动业务逻辑
  - 不引入新的依赖（除 tsx/typescript 外）
  - 不改 API 接口契约

## 3. 现状探索（Explorer）

- 入口与调用链：
  - `index.js:1` - Express 应用入口，创建 SessionManager/SettingsManager
  - `index.js:350` - `createAgentSession()` SDK 调用创建会话
  - `agents.js:1` - Agent 发现/加载/保存，使用 SDK 的 `getAgentDir()`/`parseFrontmatter()`
  - `session-metadata.js:1` - 会话元数据 JSON 存储
- 关键数据结构：
  - `SessionRecord` - 会话运行时状态（session, resourceLoader, turnBudget 等）
  - `AgentConfig` - Agent 配置（name, mode, model, thinking, permission 等）
  - `PermissionPolicy` - 权限策略（raw, editRules, activeToolNames）
- 约束与坑点：
  - Pi SDK 无类型定义，需 declare module
  - SDK 部分类使用静态工厂方法（`SessionManager.create()`）
  - Express Request/Response 需扩展类型

## 4. 资料与依据（Librarian）

- tsx 官方文档：https://github.com/privatenumber/tsx
  - 支持 `tsx watch` 热重载
  - 零配置，直接运行 TS
- Pi SDK 类型推导：
  - 从运行时对象反推类型（SessionManager, SettingsManager, createAgentSession）
  - 关注事件订阅接口（session.subscribe）

## 5. 方案概览（主方案）

### 5.1 方案摘要

- 一句话：使用 tsx + TypeScript 严格模式，编写完整 SDK 类型声明，逐文件迁移
- 取舍：tsx 而非 tsc 编译，保留开发速度和简单性
- 影响面：server 包所有源文件 + package.json scripts

### 5.2 风险与回滚

- 风险：
  - SDK 类型推断不完整 → 使用 `unknown` + 运行时检查
  - tsx watch 内存泄漏 → 备选 tsc --watch
- 回滚：
  - Git 回滚到 JS 版本，重新评估

## 6. 详细设计（Spec）

### 6.1 文件结构变更

```
packages/server/
├── package.json          # 添加 tsx, typescript, @types/node
├── tsconfig.json         # 严格模式配置
├── src/
│   ├── types/
│   │   ├── pi-sdk.d.ts   # Pi SDK 类型声明
│   │   └── express.d.ts  # Express 扩展
│   ├── index.ts          # 主入口
│   ├── agents.ts
│   ├── session-metadata.ts
│   ├── agent-permissions.ts
│   ├── project-context.ts
│   ├── storage/
│   │   └── index.ts
│   └── utils/
│       ├── paths.ts
│       ├── fs.ts
│       ├── lock.ts
│       └── migrations.ts
└── dist/                 # 不输出，tsx 直接运行 src
```

### 6.2 tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": false,
    "noEmit": true
  },
  "include": ["src/**/*"]
}
```

### 6.3 package.json scripts

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc --noEmit",
    "start": "tsx src/index.ts",
    "typecheck": "tsc --noEmit"
  }
}
```

### 6.4 Pi SDK 类型声明（关键）

```typescript
// types/pi-sdk.d.ts
declare module '@mariozechner/pi-coding-agent' {
  export interface ModelInfo {
    provider: string;
    id: string;
    name: string;
    reasoning?: boolean;
  }

  export class AuthStorage {
    static create(): AuthStorage;
  }

  export class ModelRegistry {
    static create(authStorage: AuthStorage): ModelRegistry;
    refresh(): void;
    getAvailable(): ModelInfo[];
  }

  // ... SessionManager, SettingsManager, createAgentSession 等
}
```

## 7. 验收标准（必须可验证）

- 功能验收：
  - [ ] `npm run typecheck` 零错误
  - [ ] `npm run dev` 正常启动并监听端口 3000
  - [ ] 会话列表 API `/api/sessions` 正常返回
  - [ ] 发送消息 API `/api/sessions/:id/messages` 正常工作
  - [ ] Agent 列表 API `/api/agents` 正常返回
- 非功能验收：
  - [ ] 类型覆盖率 > 90%（核心接口无 any）
  - [ ] 热重载响应 < 2s

## 8. 里程碑与任务（Milestones）

### M1：基础设施

- 交付物：tsconfig.json + 类型声明文件 + 更新 package.json
- 退出标准：`npm run typecheck` 能运行（可能有很多错误）
- 任务：
  - [ ] 安装 tsx, typescript, @types/node, @types/express, @types/cors
  - [ ] 创建 tsconfig.json（严格模式）
  - [ ] 创建 src/types/pi-sdk.d.ts（核心 SDK 类型）
  - [ ] 更新 package.json scripts

### M2：工具函数迁移

- 交付物：utils/ 和 storage/ 目录全部转为 TS
- 退出标准：utils + storage 目录 `tsc --noEmit` 通过
- 任务：
  - [ ] utils/paths.ts
  - [ ] utils/fs.ts
  - [ ] utils/lock.ts
  - [ ] utils/migrations.ts
  - [ ] storage/index.ts

### M3：核心模块迁移

- 交付物：agents.ts, session-metadata.ts, agent-permissions.ts, project-context.ts
- 退出标准：核心模块 `tsc --noEmit` 通过
- 任务：
  - [ ] session-metadata.ts（含 SessionMetadata 类型）
  - [ ] agent-permissions.ts（含 PermissionPolicy 类型）
  - [ ] project-context.ts（含 ProjectContext 类型）
  - [ ] agents.ts（含 AgentConfig 类型）

### M4：主入口迁移

- 交付物：index.ts 完整类型化
- 退出标准：`npm run dev` 正常启动，所有 API 测试通过
- 任务：
  - [ ] index.ts（含 SessionRecord, Request 扩展类型）
  - [ ] 整理全局类型到 types/index.ts
  - [ ] 端到端 API 测试

## 9. 执行计划与闭环

- 执行顺序：M1 -> M2 -> M3 -> M4
- 每个里程碑验证：`npm run typecheck`
- 最终回报：变更摘要 + 验收项全部勾选
