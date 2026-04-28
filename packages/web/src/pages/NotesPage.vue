<script setup lang="ts">
import { computed, ref } from "vue";

import TabBar from "@/components/common/TabBar.vue";
import type { TabItem } from "@/components/common/TabBar.vue";
import NoteTabContent from "@/components/notes/NoteTabContent.vue";
import NoteVaultSidebar from "@/components/notes/NoteVaultSidebar.vue";
import NoteStatusBar from "@/components/notes/NoteStatusBar.vue";
import NoteNameDialog from "@/components/notes/NoteNameDialog.vue";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createNote,
  createNoteFolder,
  deleteNote,
  getNoteContent,
  listNotes,
  renameNote,
  saveNoteContent,
} from "@/lib/api";
import type { NoteListItem, NoteTab } from "@/lib/types";

const notes = ref<NoteListItem[]>([]);
const openTabs = ref<NoteTab[]>([]);
const activeTabPath = ref<string | null>(null);
const searchQuery = ref("");
const sidebarFilter = ref<"all" | "search" | "starred" | "recent">("all");

/** 收藏列表，持久化到 localStorage */
const starredPaths = ref<Set<string>>(
  new Set(
    JSON.parse(localStorage.getItem("note-starred") ?? "[]") as string[],
  ),
);

function toggleStar(path: string) {
  if (starredPaths.value.has(path)) {
    starredPaths.value.delete(path);
  } else {
    starredPaths.value.add(path);
  }
  localStorage.setItem(
    "note-starred",
    JSON.stringify([...starredPaths.value]),
  );
}

/** 自动保存定时器 */
const autoSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

const activeTab = computed(() =>
	openTabs.value.find((t) => t.relativePath === activeTabPath.value) ?? null,
);

const tabBarItems = computed<TabItem[]>(() =>
	openTabs.value.map((t) => ({
		id: t.relativePath,
		title: t.name.replace(/\.md$/, "").replace(/\.markdown$/, ""),
		status: t.isLoading ? "loading" : t.saveStatus === "unsaved" ? "unsaved" : t.saveStatus === "saving" ? "saving" : t.saveStatus === "error" ? "error" : "idle",
	})),
);

const filteredNotes = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  let list = notes.value;

  if (sidebarFilter.value === "starred") {
    list = list.filter((n) => starredPaths.value.has(n.relativePath));
  } else if (sidebarFilter.value === "recent") {
    list = [...list].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 10);
  }

  if (query) {
    list = list.filter(
      (note) =>
        note.name.toLowerCase().includes(query) ||
        note.relativePath.toLowerCase().includes(query),
    );
  }

  return list;
});

async function loadNotes() {
  try {
    const response = await listNotes();
    notes.value = response.entries;
    if (notes.value.length > 0) {
      await openNote(notes.value[0]!);
    }
  } catch (err) {
    console.error("Failed to load notes", err);
  }
}

async function openNote(note: NoteListItem) {
  const existing = openTabs.value.find(
    (t) => t.relativePath === note.relativePath,
  );
  if (existing) {
    activeTabPath.value = existing.relativePath;
    return;
  }

  const tab: NoteTab = {
    relativePath: note.relativePath,
    name: note.name,
    content: "",
    savedContent: "",
    saveStatus: "saved",
    isLoading: true,
  };

  openTabs.value.push(tab);
  activeTabPath.value = tab.relativePath;

  try {
    const response = await getNoteContent(note.relativePath);
    const target = openTabs.value.find(
      (t) => t.relativePath === note.relativePath,
    );
    if (target) {
      target.content = response.content;
      target.savedContent = response.content;
      target.isLoading = false;
    }
  } catch (err) {
    console.error("Failed to load note content", err);
    const target = openTabs.value.find(
      (t) => t.relativePath === note.relativePath,
    );
    if (target) target.isLoading = false;
  }
}

function closeTab(path: string) {
  flushAutoSave(path);

  const index = openTabs.value.findIndex((t) => t.relativePath === path);
  if (index === -1) return;
  openTabs.value.splice(index, 1);

  if (activeTabPath.value === path) {
    activeTabPath.value =
      openTabs.value[Math.min(index, openTabs.value.length - 1)]
        ?.relativePath ?? null;
  }
}

function selectTab(path: string) {
  activeTabPath.value = path;
}

function handleMarkdownUpdated(markdown: string) {
  if (!activeTab.value) return;
  activeTab.value.content = markdown;
  activeTab.value.saveStatus = "unsaved";
  scheduleAutoSave(activeTab.value.relativePath);
}

function scheduleAutoSave(path: string) {
  if (autoSaveTimers.has(path)) {
    clearTimeout(autoSaveTimers.get(path)!);
  }
  autoSaveTimers.set(
    path,
    setTimeout(() => flushAutoSave(path), 2000),
  );
}

async function flushAutoSave(path: string) {
  if (autoSaveTimers.has(path)) {
    clearTimeout(autoSaveTimers.get(path)!);
    autoSaveTimers.delete(path);
  }

  const tab = openTabs.value.find((t) => t.relativePath === path);
  if (!tab || tab.saveStatus !== "unsaved") return;

  tab.saveStatus = "saving";
  try {
    await saveNoteContent(tab.relativePath, tab.content);
    tab.savedContent = tab.content;
    tab.saveStatus = "saved";

    const noteIndex = notes.value.findIndex(
      (n) => n.relativePath === tab.relativePath,
    );
    if (noteIndex !== -1) {
      notes.value[noteIndex] = {
        ...notes.value[noteIndex]!,
        updatedAt: Date.now(),
      };
    }
  } catch (err) {
    console.error("Auto-save failed", err);
    tab.saveStatus = "error";
  }
}

async function handleCreateNote() {
  try {
    const response = await createNote("");

    const newItem: NoteListItem = {
      name: response.name,
      path: response.path,
      relativePath: response.relativePath,
      size: response.size,
      updatedAt: response.updatedAt,
    };

    notes.value.unshift(newItem);
    await openNote(newItem);
  } catch (err) {
    console.error("Failed to create note", err);
  }
}

const folderDialogOpen = ref(false);
const folderCreating = ref(false);

async function handleCreateFolder() {
  folderDialogOpen.value = true;
}

async function handleFolderDialogSubmit(name: string) {
  folderCreating.value = true;
  try {
    await createNoteFolder(name);
    await loadNotes();
  } catch (err) {
    console.error("Failed to create folder", err);
  } finally {
    folderCreating.value = false;
    folderDialogOpen.value = false;
  }
}

const renameDialogOpen = ref(false);
const renameTarget = ref<NoteListItem | null>(null);
const renameSaving = ref(false);

function handleRenameNote(note: NoteListItem) {
  renameTarget.value = note;
  renameDialogOpen.value = true;
}

async function handleRenameDialogSubmit(newName: string) {
  const note = renameTarget.value;
  if (!note || newName === note.name) return;

  renameSaving.value = true;
  try {
    const response = await renameNote(note.relativePath, newName);

    const noteIndex = notes.value.findIndex(
      (n) => n.relativePath === note.relativePath,
    );
    if (noteIndex !== -1) {
      notes.value[noteIndex] = {
        ...notes.value[noteIndex]!,
        name: response.name,
        path: response.path,
        relativePath: response.relativePath,
        updatedAt: response.updatedAt,
      };
    }

    const tab = openTabs.value.find(
      (t) => t.relativePath === note.relativePath,
    );
    if (tab) {
      tab.name = response.name;
      tab.relativePath = response.relativePath;
    }

    if (activeTabPath.value === note.relativePath) {
      activeTabPath.value = response.relativePath;
    }
  } catch (err) {
    console.error("Failed to rename note", err);
  } finally {
    renameSaving.value = false;
    renameDialogOpen.value = false;
    renameTarget.value = null;
  }
}

const deleteDialogOpen = ref(false);
const deleteTarget = ref<NoteListItem | null>(null);
const deleteSaving = ref(false);

function handleDeleteNote(note: NoteListItem) {
  deleteTarget.value = note;
  deleteDialogOpen.value = true;
}

async function handleDeleteConfirm() {
  const note = deleteTarget.value;
  if (!note) return;

  deleteSaving.value = true;
  try {
    await deleteNote(note.relativePath);

    notes.value = notes.value.filter(
      (n) => n.relativePath !== note.relativePath,
    );

    starredPaths.value.delete(note.relativePath);
    localStorage.setItem(
      "note-starred",
      JSON.stringify([...starredPaths.value]),
    );

    closeTab(note.relativePath);
  } catch (err) {
    console.error("Failed to delete note", err);
  } finally {
    deleteSaving.value = false;
    deleteDialogOpen.value = false;
    deleteTarget.value = null;
  }
}

loadNotes();
</script>

<template>
  <div class="flex h-full min-h-0 bg-background text-foreground">
    <NoteVaultSidebar
      :active-path="activeTabPath ?? ''"
      :filtered-notes="filteredNotes"
      :total-count="notes.length"
      :starred-paths="starredPaths"
      :filter="sidebarFilter"
      :search-query="searchQuery"
      @update:filter="sidebarFilter = $event"
      @update:search-query="searchQuery = $event"
      @create-note="handleCreateNote"
      @create-folder="handleCreateFolder"
      @delete-note="handleDeleteNote"
      @open-note="openNote"
      @rename-note="handleRenameNote"
      @toggle-star="toggleStar"
    />

    <main class="flex min-h-0 flex-1 flex-col">
      <TabBar
        :tabs="tabBarItems"
        :active-tab-id="activeTabPath ?? ''"
        @select="selectTab"
        @close="closeTab"
      />

      <NoteTabContent
        :tab="activeTab"
        @markdown-updated="handleMarkdownUpdated"
      />

      <NoteStatusBar :tab="activeTab" />
    </main>

    <NoteNameDialog
      v-model="folderDialogOpen"
      title="新建文件夹"
      description="新文件夹将创建在工作空间根目录。"
      :is-saving="folderCreating"
      @submit="handleFolderDialogSubmit"
    />

    <NoteNameDialog
      v-model="renameDialogOpen"
      title="重命名"
      description="名称会直接更新到当前笔记。"
      :initial-name="renameTarget?.name ?? ''"
      :is-saving="renameSaving"
      @submit="handleRenameDialogSubmit"
    />

    <Dialog :open="deleteDialogOpen" @update:open="deleteDialogOpen = $event">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>删除笔记</DialogTitle>
          <DialogDescription>确定要删除「{{ deleteTarget?.name }}」吗？此操作不可撤销。</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" :disabled="deleteSaving" @click="deleteDialogOpen = false">取消</Button>
          <Button variant="destructive" :disabled="deleteSaving" @click="handleDeleteConfirm">删除</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
