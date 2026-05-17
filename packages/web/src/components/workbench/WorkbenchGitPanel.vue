<script setup lang="ts">
import { computed, ref, toRef, watch } from "vue";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  FileCode2,
  GitBranch,
  LoaderCircle,
  Minus,
  Plus,
  RefreshCw,
  TriangleAlert,
} from "lucide-vue-next";

import { useGitState } from "@/composables/useGitState";
import type { GitRepositoryStatus } from "@/composables/useGitRepositoryStatus";
import type { GitFileStatusItem } from "@/lib/types";
import { gitCheckout } from "@/lib/api";
import GitDiffViewer from "@/components/workbench/git/GitDiffViewer.vue";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const props = defineProps<{
  cwd: string;
  gitStatus: GitRepositoryStatus | null;
}>();

const git = useGitState(toRef(() => props.cwd), toRef(() => props.gitStatus));

const commitMessage = ref("");
const selectedPaths = ref<Set<string>>(new Set());
const isSwitchingBranch = ref(false);
const branchError = ref("");

const diffOpen = ref(false);
const diffFilePath = ref("");
const diffStaged = ref(false);

const currentBranch = computed(() => git.status.value?.current ?? null);
const ahead = computed(() => git.status.value?.ahead ?? 0);
const behind = computed(() => git.status.value?.behind ?? 0);
const files = computed(() => git.status.value?.files ?? []);
const isRealGitRepository = computed(() => props.gitStatus?.isRepository === true);
const canPushPull = computed(() => props.gitStatus?.canPushPull ?? false);
const branches = computed(() => git.branches.value?.all ?? []);

const stagedFiles = computed(() => files.value.filter((f) => f.index !== " "));
const unstagedFiles = computed(() => files.value.filter((f) => f.index === " "));

const togglePath = (path: string) => {
  const next = new Set(selectedPaths.value);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  selectedPaths.value = next;
};

const toggleAllInGroup = (groupFiles: GitFileStatusItem[]) => {
  const allSelected = groupFiles.every((f) => selectedPaths.value.has(f.path));
  const next = new Set(selectedPaths.value);
  if (allSelected) {
    groupFiles.forEach((f) => next.delete(f.path));
  } else {
    groupFiles.forEach((f) => next.add(f.path));
  }
  selectedPaths.value = next;
};

const handleCommit = async (pushAfter = false) => {
  const message = commitMessage.value.trim();
  const paths = [...selectedPaths.value];
  if (!message || paths.length === 0) return;
  await git.commit(message, paths, pushAfter);
  commitMessage.value = "";
  selectedPaths.value = new Set();
};

const autoSelectNewFiles = () => {
  if (files.value.length > 0 && selectedPaths.value.size === 0) {
    selectedPaths.value = new Set(files.value.map((f) => f.path));
  }
};
watch(files, () => autoSelectNewFiles(), { immediate: true });

const handleBranchChange = async (branchName: string) => {
  if (!branchName || branchName === currentBranch.value) return;
  isSwitchingBranch.value = true;
  branchError.value = "";
  try {
    await gitCheckout({ cwd: props.cwd, branchName });
    await git.refresh();
  } catch (err) {
    branchError.value = err instanceof Error ? err.message : String(err);
  } finally {
    isSwitchingBranch.value = false;
  }
};

const openDiff = (file: GitFileStatusItem) => {
  diffFilePath.value = file.path;
  diffStaged.value = file.index !== " ";
  diffOpen.value = true;
};

const statusMeta = (file: GitFileStatusItem) => {
  const code = file.index !== " " ? file.index : file.working_dir;
  const labelMap: Record<string, string> = {
    M: "已修改",
    A: "新增",
    D: "已删除",
    R: "重命名",
    C: "已复制",
    U: "冲突",
    "?": "未跟踪",
    "!": "已忽略",
  };
  const colorMap: Record<string, string> = {
    M: "text-amber-500/60",
    A: "text-emerald-500/60",
    D: "text-destructive/50",
    R: "text-blue-500/60",
    "?": "text-muted-foreground/30",
  };
  const dotMap: Record<string, string> = {
    M: "bg-amber-500/50",
    A: "bg-emerald-500/50",
    D: "bg-destructive/50",
    R: "bg-blue-500/50",
    "?": "bg-muted-foreground/30",
  };
  return {
    label: labelMap[code] ?? code,
    color: colorMap[code] ?? "text-muted-foreground/30",
    dot: dotMap[code] ?? "bg-muted-foreground/30",
  };
};

const statusIcon = (file: GitFileStatusItem) => {
  const code = file.index !== " " ? file.index : file.working_dir;
  if (code === "D") return Minus;
  if (code === "A" || code === "?") return Plus;
  return FileCode2;
};

const allInGroupSelected = (groupFiles: GitFileStatusItem[]) =>
  groupFiles.length > 0 && groupFiles.every((f) => selectedPaths.value.has(f.path));

const selectedCount = computed(() => selectedPaths.value.size);
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden bg-background">
    <!-- Error -->
    <div
      v-if="git.error.value"
      class="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-destructive/10 bg-destructive/[0.04]"
    >
      <TriangleAlert class="size-3 shrink-0 text-destructive/60" />
      <p class="text-[11px] text-destructive/70 truncate">{{ git.error.value }}</p>
    </div>

    <!-- Empty -->
    <div v-if="!cwd" class="flex flex-1 flex-col items-center justify-center gap-2">
      <GitBranch class="size-6 text-muted-foreground/10" />
      <p class="text-[11px] text-muted-foreground/25">未选择项目目录</p>
    </div>
    <div v-else-if="props.gitStatus && !isRealGitRepository" class="flex flex-1 flex-col items-center justify-center gap-2 px-5 text-center">
      <GitBranch class="size-6 text-muted-foreground/10" />
      <p class="text-[11px] text-muted-foreground/40">不是 Git 仓库</p>
      <p class="text-[10px] leading-4 text-muted-foreground/25">Git 只用于目录内存在真实 .git 的项目。工作空间历史请看「版本」。</p>
    </div>
    <div v-else-if="git.isLoading.value && !git.status.value" class="flex flex-1 flex-col items-center justify-center gap-2">
      <LoaderCircle class="size-4 animate-spin text-muted-foreground/10" />
      <p class="text-[11px] text-muted-foreground/25">加载中...</p>
    </div>

    <!-- Main -->
    <template v-else>
      <ScrollArea class="flex-1">
        <div class="pb-2">

          <!-- ===== Toolbar ===== -->
          <div class="flex items-center justify-between px-3 py-2 gap-2 border-b border-border/[0.08]">
            <div class="flex min-w-0 items-center gap-2 flex-1">
              <Select :model-value="currentBranch || ''" @update:model-value="(v) => handleBranchChange(v as string)">
                <SelectTrigger class="h-7 gap-1.5 rounded-md border-0 bg-accent/25 px-2 text-[11px] font-medium text-foreground/70 hover:bg-accent/40 focus:ring-0 focus:ring-offset-0 [&>svg]:hidden">
                  <GitBranch class="size-3 shrink-0 text-muted-foreground/40" />
                  <SelectValue :placeholder="currentBranch || 'detached'" />
                  <ChevronDown class="size-3 text-muted-foreground/30" />
                </SelectTrigger>
                <SelectContent class="max-h-60">
                  <SelectItem v-for="branch in branches" :key="branch" :value="branch" class="text-[11px]">
                    {{ branch }}
                  </SelectItem>
                </SelectContent>
              </Select>

              <span v-if="branchError" class="text-[10px] text-destructive/60 truncate">{{ branchError }}</span>

              <div class="flex items-center gap-1 shrink-0">
                <span v-if="ahead > 0" class="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600/70">
                  <ArrowUp class="size-2.5" />{{ ahead }}
                </span>
                <span v-if="behind > 0" class="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-600/70">
                  <ArrowDown class="size-2.5" />{{ behind }}
                </span>
              </div>
            </div>

            <TooltipProvider>
              <div class="flex items-center gap-0.5 shrink-0">
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Button variant="ghost" size="icon-sm" class="size-6 text-muted-foreground/25 hover:text-foreground" :disabled="git.isSyncing.value" @click="git.refresh()">
                      <RefreshCw class="size-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom"><p class="text-[10px]">刷新</p></TooltipContent>
                </Tooltip>

                <template v-if="canPushPull">
                  <div class="w-px h-3 bg-border/30 mx-0.5" />
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <Button variant="ghost" size="icon-sm" class="size-6 text-muted-foreground/25 hover:text-foreground" :disabled="git.isSyncing.value" @click="git.fetch()">
                        <LoaderCircle v-if="git.isSyncing.value" class="size-3 animate-spin" />
                        <ArrowDown v-else class="size-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom"><p class="text-[10px]">Fetch</p></TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <Button variant="ghost" size="icon-sm" class="size-6 text-muted-foreground/25 hover:text-foreground" :disabled="git.isSyncing.value || behind === 0" @click="git.pull()">
                        <ArrowDown class="size-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom"><p class="text-[10px]">Pull</p></TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <Button variant="ghost" size="icon-sm" class="size-6 text-muted-foreground/25 hover:text-foreground" :disabled="git.isSyncing.value || ahead === 0" @click="git.push()">
                        <ArrowUp class="size-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom"><p class="text-[10px]">Push</p></TooltipContent>
                  </Tooltip>
                </template>
              </div>
            </TooltipProvider>
          </div>

          <!-- ===== Staged ===== -->
          <div v-if="stagedFiles.length > 0">
            <div
              class="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-accent/15 transition-colors select-none"
              @click="toggleAllInGroup(stagedFiles)"
            >
              <div class="flex items-center gap-2">
                <div
                  class="flex shrink-0 items-center justify-center size-3.5 rounded-[3px] transition-colors"
                  :class="allInGroupSelected(stagedFiles)
                    ? 'bg-primary/70 text-primary-foreground'
                    : 'border border-muted-foreground/20 text-transparent'"
                >
                  <Check class="size-2.5" />
                </div>
                <span class="text-[11px] font-semibold text-muted-foreground/45 uppercase tracking-wider">已暂存</span>
                <span class="text-[10px] font-bold text-muted-foreground/30">{{ stagedFiles.length }}</span>
              </div>
              <div class="size-1.5 rounded-full bg-emerald-500/40" />
            </div>

            <div
              v-for="file in stagedFiles"
              :key="file.path"
              class="group flex items-center gap-2 px-3 py-[5px] cursor-pointer select-none transition-colors"
              :class="selectedPaths.has(file.path) ? 'bg-accent/15' : 'hover:bg-accent/10'"
              @click="togglePath(file.path)"
            >
              <div
                class="flex shrink-0 items-center justify-center size-3.5 rounded-[3px] transition-colors"
                :class="selectedPaths.has(file.path)
                  ? 'bg-primary/70 text-primary-foreground'
                  : 'border border-muted-foreground/15 text-transparent group-hover:border-muted-foreground/25'"
                @click.stop="togglePath(file.path)"
              >
                <Check class="size-2.5" />
              </div>
              <component :is="statusIcon(file)" class="size-3 shrink-0" :class="statusMeta(file).color" />
              <div class="size-[5px] rounded-full shrink-0" :class="statusMeta(file).dot" />
              <span class="min-w-0 flex-1 truncate text-[12px] font-mono text-foreground/70">{{ file.path }}</span>
              <span class="shrink-0 text-[9px] font-medium uppercase tracking-wider" :class="statusMeta(file).color">
                {{ statusMeta(file).label }}
              </span>
              <button
                class="shrink-0 text-[9px] text-muted-foreground/30 hover:text-foreground/60 px-1.5 py-0.5 rounded border border-border/15 hover:bg-accent/40 transition-colors"
                @click.stop="openDiff(file)"
              >
                diff
              </button>
            </div>
          </div>

          <!-- Divider -->
          <div v-if="stagedFiles.length > 0 && unstagedFiles.length > 0" class="mx-3 my-1 h-px bg-border/15" />

          <!-- ===== Changes ===== -->
          <div v-if="unstagedFiles.length > 0">
            <div
              class="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-accent/15 transition-colors select-none"
              @click="toggleAllInGroup(unstagedFiles)"
            >
              <div class="flex items-center gap-2">
                <div
                  class="flex shrink-0 items-center justify-center size-3.5 rounded-[3px] transition-colors"
                  :class="allInGroupSelected(unstagedFiles)
                    ? 'bg-primary/70 text-primary-foreground'
                    : 'border border-muted-foreground/20 text-transparent'"
                >
                  <Check class="size-2.5" />
                </div>
                <span class="text-[11px] font-semibold text-muted-foreground/45 uppercase tracking-wider">变更</span>
                <span class="text-[10px] font-bold text-muted-foreground/30">{{ unstagedFiles.length }}</span>
              </div>
            </div>

            <div
              v-for="file in unstagedFiles"
              :key="file.path"
              class="group flex items-center gap-2 px-3 py-[5px] cursor-pointer select-none transition-colors"
              :class="selectedPaths.has(file.path) ? 'bg-accent/15' : 'hover:bg-accent/10'"
              @click="togglePath(file.path)"
            >
              <div
                class="flex shrink-0 items-center justify-center size-3.5 rounded-[3px] transition-colors"
                :class="selectedPaths.has(file.path)
                  ? 'bg-primary/70 text-primary-foreground'
                  : 'border border-muted-foreground/15 text-transparent group-hover:border-muted-foreground/25'"
                @click.stop="togglePath(file.path)"
              >
                <Check class="size-2.5" />
              </div>
              <component :is="statusIcon(file)" class="size-3 shrink-0" :class="statusMeta(file).color" />
              <div class="size-[5px] rounded-full shrink-0" :class="statusMeta(file).dot" />
              <span class="min-w-0 flex-1 truncate text-[12px] font-mono text-foreground/70">{{ file.path }}</span>
              <span class="shrink-0 text-[9px] font-medium uppercase tracking-wider" :class="statusMeta(file).color">
                {{ statusMeta(file).label }}
              </span>
              <button
                class="shrink-0 text-[9px] text-muted-foreground/30 hover:text-foreground/60 px-1.5 py-0.5 rounded border border-border/15 hover:bg-accent/40 transition-colors"
                @click.stop="openDiff(file)"
              >
                diff
              </button>
            </div>
          </div>

          <!-- Empty -->
          <div v-if="files.length === 0" class="flex flex-col items-center py-12">
            <Check class="size-5 text-muted-foreground/10 mb-2" />
            <p class="text-[11px] text-muted-foreground/25">没有变更</p>
            <p class="text-[10px] text-muted-foreground/15 mt-0.5">工作区已清空</p>
          </div>

          <!-- ===== Commit ===== -->
          <div class="px-3 pt-3 mt-1 border-t border-border/[0.08]">
            <Textarea
              v-model="commitMessage"
              placeholder="Commit message..."
              class="min-h-[44px] resize-none text-[12px] rounded-md border-border/15 bg-accent/[0.08] px-3 py-2 focus-visible:ring-1 focus-visible:ring-ring/30 focus-visible:ring-offset-0"
              @keydown.ctrl.enter="() => handleCommit(false)"
              @keydown.meta.enter="() => handleCommit(false)"
            />
            <div class="flex items-center gap-1.5 mt-2">
              <Button
                size="sm"
                class="flex-1 h-7 text-[11px]"
                :disabled="!commitMessage.trim() || selectedCount === 0 || git.isCommitting.value"
                @click="handleCommit(false)"
              >
                <Check class="mr-1 size-3" />
                Commit
                <span v-if="selectedCount > 0" class="ml-1 text-[10px] opacity-50">({{ selectedCount }})</span>
              </Button>
              <Button
                v-if="canPushPull"
                size="sm"
                variant="outline"
                class="h-7 text-[11px]"
                :disabled="!commitMessage.trim() || selectedCount === 0 || git.isCommitting.value"
                @click="handleCommit(true)"
              >
                <ArrowUp class="mr-1 size-3" />
                Push
              </Button>
            </div>
          </div>

        </div>
      </ScrollArea>
    </template>

    <GitDiffViewer v-model:open="diffOpen" :cwd="cwd" :file-path="diffFilePath" :staged="diffStaged" />
  </div>
</template>
