<script setup lang="ts">
import { computed, ref } from "vue";

import NoteEditorShell from "@/components/notes/NoteEditorShell.vue";
import NoteVaultSidebar from "@/components/notes/NoteVaultSidebar.vue";
import {
  createNote,
  getNoteContent,
  listNotes,
  saveNoteContent,
} from "@/lib/api";
import type { NoteListItem } from "@/lib/types";

const notes = ref<NoteListItem[]>([]);
const activeNote = ref<NoteListItem | null>(null);
const noteContent = ref("");
const currentMarkdown = ref("");
const isSaving = ref(false);
const isLoading = ref(false);
const searchQuery = ref("");
const showNewNoteInput = ref(false);
const newNoteName = ref("");
let noteLoadRequestId = 0;

const hasUnsavedChanges = computed(() => {
  if (!activeNote.value) return false;
  return currentMarkdown.value !== noteContent.value;
});

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
  if (isSaving.value) return;

  const requestId = ++noteLoadRequestId;
  activeNote.value = note;
  isLoading.value = true;

  try {
    const response = await getNoteContent(note.relativePath);
    if (requestId !== noteLoadRequestId) return;
    noteContent.value = response.content;
    currentMarkdown.value = response.content;
  } catch (err) {
    if (requestId !== noteLoadRequestId) return;
    console.error("Failed to load note content", err);
    noteContent.value = "";
    currentMarkdown.value = "";
  } finally {
    if (requestId === noteLoadRequestId) {
      isLoading.value = false;
    }
  }
}

async function saveCurrentNote() {
  if (!activeNote.value || isSaving.value) return;

  const savedPath = activeNote.value.relativePath;
  const savedContent = currentMarkdown.value;
  isSaving.value = true;

  try {
    const response = await saveNoteContent(savedPath, savedContent);
    const noteIndex = notes.value.findIndex(
      (note) => note.relativePath === savedPath,
    );

    if (noteIndex !== -1) {
      notes.value[noteIndex] = {
        ...notes.value[noteIndex]!,
        updatedAt: response.updatedAt,
        size: response.size,
      };
    }

    if (activeNote.value?.relativePath === savedPath) {
      noteContent.value = savedContent;
      activeNote.value = {
        ...activeNote.value,
        updatedAt: response.updatedAt,
        size: response.size,
      };
    }
  } catch (err) {
    console.error("Failed to save note", err);
  } finally {
    isSaving.value = false;
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

loadNotes();
</script>

<template>
  <div class="flex h-full min-h-0 bg-background text-foreground">
    <NoteVaultSidebar
      v-model:new-note-name="newNoteName"
      v-model:search-query="searchQuery"
      v-model:show-new-note-input="showNewNoteInput"
      :active-path="activeNote?.relativePath ?? ''"
      :filtered-notes="filteredNotes"
      :total-count="notes.length"
      @create-note="handleCreateNote"
      @open-note="openNote"
    />

    <NoteEditorShell
      :key="activeNote?.relativePath ?? 'empty-note-shell'"
      :active-note="activeNote"
      :content="noteContent"
      :current-markdown="currentMarkdown"
      :has-unsaved-changes="hasUnsavedChanges"
      :is-loading="isLoading"
      :is-saving="isSaving"
      @markdown-updated="currentMarkdown = $event"
      @save="saveCurrentNote"
    />
  </div>
</template>
