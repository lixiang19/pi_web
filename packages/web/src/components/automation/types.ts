import type { ThinkingLevel } from "@/lib/types";

export type AutomationScheduleType = "daily" | "weekly" | "interval";

export interface AutomationRuleDraft {
  id?: string;
  name: string;
  enabled: boolean;
  cwd: string;
  agent: string;
  model: string;
  thinkingLevel: ThinkingLevel;
  scheduleType: AutomationScheduleType;
  time: string;
  weekdays: number[];
  everyMinutes: number;
  prompt: string;
}

export interface AutomationOption {
  label: string;
  value: string;
}
