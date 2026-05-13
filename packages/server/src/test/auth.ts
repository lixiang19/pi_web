import request from "supertest";

let testClientCounter = 0;

export function getTestClientKey(): string {
	testClientCounter += 1;
	return `test-client-${testClientCounter}`;
}

export async function createAuthenticatedAgent(app: Parameters<typeof request.agent>[0]) {
	// Do NOT reset authRuntime here. With Vitest pool:forks, test files
	// may run concurrently in the same process; a global reset would
	// invalidate sessions held by other test files, causing 401 races.
	// Each call creates a brand-new agent and performs a fresh login,
	// which is sufficient for isolation.
	const clientKey = getTestClientKey();
	const agent = request.agent(app);
	await agent
		.post("/api/auth/login")
		.set("x-test-client-key", clientKey)
		.send({ password: "ridge-admin" })
		.expect(200);
	return agent;
}
