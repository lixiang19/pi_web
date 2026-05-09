import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { listenHttpServer } from "../index.js";

const openServers: ReturnType<typeof createServer>[] = [];

const closeServer = async (server: ReturnType<typeof createServer>) => {
	if (!server.listening) {
		return;
	}
	await new Promise<void>((resolve, reject) => {
		server.close((error) => {
			if (error) {
				reject(error);
				return;
			}
			resolve();
		});
	});
};

describe("listenHttpServer", () => {
	afterEach(async () => {
		await Promise.all(openServers.splice(0).map(closeServer));
	});

	it("rejects instead of throwing an unhandled error when the port is occupied", async () => {
		const first = createServer();
		openServers.push(first);
		await listenHttpServer(first, 0);
		const address = first.address();
		if (!address || typeof address === "string") {
			throw new Error("Expected test server to bind an IPv4 or IPv6 port");
		}

		const second = createServer();
		openServers.push(second);

		await expect(listenHttpServer(second, address.port)).rejects.toMatchObject({
			code: "EADDRINUSE",
		});
	});
});
