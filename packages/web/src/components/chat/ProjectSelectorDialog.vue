<script setup lang="ts">
import { computed, watch } from "vue";
import { useVModel } from "@vueuse/core";
import { ArrowLeft, ChevronRight, Folder, LoaderCircle } from "lucide-vue-next";

import { useDirectoryBrowser } from "@/composables/useDirectoryBrowser";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

const props = defineProps<{
  open: boolean;
  pending?: boolean;
  error?: string;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "confirm", path: string): void;
}>();

const open = useVModel(props, "open", emit);
const browser = useDirectoryBrowser();
const {
  breadcrumbs,
  currentPath,
  entries,
  error: browserError,
  goParent,
  isLoading,
  load,
  openDirectory,
  parentPath,
} = browser;

const selectedPath = computed(() => currentPath.value);
const combinedError = computed(() => props.error || browserError.value);

const handleConfirm = () => {
  if (!selectedPath.value || props.pending) {
    return;
  }

  emit("confirm", selectedPath.value);
};

watch(
  open,
  (nextOpen) => {
    if (!nextOpen) {
      return;
    }

    if (!currentPath.value) {
      void load().catch(() => undefined);
    }
  },
  { immediate: true },
);
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="overflow-hidden sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>选择项目文件夹</DialogTitle>
        <DialogDescription>
          只显示 Home 目录下可访问的文件夹。进入目标目录后确认添加。
        </DialogDescription>
      </DialogHeader>

      <div class="flex h-[420px] min-w-0 flex-col">
        <div class="flex flex-wrap items-center gap-1 px-5 py-3 text-xs text-muted-foreground">
          <button
            v-for="(crumb, index) in breadcrumbs"
            :key="crumb.path"
            type="button"
            class="inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-accent hover:text-accent-foreground"
            @click="openDirectory(crumb.path)"
          >
            <span>{{ crumb.label }}</span>
            <ChevronRight v-if="index < breadcrumbs.length - 1" class="size-3" />
          </button>
        </div>

        <Separator />

        <div class="flex min-w-0 flex-col gap-3 px-5 py-3">
          <div class="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              class="shrink-0"
              :disabled="!parentPath || isLoading"
              @click="goParent()"
            >
              <ArrowLeft data-icon="inline-start" />
              返回上一级
            </Button>
          </div>

          <div class="min-w-0 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs leading-5 text-muted-foreground">
            <div class="font-medium text-foreground/70">当前选择</div>
            <p class="mt-1 break-all" :title="selectedPath">
              {{ selectedPath || "-" }}
            </p>
          </div>
        </div>

        <Separator />

        <ScrollArea class="flex-1 min-h-0 px-3 py-3">
          <div v-if="isLoading" class="flex min-h-[240px] items-center justify-center text-sm text-muted-foreground">
            <LoaderCircle class="size-4 animate-spin" />
          </div>

          <div v-else-if="combinedError" class="px-2 py-10 text-center text-sm text-destructive">
            {{ combinedError }}
          </div>

          <div v-else-if="entries.length === 0" class="px-2 py-10 text-center text-sm text-muted-foreground">
            当前目录下没有可用文件夹。
          </div>

          <div v-else class="flex flex-col gap-1">
            <button
              v-for="entry in entries"
              :key="entry.path"
              type="button"
              class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              :title="entry.path"
              @click="openDirectory(entry.path)"
            >
              <Folder class="size-4 text-muted-foreground" />
              <span class="truncate">{{ entry.name }}</span>
            </button>
          </div>
        </ScrollArea>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="open = false">取消</Button>
        <Button :disabled="!selectedPath || props.pending" @click="handleConfirm">
          {{ props.pending ? "添加中..." : "确认添加" }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>