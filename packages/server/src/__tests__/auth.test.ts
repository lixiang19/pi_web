import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app, authRuntime } from "../index.js";
import { createAuthRuntime } from "../auth.js";
import { getTestClientKey } from "../test/auth.js";

const api = request(app);
const ADMIN_PASSWORD = "ridge-admin";

describe("single-user auth", () => {
	beforeAll(() => {
		// Explicitly reset module-level auth singleton so this suite starts
		// from a known clean state, regardless of fork isolation.
		authRuntime.resetForTests();
	});

	beforeEach(() => {
		// Reset between individual tests within this file so that
		// rate-limiting / session state from one test does not leak
		// into the next (test order is not guaranteed to be declaration
		// order under all vitest configurations).
		authRuntime.resetForTests();
	});

	it("rejects protected api requests without a session", async () => {
		const res = await api.get("/api/system/info");
		expect(res.status).toBe(401);
	});

	it("creates a session cookie after password login", async () => {
		const agent = request.agent(app);

		const login = await agent
			.post("/api/auth/login")
			.send({ password: ADMIN_PASSWORD });
		expect(login.status).toBe(200);
		const setCookie = login.headers["set-cookie"];
		expect(Array.isArray(setCookie) ? setCookie.join("\n") : setCookie).toContain(
			"ridge_session=",
		);

		const session = await agent.get("/api/auth/session");
		expect(session.status).toBe(200);
		expect(session.body).toEqual({ authenticated: true });
	});

	it("clears the server session on logout", async () => {
		const agent = request.agent(app);

		await agent.post("/api/auth/login").send({ password: ADMIN_PASSWORD });
		const logout = await agent.post("/api/auth/logout");
		expect(logout.status).toBe(200);

		const protectedRes = await agent.get("/api/system/info");
		expect(protectedRes.status).toBe(401);
	});

	it("rate-limits repeated failed password attempts", async () => {
		const agent = request.agent(app);
		const clientKey = getTestClientKey();

		for (let index = 0; index < 5; index += 1) {
			const res = await agent
				.post("/api/auth/login")
				.set("x-test-client-key", clientKey)
				.send({ password: "wrong" });
			expect(res.status).toBe(401);
		}

		const locked = await agent
			.post("/api/auth/login")
			.set("x-test-client-key", clientKey)
			.send({ password: ADMIN_PASSWORD });
		expect(locked.status).toBe(429);
	});

	it("validates websocket upgrade cookies with the same session store", () => {
		const auth = createAuthRuntime({ adminPassword: ADMIN_PASSWORD });
		const cookie = auth.createSessionCookie();

		expect(auth.isAuthenticatedCookieHeader(cookie)).toBe(true);
		expect(auth.isAuthenticatedCookieHeader("ridge_session=missing")).toBe(false);
		expect(auth.isAuthenticatedCookieHeader(undefined)).toBe(false);
	});
});
