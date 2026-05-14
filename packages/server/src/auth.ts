import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const SESSION_COOKIE = "ridge_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

type SessionRecord = {
	expiresAt: number;
};

type LoginFailureRecord = {
	count: number;
	lockedUntil: number;
};

export type AuthRuntime = ReturnType<typeof createAuthRuntime>;

function parseCookieHeader(cookieHeader: string | undefined) {
	const cookies = new Map<string, string>();
	if (!cookieHeader) {
		return cookies;
	}

	for (const part of cookieHeader.split(";")) {
		const [name, ...valueParts] = part.trim().split("=");
		if (!name) {
			continue;
		}
		cookies.set(name, decodeURIComponent(valueParts.join("=")));
	}

	return cookies;
}

function constantTimeEqual(left: string, right: string) {
	const leftBuffer = Buffer.from(left);
	const rightBuffer = Buffer.from(right);
	if (leftBuffer.length !== rightBuffer.length) {
		return false;
	}
	return timingSafeEqual(leftBuffer, rightBuffer);
}

function getClientKey(req: Request) {
	if (process.env.VITEST) {
		const testClient = req.headers["x-test-client-key"];
		if (typeof testClient === "string") {
			return testClient;
		}
	}
	return req.ip || req.socket.remoteAddress || "unknown";
}

function buildCookie(sessionId: string, maxAgeSeconds: number) {
	const parts = [
		`${SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
		"HttpOnly",
		"SameSite=Lax",
		"Path=/",
		`Max-Age=${maxAgeSeconds}`,
	];
	if (process.env.NODE_ENV === "production") {
		parts.push("Secure");
	}
	return parts.join("; ");
}

export function createAuthRuntime(options: { adminPassword: string }) {
	const sessions = new Map<string, SessionRecord>();
	const failures = new Map<string, LoginFailureRecord>();

	const isValidSession = (sessionId: string | undefined) => {
		if (!sessionId) {
			return false;
		}
		const session = sessions.get(sessionId);
		if (!session) {
			return false;
		}
		if (session.expiresAt <= Date.now()) {
			sessions.delete(sessionId);
			return false;
		}
		return true;
	};

	const getSessionIdFromCookieHeader = (cookieHeader: string | undefined) =>
		parseCookieHeader(cookieHeader).get(SESSION_COOKIE);

	const createSessionCookie = () => {
		const sessionId = randomBytes(32).toString("base64url");
		sessions.set(sessionId, { expiresAt: Date.now() + SESSION_TTL_MS });
		return buildCookie(sessionId, Math.floor(SESSION_TTL_MS / 1000));
	};

	const clearSessionCookie = () => buildCookie("", 0);

	const removeSession = (cookieHeader: string | undefined) => {
		const sessionId = getSessionIdFromCookieHeader(cookieHeader);
		if (sessionId) {
			sessions.delete(sessionId);
		}
	};

	const isAuthenticatedCookieHeader = (cookieHeader: string | undefined) =>
		isValidSession(getSessionIdFromCookieHeader(cookieHeader));

	const login = (req: Request, res: Response) => {
		const clientKey = getClientKey(req);
		const failure = failures.get(clientKey);
		if (failure && failure.lockedUntil > Date.now()) {
			res.status(429).json({ error: "Too many login attempts" });
			return;
		}

		const password = String((req.body as { password?: unknown })?.password ?? "");
		if (!constantTimeEqual(password, options.adminPassword)) {
			const nextCount = (failure?.count ?? 0) + 1;
			failures.set(clientKey, {
				count: nextCount,
				lockedUntil: nextCount >= MAX_FAILED_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0,
			});
			res.status(401).json({ error: "Invalid password" });
			return;
		}

		failures.delete(clientKey);
		res.setHeader("Set-Cookie", createSessionCookie());
		res.json({ ok: true });
	};

	const logout = (req: Request, res: Response) => {
		removeSession(req.headers.cookie);
		res.setHeader("Set-Cookie", clearSessionCookie());
		res.json({ ok: true });
	};

	const session = (req: Request, res: Response) => {
		res.json({ authenticated: isAuthenticatedCookieHeader(req.headers.cookie) });
	};

	const requireApiAuth = (req: Request, res: Response, next: NextFunction) => {
		if (!req.path.startsWith("/api/")) {
			next();
			return;
		}
		if (isAuthenticatedCookieHeader(req.headers.cookie)) {
			next();
			return;
		}
		res.status(401).json({ error: "Unauthorized" });
	};

	const resetForTests = () => {
		sessions.clear();
		failures.clear();
	};

	return {
		clearSessionCookie,
		createSessionCookie,
		isAuthenticatedCookieHeader,
		login,
		logout,
		requireApiAuth,
		resetForTests,
		session,
	};
}
