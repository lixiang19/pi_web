<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Check, ChevronDown, ChevronRight, FileCode2, History, LoaderCircle, Minus, Plus, RefreshCw, TriangleAlert, X } from "lucide-vue-next";

import { getWorkspaceVersionStatus, workspaceVersionCommit, workspaceVersionShowDiff } from "@/lib/api";
import type { GitFileStatusItem, GitStatusResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";

const props = defineProps<{
	root: string;
}>();

const status = ref<GitStatusResponse | null>(null);
const isLoading = ref(false);
const isCommitting = ref(false);
const error = ref("");
const versionMessage = ref("");
const selectedPaths = ref<Set<string>>(new Set());

const expandedDiffPath = ref<string | null>(null);
const diffContent = ref("");
const isDiffLoading = ref(false);
const diffError = ref("");

const files = computed(() => status.value?.files ?? []);
const selectedCount = computed(() => selectedPaths.value.size);

const refresh = async () => {
	if (!props.root) {
		status.value = null;
		return;
	}
	isLoading.value = true;
	error.value = "";
	try {
		status.value = await getWorkspaceVersionStatus(props.root);
	} catch (caughtError) {
		error.value = caughtError instanceof Error ? caughtError.message : String(caughtError);
	} finally {
		isLoading.value = false;
	}
};

const togglePath = (filePath: string) => {
	const next = new Set(selectedPaths.value);
	if (next.has(filePath)) next.delete(filePath);
	else next.add(filePath);
	selectedPaths.value = next;
};

const toggleAll = () => {
	const allSelected = files.value.every((file) => selectedPaths.value.has(file.path));
	selectedPaths.value = allSelected ? new Set() : new Set(files.value.map((file) => file.path));
};

const commitVersion = async () => {
	const message = versionMessage.value.trim();
	const paths = [...selectedPaths.value];
	if (!message || paths.length === 0 || !props.root) return;
	isCommitting.value = true;
	error.value = "";
	try {
		await workspaceVersionCommit({
			root: props.root,
			message,
			files: paths,
		});
		versionMessage.value = "";
		selectedPaths.value = new Set();
		await refresh();
	} catch (caughtError) {
		error.value = caughtError instanceof Error ? caughtError.message : String(caughtError);
	} finally {
		isCommitting.value = false;
	}
};

const toggleDiff = async (file: GitFileStatusItem) => {
	if (expandedDiffPath.value === file.path) {
		expandedDiffPath.value = null;
		return;
	}
	expandedDiffPath.value = file.path;
	diffContent.value = "";
	diffError.value = "";
	isDiffLoading.value = true;
	try {
		const res = await workspaceVersionShowDiff({
			root: props.root,
			filePath: file.path,
		});
		diffContent.value = res.diff;
	} catch (err) {
		diffError.value = err instanceof Error ? err.message : "加载 diff 失败";
	} finally {
		isDiffLoading.value = false;
	}
};

const statusMeta = (file: GitFileStatusItem) => {
	const code = file.index !== " " ? file.index : file.working_dir;
	const labelMap: Record<string, string> = {
		M: "已修改",
		A: "新增",
		D: "已删除",
		"?": "未跟踪",
	};
	const colorMap: Record<string, string> = {
		M: "text-amber-500/60",
		A: "text-emerald-500/60",
		D: "text-destructive/50",
		"?": "text-muted-foreground/30",
	};
	return {
		label: labelMap[code] ?? code,
		color: colorMap[code] ?? "text-muted-foreground/30",
	};
};

const statusIcon = (file: GitFileStatusItem) => {
	const code = file.index !== " " ? file.index : file.working_dir;
	if (code === "D") return Minus;
	if (code === "A" || code === "?") return Plus;
	return FileCode2;
};

const formatDiff = (text: string) =>
	text.split("\n").map((line) => {
		let type: "add" | "del" | "meta" | "normal" = "normal";
		if (line.startsWith("+")) type = "add";
		else if (line.startsWith("-")) type = "del";
		else if (line.startsWith("@@")) type = "meta";
		return { text: line, type };
	});

watch(
	() => props.root,
	() => {
		selectedPaths.value = new Set();
		expandedDiffPath.value = null;
		void refresh();
	},
	{ immediate: true },
);

watch(files, () => {
	if (files.value.length > 0 && selectedPaths.value.size === 0) {
		selectedPaths.value = new Set(files.value.map((file) => file.path));
	}
});
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden bg-background">
    <div
      v-if="error"
      class="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-destructive/10 bg-destructive/[0.04]"
    >
      <TriangleAlert class="size-3 shrink-0 text-destructive/60" />
      <p class="text-[11px] text-destructive/70 truncate">{{ error }}</p>
    </div>

    <div v-if="!root" class="flex flex-1 flex-col items-center justify-center gap-2">
      <History class="size-6 text-muted-foreground/10" />
      <p class="text-[11px] text-muted-foreground/25">未找到工作空间</p>
    </div>
    <div v-else-if="isLoading && !status" class="flex flex-1 flex-col items-center justify-center gap-2">
      <LoaderCircle class="size-4 animate-spin text-muted-foreground/10" />
      <p class="text-[11px] text-muted-foreground/25">加载中...</p>
    </div>

    <template v-else>
      <!-- 头部：仅图标 + 计数 -->
      <div class="flex items-center justify-between px-3 py-2.5 gap-2 border-b border-border/[0.06]">
        <div class="flex min-w-0 items-center gap-2">
          <div class="flex items-center justify-center size-5 rounded-[4px] bg-primary/[0.06] text-primary/50">
            <History class="size-3" />
          </div>
          <span
            class="inline-flex items-center rounded-full px-1.5 py-[1px] text-[9px] font-bold tabular-nums"
            :class="files.length > 0
              ? 'bg-primary/[0.08] text-primary/60'
              : 'bg-muted-foreground/[0.06] text-muted-foreground/30'"
          >
            {{ files.length }}
          </span>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon-sm"
                class="size-6 text-muted-foreground/25 hover:text-foreground hover:bg-accent/40"
                :disabled="isLoading"
                @click="refresh()"
              >
                <RefreshCw class="size-3" :class="isLoading && 'animate-spin'" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom"><p class="text-[10px]">刷新</p></TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <!-- 文件列表（可滚动） -->
      <ScrollArea class="flex-1">
        <div class="pb-1">
          <div v-if="files.length > 0">
            <!-- 全选头部 -->
            <div
              class="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-accent/[0.12] transition-colors select-none"
              @click="toggleAll"
            >
              <div class="flex items-center gap-2">
                <div
                  class="flex shrink-0 items-center justify-center size-3.5 rounded transition-colors"
                  :class="selectedCount === files.length
                    ? 'bg-primary/80 text-primary-foreground shadow-sm shadow-primary/20'
                    : 'border border-muted-foreground/15 text-transparent'"
                >
                  <Check class="size-2.5" />
                </div>
                <span class="text-[10px] font-semibold text-muted-foreground/40 uppercase tracking-widest">变更文件</span>
              </div>
              <span class="text-[9px] text-muted-foreground/25 tabular-nums">{{ selectedCount }}/{{ files.length }}</span>
            </div>

            <!-- 文件列表 -->
            <div class="px-1.5">
              <div
                v-for="(file, idx) in files"
                :key="file.path"
              >
                <!-- 文件行 -->
                <div
                  class="group flex items-center gap-2 px-2 py-[6px] cursor-pointer select-none transition-all rounded-md"
                  :class="[
                    selectedPaths.has(file.path) ? 'bg-primary/[0.04]' : 'hover:bg-accent/[0.08]',
                    idx !== files.length - 1 && expandedDiffPath !== file.path ? 'mb-[1px]' : '',
                  ]"
                  @click="togglePath(file.path)"
                >
                  <!-- 复选框 -->
                  <div
                    class="flex shrink-0 items-center justify-center size-3.5 rounded transition-all"
                    :class="selectedPaths.has(file.path)
                      ? 'bg-primary/80 text-primary-foreground shadow-sm shadow-primary/20'
                      : 'border border-muted-foreground/12 text-transparent group-hover:border-muted-foreground/25'"
                    @click.stop="togglePath(file.path)"
                  >
                    <Check class="size-2.5" />
                  </div>

                  <!-- 状态图标 -->
                  <div class="flex shrink-0 items-center justify-center size-4 rounded-sm" :class="{
                    'bg-amber-500/[0.06]': (file.index !== ' ' ? file.index : file.working_dir) === 'M',
                    'bg-emerald-500/[0.06]': ['A', '?'].includes(file.index !== ' ' ? file.index : file.working_dir),
                    'bg-destructive/[0.06]': (file.index !== ' ' ? file.index : file.working_dir) === 'D',
                  }">
                    <component :is="statusIcon(file)" class="size-3 shrink-0" :class="statusMeta(file).color" />
                  </div>

                  <!-- 文件名 -->
                  <span class="min-w-0 flex-1 truncate text-[11px] font-mono text-foreground/70 leading-4">{{ file.path }}</span>

                  <!-- 状态标签 -->
                  <span class="shrink-0 text-[9px] font-semibold uppercase tracking-wider px-1 py-[1px] rounded-sm leading-3" :class="{
                    'bg-amber-500/[0.06] text-amber-600/60': (file.index !== ' ' ? file.index : file.working_dir) === 'M',
                    'bg-emerald-500/[0.06] text-emerald-600/60': ['A', '?'].includes(file.index !== ' ' ? file.index : file.working_dir),
                    'bg-destructive/[0.06] text-destructive/50': (file.index !== ' ' ? file.index : file.working_dir) === 'D',
                  }">
                    {{ statusMeta(file).label }}
                  </span>

                  <!-- Diff 折叠按钮 -->
                  <button
                    class="shrink-0 flex items-center gap-0.5 text-[9px] text-muted-foreground/30 hover:text-foreground/60 px-1 py-0.5 rounded hover:bg-accent/40 transition-all"
                    :class="expandedDiffPath === file.path && 'text-foreground/60 bg-accent/30'"
                    @click.stop="toggleDiff(file)"
                  >
                    <component :is="expandedDiffPath === file.path ? ChevronDown : ChevronRight" class="size-3" />
                    <span>diff</span>
                  </button>
                </div>

                <!-- 展开的 Diff 内容（内联折叠） -->
                <div
                  v-if="expandedDiffPath === file.path"
                  class="mx-1 mb-2 overflow-hidden rounded-md border border-border/[0.08] bg-[#1e1e1e]/80 dark:bg-[#1e1e1e]/60"
                >
                  <div v-if="isDiffLoading" class="flex flex-col items-center py-6 gap-1.5">
                    <LoaderCircle class="size-4 animate-spin text-muted-foreground/20" />
                    <p class="text-[10px] text-muted-foreground/25">加载 diff...</p>
                  </div>

                  <div v-else-if="diffError" class="flex flex-col items-center py-6 px-3 gap-1.5">
                    <X class="size-4 text-destructive/30" />
                    <p class="text-[10px] text-destructive/50 text-center">{{ diffError }}</p>
                  </div>

                  <div v-else-if="diffContent" class="overflow-x-auto">
                    <div class="min-w-full">
                      <div
                        v-for="(line, i) in formatDiff(diffContent)"
                        :key="i"
                        class="px-3 font-mono text-[10px] leading-[18px] whitespace-pre"
                        :class="{
                          'bg-emerald-500/[0.08] text-emerald-500/80': line.type === 'add',
                          'bg-red-500/[0.08] text-red-400/80': line.type === 'del',
                          'text-amber-400/60': line.type === 'meta',
                          'text-gray-400/70': line.type === 'normal',
                        }"
                      >
                        {{ line.text }}
                      </div>
                    </div>
                  </div>

                  <div v-else class="flex flex-col items-center py-6">
                    <p class="text-[10px] text-muted-foreground/25">没有可显示的变更</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 空状态 -->
          <div v-else class="flex flex-col items-center py-14">
            <div class="flex items-center justify-center size-9 rounded-full bg-muted-foreground/[0.04] mb-3">
              <Check class="size-4 text-muted-foreground/15" />
            </div>
            <p class="text-[11px] text-muted-foreground/30 font-medium">没有变更</p>
            <p class="text-[10px] text-muted-foreground/15 mt-0.5">当前工作空间已记录</p>
          </div>
        </div>
      </ScrollArea>

      <!-- 底部固定提交区域 -->
      <div class="shrink-0 px-3 pt-3 pb-3 border-t border-border/[0.06] bg-accent/[0.02]">
        <Textarea
          v-model="versionMessage"
          placeholder="版本说明..."
          class="min-h-[44px] resize-none text-[12px] rounded-md border-border/15 bg-background px-3 py-2 placeholder:text-muted-foreground/20 focus-visible:ring-1 focus-visible:ring-ring/30 focus-visible:ring-offset-0"
          @keydown.ctrl.enter="commitVersion"
          @keydown.meta.enter="commitVersion"
        />
        <Button
          size="sm"
          class="mt-2 h-7 w-full text-[11px]"
          :disabled="!versionMessage.trim() || selectedCount === 0 || isCommitting"
          @click="commitVersion"
        >
          <Check class="mr-1 size-3" />
          提交版本
          <span v-if="selectedCount > 0" class="ml-1 text-[10px] opacity-50">({{ selectedCount }})</span>
        </Button>
      </div>
    </template>
  </div>
</template>
