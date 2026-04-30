import fs from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { createNotesRouter } from "../notes.js";
import { createTempDir } from "../test/helpers.js";
import type { WorkspaceChatConfig } from "../workspace-chat.js";

describe("notes router", () => {
	let notesRoot: string;
	let cleanup: () => Promise<void>;

	afterEach(async () => {
		await cleanup();
	});

	const setup = async () => {
		notesRoot = await createTempDir("ridge-notes-");
		cleanup = () => fs.rm(notesRoot, { recursive: true, force: true });
	};

	it("createNotesRouter does not throw", async () => {
		await setup();
		const chatConfig: WorkspaceChatConfig = {
			workspaceDir: notesRoot,
			chatProjectId: "test-chat",
			chatProjectPath: notesRoot,
			chatProjectLabel: "测试聊天",
		};
		expect(() => createNotesRouter(chatConfig)).not.toThrow();
	});
});
