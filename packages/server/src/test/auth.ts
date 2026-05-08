import request from "supertest";
import { authRuntime } from "../index.js";

export async function createAuthenticatedAgent(app: Parameters<typeof request.agent>[0]) {
	authRuntime.resetForTests();
	const agent = request.agent(app);
	await agent.post("/api/auth/login").send({ password: "ridge-admin" }).expect(200);
	return agent;
}
