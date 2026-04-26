<script setup lang="ts">
import { FileText, Plus, Save, Search } from "lucide-vue-next";
import { computed, nextTick, ref, watch } from "vue";
import NoteMilkdownEditor from "@/components/notes/NoteMilkdownEditor.vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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
	if (!searchQuery.value.trim()) return notes.value;
	const q = searchQuery.value.toLowerCase();
	return notes.value.filter(
		(n) =>
			n.name.toLowerCase().includes(q) ||
			n.relativePath.toLowerCase().includes(q),
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

function formatDate(ts: number): string {
	const d = new Date(ts);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

watch(activeNote, () => {
	nextTick(() => {
		currentMarkdown.value = noteContent.value;
	});
});

loadNotes();
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background">
    <header
      class="ridge-panel-header flex h-14 min-h-14 items-center justify-between gap-4 border-b border-border/50 px-4"
    >
      <div class="flex items-center gap-3">
        <p class="text-11px font-black uppercase tracking-0.24em text-primary/70">
          笔记
        </p>
        <h1
          v-if="activeNote"
          class="text-sm font-medium text-foreground truncate max-w-60"
        >
          {{ activeNote.name }}
        </h1>
      </div>
      <div class="flex items-center gap-2">
        <span
          v-if="hasUnsavedChanges"
          class="text-xs text-muted-foreground"
        >
          未保存
        </span>
        <Button
          variant="ghost"
          size="sm"
          :disabled="!activeNote || isSaving || !hasUnsavedChanges"
          @click="saveCurrentNote"
        >
          <Save class="mr-1 h-4 w-4" />
          保存
        </Button>
        <Button
          variant="ghost"
          size="sm"
          @click="showNewNoteInput = !showNewNoteInput"
        >
          <Plus class="mr-1 h-4 w-4" />
          新建
        </Button>
      </div>
    </header>

    <div class="flex min-h-0 flex-1 overflow-hidden">
      <aside
        class="w-64 min-w-64 border-r border-border/50 flex flex-col bg-card/40"
      >
        <div class="p-3">
          <div class="relative">
            <Search
              class="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              v-model="searchQuery"
              placeholder="搜索笔记"
              class="h-9 pl-8 text-sm"
            />
          </div>
        </div>

        <div v-if="showNewNoteInput" class="px-3 pb-2">
          <form @submit.prevent="handleCreateNote" class="flex gap-2">
            <Input
              v-model="newNoteName"
              placeholder="笔记名称"
              class="h-8 text-sm flex-1"
              autofocus
            />
            <Button type="submit" size="sm" variant="default" class="h-8">
              创建
            </Button>
          </form>
        </div>

        <ScrollArea class="flex-1">
          <div v-if="filteredNotes.length === 0" class="px-4 py-8 text-center text-sm text-muted-foreground">
            没有笔记
          </div>
          <div
            v-for="note in filteredNotes"
            :key="note.relativePath"
            class="group flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-accent/50"
            :class="{
              'bg-accent text-accent-foreground': activeNote?.relativePath === note.relativePath,
            }"
            @click="openNote(note)"
          >
            <FileText class="h-4 w-4 shrink-0 text-muted-foreground" />
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium">{{ note.name }}</p>
              <p class="truncate text-xs text-muted-foreground">
                {{ formatDate(note.updatedAt) }}
              </p>
            </div>
          </div>
        </ScrollArea>
      </aside>

      <main class="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          v-if="!activeNote"
          class="flex flex-1 items-center justify-center text-sm text-muted-foreground"
        >
          选择笔记开始编辑
        </div>
        <div
          v-else-if="isLoading"
          class="flex flex-1 items-center justify-center text-sm text-muted-foreground"
        >
          正在加载...
        </div>
        <div v-else class="flex-1 overflow-hidden">
          <NoteMilkdownEditor
            :key="activeNote.relativePath"
            :content="noteContent"
            @markdown-updated="currentMarkdown = $event"
          />
        </div>
      </main>
    </div>
  </div>
</template>
