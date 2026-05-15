import crypto, { timingSafeEqual } from "node:crypto";
import { getRidgeDb } from "./db/index.js";

export interface DeviceRecord {
  deviceId: string;
  name: string;
  deviceType: string;
  token?: string;
  status: "online" | "offline";
  capabilities: Record<string, unknown>;
  lastSeenAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export type RegisteredDeviceRecord = DeviceRecord & { token: string };

export const DEVICE_TOKEN_BYTES = 32;
const HEARTBEAT_TIMEOUT_MS = 60_000;

function generateToken(): string {
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

export async function validateDeviceToken(deviceId: string, token: string): Promise<boolean> {
  const normalizedToken = token.trim();
  if (!deviceId || !normalizedToken) {
    return false;
  }

  const db = await getRidgeDb();
  const tokenHash = hashDeviceToken(normalizedToken);
  const row = db
    .prepare("SELECT token_hash FROM devices WHERE device_id = ?")
    .get(deviceId) as { token_hash: string | null } | undefined;

  return Boolean(row?.token_hash && constantTimeEqual(row.token_hash, tokenHash));
}

export async function authenticateDeviceToken(token: string | undefined): Promise<DeviceRecord | null> {
  const normalizedToken = token?.trim();
  if (!normalizedToken) {
    return null;
  }

  const db = await getRidgeDb();
  const tokenHash = hashDeviceToken(normalizedToken);
  const row = db
    .prepare(
      `SELECT device_id, token_hash
         FROM devices
        WHERE token_hash = ?
        LIMIT 1`,
    )
    .get(tokenHash) as { device_id: string; token_hash: string | null } | undefined;

  if (!row?.token_hash || !constantTimeEqual(row.token_hash, tokenHash)) {
    return null;
  }

  await heartbeatDevice(row.device_id);
  return getDevice(row.device_id);
}

export async function registerDevice(params: {
  deviceId?: string;
  name: string;
  deviceType: string;
  capabilities?: Record<string, unknown>;
}): Promise<RegisteredDeviceRecord> {
  const db = await getRidgeDb();
  const now = Date.now();
  const token = generateToken();
  const tokenHash = hashDeviceToken(token);
  const deviceId = params.deviceId?.trim() || `device-${crypto.randomBytes(12).toString("base64url")}`;
  const name = params.name.trim();
  const capabilities = params.capabilities || {};
  const existing = db
    .prepare("SELECT created_at FROM devices WHERE device_id = ?")
    .get(deviceId) as { created_at: number } | undefined;

  db.prepare(
    `INSERT INTO devices(
       device_id, name, device_type, token, status, capabilities_json, token_hash,
       last_seen_at, created_at, updated_at
     )
     VALUES(?, ?, ?, NULL, 'online', ?, ?, ?, ?, ?)
     ON CONFLICT(device_id) DO UPDATE SET
       name = excluded.name,
       device_type = excluded.device_type,
       token = NULL,
       status = 'online',
       capabilities_json = excluded.capabilities_json,
       token_hash = excluded.token_hash,
       last_seen_at = excluded.last_seen_at,
       updated_at = excluded.updated_at`,
  ).run(
    deviceId,
    name,
    params.deviceType,
    JSON.stringify(capabilities),
    tokenHash,
    now,
    existing?.created_at ?? now,
    now,
  );

  return {
    deviceId,
    name,
    deviceType: params.deviceType,
    token,
    status: "online",
    capabilities,
    lastSeenAt: now,
    createdAt: existing?.created_at ?? now,
    updatedAt: now,
  };
}

export async function heartbeatDevice(deviceId: string): Promise<boolean> {
  const db = await getRidgeDb();
  const now = Date.now();

  const result = db.prepare(
    `UPDATE devices
     SET status = 'online', last_seen_at = ?, updated_at = ?
     WHERE device_id = ?`,
  ).run(now, now, deviceId);

  return result.changes > 0;
}

export async function updateDeviceStatus(deviceId: string, status: "online" | "offline"): Promise<boolean> {
  const db = await getRidgeDb();
  const now = Date.now();

  const result = db.prepare(
    `UPDATE devices
     SET status = ?, updated_at = ?
     WHERE device_id = ?`,
  ).run(status, now, deviceId);

  return result.changes > 0;
}

export async function renameDevice(deviceId: string, name: string): Promise<boolean> {
  const db = await getRidgeDb();
  const now = Date.now();

  const result = db.prepare(
    `UPDATE devices
     SET name = ?, updated_at = ?
     WHERE device_id = ?`,
  ).run(name, now, deviceId);

  return result.changes > 0;
}

export async function getDevice(deviceId: string): Promise<DeviceRecord | null> {
  const db = await getRidgeDb();
  const row = db.prepare(
    `SELECT device_id, name, device_type, status, capabilities_json, last_seen_at, created_at, updated_at
     FROM devices
     WHERE device_id = ?`,
  ).get(deviceId) as {
    device_id: string;
    name: string;
    device_type: string;
    status: string;
    capabilities_json: string;
    last_seen_at: number | null;
    created_at: number;
    updated_at: number;
  } | undefined;

  return row ? mapDeviceRow(row) : null;
}

export async function listDevices(): Promise<DeviceRecord[]> {
  const db = await getRidgeDb();
  const rows = db.prepare(
    `SELECT device_id, name, device_type, status, capabilities_json, last_seen_at, created_at, updated_at
     FROM devices
     ORDER BY created_at DESC`,
  ).all() as Array<{
    device_id: string;
    name: string;
    device_type: string;
    status: string;
    capabilities_json: string;
    last_seen_at: number | null;
    created_at: number;
    updated_at: number;
  }>;

  return rows.map(mapDeviceRow);
}

export async function sweepOfflineDevices(): Promise<string[]> {
  const db = await getRidgeDb();
  const now = Date.now();
  const cutoff = now - HEARTBEAT_TIMEOUT_MS;

  const rows = db.prepare(
    `SELECT device_id FROM devices
     WHERE device_type = 'desktop'
       AND status = 'online'
       AND last_seen_at < ?`,
  ).all(cutoff) as Array<{ device_id: string }>;

  const offlineIds = rows.map((r) => r.device_id);

  if (offlineIds.length > 0) {
    const placeholders = offlineIds.map(() => "?").join(",");
    db.prepare(
      `UPDATE devices
       SET status = 'offline', updated_at = ?
       WHERE device_id IN (${placeholders})`,
    ).run(now, ...offlineIds);
  }

  return offlineIds;
}

function parseCapabilities(json: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error(`Invalid capabilities JSON: expected object, got ${Array.isArray(parsed) ? "array" : typeof parsed}`);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[devices] Failed to parse capabilities JSON: ${message}. Raw: ${json}`);
    throw Object.assign(
      new Error(`Capabilities parse failed: ${message}`),
      { statusCode: 500, code: "CAPABILITIES_PARSE_ERROR" },
    );
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
}): DeviceRecord {
  return {
    deviceId: row.device_id,
    name: row.name,
    deviceType: row.device_type,
    status: row.status === "online" ? "online" : "offline",
    capabilities: parseCapabilities(row.capabilities_json),
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function ensureServerDevice(): Promise<DeviceRecord> {
  const existing = await getDevice("server");
  if (existing) return existing;

  return registerDevice({
    deviceId: "server",
    name: "Ridge Server",
    deviceType: "server",
    capabilities: {},
  });
}
