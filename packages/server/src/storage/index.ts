import crypto from 'node:crypto';
import path from 'node:path';
import { getRidgeSettingsPath } from '../utils/paths.js';
import { readJsonFile, writeJsonFile } from '../utils/fs.js';
import { createFileLock } from '../utils/lock.js';
import { migrateRidgeSettings } from '../utils/migrations.js';
import type { RidgeSettings, Settings, FavoriteItem, FavoritesState, Project, ProjectsState } from '../types/index.js';

const settingsLock = createFileLock();

const DEFAULT_RIDGE_SETTINGS: RidgeSettings = {
  version: 2,
  theme: 'system',
  themeName: 'default',
  language: 'zh-CN',
  sidebarCollapsed: false,
  notifications: true,
  defaultModel: '',
  defaultAgent: '',
  defaultThinkingLevel: 'medium',
  projects: [],
  favorites: [],
};

// 白名单字段定义 - 只允许这些字段被设置
const ALLOWED_SETTINGS_FIELDS = Object.keys(DEFAULT_RIDGE_SETTINGS) as (keyof RidgeSettings)[];

// 安全合并对象 - 防止原型污染
const safeMerge = (target: RidgeSettings, source: Partial<RidgeSettings>): RidgeSettings => {
  const result: RidgeSettings = { ...target };
  for (const key of Object.keys(source) as (keyof RidgeSettings)[]) {
    // 只合并白名单字段，且跳过危险属性
    if (ALLOWED_SETTINGS_FIELDS.includes(key) && !key.startsWith('__')) {
      const value = source[key];
      if (value !== undefined) {
        // Type-safe assignment
        (result as Record<keyof RidgeSettings, unknown>)[key] = value;
      }
    }
  }
  return result;
};

const normalizeProjectPath = (projectPath: string): string =>
  path.resolve(typeof projectPath === 'string' ? projectPath.trim() : '');

const createProjectRecord = (projectPath: string): Project => ({
  id: crypto.createHash('md5').update(projectPath).digest('hex').slice(0, 8),
  name: path.basename(projectPath),
  path: projectPath,
  addedAt: Date.now(),
});

// ============================================================================
// Core: Read / Write unified ridge-settings.json
// ============================================================================

const loadRidgeSettings = async (): Promise<RidgeSettings> => {
  const filePath = await getRidgeSettingsPath();

  return settingsLock.withLock('settings', async () => {
    const data = await readJsonFile<RidgeSettings>(filePath, DEFAULT_RIDGE_SETTINGS);
    const migrated = migrateRidgeSettings({ ...DEFAULT_RIDGE_SETTINGS, ...data });

    if (JSON.stringify(data) !== JSON.stringify(migrated)) {
      await writeJsonFile(filePath, migrated);
    }

    return migrated ?? DEFAULT_RIDGE_SETTINGS;
  });
};

const saveRidgeSettings = async (settings: RidgeSettings): Promise<void> => {
  const filePath = await getRidgeSettingsPath();

  return settingsLock.withLock('settings', async () => {
    await writeJsonFile(filePath, settings);
  });
};

// ============================================================================
// Settings API (backward compatible)
// ============================================================================

export const getSettings = async (): Promise<Settings> => {
  const ridge = await loadRidgeSettings();
  // Return only the Settings portion (omit version, projects, favorites)
  const { version: _v, projects: _p, favorites: _f, ...settings } = ridge;
  void _v; void _p; void _f;
  return settings;
};

export const setSettings = async (settings: Partial<Settings>): Promise<Settings> => {
  const current = await loadRidgeSettings();
  const merged = safeMerge(current, settings as Partial<RidgeSettings>);
  await saveRidgeSettings(merged);
  const { version: _v, projects: _p, favorites: _f, ...result } = merged;
  void _v; void _p; void _f;
  return result;
};

// ============================================================================
// Favorites API (backward compatible)
// ============================================================================

export const getFavorites = async (): Promise<FavoritesState> => {
  const ridge = await loadRidgeSettings();
  return { items: ridge.favorites };
};

export const setFavorites = async (favorites: FavoritesState): Promise<FavoritesState> => {
  const current = await loadRidgeSettings();
  const updated: RidgeSettings = { ...current, favorites: favorites.items };
  await saveRidgeSettings(updated);
  return { items: updated.favorites };
};

export const addFavorite = async (item: Omit<FavoriteItem, 'createdAt'>): Promise<FavoritesState> => {
  const current = await loadRidgeSettings();

  const exists = current.favorites.some((i) => i.id === item.id);
  if (exists) {
    return { items: current.favorites };
  }

  const updated: RidgeSettings = {
    ...current,
    favorites: [...current.favorites, { ...item, createdAt: Date.now() }],
  };
  await saveRidgeSettings(updated);
  return { items: updated.favorites };
};

export const removeFavorite = async (id: string): Promise<FavoritesState> => {
  const current = await loadRidgeSettings();

  const updated: RidgeSettings = {
    ...current,
    favorites: current.favorites.filter((i) => i.id !== id),
  };
  await saveRidgeSettings(updated);
  return { items: updated.favorites };
};

// ============================================================================
// Projects API (backward compatible)
// ============================================================================

export const getProjects = async (): Promise<ProjectsState> => {
  const ridge = await loadRidgeSettings();
  return { version: ridge.version, projects: ridge.projects };
};

export const addProject = async (projectPath: string): Promise<Project> => {
  const normalizedPath = normalizeProjectPath(projectPath);

  const current = await loadRidgeSettings();
  const existing = current.projects.find(
    (item) => normalizeProjectPath(item.path) === normalizedPath,
  );

  if (existing) {
    return existing;
  }

  const nextProject = createProjectRecord(normalizedPath);
  const updated: RidgeSettings = {
    ...current,
    projects: [...current.projects, nextProject],
  };
  await saveRidgeSettings(updated);
  return nextProject;
};

export const removeProject = async (id: string): Promise<ProjectsState> => {
  const current = await loadRidgeSettings();

  const updated: RidgeSettings = {
    ...current,
    projects: current.projects.filter((item) => item.id !== id),
  };
  await saveRidgeSettings(updated);
  return { version: updated.version, projects: updated.projects };
};
