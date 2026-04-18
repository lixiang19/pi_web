import { describe, expect, it } from "vitest";
import type { SessionContextSummary, SessionSummary } from "@/lib/types";
import { buildSidebarProjects } from "@/lib/session-sidebar";

const createSession = (
  id: string,
  cwd: string,
  contextId: string,
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
      storedProjects: [
        {
          id: "project-a",
          name: "project-a",
          path: "/outside/project-a",
          addedAt: 1,
          isGit: false,
        },
      ],
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
});
