# Runtime Bundle 与设备专属 Skill

## 职责边界

- **runtime-bundle.ts**：Bundle 生成、Skill 过滤、文件物化、配置校验（Zod schema）。
- **routes/bundle.ts**：REST API 路由，设备 token 校验 + projectPath 边界校验 + ack 哈希/版本比对。

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

1. **全局 Agents**：`~/ridge-workspace/.pi/agents/*`
2. **全局 Skills**：`~/ridge-workspace/.pi/skills/*`
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

## 物化策略（安全边界）

- `materializeBundle(bundle, targetDir)`：将 manifest + files 写入目标目录
- **路径逃逸拒绝**：任何 file path 必须在 `targetDir + path.sep` 边界内
- **绝对 symlink 拒绝**：`symlink: "/etc/passwd"` → 400
- **越界 symlink 拒绝**：`symlink: "../../escape"` → 400
- **危险 mode 位过滤**：物化时 `mode & 0o777`，去除 setuid/setgid/sticky
- **桌面端在启动 Pi 前调用**，将 bundle 写入 ridge 管理目录

## API

- `GET /api/devices/:deviceId/bundle` — 返回 { manifest, files }
  - 支持 `?projectPath=` 参数，仅下发项目级覆盖后的 bundle
  - 每次请求写入 `device_bundle_served` 表（bundleId + contentHash + version + projectId + projectPath）
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
- 项目目录 `.pi/skills` 按 Pi 原机制读取，覆盖 bundle 中的全局 Skill
- 不读取用户真实 `~/.pi` 作为 ridge 全局配置
- 物化时旧文件被清理、权限恢复、符号链接重建
- Bundle ack 严格比对 served 记录，错误 hash/version 拒绝并结构化记录
