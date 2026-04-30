import fs from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { createNotesRouter } from "../notes.js";
import { createTempDir } from "../test/helpers.js";

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
		const chatConfig = { chatProjectPath: notesRoot } as any;
		expect(() => createNotesRouter(chatConfig)).not.toThrow();
	});
});
