import { describe, expect, it } from "vitest";
import { createSubagentToolExtension } from "../subagents.js";
import type { SessionRecord } from "../types/index.js";

describe("subagent tools", () => {
	it("registers subagent as the launch tool and keeps helper tools named explicitly", () => {
		const registeredToolNames: string[] = [];
		const extension = createSubagentToolExtension({} as SessionRecord, {
			authStorage: {},
			modelRegistry: {},
			resolveModel: () => null,
		});

		extension({
			registerTool(tool: { name: string }) {
				registeredToolNames.push(tool.name);
			},
		} as never);

		expect(registeredToolNames).toEqual([
			"subagent",
			"steer_subagent",
			"get_subagent_result",
		]);
		expect(registeredToolNames).not.toContain("task");
	});
});
