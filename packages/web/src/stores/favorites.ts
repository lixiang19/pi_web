import { ref, computed } from "vue";
import { defineStore } from "pinia";
import {
  getFavorites,
  addFavorite,
  removeFavorite,
  type FavoriteItem,
  type Favorites,
} from "@/lib/api/storage";

export type { FavoriteItem } from "@/lib/api/storage";
export const useFavoritesStore = defineStore("favorites", () => {
  const favorites = ref<Favorites | null>(null);
  const isLoading = ref(false);
  const isSaving = ref(false);
  const error = ref<string | null>(null);

  const isLoaded = computed(() => favorites.value !== null);

  const items = computed(() => favorites.value?.items ?? []);

  const sortedItems = computed(() => {
    return [...items.value].sort((a, b) => {
      const timeA = a.createdAt ?? 0;
      const timeB = b.createdAt ?? 0;
      return timeB - timeA;
    });
  });

  const itemsByType = computed(() => {
    const grouped = new Map<string, FavoriteItem[]>();
    for (const item of items.value) {
      const list = grouped.get(item.type) ?? [];
      list.push(item);
      grouped.set(item.type, list);
    }
    return grouped;
  });

  const count = computed(() => items.value.length);

  function isFavorite(id: string): boolean {
    return items.value.some((item) => item.id === id);
  }

  function getFavoriteById(id: string): FavoriteItem | undefined {
    return items.value.find((item) => item.id === id);
  }

  async function load(): Promise<void> {
    if (isLoading.value) return;

    isLoading.value = true;
    error.value = null;

    try {
      favorites.value = await getFavorites();
    } catch (err) {
      error.value = err instanceof Error ? err.message : "加载收藏失败";
      console.error("Failed to load favorites:", err);
    } finally {
      isLoading.value = false;
    }
  }

  async function add(item: Omit<FavoriteItem, "createdAt">): Promise<void> {
    if (isSaving.value) return;

    isSaving.value = true;
    error.value = null;

    try {
      const updated = await addFavorite(item);
      favorites.value = updated;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "添加收藏失败";
      console.error("Failed to add favorite:", err);
      throw err;
    } finally {
      isSaving.value = false;
    }
  }

  async function remove(id: string): Promise<void> {
    if (isSaving.value) return;

    isSaving.value = true;
    error.value = null;

    try {
      const updated = await removeFavorite(id);
      favorites.value = updated;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "删除收藏失败";
      console.error("Failed to remove favorite:", err);
      throw err;
    } finally {
      isSaving.value = false;
    }
  }

  async function toggle(item: Omit<FavoriteItem, "createdAt">): Promise<void> {
    if (isFavorite(item.id)) {
      await remove(item.id);
    } else {
      await add(item);
    }
  }

  return {
    favorites,
    items,
    sortedItems,
    itemsByType,
    count,
    isLoading,
    isSaving,
    isLoaded,
    error,
    isFavorite,
    getFavoriteById,
    load,
    add,
    remove,
    toggle,
  };
});
