import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import {
  heartbeatDevice,
  listDevices,
  registerDevice,
  renameDevice,
  sweepOfflineDevices,
  validateDeviceToken,
} from "../devices.js";

const registerDeviceSchema = z.object({
  deviceId: z.string().min(1),
  name: z.string().min(1),
  deviceType: z.enum(["server", "desktop"]),
  capabilities: z.record(z.string(), z.boolean()).optional(),
});

const heartbeatSchema = z.object({
  deviceId: z.string().min(1),
  token: z.string().min(1),
});

const renameSchema = z.object({
  name: z.string().min(1),
  token: z.string().min(1),
});

function requireDeviceToken(
  deviceIdField: "body" | "params" = "body",
  tokenField: "body" | "params" = "body",
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const deviceId =
        deviceIdField === "body"
          ? req.body?.deviceId
          : req.params?.deviceId;
      const token =
        tokenField === "body"
          ? req.body?.token
          : req.query?.token;

      if (!deviceId || !token) {
        const error = new Error("Missing deviceId or token") as {
          statusCode: number;
        } & Error;
        error.statusCode = 401;
        throw error;
      }

      const valid = await validateDeviceToken(deviceId, token);
      if (!valid) {
        const error = new Error("Invalid device token") as {
          statusCode: number;
        } & Error;
        error.statusCode = 401;
        throw error;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export function createDeviceRouter() {
  const router = express.Router();

  // GET /api/devices — list all devices (no token required, standard auth)
  router.get(
    "/",
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        await sweepOfflineDevices();
        const devices = await listDevices();
        res.json({ devices: devices.map(serializeDevice) });
      } catch (error) {
        next(error);
      }
    },
  );

  // POST /api/devices/register — register or re-register a device
  router.post(
    "/register",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const payload = registerDeviceSchema.parse(req.body ?? {});
        const capabilities =
          typeof payload.capabilities === "object" &&
          payload.capabilities !== null
            ? (payload.capabilities as Record<string, boolean>)
            : {};
        const device = await registerDevice({
          deviceId: payload.deviceId,
          name: payload.name,
          deviceType: payload.deviceType,
          capabilities,
        });
        res.status(201).json({
          ...serializeDevice(device),
          token: device.token,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  // POST /api/devices/heartbeat — device heartbeat (requires token)
  router.post(
    "/heartbeat",
    requireDeviceToken("body", "body"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const payload = heartbeatSchema.parse(req.body ?? {});
        const ok = await heartbeatDevice(payload.deviceId);
        if (!ok) {
          const error = new Error("Device not found") as {
            statusCode: number;
          } & Error;
          error.statusCode = 404;
          throw error;
        }
        res.json({ ok: true });
      } catch (error) {
        next(error);
      }
    },
  );

  // POST /api/devices/:deviceId/rename — rename a device (requires token)
  router.post(
    "/:deviceId/rename",
    requireDeviceToken("params", "body"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const deviceId = String(req.params.deviceId);
        const payload = renameSchema.parse(req.body ?? {});
        const ok = await renameDevice(deviceId, payload.name);
        if (!ok) {
          const error = new Error("Device not found") as {
            statusCode: number;
          } & Error;
          error.statusCode = 404;
          throw error;
        }
        res.json({ ok: true });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}

export function createServerDeviceRouter() {
  const router = express.Router();

  router.get(
    "/server-status",
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const { ensureServerDevice } = await import("../devices.js");
        const server = await ensureServerDevice();
        res.json({ device: serializeDevice(server) });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}

function serializeDevice(
  device: {
    deviceId: string;
    name: string;
    deviceType: string;
    status: string;
    capabilities: Record<string, unknown>;
    lastSeenAt: number | null;
    createdAt: number;
    updatedAt: number;
  },
): Record<string, unknown> {
  return {
    deviceId: device.deviceId,
    name: device.name,
    deviceType: device.deviceType,
    status: device.status,
    capabilities: device.capabilities,
    lastSeenAt: device.lastSeenAt,
    createdAt: device.createdAt,
    updatedAt: device.updatedAt,
  };
}
