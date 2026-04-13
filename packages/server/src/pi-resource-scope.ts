import os from 'node:os';
import path from 'node:path';

import { SettingsManager } from '@mariozechner/pi-coding-agent';

const truthyEnvValues = new Set(['1', 'true', 'yes', 'on']);

const normalizeEnvFlag = (value: string | undefined): boolean =>
  truthyEnvValues.has((value || '').trim().toLowerCase());

const getIsolatedAgentDir = (): string =>
  path.join(os.tmpdir(), 'ridge-pi-resource-isolation', 'agent');

const getScopedAgentDir = (): string | undefined =>
  isPiResourceIsolationEnabled() ? getIsolatedAgentDir() : undefined;

export const isPiResourceIsolationEnabled = (): boolean =>
  normalizeEnvFlag(process.env.RIDGE_PI_ISOLATED);

export const createPiAgentScopeSettingsManager = (cwd: string): SettingsManager =>
  SettingsManager.create(cwd, getScopedAgentDir());
