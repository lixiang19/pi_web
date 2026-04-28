<script setup lang="ts">
import { computed, ref } from "vue";

import NoteTabBar from "@/components/notes/NoteTabBar.vue";
import NoteTabContent from "@/components/notes/NoteTabContent.vue";
import NoteVaultSidebar from "@/components/notes/NoteVaultSidebar.vue";
import NoteStatusBar from "@/components/notes/NoteStatusBar.vue";
import {
  createNote,
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
const showNewNoteInput = ref(false);
const newNoteName = ref("");

/** 自动保存定时器 */
const autoSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

const activeTab = computed(() =>
  openTabs.value.find((t) => t.relativePath === activeTabPath.value) ?? null,
);

const filteredNotes = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return notes.value;
  return notes.value.filter(
    (note) =>
      note.name.toLowerCase().includes(query) ||
      note.relativePath.toLowerCase().includes(query),
  );
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
  // 保存再关闭
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

    // 同步更新 notes 列表中的 updatedAt
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
  const name = newNoteName.value.trim();
  if (!name) return;

  try {
    const response = await createNote(name);
    showNewNoteInput.value = false;
    newNoteName.value = "";

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

async function handleRenameNote(note: NoteListItem) {
  const newName = prompt("新笔记名称", note.name);
  if (!newName || newName === note.name) return;

  try {
    const response = await renameNote(note.relativePath, newName);

    // 更新 notes 列表
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

    // 更新 tab
    const tab = openTabs.value.find(
      (t) => t.relativePath === note.relativePath,
    );
    if (tab) {
      tab.name = response.name;
      tab.relativePath = response.relativePath;
    }

    // 如果是当前活动标签，更新路径
    if (activeTabPath.value === note.relativePath) {
      activeTabPath.value = response.relativePath;
    }
  } catch (err) {
    console.error("Failed to rename note", err);
  }
}

async function handleDeleteNote(note: NoteListItem) {
  if (!confirm(`确定要删除「${note.name}」吗？`)) return;

  try {
    await deleteNote(note.relativePath);

    notes.value = notes.value.filter(
      (n) => n.relativePath !== note.relativePath,
    );

    // 关闭对应的 tab
    closeTab(note.relativePath);
  } catch (err) {
    console.error("Failed to delete note", err);
  }
}

loadNotes();
</script>

<template>
  <div class="flex h-full min-h-0 bg-background text-foreground">
    <NoteVaultSidebar
      v-model:new-note-name="newNoteName"
      v-model:search-query="searchQuery"
      v-model:show-new-note-input="showNewNoteInput"
      :active-path="activeTabPath ?? ''"
      :filtered-notes="filteredNotes"
      :total-count="notes.length"
      @create-note="handleCreateNote"
      @delete-note="handleDeleteNote"
      @open-note="openNote"
      @rename-note="handleRenameNote"
    />

    <main class="flex min-h-0 flex-1 flex-col">
      <NoteTabBar
        :tabs="openTabs"
        :active-tab-path="activeTabPath"
        @close-tab="closeTab"
        @select-tab="selectTab"
      />

      <NoteTabContent
        :tab="activeTab"
        @markdown-updated="handleMarkdownUpdated"
      />

      <NoteStatusBar :tab="activeTab" />
    </main>
  </div>
</template>
