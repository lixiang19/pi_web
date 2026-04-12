import type { RidgeSettings } from '../types/index.js';

export const CURRENT_VERSION = 2;

interface Migration {
  version: number;
  description: string;
  migrate: (data: unknown) => unknown;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Initial schema',
    migrate: (data) => data,
  },
  {
    version: 2,
    description: 'Unified ridge-settings with composer defaults',
    migrate: (data) => data,
  },
];

export const migrateRidgeSettings = (data: RidgeSettings): RidgeSettings => {
  const currentVersion = data.version || 0;
  if (currentVersion >= CURRENT_VERSION) {
    return data;
  }

  let migratedData: unknown = { ...data };
  for (const migration of MIGRATIONS) {
    if (migration.version > currentVersion) {
      migratedData = migration.migrate(migratedData);
    }
  }

  (migratedData as RidgeSettings).version = CURRENT_VERSION;
  return migratedData as RidgeSettings;
};
