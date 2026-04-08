import crypto from 'node:crypto';
import path from 'node:path';
import {
  getSettingsPath,
  getFavoritesPath,
  getProjectsPath,
} from '../utils/paths.js';
import { readJsonFile, writeJsonFile } from '../utils/fs.js';
import { createFileLock } from '../utils/lock.js';
import { migrateData } from '../utils/migrations.js';
import type { Settings, FavoritesState, ProjectsState, Project, FavoriteItem } from '../types/index.js';

const settingsLock = createFileLock();
const favoritesLock = createFileLock();
const projectsLock = createFileLock();

const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  language: 'zh-CN',
  sidebarCollapsed: false,
  notifications: true,
};

// 白名单字段定义 - 只允许这些字段被设置
const ALLOWED_SETTINGS_FIELDS = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];

// 安全合并对象 - 防止原型污染
const safeMerge = (target: Settings, source: Partial<Settings>): Settings => {
  const result: Settings = { ...target };
  for (const key of Object.keys(source) as (keyof Settings)[]) {
    // 只合并白名单字段，且跳过危险属性
    if (ALLOWED_SETTINGS_FIELDS.includes(key) && !key.startsWith('__')) {
      const value = source[key];
      if (value !== undefined) {
        // Type-safe assignment
        (result as Record<keyof Settings, unknown>)[key] = value;
      }
    }
  }
  return result;
};

const DEFAULT_FAVORITES: FavoritesState = {
  items: [],
};

const DEFAULT_PROJECTS: ProjectsState = {
  version: 1,
  projects: [],
};

const normalizeProjectPath = (projectPath: string): string =>
  path.resolve(typeof projectPath === 'string' ? projectPath.trim() : '');

const createProjectRecord = (projectPath: string): Project => ({
  id: crypto.createHash('md5').update(projectPath).digest('hex').slice(0, 8),
  name: path.basename(projectPath),
  path: projectPath,
  addedAt: Date.now(),
});

export const getSettings = async (): Promise<Settings> => {
  const filePath = await getSettingsPath();

  return settingsLock.withLock('settings', async () => {
    const data = await readJsonFile<Settings>(filePath, DEFAULT_SETTINGS);
    const migrated = await migrateData('settings', data);

    if (JSON.stringify(data) !== JSON.stringify(migrated)) {
      await writeJsonFile(filePath, migrated);
    }

    return migrated ?? DEFAULT_SETTINGS;
  });
};

export const setSettings = async (settings: Partial<Settings>): Promise<Settings> => {
  const filePath = await getSettingsPath();

  return settingsLock.withLock('settings', async () => {
    const current = await readJsonFile<Settings>(filePath, DEFAULT_SETTINGS);
    // 使用安全合并防止原型污染，并只合并白名单字段
    const merged = safeMerge(current ?? DEFAULT_SETTINGS, settings);
    await writeJsonFile(filePath, merged);
    return merged;
  });
};

export const getFavorites = async (): Promise<FavoritesState> => {
  const filePath = await getFavoritesPath();

  return favoritesLock.withLock('favorites', async () => {
    const data = await readJsonFile<FavoritesState>(filePath, DEFAULT_FAVORITES);
    const migrated = await migrateData('favorites', data);

    if (JSON.stringify(data) !== JSON.stringify(migrated)) {
      await writeJsonFile(filePath, migrated);
    }

    return migrated ?? DEFAULT_FAVORITES;
  });
};

export const setFavorites = async (favorites: FavoritesState): Promise<FavoritesState> => {
  const filePath = await getFavoritesPath();

  return favoritesLock.withLock('favorites', async () => {
    await writeJsonFile(filePath, favorites);
    return favorites;
  });
};

export const addFavorite = async (item: Omit<FavoriteItem, 'createdAt'>): Promise<FavoritesState> => {
  const filePath = await getFavoritesPath();

  return favoritesLock.withLock('favorites', async () => {
    const current = await readJsonFile<FavoritesState>(filePath, DEFAULT_FAVORITES);
    const items = current?.items || [];

    const exists = items.some((i) => i.id === item.id);
    if (exists) {
      return current ?? DEFAULT_FAVORITES;
    }

    const updated: FavoritesState = {
      ...current,
      items: [...items, { ...item, createdAt: Date.now() }],
    };

    await writeJsonFile(filePath, updated);
    return updated;
  });
};

export const removeFavorite = async (id: string): Promise<FavoritesState> => {
  const filePath = await getFavoritesPath();

  return favoritesLock.withLock('favorites', async () => {
    const current = await readJsonFile<FavoritesState>(filePath, DEFAULT_FAVORITES);
    const items = current?.items || [];

    const updated: FavoritesState = {
      ...current,
      items: items.filter((i) => i.id !== id),
    };

    await writeJsonFile(filePath, updated);
    return updated;
  });
};

export const getProjects = async (): Promise<ProjectsState> => {
  const filePath = await getProjectsPath();

  return projectsLock.withLock('projects', async () => {
    const data = await readJsonFile<ProjectsState>(filePath, DEFAULT_PROJECTS);
    return {
      ...DEFAULT_PROJECTS,
      ...data,
      projects: Array.isArray(data?.projects) ? data.projects : [],
    };
  });
};

export const addProject = async (projectPath: string): Promise<Project> => {
  const filePath = await getProjectsPath();
  const normalizedPath = normalizeProjectPath(projectPath);

  return projectsLock.withLock('projects', async () => {
    const current = await readJsonFile<ProjectsState>(filePath, DEFAULT_PROJECTS);
    const projects = Array.isArray(current?.projects) ? current.projects : [];
    const existing = projects.find(
      (item) => normalizeProjectPath(item.path) === normalizedPath,
    );

    if (existing) {
      return existing;
    }

    const nextProject = createProjectRecord(normalizedPath);
    const nextState: ProjectsState = {
      ...DEFAULT_PROJECTS,
      ...current,
      projects: [...projects, nextProject],
    };

    await writeJsonFile(filePath, nextState);
    return nextProject;
  });
};

export const removeProject = async (id: string): Promise<ProjectsState> => {
  const filePath = await getProjectsPath();

  return projectsLock.withLock('projects', async () => {
    const current = await readJsonFile<ProjectsState>(filePath, DEFAULT_PROJECTS);
    const projects = Array.isArray(current?.projects) ? current.projects : [];
    const nextState: ProjectsState = {
      ...DEFAULT_PROJECTS,
      ...current,
      projects: projects.filter((item) => item.id !== id),
    };

    await writeJsonFile(filePath, nextState);
    return nextState;
  });
};
