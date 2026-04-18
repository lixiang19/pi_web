import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ensureWorkspaceChatProject,
  getWorkspaceChatConfig,
  resolveDefaultWorkspaceDir,
} from "../workspace-chat.js";

test("getWorkspaceChatConfig resolves the fixed chat project path", () => {
  const config = getWorkspaceChatConfig("/tmp/workspace");

  assert.equal(config.workspaceDir, "/tmp/workspace");
  assert.equal(config.chatProjectPath, "/tmp/workspace/chat");
  assert.equal(config.chatProjectLabel, "聊天");
});

test("resolveDefaultWorkspaceDir uses ~/ridge-workspace on macOS when env is absent", () => {
  const workspaceDir = resolveDefaultWorkspaceDir({
    platform: "darwin",
    homeDir: "/Users/demo",
  });

  assert.equal(workspaceDir, "/Users/demo/ridge-workspace");
});

test("resolveDefaultWorkspaceDir requires PI_WORKSPACE_DIR on non-macOS", () => {
  assert.throws(
    () =>
      resolveDefaultWorkspaceDir({
        platform: "linux",
        homeDir: "/home/demo",
      }),
    /PI_WORKSPACE_DIR/,
  );
});

test("ensureWorkspaceChatProject copies the template only on first creation", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ridge-workspace-chat-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const templateDir = path.join(tempRoot, "template");
  const templateFile = path.join(templateDir, "README.md");

  await fs.mkdir(templateDir, { recursive: true });
  await fs.writeFile(templateFile, "template v1\n", "utf8");

  await ensureWorkspaceChatProject({
    workspaceDir,
    templateDir,
  });

  const firstContent = await fs.readFile(
    path.join(workspaceDir, "chat", "README.md"),
    "utf8",
  );
  assert.equal(firstContent, "template v1\n");

  await fs.writeFile(
    path.join(workspaceDir, "chat", "README.md"),
    "workspace override\n",
    "utf8",
  );
  await fs.writeFile(templateFile, "template v2\n", "utf8");

  await ensureWorkspaceChatProject({
    workspaceDir,
    templateDir,
  });

  const secondContent = await fs.readFile(
    path.join(workspaceDir, "chat", "README.md"),
    "utf8",
  );
  assert.equal(secondContent, "workspace override\n");
});

test("ensureWorkspaceChatProject fails when chat path exists but is not a directory", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ridge-workspace-chat-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  const templateDir = path.join(tempRoot, "template");

  await fs.mkdir(workspaceDir, { recursive: true });
  await fs.mkdir(templateDir, { recursive: true });
  await fs.writeFile(path.join(templateDir, "README.md"), "template\n", "utf8");
  await fs.writeFile(path.join(workspaceDir, "chat"), "not-a-directory\n", "utf8");

  await assert.rejects(
    () =>
      ensureWorkspaceChatProject({
        workspaceDir,
        templateDir,
      }),
    /不是目录/,
  );
});
