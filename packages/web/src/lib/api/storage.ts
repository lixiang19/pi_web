
import type { ThemeName } from "@/assets/registry";

export type ThemeMode = "light" | "dark" | "system";

export interface Settings {
  theme: ThemeMode;
  themeName: ThemeName;
  language: string;
  sidebarCollapsed: boolean;
  notifications: boolean;
}

export interface FavoriteItem {
  id: string;
  name: string;
  type: string;
  data?: Record<string, unknown>;
  createdAt?: number;
}

export interface Favorites {
  items: FavoriteItem[];
}

const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  themeName: "default",
  language: "zh-CN",
  sidebarCollapsed: false,
  notifications: true,
};

const DEFAULT_FAVORITES: Favorites = {
  items: [],
};

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function getSettings(): Promise<Settings> {
  try {
    const settings = await request<Settings>("/api/storage/settings");
    return { ...DEFAULT_SETTINGS, ...settings };
  } catch (error) {
    console.error("Failed to load settings:", error);
    return { ...DEFAULT_SETTINGS };
  }
}

export async function setSettings(settings: Partial<Settings>): Promise<Settings> {
  const updated = await request<Settings>("/api/storage/settings", {
    method: "POST",
    body: JSON.stringify(settings),
  });
  return { ...DEFAULT_SETTINGS, ...updated };
}

export async function getFavorites(): Promise<Favorites> {
  try {
    const favorites = await request<Favorites>("/api/storage/favorites");
    return { ...DEFAULT_FAVORITES, ...favorites };
  } catch (error) {
    console.error("Failed to load favorites:", error);
    return { ...DEFAULT_FAVORITES };
  }
}

export async function addFavorite(item: Omit<FavoriteItem, "createdAt">): Promise<Favorites> {
  return request<Favorites>("/api/storage/favorites", {
    method: "POST",
    body: JSON.stringify(item),
  });
}

export async function removeFavorite(id: string): Promise<Favorites> {
  return request<Favorites>(`/api/storage/favorites/${id}`, {
    method: "DELETE",
  });
}
