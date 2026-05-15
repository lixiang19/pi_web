import request from "supertest";

let testClientCounter = 0;

export function getTestClientKey(): string {
	testClientCounter += 1;
	return `test-client-${testClientCounter}`;
}

export async function createAuthenticatedAgent(app: Parameters<typeof request.agent>[0]) {
	const clientKey = getTestClientKey();
	const agent = request.agent(app);
	// Test environment bypass: set x-test-client-key as a persistent default
	// header so every request passes auth without needing a session cookie.
	// This eliminates all auth singleton / login-flakiness / rate-limit
	// pollution across test files.
	agent.set("x-test-client-key", clientKey);
	return agent;
}
