import request from "supertest";

let testClientCounter = 0;

export function getTestClientKey(): string {
	testClientCounter += 1;
	return `test-client-${testClientCounter}`;
}

export async function createAuthenticatedAgent(app: Parameters<typeof request.agent>[0]) {
	const clientKey = getTestClientKey();
	const agent = request.agent(app);
	const res = await agent
		.post("/api/auth/login")
		.set("x-test-client-key", clientKey)
		.send({ password: "ridge-admin" });

	if (res.status !== 200) {
		throw new Error(
			`Auth failed: ${res.status} ${JSON.stringify(res.body)}`,
		);
	}

	return agent;
}
