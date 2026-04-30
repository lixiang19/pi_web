import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AutomationRuleEditor from "@/components/automation/AutomationRuleEditor.vue";

describe("AutomationRuleEditor", () => {
	it("does not render project selection", () => {
		const wrapper = mount(AutomationRuleEditor, {
			props: {
				draft: {
					name: "Test",
					enabled: true,
					cwd: "/tmp",
					agent: "",
					model: "",
					thinkingLevel: "medium",
					scheduleType: "daily",
					time: "09:00",
					weekdays: [1, 2, 3, 4, 5],
					everyMinutes: 60,
					prompt: "Hello",
				},
				agentOptions: [],
				isSaving: false,
				isRunnable: false,
				modelOptions: [],
				nextRunText: "Next run",
				thinkingOptions: [],
			},
			global: {
				stubs: {
					Button: true,
					Input: true,
					Label: { template: "<label><slot /></label>" },
					Select: { template: "<div><slot /></div>" },
					SelectContent: { template: "<div><slot /></div>" },
					SelectItem: { template: "<div><slot /></div>" },
					SelectTrigger: { template: "<div><slot /></div>" },
					SelectValue: true,
					Textarea: true,
				},
			},
		});

		const labelTexts = wrapper.findAll("label").map((el) => el.text());
		expect(labelTexts).not.toContain("项目");
	});
});
