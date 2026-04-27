import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

import type {
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

type AutomationRulePatch = Partial<
  Omit<AutomationRuleInput, 'agent' | 'model' | 'thinkingLevel'>
> & {
  agent?: string | null;
  model?: string | null;
  thinkingLevel?: ThinkingLevel | null;
};

const MAX_TIMER_DELAY_MS = 86_400_000;

const toRule = (row: AutomationRuleRow): AutomationRule => ({
  id: row.automation_id,
  name: row.name,
  enabled: row.enabled === 1,
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
    `SELECT * FROM automation_rules ORDER BY updated_at DESC`,
  );
  const listDueRows = db.prepare(
    `SELECT * FROM automation_rules
     WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?
     ORDER BY next_run_at ASC`,
  );
  const getRow = db.prepare(
    `SELECT * FROM automation_rules WHERE automation_id = ?`,
  );
  const insertRow = db.prepare(
    `INSERT INTO automation_rules(
      automation_id,
      name,
      enabled,
      cwd,
      agent_name,
      explicit_model,
      explicit_thinking_level,
      schedule_json,
      prompt,
      next_run_at,
      created_at,
      updated_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateRow = db.prepare(
    `UPDATE automation_rules SET
      name = ?,
      enabled = ?,
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

  const listRules = () =>
    (listRows.all() as AutomationRuleRow[]).map(toRule);

  const listDueRules = (now: number) =>
    (listDueRows.all(now) as AutomationRuleRow[]).map(toRule);

  const getRule = (id: string) => {
    const row = getRow.get(id) as AutomationRuleRow | undefined;
    return row ? toRule(row) : null;
  };

  const saveRule = (id: string, input: AutomationRuleInput) => {
    const now = Date.now();
    const existing = getRule(id);
    const createdAt = existing?.createdAt ?? now;
    const nextRunAt = input.enabled
      ? computeAutomationNextRunAt(input.schedule, now)
      : null;

    if (existing) {
      updateRow.run(
        input.name,
        input.enabled ? 1 : 0,
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

  return {
    createRule,
    getRule,
    listDueRules,
    listRules,
    removeRule,
    updateNextRunAt,
    updateRule,
  };
}

export type AutomationStore = ReturnType<typeof createAutomationStore>;

export function createAutomationScheduler(options: {
  store: AutomationStore;
  dispatchRule: (rule: AutomationRule) => Promise<void>;
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
        await options.dispatchRule(rule);
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
