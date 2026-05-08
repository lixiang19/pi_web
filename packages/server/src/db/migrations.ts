export const RIDGE_DB_SCHEMA_VERSION = 3;

export const RIDGE_DB_BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS ridge_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  is_git INTEGER NOT NULL,
  added_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS favorites (
  favorite_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  data_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  cwd TEXT NOT NULL DEFAULT '',
  session_file TEXT NOT NULL DEFAULT '',
  parent_session_path TEXT,
  parent_session_id TEXT,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  context_id TEXT,
  user_round_count INTEGER NOT NULL DEFAULT 0,
  last_model TEXT,
  last_thinking_level TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_context_id ON sessions(context_id);
CREATE INDEX IF NOT EXISTS idx_sessions_archived ON sessions(archived);
CREATE INDEX IF NOT EXISTS idx_sessions_parent_session_id ON sessions(parent_session_id);

CREATE TABLE IF NOT EXISTS session_contexts (
  context_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  project_root TEXT NOT NULL,
  project_label TEXT NOT NULL,
  worktree_root TEXT NOT NULL,
  worktree_label TEXT NOT NULL,
  branch TEXT,
  is_git INTEGER NOT NULL,
  cwd TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_selections (
  session_id TEXT PRIMARY KEY,
  agent_name TEXT,
  explicit_model TEXT,
  explicit_thinking_level TEXT,
  updated_at INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS automation_rules (
  automation_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  cwd TEXT NOT NULL,
  agent_name TEXT,
  explicit_model TEXT,
  explicit_thinking_level TEXT,
  schedule_json TEXT NOT NULL,
  prompt TEXT NOT NULL,
  next_run_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_automation_rules_next_run_at
  ON automation_rules(enabled, next_run_at);

CREATE TABLE IF NOT EXISTS workspace_milestones (
  milestone_id TEXT PRIMARY KEY,
  workspace_path TEXT NOT NULL,
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_milestones_default
  ON workspace_milestones(workspace_path, title)
  WHERE is_system = 1;

CREATE INDEX IF NOT EXISTS idx_workspace_milestones_workspace
  ON workspace_milestones(workspace_path, sort_order, created_at);

CREATE INDEX IF NOT EXISTS idx_workspace_milestones_status
  ON workspace_milestones(workspace_path, status);

CREATE TABLE IF NOT EXISTS workspace_tasks (
  task_id TEXT PRIMARY KEY,
  workspace_path TEXT NOT NULL,
  milestone_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  acceptance_criteria TEXT NOT NULL,
  due_date INTEGER,
  blocked_reason TEXT,
  processing_session_id TEXT UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(milestone_id) REFERENCES workspace_milestones(milestone_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_workspace_tasks_workspace
  ON workspace_tasks(workspace_path, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_tasks_milestone
  ON workspace_tasks(milestone_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS idx_workspace_tasks_status
  ON workspace_tasks(workspace_path, status, sort_order);

CREATE INDEX IF NOT EXISTS idx_workspace_tasks_due_date
  ON workspace_tasks(workspace_path, due_date);


`;
