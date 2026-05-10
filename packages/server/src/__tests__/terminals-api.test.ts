import { describe, expect, it } from "vitest";

import { app } from "../index.js";
import { createAuthenticatedAgent } from "../test/auth.js";

describe("terminal api", () => {
	it("creates a terminal with the configured workspace cwd when cwd is omitted", async () => {
		const agent = await createAuthenticatedAgent(app);

		const response = await agent.post("/api/terminals").send({}).expect(201);

		try {
			expect(response.body).toMatchObject({
				title: "终端",
				status: "disconnected",
			});
			expect(response.body.id).toEqual(expect.any(String));
			expect(response.body.cwd).toEqual(expect.any(String));
			expect(response.body.cwd).not.toBe("");
		} finally {
			await agent.delete(`/api/terminals/${response.body.id}`);
		}
	});
});
