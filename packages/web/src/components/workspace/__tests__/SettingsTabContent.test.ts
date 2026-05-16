import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SettingsTabContent from "../SettingsTabContent.vue";

const {
	mockSetBackgroundAgentModel,
	mockSetBackgroundAgentThinkingLevel,
	mockDownloadWorkspaceBackup,
	mockRestoreWorkspaceBackup,
} = vi.hoisted(() => ({
	mockSetBackgroundAgentModel: vi.fn(),
	mockSetBackgroundAgentThinkingLevel: vi.fn(),
	mockDownloadWorkspaceBackup: vi.fn(),
	mockRestoreWorkspaceBackup: vi.fn(),
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
	getSystemInfo: vi.fn().mockResolvedValue({
		appName: "Pi Web",
		workspaceDir: "/Users/test/ridge-workspace",
		defaultWorkspaceDir: "/Users/test/ridge-workspace",
		dataDir: "/Users/test/.pi",
		ridgeDbPath: "/Users/test/.pi/ridge.db",
		chatProjectId: "workspace-chat",
		chatProjectPath: "/Users/test/ridge-workspace",
		chatProjectLabel: "工作空间",
		apiBase: "http://127.0.0.1:3000",
		sdkVersion: "0.65.2",
		serviceStatus: { api: "online", backup: "ready" },
		deviceStatus: { total: 2, online: 1, serverOnline: true },
	}),
	getDevices: vi.fn().mockResolvedValue({
		devices: [
			{ deviceId: "server", name: "server", deviceType: "server", status: "online" },
			{ deviceId: "desktop", name: "desktop", deviceType: "desktop", status: "offline" },
		],
	}),
	downloadWorkspaceBackup: mockDownloadWorkspaceBackup.mockResolvedValue({
		blob: new Blob(["zip"], { type: "application/zip" }),
		fileName: "ridge-backup.zip",
	}),
	restoreWorkspaceBackup: mockRestoreWorkspaceBackup.mockResolvedValue({
		ok: true,
		preRestoreSnapshotPath: "/Users/test/.pi/restore-snapshots/pre-restore.zip",
		restoredFiles: ["server/ridge.db"],
		rebuildStatus: { rag: "pending", search_chunks: "pending" },
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
	const originalCreateObjectURL = URL.createObjectURL;
	const originalRevokeObjectURL = URL.revokeObjectURL;

	beforeEach(() => {
		vi.clearAllMocks();
		Object.defineProperty(URL, "createObjectURL", {
			value: vi.fn(() => ""),
			configurable: true,
		});
		Object.defineProperty(URL, "revokeObjectURL", {
			value: vi.fn(),
			configurable: true,
		});
	});

	afterEach(() => {
		Object.defineProperty(URL, "createObjectURL", {
			value: originalCreateObjectURL,
			configurable: true,
		});
		Object.defineProperty(URL, "revokeObjectURL", {
			value: originalRevokeObjectURL,
			configurable: true,
		});
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

	it("shows system paths, service status, and device status", async () => {
		const wrapper = mountSettings();

		await vi.waitFor(() => {
			expect(wrapper.text()).toContain("数据目录");
			expect(wrapper.text()).toContain("/Users/test/.pi");
			expect(wrapper.text()).toContain("数据库");
			expect(wrapper.text()).toContain("/Users/test/.pi/ridge.db");
			expect(wrapper.text()).toContain("服务状态");
			expect(wrapper.text()).toContain("1 / 2 在线");
		});
	});

	it("triggers backup download and restore upload from settings", async () => {
		const wrapper = mountSettings();
		await vi.waitFor(() => expect(wrapper.text()).toContain("立即备份"));

		await wrapper.get('[data-test="settings-backup-download"]').trigger("click");
		expect(mockDownloadWorkspaceBackup).toHaveBeenCalledOnce();

		const file = new File(["zip"], "ridge-backup.zip", { type: "application/zip" });
		const input = wrapper.get('[data-test="settings-restore-file"]');
		Object.defineProperty(input.element, "files", {
			value: [file],
			configurable: true,
		});
		await input.trigger("change");

		expect(mockRestoreWorkspaceBackup).toHaveBeenCalledWith(file);
		await vi.waitFor(() => {
			expect(wrapper.text()).toContain("恢复完成");
			expect(wrapper.text()).toContain("pre-restore.zip");
		});
	});
});
