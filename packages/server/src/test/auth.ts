import request from "supertest";
import { authRuntime } from "../index.js";

let testClientCounter = 0;

export function getTestClientKey(): string {
	testClientCounter += 1;
	return `test-client-${testClientCounter}`;
}

export async function createAuthenticatedAgent(app: Parameters<typeof request.agent>[0]) {
	authRuntime.resetForTests();
	const clientKey = getTestClientKey();
	const agent = request.agent(app);
	await agent
		.post("/api/auth/login")
		.set("x-test-client-key", clientKey)
		.send({ password: "ridge-admin" })
		.expect(200);
	return agent;
}
