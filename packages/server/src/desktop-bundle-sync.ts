import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { materializeBundle } from "./runtime-bundle.js";
import type { BundleResource, RuntimeBundle } from "./runtime-bundle.js";
import { createBundleBackedResourceLoader } from "./bundle-resource-loader.js";

/**
 * Desktop-side bundle sync client.
 *
 * Implements the full desktop bundle lifecycle:
 *   1. GET bundle from server
 *   2. Materialize to local deterministic directory
 *   3. Configure Pi resourceLoader with materialized bundle dir
 *   4. POST ack back to server (with materializedHash)
 *
 * This runs in the Node context (server test helpers or future Tauri
 * subprocess).  It does NOT depend on Electron/Tauri APIs.
 */

export interface BundleSyncResult {
	bundleId: string;
	bundleVersion: number;
	materializedDir: string;
	materializedHash: string;
	acked: boolean;
}

/**
 * Materialize a server-provided bundle and compute its materialized hash.
 */
export async function materializeDesktopBundle(
	bundle: RuntimeBundle,
	deviceId: string,
): Promise<{ materializedDir: string; materializedHash: string }> {
	const baseDir = process.env.RIDGE_BUNDLE_DIR
		|| path.join(process.env.HOME || "/tmp", ".ridge", "bundles");
	const materializedDir = path.join(baseDir, deviceId);

	// Remove stale files, then materialize
	await fs.rm(materializedDir, { recursive: true, force: true });
	await fs.mkdir(materializedDir, { recursive: true });
	await materializeBundle(bundle, materializedDir);

	// Compute hash of materialized directory contents
	const materializedHash = await hashMaterializedDir(materializedDir);

	return { materializedDir, materializedHash };
}

/**
 * Compute a deterministic SHA-256 hash of all files in a directory tree.
 * Uses relative paths + content to detect any tampering.
 */
async function hashMaterializedDir(dir: string): Promise<string> {
	const files: Array<{ relPath: string; content: Buffer }> = [];
	await collectFiles(dir, "", files);
	files.sort((a, b) => a.relPath.localeCompare(b.relPath));

	const hash = crypto.createHash("sha256");
	for (const file of files) {
		hash.update(file.relPath);
		hash.update(file.content);
	}
	return hash.digest("hex");
}

async function collectFiles(
	root: string,
	prefix: string,
	out: Array<{ relPath: string; content: Buffer }>,
): Promise<void> {
	const entries = await fs.readdir(path.join(root, prefix), { withFileTypes: true });
	for (const entry of entries) {
		const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory()) {
			await collectFiles(root, relPath, out);
		} else if (entry.isFile()) {
			const content = await fs.readFile(path.join(root, relPath));
			out.push({ relPath, content });
		}
	}
}

/**
 * Full desktop bundle sync: fetch, materialize, ack.
 *
 * @param baseUrl  Server base URL (e.g. "http://localhost:3000")
 * @param deviceId Desktop device ID
 * @param token    Device auth token
 * @param options  Optional extra headers (e.g. x-test-client-key for test bypass)
 * @param projectPath Optional project context for project-scoped bundle
 */
export async function syncDesktopBundle(
	baseUrl: string,
	deviceId: string,
	token: string,
	options?: { headers?: Record<string, string> },
	projectPath?: string,
): Promise<BundleSyncResult> {
	// 1. GET bundle from server
	const url = new URL(`/api/devices/${encodeURIComponent(deviceId)}/bundle`, baseUrl);
	url.searchParams.set("token", token);
	if (projectPath) {
		url.searchParams.set("projectPath", projectPath);
	}

	const response = await fetch(url.toString(), {
		headers: options?.headers,
	});
	if (!response.ok) {
		throw new Error(`Bundle fetch failed: ${response.status} ${response.statusText}`);
	}
	const bundleRaw = await response.json() as {
		manifest?: RuntimeBundle["manifest"];
		files?: Record<string, BundleResource> | Array<[string, BundleResource]>;
	};
	const manifest = bundleRaw.manifest;
	if (!manifest?.bundleId) {
		throw new Error("Bundle response missing bundleId");
	}
	if (!manifest.contentHash) {
		throw new Error("Bundle response missing contentHash");
	}
	// Rehydrate Map from JSON serialization (server returns plain object in `files`)
	const filesMap = new Map<string, BundleResource>(
		Array.isArray(bundleRaw.files)
			? bundleRaw.files
			: Object.entries(bundleRaw.files ?? {}),
	);
	// Server returns { manifest, files } — reconstruct RuntimeBundle shape
	const bundle: RuntimeBundle = {
		manifest,
		files: filesMap,
	};

	// 2. Materialize
	const { materializedDir, materializedHash } = await materializeDesktopBundle(
		bundle,
		deviceId,
	);

	// 3. POST ack
	const ackUrl = new URL(
		`/api/devices/${encodeURIComponent(deviceId)}/bundle/ack`,
		baseUrl,
	);
	const ackResponse = await fetch(ackUrl.toString(), {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...options?.headers,
		},
		body: JSON.stringify({
			bundleId: bundle.manifest.bundleId,
			token,
			contentHash: bundle.manifest.contentHash,
			bundleVersion: bundle.manifest.version,
			projectId: undefined,
			projectPath: undefined,
			materializedHash,
		}),
	});

	return {
		bundleId: bundle.manifest.bundleId,
		bundleVersion: bundle.manifest.version,
		materializedDir,
		materializedHash,
		acked: ackResponse.ok,
	};
}

/**
 * Create a Pi-compatible resourceLoader backed by a materialized bundle.
 * Used by the desktop runtime after syncDesktopBundle completes.
 */
export function createDesktopResourceLoader(
	materializedDir: string,
	cwd: string,
) {
	return createBundleBackedResourceLoader(materializedDir, cwd);
}
