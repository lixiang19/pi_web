import { createMemoryHistory } from "vue-router";
import { describe, expect, it, vi } from "vitest";

const { mockEnsureAuthSession } = vi.hoisted(() => ({
	mockEnsureAuthSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
	ensureAuthSession: mockEnsureAuthSession,
}));

vi.mock("vue-router", async () => {
	const actual = await vi.importActual<typeof import("vue-router")>("vue-router");
	return {
		...actual,
		createWebHistory: () => createMemoryHistory(),
	};
});

vi.mock("@/pages/LoginPage.vue", () => ({
	default: { template: "<main>login</main>" },
}));
vi.mock("@/pages/WorkspacePage.vue", () => ({
	default: { template: "<main>workspace</main>" },
}));
vi.mock("@/pages/NotFoundPage.vue", () => ({
	default: { template: "<main>not found</main>" },
}));

describe("router auth guard", () => {
	it("redirects unauthenticated workspace visits to login", async () => {
		mockEnsureAuthSession.mockResolvedValue(false);
		const { default: router } = await import("../index");

		await router.push("/");
		await router.isReady();

		expect(router.currentRoute.value.name).toBe("login");
		expect(router.currentRoute.value.query["redirect"]).toBe("/");
	});
});
