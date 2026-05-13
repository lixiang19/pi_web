export const RIDGE_DB_SCHEMA_VERSION = 10;

export const RIDGE_DB_BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS ridge_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ridge_schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  device_id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  device_type TEXT NOT NULL DEFAULT 'server',
  status TEXT NOT NULL DEFAULT 'offline',
  capabilities_json TEXT NOT NULL DEFAULT '{}',
  last_seen_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_devices_status
  ON devices(status, last_seen_at);

CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  is_git INTEGER NOT NULL,
  added_at INTEGER NOT NULL,
  project_type TEXT NOT NULL DEFAULT 'external',
  source TEXT NOT NULL DEFAULT 'server-folder',
  workspace_path TEXT NOT NULL DEFAULT '',
  device_id TEXT,
  archived_at INTEGER,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_projects_type
  ON projects(project_type, archived_at);

CREATE INDEX IF NOT EXISTS idx_projects_device
  ON projects(device_id);

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

CREATE TABLE IF NOT EXISTS session_index (
  session_id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  session_type TEXT NOT NULL DEFAULT 'workspace',
  context_type TEXT NOT NULL DEFAULT 'workspace',
  workspace_path TEXT NOT NULL DEFAULT '',
  project_id TEXT,
  task_id TEXT,
  device_id TEXT,
  run_location TEXT NOT NULL DEFAULT 'server',
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_session_index_context
  ON session_index(context_type, project_id, task_id);

CREATE INDEX IF NOT EXISTS idx_session_index_device
  ON session_index(device_id, run_location);

CREATE INDEX IF NOT EXISTS idx_session_index_updated_at
  ON session_index(updated_at DESC);

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

CREATE TABLE IF NOT EXISTS background_jobs (
  job_id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL DEFAULT '',
  related_type TEXT NOT NULL DEFAULT '',
  related_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  payload_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,
  run_after INTEGER,
  next_retry_at INTEGER,
  locked_at INTEGER,
  locked_by TEXT,
  completed_at INTEGER,
  notify_on_failure INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_background_jobs_ready
  ON background_jobs(status, run_after, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_background_jobs_active_related
  ON background_jobs(job_type, related_type, related_id)
  WHERE related_type != ''
    AND related_id != ''
    AND status IN ('pending', 'running');

CREATE TABLE IF NOT EXISTS workspace_milestones (
  milestone_id TEXT PRIMARY KEY,
  workspace_path TEXT NOT NULL,
  project_id TEXT,
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
  project_id TEXT,
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

CREATE TABLE IF NOT EXISTS fleeting_notes (
  note_id TEXT PRIMARY KEY,
  content TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  analysis_status TEXT NOT NULL DEFAULT 'pending',
  recommendation_type TEXT,
  recommendation_text TEXT,
  draft TEXT,
  requires_input INTEGER NOT NULL DEFAULT 0,
  pi_session_id TEXT,
  pi_session_file TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  capture_type TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_fleeting_notes_created_at
  ON fleeting_notes(created_at DESC);

CREATE TABLE IF NOT EXISTS search_index_status (
  target_path TEXT PRIMARY KEY,
  target_type TEXT NOT NULL DEFAULT 'file',
  status TEXT NOT NULL DEFAULT 'pending',
  content_hash TEXT,
  indexed_at INTEGER,
  error TEXT,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_search_index_status_state
  ON search_index_status(status, updated_at);

CREATE TABLE IF NOT EXISTS notification_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL DEFAULT '',
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'unread',
  created_at INTEGER NOT NULL DEFAULT 0,
  read_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_notification_events_status
  ON notification_events(status, created_at DESC);

CREATE TABLE IF NOT EXISTS session_attachments (
  attachment_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  original_name TEXT NOT NULL DEFAULT '',
  stored_name TEXT NOT NULL DEFAULT '',
  stored_path TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_session_attachments_session
  ON session_attachments(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_attachments_sha256
  ON session_attachments(sha256);

CREATE TABLE IF NOT EXISTS clips (
  clip_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT,
  content TEXT NOT NULL,
  source TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clips_created_at
  ON clips(created_at DESC);

CREATE TABLE IF NOT EXISTS fleeting_attachments (
  attachment_id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  original_name TEXT NOT NULL DEFAULT '',
  stored_name TEXT NOT NULL DEFAULT '',
  stored_path TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_fleeting_attachments_note
  ON fleeting_attachments(note_id, created_at DESC);

CREATE TABLE IF NOT EXISTS file_processing_status (
  file_path TEXT PRIMARY KEY,
  workspace_path TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'converting', 'converted', 'indexed', 'convert_failed', 'index_failed')),
  content_hash TEXT,
  converted_at INTEGER,
  indexed_at INTEGER,
  error TEXT,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_file_processing_status_workspace
  ON file_processing_status(workspace_path, status, updated_at);

`;

export interface RidgeDbMigration {
  version: number;
  name: string;
  sql: string;
}

export const RIDGE_DB_MIGRATIONS: RidgeDbMigration[] = [
  {
    version: 1,
    name: 'ridge core schema bootstrap',
    sql: RIDGE_DB_BOOTSTRAP_SQL,
  },
  {
    version: 2,
    name: 'session index workspace scope',
    sql: `
CREATE TABLE IF NOT EXISTS session_index (
  session_id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  session_type TEXT NOT NULL DEFAULT 'workspace',
  context_type TEXT NOT NULL DEFAULT 'workspace',
  workspace_path TEXT NOT NULL DEFAULT '',
  project_id TEXT,
  task_id TEXT,
  device_id TEXT,
  run_location TEXT NOT NULL DEFAULT 'server',
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_session_index_context
  ON session_index(context_type, project_id, task_id);
CREATE INDEX IF NOT EXISTS idx_session_index_device
  ON session_index(device_id, run_location);
CREATE INDEX IF NOT EXISTS idx_session_index_updated_at
  ON session_index(updated_at DESC);
`,
  },
  {
    version: 3,
    name: 'workspace tasks and milestones',
    sql: `
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
`,
  },
  {
    version: 4,
    name: 'automation and background jobs',
    sql: `
CREATE TABLE IF NOT EXISTS background_jobs (
  job_id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL DEFAULT '',
  related_type TEXT NOT NULL DEFAULT '',
  related_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  payload_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,
  run_after INTEGER,
  next_retry_at INTEGER,
  locked_at INTEGER,
  locked_by TEXT,
  completed_at INTEGER,
  notify_on_failure INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_background_jobs_ready
  ON background_jobs(status, run_after, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_background_jobs_active_related
  ON background_jobs(job_type, related_type, related_id)
  WHERE related_type != ''
    AND related_id != ''
    AND status IN ('pending', 'running');
`,
  },
  {
    version: 5,
    name: 'fleeting search and notifications',
    sql: `
CREATE TABLE IF NOT EXISTS fleeting_notes (
  note_id TEXT PRIMARY KEY,
  content TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  analysis_status TEXT NOT NULL DEFAULT 'pending',
  recommendation_type TEXT,
  recommendation_text TEXT,
  draft TEXT,
  requires_input INTEGER NOT NULL DEFAULT 0,
  pi_session_id TEXT,
  pi_session_file TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_fleeting_notes_created_at
  ON fleeting_notes(created_at DESC);
CREATE TABLE IF NOT EXISTS search_index_status (
  target_path TEXT PRIMARY KEY,
  target_type TEXT NOT NULL DEFAULT 'file',
  status TEXT NOT NULL DEFAULT 'pending',
  content_hash TEXT,
  indexed_at INTEGER,
  error TEXT,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_search_index_status_state
  ON search_index_status(status, updated_at);
CREATE TABLE IF NOT EXISTS notification_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL DEFAULT '',
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'unread',
  created_at INTEGER NOT NULL DEFAULT 0,
  read_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_notification_events_status
  ON notification_events(status, created_at DESC);
`,
  },
  {
    version: 6,
    name: 'session attachments',
    sql: `
CREATE TABLE IF NOT EXISTS session_attachments (
  attachment_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  original_name TEXT NOT NULL DEFAULT '',
  stored_name TEXT NOT NULL DEFAULT '',
  stored_path TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_session_attachments_session
  ON session_attachments(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_attachments_sha256
  ON session_attachments(sha256);
`,
  },
  {
    version: 7,
    name: 'clips and project_id for tasks/milestones',
    sql: `
CREATE TABLE IF NOT EXISTS clips (
  clip_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT,
  content TEXT NOT NULL,
  source TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clips_created_at
  ON clips(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspace_milestones_project
  ON workspace_milestones(workspace_path, project_id);
CREATE INDEX IF NOT EXISTS idx_workspace_tasks_project
  ON workspace_tasks(workspace_path, project_id);
`,
  },
  {
    version: 8,
    name: 'fleeting attachments',
    sql: `
CREATE TABLE IF NOT EXISTS fleeting_attachments (
  attachment_id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  original_name TEXT NOT NULL DEFAULT '',
  stored_name TEXT NOT NULL DEFAULT '',
  stored_path TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_fleeting_attachments_note
  ON fleeting_attachments(note_id, created_at DESC);
`,
  },
  {
    version: 9,
    name: 'desktop capture fields (no-op)',
    sql: `
-- capture_type and metadata_json are now in the bootstrap schema.
-- This migration is retained for version tracking but is a no-op.
`,
  },
  {
    version: 10,
    name: 'file processing status',
    sql: `
CREATE TABLE IF NOT EXISTS file_processing_status (
  file_path TEXT PRIMARY KEY,
  workspace_path TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'converting', 'converted', 'indexed', 'convert_failed', 'index_failed')),
  content_hash TEXT,
  converted_at INTEGER,
  indexed_at INTEGER,
  error TEXT,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_file_processing_status_workspace
  ON file_processing_status(workspace_path, status, updated_at);
`,
  },
];
