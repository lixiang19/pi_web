import crypto from 'node:crypto';
import path from 'node:path';
import { getRidgeDb } from '../db/index.js';
import {
  SETTINGS_KEYS,
  type FavoriteItem,
  type FavoritesState,
  type Project,
  type ProjectsState,
  type Settings,
} from '../types/index.js';

const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  themeName: 'default',
  language: 'zh-CN',
  sidebarCollapsed: false,
  notifications: true,
  defaultModel: '',
  defaultAgent: '',
  defaultThinkingLevel: 'medium',
};

const normalizeProjectPath = (projectPath: string): string =>
  path.resolve(typeof projectPath === 'string' ? projectPath.trim() : '');

const createProjectRecord = (projectPath: string, isGit: boolean): Project => ({
  id: crypto.createHash('md5').update(projectPath).digest('hex').slice(0, 8),
  name: path.basename(projectPath),
  path: projectPath,
  addedAt: Date.now(),
  isGit,
});

const readSettingsMap = async () => {
  const db = await getRidgeDb();
  const rows = db
    .prepare('SELECT key, value_json FROM app_settings')
    .all() as Array<{ key: keyof Settings; value_json: string }>;

  const settings = {} as Partial<Settings>;
  for (const row of rows) {
    if (!SETTINGS_KEYS.includes(row.key)) {
      continue;
    }

    try {
      (settings as Record<keyof Settings, Settings[keyof Settings] | undefined>)[row.key] =
        JSON.parse(row.value_json) as Settings[keyof Settings];
    } catch {
      // Ignore invalid persisted values and fall back to defaults.
    }
  }
  return settings;
};

const mapProjectRow = (row: {
  project_id: string;
  name: string;
  path: string;
  added_at: number;
  is_git: number;
}): Project => ({
  id: row.project_id,
  name: row.name,
  path: row.path,
  addedAt: row.added_at,
  isGit: Boolean(row.is_git),
});

const mapFavoriteRow = (row: {
  favorite_id: string;
  name: string;
  type: string;
  data_json: string | null;
  created_at: number;
}): FavoriteItem => ({
  id: row.favorite_id,
  name: row.name,
  type: row.type,
  data: row.data_json ? (JSON.parse(row.data_json) as unknown) : undefined,
  createdAt: row.created_at,
});

export const getSettings = async (): Promise<Settings> => {
  const persisted = await readSettingsMap();
  return { ...DEFAULT_SETTINGS, ...persisted };
};

export const setSettings = async (settings: Partial<Settings>): Promise<Settings> => {
  const current = await getSettings();
  const merged = {
    ...current,
    ...settings,
  } satisfies Settings;
  const db = await getRidgeDb();
  const upsert = db.prepare(
    `INSERT INTO app_settings(key, value_json, updated_at)
     VALUES(?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value_json = excluded.value_json,
       updated_at = excluded.updated_at`,
  );
  const now = Date.now();

  db.transaction(() => {
    for (const key of SETTINGS_KEYS) {
      const value = merged[key];
      if (value === undefined) {
        continue;
      }
      // Skip write if value hasn't changed
      if (current[key] === value) {
        continue;
      }
      upsert.run(key, JSON.stringify(value), now);
    }
  })();
  return merged;
};

export const getFavorites = async (): Promise<FavoritesState> => {
  const db = await getRidgeDb();
  const rows = db
    .prepare(
      `SELECT favorite_id, name, type, data_json, created_at
       FROM favorites
       ORDER BY created_at DESC`,
    )
    .all() as Array<{
      favorite_id: string;
      name: string;
      type: string;
      data_json: string | null;
      created_at: number;
    }>;

  return { items: rows.map(mapFavoriteRow) };
};

export const setFavorites = async (favorites: FavoritesState): Promise<FavoritesState> => {
  const db = await getRidgeDb();
  const insert = db.prepare(
    `INSERT INTO favorites(favorite_id, name, type, data_json, created_at)
     VALUES(?, ?, ?, ?, ?)`,
  );
  db.transaction(() => {
    db.prepare('DELETE FROM favorites').run();
    for (const item of favorites.items) {
      insert.run(
        item.id,
        item.name,
        item.type,
        item.data === undefined ? null : JSON.stringify(item.data),
        item.createdAt || Date.now(),
      );
    }
  })();

  return getFavorites();
};

export const addFavorite = async (
  item: Omit<FavoriteItem, 'createdAt'>,
): Promise<FavoritesState> => {
  const db = await getRidgeDb();
  const existing = db
    .prepare('SELECT favorite_id FROM favorites WHERE favorite_id = ?')
    .get(item.id) as { favorite_id: string } | undefined;
  if (!existing) {
    db.prepare(
      `INSERT INTO favorites(favorite_id, name, type, data_json, created_at)
       VALUES(?, ?, ?, ?, ?)`,
    ).run(
      item.id,
      item.name,
      item.type,
      item.data === undefined ? null : JSON.stringify(item.data),
      Date.now(),
    );
  }

  return getFavorites();
};

export const removeFavorite = async (id: string): Promise<FavoritesState> => {
  const db = await getRidgeDb();
  db.prepare('DELETE FROM favorites WHERE favorite_id = ?').run(id);
  return getFavorites();
};

export const getProjects = async (): Promise<ProjectsState> => {
  const db = await getRidgeDb();
  const rows = db
    .prepare(
      `SELECT project_id, name, path, is_git, added_at
       FROM projects
       ORDER BY added_at DESC`,
    )
    .all() as Array<{
      project_id: string;
      name: string;
      path: string;
      is_git: number;
      added_at: number;
    }>;

  return {
    version: 1,
    projects: rows.map(mapProjectRow),
  };
};

export const addProject = async (
  projectPath: string,
  isGit: boolean,
): Promise<Project> => {
  const normalizedPath = normalizeProjectPath(projectPath);
  const db = await getRidgeDb();
  const existing = db
    .prepare(
      `SELECT project_id, name, path, is_git, added_at
       FROM projects
       WHERE path = ?`,
    )
    .get(normalizedPath) as
    | {
        project_id: string;
        name: string;
        path: string;
        is_git: number;
        added_at: number;
      }
    | undefined;

  if (existing) {
    return mapProjectRow(existing);
  }

  const nextProject = createProjectRecord(normalizedPath, isGit);
  db.prepare(
    `INSERT INTO projects(project_id, name, path, is_git, added_at)
     VALUES(?, ?, ?, ?, ?)`,
  ).run(
    nextProject.id,
    nextProject.name,
    nextProject.path,
    nextProject.isGit ? 1 : 0,
    nextProject.addedAt,
  );

  return nextProject;
};

export const removeProject = async (id: string): Promise<ProjectsState> => {
  const db = await getRidgeDb();
  db.prepare('DELETE FROM projects WHERE project_id = ?').run(id);
  return getProjects();
};
