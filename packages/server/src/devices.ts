import crypto, { timingSafeEqual } from "node:crypto";
import type { RidgeDatabase } from "./db/index.js";

export interface RegisteredDevice {
	deviceId: string;
	name: string;
	deviceType: string;
	status: "online" | "offline";
	capabilities: Record<string, unknown>;
	lastSeenAt: number;
	createdAt: number;
	updatedAt: number;
}

export interface DeviceRegistrationInput {
	deviceId?: string;
	name: string;
	deviceType: "server" | "desktop" | "mobile" | "browser" | string;
	capabilities?: Record<string, unknown>;
}

export interface DeviceRegistrationResult {
	device: RegisteredDevice;
	token: string;
}

export const DEVICE_TOKEN_BYTES = 32;

function generateDeviceId(): string {
	return `device-${crypto.randomBytes(12).toString("base64url")}`;
}

function generateDeviceToken(): string {
	return `rdt_${crypto.randomBytes(DEVICE_TOKEN_BYTES).toString("base64url")}`;
}

export function hashDeviceToken(token: string): string {
	return crypto.createHash("sha256").update(token).digest("hex");
}

function constantTimeEqual(left: string, right: string): boolean {
	const leftBuffer = Buffer.from(left);
	const rightBuffer = Buffer.from(right);
	if (leftBuffer.length !== rightBuffer.length) {
		return false;
	}
	return timingSafeEqual(leftBuffer, rightBuffer);
}

function parseCapabilities(raw: string): Record<string, unknown> {
	try {
		const parsed = JSON.parse(raw) as unknown;
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? parsed as Record<string, unknown>
			: {};
	} catch {
		return {};
	}
}

function mapDeviceRow(row: {
	device_id: string;
	name: string;
	device_type: string;
	status: string;
	capabilities_json: string;
	last_seen_at: number | null;
	created_at: number;
	updated_at: number;
}): RegisteredDevice {
	return {
		deviceId: row.device_id,
		name: row.name,
		deviceType: row.device_type,
		status: row.status === "online" ? "online" : "offline",
		capabilities: parseCapabilities(row.capabilities_json),
		lastSeenAt: row.last_seen_at ?? 0,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export function registerDevice(
	db: RidgeDatabase,
	input: DeviceRegistrationInput,
): DeviceRegistrationResult {
	const now = Date.now();
	const token = generateDeviceToken();
	const deviceId = input.deviceId?.trim() || generateDeviceId();
	const name = input.name.trim();
	const capabilities = input.capabilities ?? {};
	const capabilitiesJson = JSON.stringify(capabilities);
	const tokenHash = hashDeviceToken(token);
	const existing = db
		.prepare("SELECT created_at FROM devices WHERE device_id = ?")
		.get(deviceId) as { created_at: number } | undefined;

	db.prepare(
		`INSERT INTO devices(
			device_id, name, device_type, status, capabilities_json, token_hash,
			last_seen_at, created_at, updated_at
		) VALUES(?, ?, ?, 'online', ?, ?, ?, ?, ?)
		ON CONFLICT(device_id) DO UPDATE SET
			name = excluded.name,
			device_type = excluded.device_type,
			status = 'online',
			capabilities_json = excluded.capabilities_json,
			token_hash = excluded.token_hash,
			last_seen_at = excluded.last_seen_at,
			updated_at = excluded.updated_at`,
	).run(
		deviceId,
		name,
		input.deviceType,
		capabilitiesJson,
		tokenHash,
		now,
		existing?.created_at ?? now,
		now,
	);

	return {
		device: {
			deviceId,
			name,
			deviceType: input.deviceType,
			status: "online",
			capabilities,
			lastSeenAt: now,
			createdAt: existing?.created_at ?? now,
			updatedAt: now,
		},
		token,
	};
}

export function authenticateDeviceToken(
	db: RidgeDatabase,
	token: string | undefined,
): RegisteredDevice | null {
	if (!token?.trim()) {
		return null;
	}
	const tokenHash = hashDeviceToken(token.trim());
	const row = db
		.prepare(
			`SELECT device_id, name, device_type, status, capabilities_json, token_hash,
			        last_seen_at, created_at, updated_at
			   FROM devices
			  WHERE token_hash = ?
			  LIMIT 1`,
		)
		.get(tokenHash) as {
			device_id: string;
			name: string;
			device_type: string;
			status: string;
			capabilities_json: string;
			token_hash: string;
			last_seen_at: number | null;
			created_at: number;
			updated_at: number;
		} | undefined;

	if (!row || !constantTimeEqual(row.token_hash, tokenHash)) {
		return null;
	}

	const now = Date.now();
	db.prepare(
		`UPDATE devices
		    SET status = 'online', last_seen_at = ?, updated_at = ?
		  WHERE device_id = ?`,
	).run(now, now, row.device_id);

	return mapDeviceRow({
		...row,
		status: "online",
		last_seen_at: now,
		updated_at: now,
	});
}
