import { getVersionsPath } from './paths.js';
import { readJsonFile, writeJsonFile } from './fs.js';

export const CURRENT_VERSION = 1;

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
];

interface Versions {
  settings?: number;
  favorites?: number;
}

export const getVersions = async (): Promise<Versions> => {
  const versions = await readJsonFile<Versions>(await getVersionsPath(), {});
  return {
    settings: versions?.settings || 0,
    favorites: versions?.favorites || 0,
  };
};

export const saveVersions = async (versions: Versions): Promise<void> => {
  await writeJsonFile(await getVersionsPath(), versions);
};

export const migrateData = async <T>(type: keyof Versions, data: T): Promise<T> => {
  const versions = await getVersions();
  const currentVersion = versions[type] || 0;

  if (currentVersion >= CURRENT_VERSION) {
    return data;
  }

  let migratedData: unknown = data;
  for (const migration of MIGRATIONS) {
    if (migration.version > currentVersion) {
      migratedData = migration.migrate(migratedData);
    }
  }

  versions[type] = CURRENT_VERSION;
  await saveVersions(versions);

  return migratedData as T;
};
