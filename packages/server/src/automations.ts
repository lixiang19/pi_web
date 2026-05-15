import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

import type {
  AutomationRun,
  AutomationRunStatus,
  AutomationRule,
  AutomationRuleInput,
  AutomationSchedule,
} from '@pi/protocol';
import type { ThinkingLevel } from './types/index.js';

type RidgeDatabase = InstanceType<typeof Database>;

interface AutomationRuleRow {
  automation_id: string;
  name: string;
  enabled: number;
  scope: string | null;
  project_id: string | null;
  project_name?: string | null;
  cwd: string;
  agent_name: string | null;
  explicit_model: string | null;
  explicit_thinking_level: string | null;
  schedule_json: string;
  prompt: string;
  next_run_at: number | null;
  created_at: number;
  updated_at: number;
}

interface AutomationRunRow {
  run_id: string;
  automation_id: string;
  status: AutomationRunStatus;
  reason: string | null;
  session_id: string | null;
  created_at: number;
}

interface AutomationProjectRow {
  project_id: string;
  name: string;
  path: string;
  project_type: string;
  device_id: string | null;
  archived_at: number | null;
  device_status: string | null;
}

type AutomationRulePatch = Partial<
  Omit<AutomationRuleInput, 'agent' | 'model' | 'thinkingLevel'>
> & {
  agent?: string | null;
  model?: string | null;
  thinkingLevel?: ThinkingLevel | null;
};

const MAX_TIMER_DELAY_MS = 86_400_000;
const RECENT_RUN_LIMIT = 50;

export type AutomationReadyExecutionTarget = {
  status: 'ready';
  cwd: string;
  projectId?: string;
  projectName?: string;
  deviceId?: string;
  runLocation: 'server' | 'desktop';
};

export type AutomationExecutionTarget =
  | AutomationReadyExecutionTarget
  | {
      status: 'skipped';
      reason: string;
      projectId?: string;
      projectName?: string;
      deviceId?: string;
    }
  | {
      status: 'failed';
      reason: string;
      projectId?: string;
      projectName?: string;
      deviceId?: string;
    };

export class AutomationSkippedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AutomationSkippedError';
  }
}

const toRule = (row: AutomationRuleRow): AutomationRule => ({
  id: row.automation_id,
  name: row.name,
  enabled: row.enabled === 1,
  scope: row.scope === 'project' ? 'project' : 'workspace',
  projectId: row.project_id || undefined,
  projectName: row.project_name || undefined,
  cwd: row.cwd,
  agent: row.agent_name || undefined,
  model: row.explicit_model || undefined,
  thinkingLevel: (row.explicit_thinking_level || undefined) as
    | ThinkingLevel
    | undefined,
  schedule: JSON.parse(row.schedule_json) as AutomationSchedule,
  prompt: row.prompt,
  nextRunAt: row.next_run_at || undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toRun = (row: AutomationRunRow): AutomationRun => ({
  id: row.run_id,
  automationId: row.automation_id,
  status: row.status,
  reason: row.reason || undefined,
  sessionId: row.session_id || undefined,
  createdAt: row.created_at,
});

const parseScheduleTime = (time: string) => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match?.[1] || !match[2]) {
    throw new Error(`定时格式非法: ${time}`);
  }

  return {
    hours: Number(match[1]),
    minutes: Number(match[2]),
  };
};

const nextDailyRunAt = (time: string, from: number) => {
  const { hours, minutes } = parseScheduleTime(time);
  const next = new Date(from);
  next.setHours(hours, minutes, 0, 0);

  if (next.getTime() <= from) {
    next.setDate(next.getDate() + 1);
  }

  return next.getTime();
};

const nextWeeklyRunAt = (schedule: Extract<AutomationSchedule, { type: 'weekly' }>, from: number) => {
  if (schedule.weekdays.length === 0) {
    throw new Error('每周定时至少需要选择一天');
  }

  const { hours, minutes } = parseScheduleTime(schedule.time);
  const enabledWeekdays = new Set(schedule.weekdays);
  let candidate: number | null = null;

  for (let offset = 0; offset < 7; offset += 1) {
    const next = new Date(from);
    next.setDate(next.getDate() + offset);
    next.setHours(hours, minutes, 0, 0);

    if (!enabledWeekdays.has(next.getDay()) || next.getTime() <= from) {
      continue;
    }

    candidate = next.getTime();
    break;
  }

  if (candidate !== null) {
    return candidate;
  }

  const firstWeekday = [...enabledWeekdays].sort((left, right) => left - right)[0];
  if (firstWeekday === undefined) {
    throw new Error('每周定时至少需要选择一天');
  }

  const next = new Date(from);
  const dayOffset = (firstWeekday - next.getDay() + 7) % 7 || 7;
  next.setDate(next.getDate() + dayOffset);
  next.setHours(hours, minutes, 0, 0);
  return next.getTime();
};

export const computeAutomationNextRunAt = (
  schedule: AutomationSchedule,
  from = Date.now(),
) => {
  if (schedule.type === 'interval') {
    return from + schedule.everyMinutes * 60_000;
  }

  if (schedule.type === 'daily') {
    return nextDailyRunAt(schedule.time, from);
  }

  return nextWeeklyRunAt(schedule, from);
};

export function createAutomationStore(db: RidgeDatabase) {
  const listRows = db.prepare(
    `SELECT ar.*, p.name AS project_name
       FROM automation_rules ar
       LEFT JOIN projects p ON p.project_id = ar.project_id
      ORDER BY ar.updated_at DESC`,
  );
  const listDueRows = db.prepare(
    `SELECT ar.*, p.name AS project_name
       FROM automation_rules ar
       LEFT JOIN projects p ON p.project_id = ar.project_id
      WHERE ar.enabled = 1 AND ar.next_run_at IS NOT NULL AND ar.next_run_at <= ?
      ORDER BY ar.next_run_at ASC`,
  );
  const getRow = db.prepare(
    `SELECT ar.*, p.name AS project_name
       FROM automation_rules ar
       LEFT JOIN projects p ON p.project_id = ar.project_id
      WHERE ar.automation_id = ?`,
  );
  const insertRow = db.prepare(
    `INSERT INTO automation_rules(
      automation_id,
      name,
      enabled,
      scope,
      project_id,
      cwd,
      agent_name,
      explicit_model,
      explicit_thinking_level,
      schedule_json,
      prompt,
      next_run_at,
      created_at,
      updated_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateRow = db.prepare(
    `UPDATE automation_rules SET
      name = ?,
      enabled = ?,
      scope = ?,
      project_id = ?,
      cwd = ?,
      agent_name = ?,
      explicit_model = ?,
      explicit_thinking_level = ?,
      schedule_json = ?,
      prompt = ?,
      next_run_at = ?,
      updated_at = ?
     WHERE automation_id = ?`,
  );
  const deleteRow = db.prepare(
    `DELETE FROM automation_rules WHERE automation_id = ?`,
  );
  const updateNextRunRow = db.prepare(
    `UPDATE automation_rules
     SET next_run_at = ?, updated_at = ?
     WHERE automation_id = ?`,
  );
  const listRunsRow = db.prepare(
    `SELECT * FROM automation_runs
     WHERE (? IS NULL OR automation_id = ?)
     ORDER BY created_at DESC
     LIMIT ?`,
  );
  const insertRunRow = db.prepare(
    `INSERT INTO automation_runs(
      run_id,
      automation_id,
      status,
      reason,
      session_id,
      created_at
    ) VALUES(?, ?, ?, ?, ?, ?)`,
  );
  const getProjectRow = db.prepare(
    `SELECT p.project_id,
            p.name,
            p.path,
            p.project_type,
            p.device_id,
            p.archived_at,
            COALESCE(d.status, CASE WHEN p.device_id IS NULL THEN 'online' ELSE 'offline' END) AS device_status
       FROM projects p
       LEFT JOIN devices d ON d.device_id = p.device_id
      WHERE p.project_id = ?`,
  );
  const insertNotificationRow = db.prepare(
    `INSERT INTO notification_events(
      event_id,
      event_type,
      source,
      severity,
      title,
      body,
      related_type,
      related_id,
      actions_json,
      payload_json,
      status,
      created_at,
      updated_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const listRules = () =>
    (listRows.all() as AutomationRuleRow[]).map(toRule);

  const listDueRules = (now: number) =>
    (listDueRows.all(now) as AutomationRuleRow[]).map(toRule);

  const getRule = (id: string) => {
    const row = getRow.get(id) as AutomationRuleRow | undefined;
    return row ? toRule(row) : null;
  };

  const getProject = (projectId: string) =>
    getProjectRow.get(projectId) as AutomationProjectRow | undefined;

  const saveRule = (id: string, input: AutomationRuleInput) => {
    const now = Date.now();
    const existing = getRule(id);
    const createdAt = existing?.createdAt ?? now;
    const scope = input.scope === 'project' ? 'project' : 'workspace';
    const projectId = scope === 'project' ? input.projectId || null : null;
    const nextRunAt = input.enabled
      ? computeAutomationNextRunAt(input.schedule, now)
      : null;

    if (existing) {
      updateRow.run(
        input.name,
        input.enabled ? 1 : 0,
        scope,
        projectId,
        input.cwd,
        input.agent || null,
        input.model || null,
        input.thinkingLevel || null,
        JSON.stringify(input.schedule),
        input.prompt,
        nextRunAt,
        now,
        id,
      );
    } else {
      insertRow.run(
        id,
        input.name,
        input.enabled ? 1 : 0,
        scope,
        projectId,
        input.cwd,
        input.agent || null,
        input.model || null,
        input.thinkingLevel || null,
        JSON.stringify(input.schedule),
        input.prompt,
        nextRunAt,
        createdAt,
        now,
      );
    }

    return getRule(id);
  };

  const createRule = (input: AutomationRuleInput) =>
    saveRule(randomUUID(), input);

  const updateRule = (id: string, patch: AutomationRulePatch) => {
    const current = getRule(id);
    if (!current) {
      return null;
    }

    return saveRule(id, {
      name: patch.name ?? current.name,
      enabled: patch.enabled ?? current.enabled,
      scope: patch.scope ?? current.scope,
      projectId:
        patch.projectId === undefined ? current.projectId : patch.projectId,
      cwd: patch.cwd ?? current.cwd,
      agent: patch.agent === null ? undefined : patch.agent ?? current.agent,
      model: patch.model === null ? undefined : patch.model ?? current.model,
      thinkingLevel:
        patch.thinkingLevel === null
          ? undefined
          : patch.thinkingLevel ?? current.thinkingLevel,
      schedule: patch.schedule ?? current.schedule,
      prompt: patch.prompt ?? current.prompt,
    });
  };

  const removeRule = (id: string) => {
    const rule = getRule(id);
    if (!rule) {
      return false;
    }

    deleteRow.run(id);
    return true;
  };

  const updateNextRunAt = (id: string, nextRunAt: number | null) => {
    updateNextRunRow.run(nextRunAt, Date.now(), id);
  };

  const listRuns = (automationId?: string, limit = RECENT_RUN_LIMIT) =>
    (listRunsRow.all(automationId ?? null, automationId ?? null, limit) as AutomationRunRow[])
      .map(toRun);

  const createRun = (input: {
    automationId: string;
    status: AutomationRunStatus;
    reason?: string;
    sessionId?: string;
  }) => {
    const runId = randomUUID();
    const now = Date.now();
    insertRunRow.run(
      runId,
      input.automationId,
      input.status,
      input.reason || null,
      input.sessionId || null,
      now,
    );
    return toRun({
      run_id: runId,
      automation_id: input.automationId,
      status: input.status,
      reason: input.reason || null,
      session_id: input.sessionId || null,
      created_at: now,
    });
  };

  const resolveExecutionTarget = (rule: AutomationRule): AutomationExecutionTarget => {
    if (rule.scope === 'workspace') {
      return { status: 'ready', cwd: rule.cwd, runLocation: 'server' };
    }

    if (!rule.projectId) {
      return {
        status: 'failed',
        reason: '项目自动化缺少绑定项目',
      };
    }

    const project = getProject(rule.projectId);
    if (!project) {
      return {
        status: 'failed',
        reason: '项目自动化绑定的项目不存在',
        projectId: rule.projectId,
      };
    }

    const projectInfo = {
      projectId: project.project_id,
      projectName: project.name,
      deviceId: project.device_id || undefined,
    };

    if (project.archived_at) {
      return {
        status: 'skipped',
        reason: '项目已归档，已跳过本次自动化',
        ...projectInfo,
      };
    }

    if (project.project_type !== 'external') {
      return {
        status: 'failed',
        reason: '项目自动化只能绑定外部仓库项目',
        ...projectInfo,
      };
    }

    if (project.device_id && project.device_id !== 'server') {
      if (project.device_status !== 'online') {
        return {
          status: 'skipped',
          reason: '项目设备离线，已跳过本次自动化',
          ...projectInfo,
        };
      }
      return {
        status: 'ready',
        cwd: project.path,
        runLocation: 'desktop',
        ...projectInfo,
      };
    }

    return {
      status: 'ready',
      cwd: project.path,
      runLocation: 'server',
      ...projectInfo,
    };
  };

  const createRunNotification = (rule: AutomationRule, run: AutomationRun) => {
    if (run.status === 'success') {
      return;
    }

    const now = Date.now();
    const isSkipped = run.status === 'skipped';
    const eventType = isSkipped ? 'automation.skipped' : 'automation.failed';
    const severity = isSkipped ? 'warning' : 'error';
    const body = run.reason || (isSkipped ? '自动化本次触发已跳过' : '自动化运行失败');
    insertNotificationRow.run(
      randomUUID(),
      eventType,
      'automation',
      severity,
      isSkipped ? `自动化已跳过：${rule.name}` : `自动化失败：${rule.name}`,
      body,
      'automation',
      rule.id,
      JSON.stringify([
        { id: 'open_related', label: '打开自动化' },
        { id: 'retry', label: '重试' },
      ]),
      JSON.stringify({
        automationId: rule.id,
        automationRunId: run.id,
        reason: run.reason,
        status: run.status,
      }),
      'unread',
      now,
      now,
    );
  };

  return {
    createRun,
    createRule,
    createRunNotification,
    getProject,
    getRule,
    listDueRules,
    listRuns,
    listRules,
    removeRule,
    resolveExecutionTarget,
    updateNextRunAt,
    updateRule,
  };
}

export type AutomationStore = ReturnType<typeof createAutomationStore>;

export function createAutomationScheduler(options: {
  store: AutomationStore;
  dispatchRule: (rule: AutomationRule) => Promise<{ sessionId?: string }>;
}) {
  let timer: NodeJS.Timeout | null = null;

  function stop() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function scheduleNextTick() {
    stop();
    const enabledRules = options.store
      .listRules()
      .filter((rule) => rule.enabled && rule.nextRunAt);
    const nextRunAt = Math.min(
      ...enabledRules.map((rule) => rule.nextRunAt as number),
    );

    if (!Number.isFinite(nextRunAt)) {
      return;
    }

    const delay = Math.min(
      Math.max(nextRunAt - Date.now(), 0),
      MAX_TIMER_DELAY_MS,
    );
    timer = setTimeout(() => {
      void tick();
    }, delay);
  }

  async function tick() {
    const dueRules = options.store.listDueRules(Date.now());
    for (const rule of dueRules) {
      try {
        const result = await options.dispatchRule(rule);
        options.store.createRun({
          automationId: rule.id,
          status: 'success',
          sessionId: result.sessionId,
        });
      } catch (error) {
        const status = error instanceof AutomationSkippedError ? 'skipped' : 'failed';
        const run = options.store.createRun({
          automationId: rule.id,
          status,
          reason: error instanceof Error ? error.message : String(error),
        });
        options.store.createRunNotification(rule, run);
      } finally {
        options.store.updateNextRunAt(
          rule.id,
          computeAutomationNextRunAt(rule.schedule),
        );
      }
    }

    scheduleNextTick();
  }

  return {
    reschedule: scheduleNextTick,
    start: scheduleNextTick,
    stop,
  };
}
