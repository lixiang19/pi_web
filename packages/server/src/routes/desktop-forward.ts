import express, { type NextFunction, type Request, type Response } from "express";
import {
  addDesktopSseListener,
  forwardRunRequestToDesktop,
  isDesktopOnline,
} from "../desktop-bridge.js";

export function createDesktopForwardRouter() {
  const router = express.Router();

  // GET /api/devices/:deviceId/sse
  // Unified SSE endpoint for desktop project sessions.
  // Events forwarded from desktop Pi via WebSocket without server-side message mirroring.
  router.get(
    "/:deviceId/sse",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const deviceId = String(req.params.deviceId);

        if (!isDesktopOnline(deviceId)) {
          const error = new Error("Device offline") as {
            statusCode: number;
          } & Error;
          error.statusCode = 409;
          throw error;
        }

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders();

        // Send initial connection confirmation
        res.write(`data: ${JSON.stringify({ type: "connected", deviceId })}\n\n`);

        const listener = (event: Record<string, unknown>) => {
          try {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
          } catch {
            // Connection may be closing
          }
        };

        const removeListener = addDesktopSseListener(deviceId, listener);

        req.on("close", () => {
          removeListener();
        });

        req.on("error", () => {
          removeListener();
        });
      } catch (error) {
        next(error);
      }
    },
  );

  // POST /api/devices/:deviceId/forward
  // Forward a run request to the desktop device for execution.
  router.post(
    "/:deviceId/forward",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const deviceId = String(req.params.deviceId);
        const payload = req.body ?? {};

        const result = await forwardRunRequestToDesktop(deviceId, payload);
        res.json({ ok: true, result });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
