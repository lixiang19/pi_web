import { afterEach, describe, expect, it, vi } from "vitest";

describe("auth state", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.resetModules();
	});

	it("loads unauthenticated session state", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ authenticated: false }),
			}),
		);
		const { authState, ensureAuthSession } = await import("../auth");

		await expect(ensureAuthSession()).resolves.toBe(false);
		expect(authState.checked).toBe(true);
		expect(authState.authenticated).toBe(false);
	});

	it("marks the user authenticated after password login", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ ok: true }),
			}),
		);
		const { authState, loginWithPassword } = await import("../auth");

		await loginWithPassword("ridge-admin");

		expect(authState.checked).toBe(true);
		expect(authState.authenticated).toBe(true);
		expect(fetch).toHaveBeenCalledWith(
			"/api/auth/login",
			expect.objectContaining({ credentials: "same-origin" }),
		);
	});
});
