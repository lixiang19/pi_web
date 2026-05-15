import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsTabContent from "../SettingsTabContent.vue";

const {
	mockSetBackgroundAgentModel,
	mockSetBackgroundAgentThinkingLevel,
} = vi.hoisted(() => ({
	mockSetBackgroundAgentModel: vi.fn(),
	mockSetBackgroundAgentThinkingLevel: vi.fn(),
}));

vi.mock("vue-router", () => ({
	useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("@/composables/useThemePreferences", () => ({
	useThemePreferences: () => ({
		mode: "light",
		setMode: vi.fn(),
		setTheme: vi.fn(),
		themeName: "default",
	}),
}));

vi.mock("@/stores/settings", () => ({
	useSettingsStore: () => ({
		notifications: true,
		sidebarCollapsed: false,
		language: "zh-CN",
		backgroundAgentModel: "openai/gpt-test",
		backgroundAgentThinkingLevel: "low",
		setNotifications: vi.fn(),
		setSidebarCollapsed: vi.fn(),
		setLanguage: vi.fn(),
		setBackgroundAgentModel: mockSetBackgroundAgentModel,
		setBackgroundAgentThinkingLevel: mockSetBackgroundAgentThinkingLevel,
	}),
}));

vi.mock("@/lib/api", () => ({
	getProviders: vi.fn().mockResolvedValue({
		providers: [
			{
				id: "openai",
				name: "OpenAI",
				models: {
					"gpt-test": { id: "gpt-test", name: "GPT Test", reasoning: true },
				},
			},
		],
		default: { chat: "openai/gpt-test" },
	}),
}));

vi.mock("@/lib/auth", () => ({
	logoutAuth: vi.fn(),
}));

const mountSettings = () =>
	mount(SettingsTabContent, {
		global: {
			stubs: {
				Card: { template: "<section><slot /></section>" },
				CardHeader: { template: "<div><slot /></div>" },
				CardTitle: { template: "<h2><slot /></h2>" },
				CardContent: { template: "<div><slot /></div>" },
				Button: { template: "<button><slot /></button>" },
				Separator: { template: "<hr />" },
				Switch: { template: "<button />", props: ["checked"], emits: ["update:checked"] },
				Select: {
					name: "Select",
					template: '<div class="select-stub"><slot /></div>',
					props: ["modelValue"],
					emits: ["update:modelValue"],
				},
				SelectTrigger: { template: "<button><slot /></button>" },
				SelectContent: { template: "<div><slot /></div>" },
				SelectItem: { template: "<div><slot /></div>", props: ["value"] },
				SelectValue: { template: "<span><slot /></span>" },
			},
		},
	});

describe("SettingsTabContent background agent settings", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders configurable background agent model and thinking level", async () => {
		const wrapper = mountSettings();
		await vi.waitFor(() => {
			expect(wrapper.text()).toContain("后台整理模型");
			expect(wrapper.text()).toContain("OpenAI / GPT Test");
			expect(wrapper.text()).toContain("后台思考强度");
		});
	});

	it("saves background agent settings through the settings store", async () => {
		const wrapper = mountSettings();
		const selects = wrapper.findAllComponents({ name: "Select" });

		await selects.at(-2)!.vm.$emit("update:modelValue", "openai/gpt-test");
		await selects.at(-1)!.vm.$emit("update:modelValue", "medium");

		expect(mockSetBackgroundAgentModel).toHaveBeenCalledWith("openai/gpt-test");
		expect(mockSetBackgroundAgentThinkingLevel).toHaveBeenCalledWith("medium");
	});
});
