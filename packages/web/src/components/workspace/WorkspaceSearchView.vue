<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import {
	AlertTriangle,
	BookOpen,
	Brain,
	Briefcase,
	CheckCircle2,
	FileText,
	Flag,
	FolderSearch,
	Layers,
	LoaderCircle,
	MessageSquare,
	RefreshCcw,
	Search,
	Sparkles,
} from "lucide-vue-next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getWorkspaceKnowledgeDiagnostics, refreshWorkspaceRag, searchWorkspace } from "@/lib/api";
import type {
	WorkspaceKnowledgeDiagnosticsResponse,
	WorkspaceSearchResponse,
	WorkspaceSearchResult,
	WorkspaceSearchResultType,
} from "@/lib/types";
import { toast } from "vue-sonner";

const props = defineProps<{
	workspaceDir: string;
}>();

const emit = defineEmits<{
	(e: "open-file", path: string): void;
	(e: "open-session", sessionId: string): void;
	(e: "open-tasks"): void;
	(e: "open-project", projectId: string): void;
	(e: "open-space-work", workId: string): void;
}>();

const query = ref("");
const isLoading = ref(false);
const response = ref<WorkspaceSearchResponse | null>(null);
const diagnostics = ref<WorkspaceKnowledgeDiagnosticsResponse | null>(null);
const isDiagnosticsLoading = ref(false);
const debounceTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const refreshingId = ref<string | null>(null);
const selectedType = ref<WorkspaceSearchResultType | "all">("all");

const hiddenIssueCount = computed(() => diagnostics.value?.rag.failedTargets.length ?? 0);
const firstHiddenIssue = computed(() => diagnostics.value?.rag.failedTargets[0] ?? null);

const typeMeta: Record<WorkspaceSearchResultType, { label: string; icon: typeof FileText; color: string }> = {
	file: { label: "文件", icon: FileText, color: "text-slate-500" },
	session: { label: "会话", icon: MessageSquare, color: "text-indigo-500" },
	task: { label: "任务", icon: CheckCircle2, color: "text-sky-500" },
	milestone: { label: "里程碑", icon: Flag, color: "text-amber-500" },
	project: { label: "项目", icon: Briefcase, color: "text-purple-500" },
	space: { label: "空间", icon: Layers, color: "text-teal-500" },
	memory: { label: "记忆", icon: Brain, color: "text-orange-500" },
	wiki: { label: "知识", icon: BookOpen, color: "text-emerald-500" },
	rag: { label: "索引", icon: Sparkles, color: "text-indigo-400" },
};

const filteredResults = computed(() => {
	if (!response.value) return [];
	if (selectedType.value === "all") return response.value.results;
	return response.value.results.filter((r) => r.type === selectedType.value);
});

const resultGroups = computed(() => {
	if (!response.value) return [];
	return response.value.groups.filter((g) => g.count > 0);
});

async function runSearch() {
	const text = query.value.trim();
	if (!text) {
		response.value = null;
		return;
	}
	isLoading.value = true;
	try {
		response.value = await searchWorkspace({
			q: text,
			limit: 100,
		});
		selectedType.value = "all";
	} catch (error) {
		toast.error("搜索失败", {
			description: error instanceof Error ? error.message : "无法完成搜索。",
		});
	} finally {
		isLoading.value = false;
	}
}

async function loadDiagnostics() {
	isDiagnosticsLoading.value = true;
	try {
		diagnostics.value = await getWorkspaceKnowledgeDiagnostics();
	} catch (error) {
		toast.error("知识诊断加载失败", {
			description: error instanceof Error ? error.message : "无法读取当前知识系统状态。",
		});
	} finally {
		isDiagnosticsLoading.value = false;
	}
}

function scheduleSearch() {
	if (debounceTimer.value) clearTimeout(debounceTimer.value);
	debounceTimer.value = setTimeout(() => {
		void runSearch();
	}, 180);
}

function openResult(item: WorkspaceSearchResult) {
	if (item.type === "session" && item.targetId) {
		emit("open-session", item.targetId);
		return;
	}
	if (item.type === "task" || item.type === "milestone") {
		emit("open-tasks");
		return;
	}
	if (item.type === "project" && item.targetId) {
		emit("open-project", item.targetId);
		return;
	}
	if (item.type === "space" && item.targetId) {
		emit("open-space-work", item.targetId);
		return;
	}
	const path = item.path ?? item.sourcePath;
	if (path) {
		const fullPath = path.startsWith("/") ? path : `${props.workspaceDir}/${path}`;
		emit("open-file", fullPath);
	}
}

async function refreshDiagnosticTarget(path: string) {
	refreshingId.value = `diagnostic:${path}`;
	try {
		await refreshWorkspaceRag(path);
		await loadDiagnostics();
		if (query.value.trim()) {
			await runSearch();
		}
	} catch (error) {
		toast.error("刷新索引失败", {
			description: error instanceof Error ? error.message : "无法刷新该文件索引。",
		});
	} finally {
		refreshingId.value = null;
	}
}

function formatTime(value: number) {
	if (!value) return "";
	return new Intl.DateTimeFormat("zh-CN", {
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(value));
}

watch(query, scheduleSearch);

onMounted(() => {
	query.value = "";
	void loadDiagnostics();
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background">
    <!-- 搜索栏 -->
    <header class="shrink-0 border-b border-subtle px-5 py-4">
      <div class="mx-auto flex max-w-3xl items-center gap-3">
        <div class="relative min-w-0 flex-1">
          <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            v-model="query"
            class="h-10 pl-9 text-body"
            placeholder="搜索文件、会话、任务、知识..."
          />
        </div>
        <span v-if="isLoading" class="inline-flex shrink-0 items-center gap-1.5 text-caption text-muted-foreground">
          <LoaderCircle class="size-3.5 animate-spin" />
          搜索中
        </span>
      </div>
    </header>

    <ScrollArea class="min-h-0 flex-1">
      <div class="mx-auto max-w-3xl px-5 py-4">
        <!-- 初始空状态 -->
        <div v-if="!response && !isLoading" class="flex flex-col items-center py-20">
          <div class="mb-5 flex size-14 items-center justify-center rounded-xl bg-soft text-muted-foreground">
            <FolderSearch class="size-7" />
          </div>
          <h3 class="text-body-lg font-semibold text-foreground">搜索工作空间</h3>
          <p class="mt-1.5 max-w-xs text-center text-caption text-muted-foreground">
            输入关键词查找文件、会话、任务和知识。ridge 会自动索引并实时搜索。
          </p>

          <div v-if="isDiagnosticsLoading" class="mt-5 flex items-center gap-1.5 text-caption text-muted-foreground">
            <LoaderCircle class="size-3.5 animate-spin" />
            正在检查索引状态
          </div>

          <div
            v-else-if="firstHiddenIssue"
            class="mt-5 flex w-full max-w-sm items-center gap-3 rounded-lg border border-subtle bg-soft px-4 py-3"
          >
            <AlertTriangle class="size-4 shrink-0 text-destructive" />
            <div class="min-w-0 flex-1">
              <p class="text-body-sm text-foreground">
                {{ hiddenIssueCount }} 个内容暂时搜不到
              </p>
              <p class="mt-0.5 text-caption text-muted-foreground">索引可能未就绪，点击重新整理</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              class="h-7 shrink-0 gap-1 text-caption"
              :disabled="refreshingId === `diagnostic:${firstHiddenIssue.path}`"
              @click="refreshDiagnosticTarget(firstHiddenIssue.path)"
            >
              <LoaderCircle v-if="refreshingId === `diagnostic:${firstHiddenIssue.path}`" class="size-3 animate-spin" />
              <RefreshCcw v-else class="size-3" />
              整理
            </Button>
          </div>
        </div>

        <!-- 无结果 -->
        <div v-else-if="response && filteredResults.length === 0" class="flex flex-col items-center py-20">
          <div class="mb-4 flex size-12 items-center justify-center rounded-xl bg-subtle text-muted-foreground/50">
            <Search class="size-6" />
          </div>
          <p class="text-body text-muted-foreground">未找到相关内容</p>
          <p v-if="selectedType !== 'all'" class="mt-1 text-caption text-muted-foreground/60">
            当前筛选：{{ typeMeta[selectedType].label }}
          </p>
        </div>

        <!-- 结果列表 -->
        <template v-else>
          <!-- 筛选芯片 -->
          <div v-if="resultGroups.length > 1" class="mb-4 flex flex-wrap gap-1.5">
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-caption transition-colors"
              :class="selectedType === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'bg-soft text-muted-foreground hover:bg-hover'"
              @click="selectedType = 'all'"
            >
              全部
              <span class="tabular-nums">{{ response?.results.length ?? 0 }}</span>
            </button>
            <button
              v-for="group in resultGroups"
              :key="group.type"
              type="button"
              class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-caption transition-colors"
              :class="selectedType === group.type
                ? 'bg-primary text-primary-foreground'
                : 'bg-soft text-muted-foreground hover:bg-hover'"
              @click="selectedType = group.type"
            >
              <component :is="typeMeta[group.type].icon" class="size-3.5" />
              {{ typeMeta[group.type].label }}
              <span class="tabular-nums">{{ group.count }}</span>
            </button>
          </div>

          <!-- 结果计数 -->
          <div v-if="selectedType === 'all' && response" class="mb-3 flex items-center justify-between">
            <span class="text-caption text-muted-foreground">
              找到 {{ response.results.length }} 个结果
            </span>
          </div>

          <!-- 结果卡片 -->
          <div class="space-y-2">
            <button
              v-for="item in filteredResults"
              :key="item.id"
              type="button"
              class="group flex w-full items-start gap-3 rounded-lg border border-subtle bg-card px-3 py-3 text-left transition-all hover:border-default hover:shadow-sm"
              @click="openResult(item)"
            >
              <!-- 类型图标 -->
              <div
                class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md"
                :class="typeMeta[item.type].color.replace('text-', 'bg-').replace('500', '100').replace('400', '100') + ' ' + typeMeta[item.type].color.replace('500', '600').replace('400', '500')"
              >
                <component :is="typeMeta[item.type].icon" class="size-4" />
              </div>

              <!-- 内容 -->
              <div class="min-w-0 flex-1">
                <!-- 标题行 -->
                <div class="flex min-w-0 items-center gap-2">
                  <span class="min-w-0 flex-1 truncate text-body font-medium text-foreground">
                    {{ item.title }}
                  </span>
                  <span class="shrink-0 text-caption text-muted-foreground tabular-nums">
                    {{ formatTime(item.updatedAt) }}
                  </span>
                </div>

                <!-- 路径 / 位置 -->
                <span
                  v-if="item.sourcePath || item.path || item.targetId"
                  class="mt-0.5 block truncate text-caption text-muted-foreground/70"
                >
                  {{ item.sourcePath || item.path || item.targetId }}
                </span>

                <!-- 高亮片段 -->
                <span v-if="item.snippet" class="mt-1 line-clamp-2 block text-body-sm leading-relaxed text-muted-foreground/80">
                  {{ item.snippet }}
                </span>

                <!-- 章节路径 -->
                <span v-if="item.headingPath?.length" class="mt-1.5 flex items-center gap-1 truncate text-micro text-muted-foreground/50">
                  <component :is="typeMeta[item.type].icon" class="size-3" />
                  {{ item.headingPath.join(" / ") }}
                  <template v-if="item.startLine"> · L{{ item.startLine }}</template>
                </span>
              </div>
            </button>
          </div>
        </template>
      </div>
    </ScrollArea>
  </div>
</template>
