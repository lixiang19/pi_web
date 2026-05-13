import path from "node:path";
import os from "node:os";
import { mkdtempSync, rmSync, readdirSync, statSync } from "node:fs";
import { resetRidgeDb } from "../db/index.js";

// Per-test-file database isolation:
// We use a unique directory for EACH invocation so DB isolation is guaranteed
// even if a fork process is reused for multiple test files.
const baseDir = mkdtempSync(path.join(os.tmpdir(), "ridge-test-"));
process.env.RIDGE_DB_PATH = path.join(baseDir, "ridge.db");

// Force db/index.ts to open a fresh DB at the new RIDGE_DB_PATH.
// NOTE: HOME is already set uniquely by vitest-preload.cjs (via execArgv -r)
// which runs BEFORE any module import, so os.homedir() returns the isolated
// directory. We do NOT override HOME here.
resetRidgeDb();

// Do NOT reset the global auth singleton here.
// With Vitest pool:forks, a single worker process may run multiple test files
// sequentially. A global reset would invalidate sessions from the previous test
// file in the same worker, causing 401 races. Each test file that needs auth
// should call createAuthenticatedAgent(), which resets + logs in atomically.

// Cleanup previously-used directories from this PID to prevent disk bloat.
// We only clean directories older than 5 minutes.
try {
	const tmpdir = os.tmpdir();
	const entries = readdirSync(tmpdir);
	const now = Date.now();
	for (const entry of entries) {
		if (entry.startsWith(`ridge-test-${process.pid}-`) || entry.startsWith(`ridge-home-${process.pid}-`)) {
			const fullPath = path.join(tmpdir, entry);
			try {
				const stats = statSync(fullPath);
				const ageMs = now - stats.mtimeMs;
				if (ageMs > 5 * 60 * 1000) {
					rmSync(fullPath, { recursive: true, force: true });
				}
			} catch {
				// Ignore cleanup errors
			}
		}
	}
} catch {
	// Ignore cleanup errors
}
