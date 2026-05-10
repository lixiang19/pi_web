import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTerminal } from "@/lib/api";
import { useTerminalPool } from "@/composables/useTerminalPool";

vi.mock("@/lib/api", () => ({
	createTerminal: vi.fn(),
	deleteTerminal: vi.fn(),
	getTerminals: vi.fn(),
	restartTerminal: vi.fn(),
	updateTerminal: vi.fn(),
}));

describe("useTerminalPool", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		const pool = useTerminalPool();
		pool.terminals.value = [];
		pool.activeTerminalId.value = "";
	});

	it("shares created terminals across workspace shell and terminal tab content", async () => {
		vi.mocked(createTerminal).mockResolvedValue({
			id: "terminal-1",
			title: "终端",
			cwd: "/tmp/ridge-workspace",
			shell: "/bin/zsh",
			status: "disconnected",
			cols: 120,
			rows: 32,
			createdAt: 1,
			updatedAt: 1,
			exitCode: null,
			errorMessage: null,
		});

		const shellPool = useTerminalPool();
		const tabContentPool = useTerminalPool();

		await shellPool.createNewTerminal();

		expect(tabContentPool.terminals.value).toHaveLength(1);
		expect(tabContentPool.activeTerminal.value?.id).toBe("terminal-1");
	});
});
