<script setup lang="ts">
import {
  FilePlus2,
  FolderPlus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Upload,
} from "lucide-vue-next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FileManagerSortKey } from "@/composables/useFileManager";

defineProps<{
  isLoading: boolean;
  isMutating: boolean;
}>();

const query = defineModel<string>("query", { required: true });
const sortKey = defineModel<FileManagerSortKey>("sortKey", { required: true });

const emit = defineEmits<{
  (event: "create-file"): void;
  (event: "create-folder"): void;
  (event: "refresh"): void;
  (event: "upload"): void;
}>();
</script>

<template>
  <div class="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
    <div class="flex min-w-0 flex-1 items-center gap-2">
      <div class="relative min-w-48 flex-1 lg:max-w-sm">
        <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          v-model="query"
          class="h-9 pl-9"
          placeholder="搜索当前目录"
        />
      </div>

      <Select v-model="sortKey">
        <SelectTrigger class="h-9 w-36">
          <SlidersHorizontal class="size-3.5" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="name">名称</SelectItem>
          <SelectItem value="modifiedAt">修改时间</SelectItem>
          <SelectItem value="size">大小</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div class="flex shrink-0 items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        :disabled="isLoading || isMutating"
        @click="emit('refresh')"
      >
        <RefreshCw class="size-4" :class="isLoading ? 'animate-spin' : ''" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        :disabled="isMutating"
        @click="emit('create-folder')"
      >
        <FolderPlus class="size-4" />
        文件夹
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        :disabled="isMutating"
        @click="emit('create-file')"
      >
        <FilePlus2 class="size-4" />
        文件
      </Button>
      <Button
        type="button"
        size="sm"
        :disabled="isMutating"
        @click="emit('upload')"
      >
        <Upload class="size-4" />
        上传
      </Button>
    </div>
  </div>
</template>
