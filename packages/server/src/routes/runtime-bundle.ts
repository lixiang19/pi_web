import express, { type NextFunction, type Request, type Response } from "express";
import type { RidgeRuntimeBundle } from "@pi/protocol";
import { z } from "zod";

import { authenticateDeviceToken, registerDevice, type RegisteredDevice } from "../devices.js";
import type { RidgeDatabase } from "../db/index.js";
import type { HttpError } from "../types/index.js";

const WORKSPACE_MCP_TOOLS = ["rag_search", "graph_search", "file_search", "read_workspace_file"] as const;

export interface RuntimeBundleDeps {
	defaultWorkspaceDir: string;
	getRidgeDb: () => Promise<RidgeDatabase>;
}

const deviceRegistrationSchema = z.object({
	deviceId: z.string().trim().min(1).max(120).optional(),
	name: z.string().trim().min(1).max(120),
	deviceType: z.string().trim().min(1).max(40).default("desktop"),
	capabilities: z.record(z.string(), z.unknown()).optional(),
});

function extractDeviceToken(req: Request): string | undefined {
	const auth = req.headers.authorization;
	if (auth?.startsWith("Bearer ")) {
		const token = auth.slice("Bearer ".length).trim();
		if (token) {
			return token;
		}
	}
	const headerToken = req.headers["x-ridge-device-token"];
	return typeof headerToken === "string" ? headerToken.trim() : undefined;
}

function configuredPublicBaseUrl(): string | null {
	const raw = process.env.RIDGE_PUBLIC_BASE_URL || process.env.RIDGE_SERVER_BASE_URL;
	if (!raw) {
		return null;
	}
	let parsed: URL;
	try {
		parsed = new URL(raw);
	} catch {
		const error = new Error("RIDGE_PUBLIC_BASE_URL must be a valid URL") as HttpError;
		error.statusCode = 400;
		throw error;
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		const error = new Error("RIDGE_PUBLIC_BASE_URL must use http or https") as HttpError;
		error.statusCode = 400;
		throw error;
	}
	if (parsed.username || parsed.password) {
		const error = new Error("RIDGE_PUBLIC_BASE_URL must not include credentials") as HttpError;
		error.statusCode = 400;
		throw error;
	}
	if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
		const error = new Error("RIDGE_PUBLIC_BASE_URL must be an origin without path, query, or hash") as HttpError;
		error.statusCode = 400;
		throw error;
	}
	return parsed.origin;
}

function isLocalHost(hostname: string): boolean {
	return hostname === "localhost" || hostname === "::1" || hostname === "[::1]" || hostname.startsWith("127.");
}

function requestBaseUrl(req: Request): string {
	const configured = configuredPublicBaseUrl();
	if (configured) {
		return configured;
	}
	const host = req.get("host");
	if (!host) {
		const error = new Error("Host header is required when RIDGE_PUBLIC_BASE_URL is not configured") as HttpError;
		error.statusCode = 400;
		throw error;
	}
	let parsed: URL;
	try {
		parsed = new URL(`${req.protocol}://${host}`);
	} catch {
		const error = new Error("Host header must be a valid HTTP host") as HttpError;
		error.statusCode = 400;
		throw error;
	}
	if (!isLocalHost(parsed.hostname)) {
		const error = new Error("RIDGE_PUBLIC_BASE_URL is required for non-local runtime bundle hosts") as HttpError;
		error.statusCode = 400;
		throw error;
	}
	return parsed.origin;
}

export function buildRuntimeBundle(options: {
	baseUrl: string;
	defaultWorkspaceDir: string;
	device: RegisteredDevice;
	token: string;
}): RidgeRuntimeBundle {
	const generatedAt = Date.now();
	return {
		bundleId: `bundle-${options.device.deviceId}-${generatedAt}`,
		deviceId: options.device.deviceId,
		version: 1,
		workspaceDir: options.defaultWorkspaceDir,
		generatedAt,
		mcp: {
			servers: {
				ridge_workspace: {
					transport: "streamable_http",
					url: `${options.baseUrl}/api/workspace/mcp`,
					headers: {
						Authorization: `Bearer ${options.token}`,
						"x-ridge-device-token": options.token,
					},
					tools: [...WORKSPACE_MCP_TOOLS],
				},
			},
		},
		startupContext: {
			workspaceDir: options.defaultWorkspaceDir,
			memoryPath: "记忆/MEMORY.md",
			wikiIndexPath: "Wiki/index.md",
		},
	};
}

export function createRuntimeBundleRouter(deps: RuntimeBundleDeps) {
	const router = express.Router();

	router.get("/api/runtime/bundle", async (req: Request, res: Response, next: NextFunction) => {
		try {
			const token = extractDeviceToken(req);
			const db = await deps.getRidgeDb();
			const device = authenticateDeviceToken(db, token);
			if (!device || !token) {
				res.status(401).json({ error: "Unauthorized device" });
				return;
			}
			res.json(buildRuntimeBundle({
				baseUrl: requestBaseUrl(req),
				defaultWorkspaceDir: deps.defaultWorkspaceDir,
				device,
				token,
			}));
		} catch (error) {
			next(error);
		}
	});

	return router;
}

export function createDeviceRegistrationRouter(deps: RuntimeBundleDeps) {
	const router = express.Router();

	router.post("/api/devices/register", async (req: Request, res: Response, next: NextFunction) => {
		try {
			const parsed = deviceRegistrationSchema.parse(req.body ?? {});
			const db = await deps.getRidgeDb();
			const registered = registerDevice(db, parsed);
			res.status(201).json({
				...registered,
				runtimeBundle: buildRuntimeBundle({
					baseUrl: requestBaseUrl(req),
					defaultWorkspaceDir: deps.defaultWorkspaceDir,
					device: registered.device,
					token: registered.token,
				}),
			});
		} catch (error) {
			next(error);
		}
	});

	return router;
}
