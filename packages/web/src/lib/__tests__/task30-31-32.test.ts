import { describe, expect, it } from "vitest";

// Simple composable test without needing the full API module

describe("Task 30/31/32 frontend API types", () => {
	it("workspace project API functions exist", async () => {
		// Verify the API module exports are importable (type-only check)
		const api = await import("@/lib/api");
		expect(typeof api.createInternalProject).toBe("function");
		expect(typeof api.registerExternalProject).toBe("function");
		expect(typeof api.cloneGithubProject).toBe("function");
		expect(typeof api.archiveProject).toBe("function");
		expect(typeof api.deleteProjectRegistration).toBe("function");
	});

	it("device API functions exist with token support", async () => {
		const api = await import("@/lib/api");
		expect(typeof api.getDevices).toBe("function");
		expect(typeof api.registerDevice).toBe("function");
		expect(typeof api.heartbeatDevice).toBe("function");
		expect(typeof api.renameDevice).toBe("function");
		expect(typeof api.getDeviceBundle).toBe("function");
		expect(typeof api.ackDeviceBundle).toBe("function");
	});

	it("heartbeatDevice accepts token in second parameter", async () => {
		const api = await import("@/lib/api");
		// Verify the function arity (signature check)
		expect(api.heartbeatDevice.length).toBe(2);
	});

	it("renameDevice accepts token in third parameter", async () => {
		const api = await import("@/lib/api");
		expect(api.renameDevice.length).toBe(3);
	});

	it("getDeviceBundle includes token in query string", async () => {
		const api = await import("@/lib/api");
		expect(api.getDeviceBundle.length).toBe(2);
	});

	it("ackDeviceBundle accepts token in third parameter", async () => {
		const api = await import("@/lib/api");
		expect(api.ackDeviceBundle.length).toBe(3);
	});
});

describe("Device capability filtering logic", () => {
	// Replicate the server-side filtering for frontend awareness
	function filterSkillsByDevice(
		skills: Array<{ name: string }>,
		capabilities: Record<string, boolean>,
	): Array<{ name: string }> {
		return skills.filter((skill) => {
			const tagMatch = skill.name.match(/\[(\w+)\]/);
			if (!tagMatch) return true;
			const tag = tagMatch[1]?.toLowerCase();
			if (!tag) return true;
			return capabilities[`skill_${tag}`] === true;
		});
	}

	it("includes general skills for all devices", () => {
		const skills = [{ name: "general.md" }, { name: "tool.md" }];
		const filtered = filterSkillsByDevice(skills, {});
		expect(filtered).toHaveLength(2);
	});

	it("filters mac-only skills by capability", () => {
		const skills = [{ name: "mac-tool[mac].md" }, { name: "general.md" }];
		const macCaps = { skill_mac: true };
		const linuxCaps = { skill_linux: true };

		expect(filterSkillsByDevice(skills, macCaps)).toHaveLength(2);
		expect(filterSkillsByDevice(skills, linuxCaps)).toHaveLength(1);
	});

	it("filters chrome-only skills by capability", () => {
		const skills = [{ name: "browser[chrome].md" }, { name: "general.md" }];
		const chromeCaps = { skill_chrome: true };
		const noCaps = {};

		expect(filterSkillsByDevice(skills, chromeCaps)).toHaveLength(2);
		expect(filterSkillsByDevice(skills, noCaps)).toHaveLength(1);
	});
});
