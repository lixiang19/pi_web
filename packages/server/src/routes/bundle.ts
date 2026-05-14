import express, { type NextFunction, type Request, type Response } from "express";
import path from "node:path";
import { z } from "zod";
import { getRidgeDb } from "../db/index.js";
import { getDevice, validateDeviceToken } from "../devices.js";
import { generateRuntimeBundle } from "../runtime-bundle.js";

const ackSchema = z.object({
	bundleId: z.string().min(1),
	token: z.string().min(1),
	contentHash: z.string().min(1),
	bundleVersion: z.number().int().min(1),
	projectId: z.string().optional(),
	projectPath: z.string().optional(),
	materializedHash: z.string().optional(),
});

/** Validate that projectPath is a legitimate, non-archived project bound to this device */
async function validateBundleProjectPath(
	deviceId: string,
	projectPath: string,
	_defaultWorkspaceDir: string,
): Promise<{
	projectId: string | null;
	validatedPath: string;
}> {
	const db = await getRidgeDb();
	
	// Must be a project in the DB, bound to this device, not archived
	const row = db.prepare(
		`SELECT project_id, path, archived_at FROM projects 
		 WHERE device_id = ? AND project_type = 'external'`
	).all(deviceId) as Array<{
		project_id: string;
		path: string;
		archived_at: number | null;
	}>;
	
	// Find the project whose path matches or is parent of the requested path
	const normalizedQueryPath = path.normalize(projectPath);
	const matching = row.find((r) => {
		const normalizedProjectPath = path.normalize(r.path);
		return normalizedQueryPath === normalizedProjectPath ||
			normalizedQueryPath.startsWith(normalizedProjectPath + path.sep);
	});
	
	if (!matching) {
		const error = new Error("projectPath is not a registered project for this device") as { statusCode: number; code: string } & Error;
		error.statusCode = 400;
		error.code = "INVALID_PROJECT_PATH";
		throw error;
	}
	
	if (matching.archived_at) {
		const error = new Error("Cannot request bundle for archived project") as { statusCode: number; code: string } & Error;
		error.statusCode = 403;
		error.code = "ARCHIVED_PROJECT";
		throw error;
	}
	return {
		projectId: matching.project_id,
		validatedPath: matching.path,
	};
}

export function createBundleRouter(defaultWorkspaceDir: string) {
	const router = express.Router();

	// GET /api/devices/:deviceId/bundle — requires device token in query
	router.get(
		"/:deviceId/bundle",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const deviceId = String(req.params.deviceId);
				const token = String(req.query.token || "");

				if (!token) {
					const error = new Error("Missing device token") as {
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

				const device = await getDevice(deviceId);
				if (!device) {
					const error = new Error("Device not found") as {
						statusCode: number;
					} & Error;
					error.statusCode = 404;
					throw error;
				}

				// Validate projectPath from projects table if provided
				let projectPath: string | undefined;
				let projectId: string | null = null;
				if (typeof req.query.projectPath === "string" && req.query.projectPath.length > 0) {
					const validated = await validateBundleProjectPath(
						deviceId,
						req.query.projectPath,
						defaultWorkspaceDir,
					);
					projectPath = validated.validatedPath;
					projectId = validated.projectId;
				}

				const bundle = await generateRuntimeBundle(
					device,
					defaultWorkspaceDir,
					projectPath,
				);

				// Record the served bundle for later ack validation
				const db = await getRidgeDb();
				const now = Date.now();
				db.prepare(
					`INSERT INTO device_bundle_served(device_id, bundle_id, content_hash, bundle_version, project_id, project_path, served_at)
					 VALUES(?, ?, ?, ?, ?, ?, ?)
					 ON CONFLICT(device_id) DO UPDATE SET
					   bundle_id = excluded.bundle_id,
					   content_hash = excluded.content_hash,
					   bundle_version = excluded.bundle_version,
					   project_id = excluded.project_id,
					   project_path = excluded.project_path,
					   served_at = excluded.served_at`,
				).run(
					deviceId,
					bundle.manifest.bundleId,
					bundle.manifest.contentHash,
					bundle.manifest.version,
					projectId,
					projectPath || null,
					now,
				);

				res.json({
					manifest: bundle.manifest,
					files: Object.fromEntries(
						Array.from(bundle.files.entries()).map(([k, v]) => [k, v])
					),
				});
			} catch (error) {
				next(error);
			}
		},
	);

	// POST /api/devices/:deviceId/bundle/ack — device acknowledges bundle receipt
	router.post(
		"/:deviceId/bundle/ack",
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				const deviceId = String(req.params.deviceId);
				const payload = ackSchema.parse(req.body ?? {});

				// Validate token
				const valid = await validateDeviceToken(deviceId, payload.token);
				if (!valid) {
					const error = new Error("Invalid device token") as {
						statusCode: number;
					} & Error;
					error.statusCode = 401;
					throw error;
				}

				// Fetch device
				const device = await getDevice(deviceId);
				if (!device) {
					const error = new Error("Device not found") as { statusCode: number } & Error;
					error.statusCode = 404;
					throw error;
				}

				// Must validate against the last served bundle record
				const db = await getRidgeDb();
				const served = db.prepare(
					`SELECT bundle_id, content_hash, bundle_version, project_id, project_path, materialized_hash
					 FROM device_bundle_served WHERE device_id = ?`
				).get(deviceId) as {
					bundle_id: string;
					content_hash: string;
					bundle_version: number;
					project_id: string | null;
					project_path: string | null;
				} | undefined;

				if (!served) {
					const error = new Error("No bundle served to this device; cannot ack") as { statusCode: number } & Error;
					error.statusCode = 400;
					throw error;
				}

				// Strict validation: device, project, bundle, version, hash must match
				const mismatches: string[] = [];
				if (served.bundle_id !== payload.bundleId) {
					mismatches.push(`bundleId mismatch: expected ${served.bundle_id}, got ${payload.bundleId}`);
				}
				if (served.bundle_version !== payload.bundleVersion) {
					mismatches.push(`bundleVersion mismatch: expected ${served.bundle_version}, got ${payload.bundleVersion}`);
				}
				if (served.content_hash !== payload.contentHash) {
					mismatches.push(`contentHash mismatch: expected ${served.content_hash}, got ${payload.contentHash}`);
				}
				// Validate project context if provided in ack
				if (payload.projectId && served.project_id !== payload.projectId) {
					mismatches.push(`projectId mismatch: expected ${served.project_id}, got ${payload.projectId}`);
				}
				if (payload.projectPath && served.project_path !== payload.projectPath) {
					mismatches.push(`projectPath mismatch: expected ${served.project_path}, got ${payload.projectPath}`);
				}
				// Validate materialized hash if desktop reports it
				if (payload.materializedHash) {
					// We store the materializedHash in the ack record for comparison on subsequent acks
					// First ack bootstraps the expected materialized hash
					const currentMaterialized = (served as Record<string, unknown>).materialized_hash as string | undefined;
					if (currentMaterialized && currentMaterialized !== payload.materializedHash) {
						mismatches.push(`materializedHash mismatch: expected ${currentMaterialized}, got ${payload.materializedHash}`);
					}
				}

				if (mismatches.length > 0) {
					// Reject the ack and record structured error
					const syncError = mismatches.join("; ");
					const now = Date.now();
					db.prepare(
						`INSERT INTO device_bundle_acks(
							device_id, bundle_id, content_hash, bundle_version, acked_at,
							created_at, sync_status, sync_error, sync_attempts
						)
						VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
						ON CONFLICT(device_id) DO UPDATE SET
							bundle_id = excluded.bundle_id,
							content_hash = excluded.content_hash,
							bundle_version = excluded.bundle_version,
							acked_at = excluded.acked_at,
							updated_at = ?,
							sync_status = excluded.sync_status,
							sync_error = excluded.sync_error,
							sync_attempts = sync_attempts + 1`,
					).run(
						deviceId,
						payload.bundleId,
						payload.contentHash,
						payload.bundleVersion,
						now,
						now,
						"hash_mismatch",
						syncError,
						0,
						now,
					);

					const error = new Error(`Ack validation failed: ${syncError}`) as { statusCode: number; code: string } & Error;
					error.statusCode = 409;
					error.code = "ACK_VALIDATION_FAILED";
					throw error;
				}

				// Valid ack — persist success record and store materializedHash for future comparison
				const now = Date.now();
				db.prepare(
					`INSERT INTO device_bundle_acks(
						device_id, bundle_id, content_hash, bundle_version, acked_at,
						created_at, sync_status, sync_error, sync_attempts
					)
					VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
					ON CONFLICT(device_id) DO UPDATE SET
						bundle_id = excluded.bundle_id,
						content_hash = excluded.content_hash,
						bundle_version = excluded.bundle_version,
						acked_at = excluded.acked_at,
						updated_at = ?,
						sync_status = excluded.sync_status,
						sync_error = excluded.sync_error,
						sync_attempts = sync_attempts + 1`,
				).run(
					deviceId,
					payload.bundleId,
					payload.contentHash,
					payload.bundleVersion,
					now,
					now,
					"acked",
					null,
					0,
					now,
				);

				// Store materializedHash in served record so subsequent acks can validate against it
				if (payload.materializedHash) {
					db.prepare(
						`UPDATE device_bundle_served SET materialized_hash = ? WHERE device_id = ?`,
					).run(payload.materializedHash, deviceId);
				}

				res.json({
					ok: true,
					bundleId: payload.bundleId,
					ackedAt: now,
					syncStatus: "acked",
					syncError: null,
				});
			} catch (error) {
				next(error);
			}
		},
	);

	return router;
}
