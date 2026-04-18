# 2026-04-18 better-sqlite3 原生构建缺失修复

- 日期：2026-04-18
- 状态：已完成
- 目标：修复开发环境启动时 `ridge.db` 因 `better-sqlite3` 原生绑定缺失而无法初始化的问题，并把依赖安装契约固化到仓库。

## 1. 现象

开发环境启动时，Web 端正常启动，但 server 在初始化数据库时失败：

`Could not locate the bindings file`

调用链：

- `packages/server/src/db/index.ts`
- `openDatabase`
- `new Database(dbPath)`

错误栈显示 `better-sqlite3` 包目录已经存在，但以下目标全部缺失：

- `build/Release/better_sqlite3.node`
- `lib/binding/node-v127-darwin-arm64/better_sqlite3.node`

## 2. 根因

问题不在数据库逻辑，也不在 ridge.db 文件本身，而在依赖安装链路。

通过 `pnpm ignored-builds` 确认，当前仓库安装依赖时，`pnpm 10` 自动忽略了 `better-sqlite3` 的构建脚本，因此：

- `better-sqlite3` JavaScript 包被安装
- `install` 脚本 `prebuild-install || node-gyp rebuild --release` 没有执行
- 最终缺失 `.node` 原生二进制
- server 在首次 `new Database()` 时直接崩溃

这是仓库缺少原生依赖构建白名单声明导致的安装契约问题。

## 3. 修复

在根 `package.json` 增加：

```json
"pnpm": {
  "onlyBuiltDependencies": [
    "better-sqlite3"
  ]
}
```

这样仓库在后续 `pnpm install` / `pnpm rebuild` 时，会明确允许 `better-sqlite3` 执行原生构建脚本，避免再次出现“包已安装但绑定缺失”的半安装状态。

同时对当前已经处于“半安装状态”的工作区执行：

- `npm rebuild better-sqlite3 --workspace @pi/server`

让当前工作区立即生成缺失的原生绑定文件。仓库后续重新执行 `pnpm install` 时，则会按照新的 `onlyBuiltDependencies` 契约正常构建。

## 4. 结果

修复后，server 的 SQLite 初始化链路恢复正常：

- `better-sqlite3` 原生 `.node` 文件生成成功
- `openDatabase()` 可以正常创建数据库连接
- `ridge.db` 初始化不再因 bindings 缺失而失败

## 5. 验证

已执行：

- `npm rebuild better-sqlite3 --workspace @pi/server`
- `npm run lint`
- `npm run typecheck`
- `npx tsx -e "(async () => { const { initializeRidgeDb } = await import('./packages/server/src/db/index.ts'); await initializeRidgeDb(process.cwd()); console.log('ridge-db-init-ok'); })().catch((error) => { console.error(error); process.exit(1); })"`

结果：全部通过。
