import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RIDGE_DB_SCHEMA_VERSION } from "../db/migrations.js";

const createLegacyDb = (dbPath: string) => {
	const db = new Database(dbPath);
	db.exec(`
CREATE TABLE ridge_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE workspace_milestones (
  milestone_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  goal TEXT NOT NULL,
  acceptance_criteria TEXT NOT NULL,
  status TEXT NOT NULL,
  due_date INTEGER,
  is_system INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#64748b',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE workspace_tasks (
  task_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  acceptance_criteria TEXT NOT NULL,
  due_date INTEGER,
  blocked_reason TEXT,
  processing_session_id TEXT UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO workspace_milestones(
  milestone_id, title, goal, acceptance_criteria, status,
  is_system, created_at, updated_at
) VALUES(
  'milestone-legacy', '未归属', '旧库默认里程碑', '旧库验收标准',
  'pending', 1, 1, 1
);

INSERT INTO workspace_tasks(
  task_id, title, status, priority,
  acceptance_criteria, created_at, updated_at
) VALUES(
  'task-legacy', '旧库任务', 'pending',
  'normal', '旧库任务验收标准', 1, 1
);
`);
	db.close();
};

const listColumns = (db: InstanceType<typeof Database>, tableName: string): string[] =>
	(db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[]).map(
		(row) => row.name,
	);

const listTables = (db: InstanceType<typeof Database>): string[] =>
	(
		db
			.prepare(
				`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
			)
			.all() as { name: string }[]
	).map((row) => row.name);

describe("ridge db migrations", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	it("upgrades legacy workspace task tables before creating workspace_path indexes", async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ridge-db-legacy-"));
		const dbPath = path.join(tempDir, "ridge.db");
		const workspaceDir = path.join(tempDir, "workspace");
		await fs.mkdir(workspaceDir, { recursive: true });
		createLegacyDb(dbPath);
		vi.stubEnv("RIDGE_DB_PATH", dbPath);

		const { initializeRidgeDb } = await import("../db/index.js");
		const db = await initializeRidgeDb(workspaceDir);

		expect(listColumns(db, "workspace_milestones")).toContain("workspace_path");
		expect(listColumns(db, "workspace_tasks")).toContain("workspace_path");
		expect(listColumns(db, "workspace_tasks")).toContain("milestone_id");
		expect(
			db
				.prepare("SELECT workspace_path FROM workspace_milestones WHERE milestone_id = ?")
				.get("milestone-legacy"),
		).toEqual({ workspace_path: path.resolve(workspaceDir) });
		expect(
			db
				.prepare("SELECT workspace_path FROM workspace_tasks WHERE task_id = ?")
				.get("task-legacy"),
		).toEqual({ workspace_path: path.resolve(workspaceDir) });
		expect(
			db
				.prepare("SELECT milestone_id FROM workspace_tasks WHERE task_id = ?")
				.get("task-legacy"),
		).toEqual({ milestone_id: "milestone-legacy" });

		db.close();
	});

	it("creates the ridge core tables and records applied migrations", async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ridge-db-empty-"));
		const dbPath = path.join(tempDir, "ridge.db");
		vi.stubEnv("RIDGE_DB_PATH", dbPath);

		const { initializeRidgeDb } = await import("../db/index.js");
		const db = await initializeRidgeDb();

		expect(listTables(db)).toEqual(
			expect.arrayContaining([
				"ridge_meta",
				"ridge_schema_migrations",
				"devices",
				"projects",
				"session_index",
				"workspace_tasks",
				"workspace_milestones",
				"fleeting_notes",
				"automations",
				"automation_runs",
				"background_jobs",
				"search_index_status",
				"notification_events",
				"app_settings",
			]),
		);
		expect(listColumns(db, "devices")).toEqual(
			expect.arrayContaining(["device_id", "name", "device_type", "status", "last_seen_at"]),
		);
		expect(listColumns(db, "projects")).toEqual(
			expect.arrayContaining(["project_type", "source", "workspace_path", "device_id", "archived_at"]),
		);
		expect(listColumns(db, "session_index")).toEqual(
			expect.arrayContaining([
				"session_id",
				"session_type",
				"context_type",
				"project_id",
				"task_id",
				"device_id",
				"readonly",
			]),
		);
		expect(listColumns(db, "background_jobs")).toEqual(
			expect.arrayContaining(["job_id", "job_type", "status", "payload_json", "attempt_count"]),
		);
		expect(
			db
				.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'messages'")
				.get(),
		).toBeUndefined();
		expect(
			(
				db
					.prepare("SELECT version FROM ridge_schema_migrations ORDER BY version ASC")
					.all() as { version: number }[]
			).map((row) => row.version),
		).toEqual(Array.from({ length: RIDGE_DB_SCHEMA_VERSION }, (_, index) => index + 1));
		expect(
			db
				.prepare("SELECT value FROM ridge_meta WHERE key = 'schema_version'")
				.get(),
		).toEqual({ value: String(RIDGE_DB_SCHEMA_VERSION) });

		db.close();
	});

	it("repairs missing columns on existing core tables", async () => {
		const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ridge-db-repair-"));
		const dbPath = path.join(tempDir, "ridge.db");
		const legacyDb = new Database(dbPath);
		legacyDb.exec(`
CREATE TABLE ridge_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE devices (
  device_id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE projects (
  project_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  is_git INTEGER NOT NULL,
  added_at INTEGER NOT NULL
);

CREATE TABLE background_jobs (
  job_id TEXT PRIMARY KEY,
  status TEXT NOT NULL
);
`);
		legacyDb.close();
		vi.stubEnv("RIDGE_DB_PATH", dbPath);

		const { initializeRidgeDb } = await import("../db/index.js");
		const db = await initializeRidgeDb();

		expect(listColumns(db, "devices")).toEqual(
			expect.arrayContaining(["device_type", "status", "capabilities_json", "updated_at"]),
		);
		expect(listColumns(db, "projects")).toEqual(
			expect.arrayContaining(["project_type", "source", "workspace_path", "archived_at"]),
		);
		expect(listColumns(db, "background_jobs")).toEqual(
			expect.arrayContaining(["job_type", "payload_json", "attempt_count", "last_error"]),
		);

		db.close();
	});
});
