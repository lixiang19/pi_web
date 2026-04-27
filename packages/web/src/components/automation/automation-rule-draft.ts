import type {
  AutomationRule,
  AutomationRuleInput,
  AutomationSchedule,
  ThinkingLevel,
} from "@/lib/types";
import type { AutomationRuleDraft } from "./types";

export function createAutomationDraft(options?: {
  projectPath?: string;
  rule?: AutomationRule;
}): AutomationRuleDraft {
  if (options?.rule) {
    return ruleToDraft(options.rule);
  }

  return {
    name: "项目晨报",
    enabled: true,
    cwd: options?.projectPath ?? "",
    agent: "",
    model: "",
    thinkingLevel: "medium" as ThinkingLevel,
    scheduleType: "daily",
    time: "09:00",
    weekdays: [1, 2, 3, 4, 5],
    everyMinutes: 60,
    prompt: "",
  };
}

export function automationDraftToInput(
  value: AutomationRuleDraft,
): AutomationRuleInput {
  return {
    name: value.name.trim(),
    enabled: value.enabled,
    cwd: value.cwd,
    agent: value.agent,
    model: value.model,
    thinkingLevel: value.thinkingLevel,
    schedule: draftToSchedule(value),
    prompt: value.prompt.trim(),
  };
}

export function computeAutomationDraftNextRunAt(value: AutomationRuleDraft) {
  return computeNextRunAt(draftToSchedule(value));
}

function ruleToDraft(rule: AutomationRule): AutomationRuleDraft {
  const base = {
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled,
    cwd: rule.cwd,
    agent: rule.agent || "",
    model: rule.model || "",
    thinkingLevel: rule.thinkingLevel || ("medium" as ThinkingLevel),
    prompt: rule.prompt,
  };

  if (rule.schedule.type === "interval") {
    return {
      ...base,
      scheduleType: "interval",
      time: "09:00",
      weekdays: [1, 2, 3, 4, 5],
      everyMinutes: rule.schedule.everyMinutes,
    };
  }

  if (rule.schedule.type === "weekly") {
    return {
      ...base,
      scheduleType: "weekly",
      time: rule.schedule.time,
      weekdays: rule.schedule.weekdays,
      everyMinutes: 60,
    };
  }

  return {
    ...base,
    scheduleType: "daily",
    time: rule.schedule.time,
    weekdays: [1, 2, 3, 4, 5],
    everyMinutes: 60,
  };
}

function draftToSchedule(value: AutomationRuleDraft): AutomationSchedule {
  if (value.scheduleType === "interval") {
    return {
      type: "interval",
      everyMinutes: normalizeMinuteValue(value.everyMinutes),
    };
  }

  if (value.scheduleType === "weekly") {
    return {
      type: "weekly",
      time: value.time,
      weekdays: value.weekdays,
    };
  }

  return {
    type: "daily",
    time: value.time,
  };
}

function normalizeMinuteValue(value: number) {
  if (!Number.isFinite(value) || value < 1) {
    return 1;
  }

  return Math.floor(value);
}

function parseScheduleTime(time: string) {
  const [hourText, minuteText] = time.split(":");
  return {
    hours: Number(hourText),
    minutes: Number(minuteText),
  };
}

function computeNextRunAt(schedule: AutomationSchedule, from = Date.now()) {
  if (schedule.type === "interval") {
    return from + schedule.everyMinutes * 60_000;
  }

  const { hours, minutes } = parseScheduleTime(schedule.time);
  const weekdaySet =
    schedule.type === "weekly" ? new Set(schedule.weekdays) : null;

  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = new Date(from);
    candidate.setDate(candidate.getDate() + offset);
    candidate.setHours(hours, minutes, 0, 0);

    if (
      candidate.getTime() > from &&
      (!weekdaySet || weekdaySet.has(candidate.getDay()))
    ) {
      return candidate.getTime();
    }
  }

  return from;
}
