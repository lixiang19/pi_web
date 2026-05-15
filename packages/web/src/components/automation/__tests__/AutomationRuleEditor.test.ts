import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AutomationRuleEditor from "@/components/automation/AutomationRuleEditor.vue";

describe("AutomationRuleEditor", () => {
	it("renders project scope and run records", async () => {
		const wrapper = mount(AutomationRuleEditor, {
			props: {
				draft: {
					name: "Test",
					enabled: true,
					scope: "project",
					projectId: "project-1",
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
				isRunnable: true,
				modelOptions: [],
				nextRunText: "Next run",
				projectOptions: [{ label: "Project 1", value: "project-1" }],
				recentRuns: [
					{
						id: "run-1",
						automationId: "rule-1",
						status: "skipped",
						reason: "项目设备离线，已跳过本次自动化",
						createdAt: Date.now(),
					},
				],
				thinkingOptions: [],
			},
			global: {
				stubs: {
					Button: { template: "<button v-bind=\"$attrs\"><slot /></button>" },
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
		expect(labelTexts).toContain("运行上下文");
		expect(labelTexts).toContain("绑定项目");
		expect(labelTexts).toContain("运行记录");
		expect(wrapper.text()).toContain("项目设备离线");
		await wrapper.get('[aria-label="重试自动化"]').trigger("click");
		expect(wrapper.emitted("run")).toHaveLength(1);
	});
});
