# Runtime Bundle 与设备专属 Skill

## 职责边界

- **runtime-bundle.ts**：Bundle 生成、Skill 过滤、文件物化、配置校验（Zod schema）。
- **routes/bundle.ts**：REST API 路由，设备 token 校验 + projectPath 边界校验 + ack 哈希/版本比对。
- Android 设备不接收 runtime bundle：`/api/runtime/bundle` 和 `/api/devices/:deviceId/bundle` 对 `device_type=android` 返回 403。

## Bundle Manifest

```typescript
interface BundleManifest {
  bundleId: string;
  deviceId: string;
  version: number;
  generatedAt: number;
  contentHash: string; // SHA-256 of sorted file paths + contents + encoding
  agents: BundleResource[];
  skills: BundleResource[];
  mcp: Record<string, unknown>; // 已 schema 校验（servers / commands / env）
  tools: Record<string, unknown>;
  permissions: Record<string, unknown>;
  modelConfig: Record<string, unknown>;
  startupContext: {
    memory?: string;    // MEMORY.md 内容
    wikiIndex?: string; // Wiki/index.md 内容
  };
}
```

## Bundle 内容来源

0. **ridge 内置 Pi 配置**：`packages/server/pi-default-config/`，服务启动时覆盖写入到 `~/.pi/agent`，但不删除目标侧已有 sessions、用户 skills、用户 prompts 等资源；`agents/` 目录只作为用户自定义 Agent 目录占位，不写入 ridge 内置 Agent 文件
1. **服务器整体 Agents**：`~/.pi/agent/agents/*`，只保存用户自定义 Agent；ridge 默认基础 Agent 由 server 代码内置，不通过该目录下发
2. **服务器整体 Skills**：`~/.pi/agent/skills/*`
3. **项目级覆盖**：`{projectPath}/.pi/agents/*`、`{projectPath}/.pi/skills/*`
4. **启动上下文**：`~/ridge-workspace/记忆/MEMORY.md`、`~/ridge-workspace/Wiki/index.md`
5. **配置已校验**：MCP / Tools / Permissions / Models 均通过 Zod schema 验证，非法 JSON 抛 400，缺失返回 {}

## 设备专属 Skill 过滤

Skill 文件名可包含平台 tag：`[mac]`、`[chrome]`、`[linux]`、`[windows]`。

```typescript
function filterSkillsByDevice(skills, device) {
  return skills.filter((skill) => {
    const tagMatches = skill.path.match(/\[(\w+)\]/g);
    if (!tagMatches || tagMatches.length === 0) return true;
    for (const match of tagMatches) {
      const tag = match.slice(1, -1).toLowerCase();
      if (device.capabilities[`skill_${tag}`] !== true) return false;
    }
    return true;
  });
}
```

Android 设备的 capability 固定收口到 `mobile_capture`、`camera`、`microphone`，不会保存 `skill_android`，因此既不匹配设备专属 Skill，也不进入 bundle 下发链路。

## 物化策略（安全边界）

- `materializeBundle(bundle, targetDir)`：将 manifest + files 写入目标目录
- **路径逃逸拒绝**：任何 file path 必须在 `targetDir + path.sep` 边界内
- **绝对 symlink 拒绝**：`symlink: "/etc/passwd"` → 400
- **越界 symlink 拒绝**：`symlink: "../../escape"` → 400
- **危险 mode 位过滤**：物化时 `mode & 0o777`，去除 setuid/setgid/sticky
- **桌面端在启动 Pi 前调用**，将 bundle 写入 ridge 管理目录
- server 和桌面设备端都使用 Pi 默认配置根 `~/.pi/agent`，ridge 只做覆盖式写入，不再另造运行时配置根。
- server 启动链路先执行 `syncBuiltInPiConfigToDefaultAgentDir()`，再创建 Pi auth/model/settings 对象；同步会覆盖内置同名文件，但保留 `/Users/lixiang/.pi/agent/` 下不在内置目录中的已有资源。

## API

- `GET /api/devices/:deviceId/bundle` — 返回 { manifest, files }
  - 支持 `?projectPath=` 参数，仅下发项目级覆盖后的 bundle
  - 每次请求写入 `device_bundle_served` 表（bundleId + contentHash + version + projectId + projectPath）
  - Android 设备即使 token 正确也返回 403，不写入 served 记录。
- `POST /api/devices/:deviceId/bundle/ack` — 桌面端确认接收
  - 必须携带 token + bundleId + contentHash + bundleVersion
  - 与最后一条 `device_bundle_served` 记录逐字段比对：
    - bundleId 不匹配 → 409 hash_mismatch
    - bundleVersion 不匹配 → 409 hash_mismatch
    - contentHash 不匹配 → 409 hash_mismatch
  - 校验失败写入 `device_bundle_acks.sync_status = "hash_mismatch"`
  - 校验成功写入 `device_bundle_acks.sync_status = "acked"`

## 验证点

- Mac-only Skill 只下发给 `skill_mac: true` 的设备
- 通用 Skill 所有设备都接收
- 项目目录 `.pi/skills` 按 Pi 原机制读取，覆盖 bundle 中的服务器整体 Skill
- 使用 Pi 默认 `~/.pi/agent`，ridge 从 `packages/server/pi-default-config/` 覆盖式写入配置
- ridge 默认基础 Agent 是 server 内置的 `builtin:assistant`；`packages/server/pi-default-config/agents/` 不下发内置 Agent 文件，后续留给用户自定义
- 物化时旧文件被清理、权限恢复、符号链接重建
- Bundle ack 严格比对 served 记录，错误 hash/version 拒绝并结构化记录
- Android 设备注册后不返回 runtime bundle，主动请求 bundle 返回 403。
