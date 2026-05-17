const SENSITIVE_QUERY_KEYS = new Set([
	"access_token",
	"auth",
	"code",
	"credential",
	"key",
	"password",
	"refresh_token",
	"secret",
	"session",
	"signature",
	"token",
]);

export function sanitizeUrlForCapture(rawUrl: string): string {
	const url = new URL(rawUrl);
	for (const key of Array.from(url.searchParams.keys())) {
		const normalized = key.toLowerCase();
		if (
			SENSITIVE_QUERY_KEYS.has(normalized) ||
			normalized.startsWith("utm_") ||
			normalized.includes("token") ||
			normalized.includes("secret") ||
			normalized.includes("password")
		) {
			url.searchParams.delete(key);
		}
	}
	url.username = "";
	url.password = "";
	return url.toString();
}

export function hostnameForBlocklist(rawUrl: string): string {
	try {
		return new URL(rawUrl).hostname.toLowerCase();
	} catch {
		return "";
	}
}
