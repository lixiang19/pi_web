<script setup lang="ts">
import {
  FilePlus2,
  FolderPlus,
  RefreshCw,
  Search,
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
  <div class="flex items-center justify-between gap-3 px-5 py-2.5">
    <div class="flex min-w-0 flex-1 items-center gap-2">
      <div class="relative min-w-40 flex-1 lg:max-w-sm">
        <Search class="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          v-model="query"
          class="h-8 pl-8 text-xs"
          placeholder="搜索"
        />
      </div>

      <Select v-model="sortKey">
        <SelectTrigger class="h-8 w-28 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="name">名称</SelectItem>
          <SelectItem value="modifiedAt">修改时间</SelectItem>
          <SelectItem value="size">大小</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div class="flex shrink-0 items-center gap-1.5">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        :disabled="isLoading || isMutating"
        @click="emit('refresh')"
      >
        <RefreshCw class="size-3.5" :class="isLoading ? 'animate-spin' : ''" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        :disabled="isMutating"
        @click="emit('create-folder')"
      >
        <FolderPlus class="size-3.5" />
        文件夹
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        :disabled="isMutating"
        @click="emit('create-file')"
      >
        <FilePlus2 class="size-3.5" />
        文件
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        :disabled="isMutating"
        @click="emit('upload')"
      >
        <Upload class="size-3.5" />
        上传
      </Button>
    </div>
  </div>
</template>
