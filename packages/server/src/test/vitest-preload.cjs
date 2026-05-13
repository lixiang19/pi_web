/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");
const os = require("os");

const testHome = fs.mkdtempSync(path.join(os.tmpdir(), "ridge-home-"));
process.env.HOME = testHome;

const testDbDir = fs.mkdtempSync(path.join(os.tmpdir(), "ridge-test-"));
process.env.RIDGE_DB_PATH = path.join(testDbDir, "ridge.db");

// Ensure the default workspace directory exists before any module loads.
// index.ts only calls ensureWorkspaceTemplate() inside startServer(),
// which doesn't run during tests (tests import app directly).
// Without this, fs.realpath() on the workspace dir throws ENOENT.
const defaultWorkspaceDir = path.join(testHome, "ridge-workspace");
fs.mkdirSync(defaultWorkspaceDir, { recursive: true });
// Also create the standard sub-directories that ensureWorkspaceTemplate() would create
const standardDirs = ["项目", "笔记", "日记", "剪藏", "附件", "记忆", "Wiki", "空间"];
for (const dir of standardDirs) {
  fs.mkdirSync(path.join(defaultWorkspaceDir, dir), { recursive: true });
}

if (!process.env.VITEST) {
  process.env.VITEST = "true";
}
