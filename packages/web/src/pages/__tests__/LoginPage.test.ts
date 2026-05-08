import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import LoginPage from "@/pages/LoginPage.vue";

const { mockLoginWithPassword, mockReplace } = vi.hoisted(() => ({
	mockLoginWithPassword: vi.fn(),
	mockReplace: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
	loginWithPassword: mockLoginWithPassword,
}));

vi.mock("vue-router", () => ({
	useRoute: () => ({ query: { redirect: "/" } }),
	useRouter: () => ({ replace: mockReplace }),
}));

describe("LoginPage", () => {
	it("submits the password and redirects to the workspace", async () => {
		mockLoginWithPassword.mockResolvedValue(undefined);
		const wrapper = mount(LoginPage);

		await wrapper.find("input[type='password']").setValue("ridge-admin");
		await wrapper.find("form").trigger("submit.prevent");

		expect(mockLoginWithPassword).toHaveBeenCalledWith("ridge-admin");
		expect(mockReplace).toHaveBeenCalledWith("/");
	});
});
