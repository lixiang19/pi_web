import { describe, expect, it } from "vitest";
import type { SessionContextSummary, SessionSummary, ProjectItem } from "@/lib/types";
import {
  buildSidebarProjects,
  getRecentProjectSessions,
  isProjectOffline,
  isProjectArchived,
} from "@/lib/session-sidebar";

const createSession = (
  id: string,
  cwd: string,
  contextId: string,
  overrides?: Partial<SessionSummary>,
): SessionSummary => ({
  id,
  title: id,
  cwd,
  status: "idle",
  createdAt: 1,
  updatedAt: 1,
  archived: false,
  sessionFile: `/tmp/${id}.jsonl`,
  contextId,
  ...overrides,
});

const createProject = (overrides: Partial<ProjectItem> = {}): ProjectItem => ({
  id: "project-a",
  name: "project-a",
  path: "/outside/project-a",
  addedAt: 1,
  isGit: false,
  projectType: "external",
  source: "server-folder",
  isOnline: true,
  updatedAt: 1,
  ...overrides,
});

describe("buildSidebarProjects", () => {
  it("separates workspace chat sessions from normal project sections", () => {
    const sessions = [
      createSession("chat-1", "/workspace/chat", "ctx-chat"),
      createSession("project-1-session", "/outside/project-a", "ctx-project-a"),
    ];

    const sessionContexts: Record<string, SessionContextSummary> = {
      "ctx-chat": {
        contextId: "ctx-chat",
        cwd: "/workspace/chat",
        projectId: "/workspace/chat",
        projectLabel: "chat",
        projectRoot: "/workspace/chat",
        worktreeRoot: "/workspace/chat",
        worktreeLabel: "chat",
        isGit: false,
      },
      "ctx-project-a": {
        contextId: "ctx-project-a",
        cwd: "/outside/project-a",
        projectId: "project-a",
        projectLabel: "project-a",
        projectRoot: "/outside/project-a",
        worktreeRoot: "/outside/project-a",
        worktreeLabel: "project-a",
        isGit: false,
      },
    };

    const result = buildSidebarProjects({
      sessions,
      sessionContexts,
      storedProjects: [createProject({ id: "project-a", name: "project-a", path: "/outside/project-a" })],
      workspaceDir: "/workspace",
      workspaceChat: {
        id: "ridge:workspace-chat",
        path: "/workspace/chat",
        label: "聊天",
      },
    });

    expect(result.workspaceChatProject?.label).toBe("聊天");
    expect(result.workspaceChatProject?.sessions.map((session) => session.id)).toEqual([
      "chat-1",
    ]);
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]?.sessions.map((session) => session.id)).toEqual([
      "project-1-session",
    ]);
  });

  it("离线项目不展开会话列表", () => {
    const sessions = [
      createSession("s1", "/outside/project-a", "ctx-1", { updatedAt: 3000 }),
      createSession("s2", "/outside/project-a", "ctx-2", { updatedAt: 2000 }),
    ];

    const sessionContexts: Record<string, SessionContextSummary> = {
      "ctx-1": {
        contextId: "ctx-1",
        cwd: "/outside/project-a",
        projectId: "project-a",
        projectLabel: "project-a",
        projectRoot: "/outside/project-a",
        worktreeRoot: "/outside/project-a",
        worktreeLabel: "project-a",
        isGit: false,
      },
      "ctx-2": {
        contextId: "ctx-2",
        cwd: "/outside/project-a",
        projectId: "project-a",
        projectLabel: "project-a",
        projectRoot: "/outside/project-a",
        worktreeRoot: "/outside/project-a",
        worktreeLabel: "project-a",
        isGit: false,
      },
    };

    const result = buildSidebarProjects({
      sessions,
      sessionContexts,
      storedProjects: [createProject({ id: "project-a", isOnline: false })],
      workspaceDir: "/workspace",
    });

    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]?.groups).toHaveLength(0);
  });

  it("归档会话不在普通列表展示", () => {
    const sessions = [
      createSession("s-active", "/outside/project-a", "ctx-1", { updatedAt: 3000, archived: false }),
      createSession("s-archived", "/outside/project-a", "ctx-2", { updatedAt: 2000, archived: true }),
    ];

    const sessionContexts: Record<string, SessionContextSummary> = {
      "ctx-1": {
        contextId: "ctx-1",
        cwd: "/outside/project-a",
        projectId: "project-a",
        projectLabel: "project-a",
        projectRoot: "/outside/project-a",
        worktreeRoot: "/outside/project-a",
        worktreeLabel: "project-a",
        isGit: false,
      },
      "ctx-2": {
        contextId: "ctx-2",
        cwd: "/outside/project-a",
        projectId: "project-a",
        projectLabel: "project-a",
        projectRoot: "/outside/project-a",
        worktreeRoot: "/outside/project-a",
        worktreeLabel: "project-a",
        isGit: false,
      },
    };

    const result = buildSidebarProjects({
      sessions,
      sessionContexts,
      storedProjects: [createProject({ id: "project-a" })],
      workspaceDir: "/workspace",
    });

    expect(result.projects).toHaveLength(1);
    const group = result.projects[0]?.groups.find((g) => g.kind === "project-root");
    expect(group?.tree.map((t) => t.session.id)).not.toContain("s-archived");
    expect(group?.tree.map((t) => t.session.id)).toContain("s-active");
  });

  it("归档项目在查询包含 archived 时展示归档分组", () => {
    const sessions = [
      createSession("s-archived", "/outside/project-a", "ctx-2", { updatedAt: 2000, archived: true }),
    ];

    const sessionContexts: Record<string, SessionContextSummary> = {
      "ctx-2": {
        contextId: "ctx-2",
        cwd: "/outside/project-a",
        projectId: "project-a",
        projectLabel: "project-a",
        projectRoot: "/outside/project-a",
        worktreeRoot: "/outside/project-a",
        worktreeLabel: "project-a",
        isGit: false,
      },
    };

    const result = buildSidebarProjects({
      sessions,
      sessionContexts,
      storedProjects: [createProject({ id: "project-a" })],
      workspaceDir: "/workspace",
      query: "archived",
    });

    expect(result.projects).toHaveLength(1);
    const archivedGroup = result.projects[0]?.groups.find((g) => g.kind === "archived");
    expect(archivedGroup).toBeTruthy();
    expect(archivedGroup?.tree.map((t) => t.session.id)).toContain("s-archived");
  });
});

describe("getRecentProjectSessions", () => {
  it("返回最近最多 3 个非归档会话", () => {
    const view: import("@/lib/session-sidebar").SessionProjectView = {
      id: "p",
      label: "p",
      projectRoot: "/p",
      pathLabel: "/p",
      lastUpdatedAt: 4000,
      sessions: [
        createSession("s1", "/p", "ctx", { updatedAt: 1000 }),
        createSession("s2", "/p", "ctx", { updatedAt: 2000 }),
        createSession("s3", "/p", "ctx", { updatedAt: 3000 }),
        createSession("s4", "/p", "ctx", { updatedAt: 4000 }),
        createSession("s-archived", "/p", "ctx", { updatedAt: 5000, archived: true }),
      ],
      groups: [],
      isGit: false,
      source: "stored-project",
      origin: "server-folder",
      isOnline: true,
      projectType: "external",
    };

    const recent = getRecentProjectSessions(view, 3);
    expect(recent).toHaveLength(3);
    expect(recent.map((s) => s.id)).toEqual(["s4", "s3", "s2"]);
  });
});

describe("isProjectOffline", () => {
  it("返回 true 当项目不在线", () => {
    const view = buildSidebarProjects({
      sessions: [],
      storedProjects: [createProject({ isOnline: false })],
      workspaceDir: "/workspace",
    }).projects[0]!;

    expect(isProjectOffline(view)).toBe(true);
  });

  it("返回 false 当项目在线", () => {
    const view = buildSidebarProjects({
      sessions: [],
      storedProjects: [createProject({ isOnline: true })],
      workspaceDir: "/workspace",
    }).projects[0]!;

    expect(isProjectOffline(view)).toBe(false);
  });
});

describe("isProjectArchived", () => {
  it("返回 true 当项目有 archivedAt", () => {
    const view = buildSidebarProjects({
      sessions: [],
      storedProjects: [createProject({ archivedAt: Date.now() })],
      workspaceDir: "/workspace",
    }).projects[0]!;

    expect(isProjectArchived(view)).toBe(true);
  });

  it("返回 false 当项目没有 archivedAt", () => {
    const view = buildSidebarProjects({
      sessions: [],
      storedProjects: [createProject()],
      workspaceDir: "/workspace",
    }).projects[0]!;

    expect(isProjectArchived(view)).toBe(false);
  });
});
