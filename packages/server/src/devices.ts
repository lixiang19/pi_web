import crypto from 'node:crypto';
import { getRidgeDb } from './db/index.js';

export interface DeviceRecord {
  deviceId: string;
  name: string;
  deviceType: 'server' | 'desktop';
  token?: string;
  status: 'online' | 'offline';
  capabilities: Record<string, boolean>;
  lastSeenAt: number | null;
  createdAt: number;
  updatedAt: number;
}

const HEARTBEAT_TIMEOUT_MS = 60_000;

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function validateDeviceToken(deviceId: string, token: string): Promise<boolean> {
  const device = await getDevice(deviceId);
  if (!device) return false;
  return device.token === token;
}

export async function registerDevice(params: {
  deviceId: string;
  name: string;
  deviceType: 'server' | 'desktop';
  capabilities?: Record<string, boolean>;
}): Promise<DeviceRecord> {
  const db = await getRidgeDb();
  const now = Date.now();
  const token = generateToken();

  db.prepare(
    `INSERT INTO devices(device_id, name, device_type, token, status, capabilities_json, last_seen_at, created_at, updated_at)
     VALUES(?, ?, ?, ?, 'online', ?, ?, ?, ?)
     ON CONFLICT(device_id) DO UPDATE SET
       name = excluded.name,
       device_type = excluded.device_type,
       token = excluded.token,
       status = 'online',
       capabilities_json = excluded.capabilities_json,
       last_seen_at = excluded.last_seen_at,
       updated_at = excluded.updated_at`
  ).run(
    params.deviceId,
    params.name,
    params.deviceType,
    token,
    JSON.stringify(params.capabilities || {}),
    now,
    now,
    now,
  );

  return {
    deviceId: params.deviceId,
    name: params.name,
    deviceType: params.deviceType,
    token,
    status: 'online',
    capabilities: params.capabilities || {},
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

export async function heartbeatDevice(deviceId: string): Promise<boolean> {
  const db = await getRidgeDb();
  const now = Date.now();

  const result = db.prepare(
    `UPDATE devices
     SET status = 'online', last_seen_at = ?, updated_at = ?
     WHERE device_id = ?`
  ).run(now, now, deviceId);

  return result.changes > 0;
}

export async function updateDeviceStatus(deviceId: string, status: 'online' | 'offline'): Promise<boolean> {
  const db = await getRidgeDb();
  const now = Date.now();

  const result = db.prepare(
    `UPDATE devices
     SET status = ?, updated_at = ?
     WHERE device_id = ?`
  ).run(status, now, deviceId);

  return result.changes > 0;
}

export async function renameDevice(deviceId: string, name: string): Promise<boolean> {
  const db = await getRidgeDb();
  const now = Date.now();

  const result = db.prepare(
    `UPDATE devices
     SET name = ?, updated_at = ?
     WHERE device_id = ?`
  ).run(name, now, deviceId);

  return result.changes > 0;
}

export async function getDevice(deviceId: string): Promise<DeviceRecord | null> {
  const db = await getRidgeDb();
  const row = db.prepare(
    `SELECT device_id, name, device_type, token, status, capabilities_json, last_seen_at, created_at, updated_at
     FROM devices
     WHERE device_id = ?`
  ).get(deviceId) as {
    device_id: string;
    name: string;
    device_type: string;
    token: string | null;
    status: string;
    capabilities_json: string;
    last_seen_at: number | null;
    created_at: number;
    updated_at: number;
  } | undefined;

  if (!row) return null;

  return {
    deviceId: row.device_id,
    name: row.name,
    deviceType: row.device_type as DeviceRecord['deviceType'],
    token: row.token || undefined,
    status: row.status as DeviceRecord['status'],
    capabilities: parseCapabilities(row.capabilities_json),
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listDevices(): Promise<DeviceRecord[]> {
  const db = await getRidgeDb();
  const rows = db.prepare(
    `SELECT device_id, name, device_type, token, status, capabilities_json, last_seen_at, created_at, updated_at
     FROM devices
     ORDER BY created_at DESC`
  ).all() as Array<{
    device_id: string;
    name: string;
    device_type: string;
    token: string | null;
    status: string;
    capabilities_json: string;
    last_seen_at: number | null;
    created_at: number;
    updated_at: number;
  }>;

  return rows.map((row) => ({
    deviceId: row.device_id,
    name: row.name,
    deviceType: row.device_type as DeviceRecord['deviceType'],
    token: row.token || undefined,
    status: row.status as DeviceRecord['status'],
    capabilities: parseCapabilities(row.capabilities_json),
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function sweepOfflineDevices(): Promise<string[]> {
  const db = await getRidgeDb();
  const now = Date.now();
  const cutoff = now - HEARTBEAT_TIMEOUT_MS;

  const rows = db.prepare(
    `SELECT device_id FROM devices
     WHERE device_type = 'desktop'
       AND status = 'online'
       AND last_seen_at < ?`
  ).all(cutoff) as Array<{ device_id: string }>;

  const offlineIds = rows.map((r) => r.device_id);

  if (offlineIds.length > 0) {
    const placeholders = offlineIds.map(() => '?').join(',');
    db.prepare(
      `UPDATE devices
       SET status = 'offline', updated_at = ?
       WHERE device_id IN (${placeholders})`
    ).run(now, ...offlineIds);
  }

  return offlineIds;
}

function parseCapabilities(json: string): Record<string, boolean> {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`Invalid capabilities JSON: expected object, got ${Array.isArray(parsed) ? 'array' : typeof parsed}`);
    }
    // Validate all values are booleans
    const result: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value !== 'boolean') {
        throw new Error(`Invalid capability value for "${key}": expected boolean, got ${typeof value}`);
      }
      result[key] = value;
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[devices] Failed to parse capabilities JSON: ${message}. Raw: ${json}`);
    throw Object.assign(
      new Error(`Capabilities parse failed: ${message}`),
      { statusCode: 500, code: 'CAPABILITIES_PARSE_ERROR' }
    );
  }
}

export async function ensureServerDevice(): Promise<DeviceRecord> {
  const existing = await getDevice('server');
  if (existing) return existing;

  return registerDevice({
    deviceId: 'server',
    name: 'Ridge Server',
    deviceType: 'server',
    capabilities: {},
  });
}
