import path from "node:path";
import os from "node:os";
import { mkdtempSync, rmSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { afterEach } from "vitest";
import { resetRidgeDb } from "../db/index.js";

// CRITICAL: Per-test-file database isolation with a unique DB path.
// Using a timestamp + counter ensures no two test files in the same fork
// ever share a DB file, eliminating all better-sqlite3 connection reuse issues.
const testFileCounter = (globalThis as Record<string, unknown>).__ridgeTestCounter__
	? (globalThis as Record<string, unknown>).__ridgeTestCounter__ as number
	: 0;
(globalThis as Record<string, unknown>).__ridgeTestCounter__ = testFileCounter + 1;

const baseDir = mkdtempSync(path.join(os.tmpdir(), `ridge-test-${Date.now()}-${testFileCounter}-`));
process.env.RIDGE_DB_PATH = path.join(baseDir, "ridge.db");

// Force db/index.ts to open a fresh DB at the new RIDGE_DB_PATH.
// NOTE: HOME is already set uniquely by vitest-preload.cjs (via execArgv -r)
// which runs BEFORE any module import, so os.homedir() returns the isolated
// directory. We do NOT override HOME here.
resetRidgeDb();

// CRITICAL: Reset the module-level auth singleton between test files.
// With pool:forks a worker may run multiple test files sequentially.
// Leftover sessions / rate-limit state from earlier files break later ones.
if (process.env.VITEST === "true") {
	try {
		const indexMod = await import("../index.js");
		if (indexMod.authRuntime?.resetForTests) {
			indexMod.authRuntime.resetForTests();
		}
	} catch {
		// Ignore import errors (e.g. mocked deps in isolated tests)
	}
}

// CRITICAL: Completely reset the shared workspace directory to prevent
// cross-test-file filesystem pollution. All tests that import `app` from
// `index.js` share the same `defaultWorkspaceDir` (~/ridge-workspace in the
// test fork). Stale files/directories from earlier test files break later
// ones (e.g. security-guards, file-tree-http, fleeting-attachments, task30).
//
// We use maxRetries: 3 on rmSync to handle transient EBUSY/ENOTEMPTY from
// concurrent file handle release (macOS/Windows). After removal we
// immediately recreate to a pristine state.
const workspaceDir = path.join(os.homedir(), "ridge-workspace");
try {
	rmSync(workspaceDir, { recursive: true, force: true, maxRetries: 3 });
} catch {
	// ignore
}
try {
	mkdirSync(workspaceDir, { recursive: true });
	for (const dir of ["项目", "笔记", "日记", "剪藏", "附件", "记忆", "Wiki", "空间"]) {
		mkdirSync(path.join(workspaceDir, dir), { recursive: true });
	}
} catch {
	// ignore
}

// CRITICAL: Also reset auth after EVERY test within the file.
// Even with per-file module-level isolation, a test file may have multiple
// tests that interfere with each other (e.g. auth rate-limit test after
// a session-cookie test, or workspace-tasks tests that share the same agent).
afterEach(async () => {
	if (process.env.VITEST === "true") {
		try {
			const indexMod = await import("../index.js");
			if (indexMod.authRuntime?.resetForTests) {
				indexMod.authRuntime.resetForTests();
			}
		} catch {
			// Ignore import errors (e.g. mocked deps in isolated tests)
		}
	}
});

// Cleanup previously-used directories from this PID to prevent disk bloat.
// We only clean directories older than 5 minutes.
try {
	const tmpdir = os.tmpdir();
	const entries = readdirSync(tmpdir);
	const now = Date.now();
	for (const entry of entries) {
		if (entry.startsWith("ridge-test-")) {
			const fullPath = path.join(tmpdir, entry);
			try {
				const stats = statSync(fullPath);
				const ageMs = now - stats.mtimeMs;
				if (ageMs > 5 * 60 * 1000) {
					rmSync(fullPath, { recursive: true, force: true, maxRetries: 3 });
				}
			} catch {
				// Ignore cleanup errors
			}
		}
	}
} catch {
	// Ignore cleanup errors
}
