<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { Activity, AlertTriangle, Brain, Database, FileText, FolderSearch, LoaderCircle, Network, RefreshCcw, Search } from "lucide-vue-next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { getWorkspaceKnowledgeDiagnostics, refreshWorkspaceRag, searchWorkspace } from "@/lib/api";
import type {
	WorkspaceKnowledgeDiagnosticsResponse,
	WorkspaceSearchResponse,
	WorkspaceSearchResult,
	WorkspaceSearchResultType,
} from "@/lib/types";
import { cn } from "@/lib/utils";
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
const selectedType = ref<WorkspaceSearchResultType | "all">("all");
const selectedTime = ref<"all" | "today" | "week" | "month">("all");
const dirFilter = ref("");
const sortMode = ref<"relevance" | "updated">("relevance");
const isLoading = ref(false);
const response = ref<WorkspaceSearchResponse | null>(null);
const diagnostics = ref<WorkspaceKnowledgeDiagnosticsResponse | null>(null);
const isDiagnosticsLoading = ref(false);
const debounceTimer = ref<ReturnType<typeof setTimeout> | null>(null);
const refreshingId = ref<string | null>(null);

const typeOptions: Array<{ value: WorkspaceSearchResultType | "all"; label: string }> = [
	{ value: "all", label: "全部类型" },
	{ value: "file", label: "文件" },
	{ value: "task", label: "任务" },
	{ value: "milestone", label: "里程碑" },
	{ value: "project", label: "项目" },
	{ value: "session", label: "会话" },
	{ value: "memory", label: "记忆" },
	{ value: "wiki", label: "Wiki" },
	{ value: "space", label: "空间" },
	{ value: "rag", label: "RAG" },
];

const typeLabelMap = new Map(typeOptions.map((item) => [item.value, item.label]));

const groupedResults = computed(() => {
	const groups = new Map<WorkspaceSearchResultType, WorkspaceSearchResult[]>();
	for (const item of response.value?.results ?? []) {
		const current = groups.get(item.type) ?? [];
		current.push(item);
		groups.set(item.type, current);
	}
	return Array.from(groups.entries());
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
			type: selectedType.value === "all" ? undefined : selectedType.value,
			time: selectedTime.value,
			dir: dirFilter.value.trim() || undefined,
			sort: sortMode.value,
			limit: 100,
		});
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

async function refreshResult(item: WorkspaceSearchResult) {
	const path = item.path ?? item.sourcePath;
	if (!path) return;
	refreshingId.value = item.id;
	try {
		await refreshWorkspaceRag(path);
		await loadDiagnostics();
		await runSearch();
	} catch (error) {
		toast.error("刷新索引失败", {
			description: error instanceof Error ? error.message : "无法刷新该文件索引。",
		});
	} finally {
		refreshingId.value = null;
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

watch([query, selectedType, selectedTime, dirFilter, sortMode], scheduleSearch);

onMounted(() => {
	query.value = "";
	void loadDiagnostics();
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background">
    <header class="shrink-0 border-b border-subtle px-5 py-4">
      <div class="flex flex-wrap items-center gap-2">
        <div class="relative min-w-[260px] flex-1">
          <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            v-model="query"
            class="h-9 pl-8 text-sm"
            placeholder="搜索文件、任务、记忆、Wiki、空间和 RAG"
          />
        </div>
        <Select v-model="selectedType">
          <SelectTrigger class="h-9 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="item in typeOptions" :key="item.value" :value="item.value">
              {{ item.label }}
            </SelectItem>
          </SelectContent>
        </Select>
        <Select v-model="selectedTime">
          <SelectTrigger class="h-9 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部时间</SelectItem>
            <SelectItem value="today">今天</SelectItem>
            <SelectItem value="week">本周</SelectItem>
            <SelectItem value="month">本月</SelectItem>
          </SelectContent>
        </Select>
        <Input v-model="dirFilter" class="h-9 w-36 text-xs" placeholder="目录筛选" />
        <Select v-model="sortMode">
          <SelectTrigger class="h-9 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="relevance">相关度</SelectItem>
            <SelectItem value="updated">最近更新</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div v-if="response" class="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary">已索引 {{ response.indexStatus.indexed }}</Badge>
        <Badge variant="outline">待索引 {{ response.indexStatus.pending }}</Badge>
        <Badge :variant="response.indexStatus.indexFailed ? 'destructive' : 'outline'">
          失败 {{ response.indexStatus.indexFailed }}
        </Badge>
        <span v-if="isLoading" class="inline-flex items-center gap-1">
          <LoaderCircle class="size-3 animate-spin" />
          搜索中
        </span>
      </div>
    </header>

    <ScrollArea class="min-h-0 flex-1">
      <div v-if="!response && !isLoading" class="space-y-5 p-5">
        <section class="space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <Brain class="size-4 text-muted-foreground" />
              <h3 class="text-sm font-medium text-foreground">知识诊断</h3>
              <LoaderCircle v-if="isDiagnosticsLoading" class="size-3.5 animate-spin text-muted-foreground" />
            </div>
            <Button variant="outline" size="sm" class="h-8 gap-1.5 text-xs" @click="loadDiagnostics">
              <RefreshCcw class="size-3.5" />
              刷新
            </Button>
          </div>

          <div v-if="diagnostics" class="grid gap-3 lg:grid-cols-3">
            <div class="rounded-md border border-default p-3">
              <div class="mb-2 flex items-center gap-2 text-xs font-medium text-foreground">
                <Activity class="size-3.5 text-muted-foreground" />
                RAG
              </div>
              <div class="flex flex-wrap gap-1.5 text-xs">
                <Badge variant="secondary">已索引 {{ diagnostics.rag.indexed }}</Badge>
                <Badge variant="outline">待索引 {{ diagnostics.rag.pending }}</Badge>
                <Badge :variant="diagnostics.rag.indexFailed ? 'destructive' : 'outline'">失败 {{ diagnostics.rag.indexFailed }}</Badge>
              </div>
              <div class="mt-2 text-xs text-muted-foreground">
                最近索引 {{ diagnostics.rag.latestIndexedAt ? formatTime(diagnostics.rag.latestIndexedAt) : "无记录" }}
              </div>
            </div>

            <div class="rounded-md border border-default p-3">
              <div class="mb-2 flex items-center gap-2 text-xs font-medium text-foreground">
                <FileText class="size-3.5 text-muted-foreground" />
                记忆 / Wiki
              </div>
              <div class="space-y-1 text-xs text-muted-foreground">
                <div class="flex items-center justify-between gap-2">
                  <span class="truncate">{{ diagnostics.memory.memoryPath }}</span>
                  <Badge :variant="diagnostics.memory.injected ? 'secondary' : 'outline'">{{ diagnostics.memory.injected ? "已注入" : "空" }}</Badge>
                </div>
                <div class="flex items-center justify-between gap-2">
                  <span class="truncate">{{ diagnostics.wiki.indexPath }}</span>
                  <Badge :variant="diagnostics.wiki.injected ? 'secondary' : 'outline'">{{ diagnostics.wiki.indexStatus }}</Badge>
                </div>
                <div>daily {{ diagnostics.memory.dailyCount }} · 最近 {{ diagnostics.memory.latestDailyAt ? formatTime(diagnostics.memory.latestDailyAt) : "无记录" }}</div>
              </div>
            </div>

            <div class="rounded-md border border-default p-3">
              <div class="mb-2 flex items-center gap-2 text-xs font-medium text-foreground">
                <Database class="size-3.5 text-muted-foreground" />
                图谱 / MCP
              </div>
              <div class="flex flex-wrap gap-1.5 text-xs">
                <Badge :variant="diagnostics.graph.schemaExists ? 'secondary' : 'outline'">schema {{ diagnostics.graph.schemaExists ? "存在" : "缺失" }}</Badge>
                <Badge :variant="diagnostics.graph.databaseExists ? 'secondary' : 'outline'">graph {{ diagnostics.graph.databaseExists ? "存在" : "缺失" }}</Badge>
              </div>
              <div class="mt-2 flex flex-wrap gap-1.5 text-caption text-muted-foreground">
                <span v-for="tool in diagnostics.mcp.tools" :key="tool.name" class="rounded-sm bg-muted px-1.5 py-0.5">{{ tool.name }}</span>
              </div>
            </div>
          </div>
        </section>

        <section v-if="diagnostics?.rag.failedTargets.length" class="space-y-2">
          <div class="flex items-center gap-2">
            <AlertTriangle class="size-4 text-destructive" />
            <h3 class="text-sm font-medium text-foreground">索引失败</h3>
          </div>
          <div class="divide-y divide-border/50 rounded-md border border-default">
            <div v-for="target in diagnostics.rag.failedTargets" :key="target.path" class="flex items-center gap-3 px-3 py-2">
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm text-foreground">{{ target.path }}</div>
                <div class="truncate text-xs text-muted-foreground">{{ target.error || "未知错误" }}</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                class="h-8 shrink-0 gap-1.5 text-xs"
                :disabled="refreshingId === `diagnostic:${target.path}`"
                @click="refreshDiagnosticTarget(target.path)"
              >
                <LoaderCircle v-if="refreshingId === `diagnostic:${target.path}`" class="size-3.5 animate-spin" />
                <RefreshCcw v-else class="size-3.5" />
                刷新失败索引
              </Button>
            </div>
          </div>
        </section>

        <section v-if="diagnostics?.backgroundJobs.recentFailures.length" class="space-y-2">
          <div class="flex items-center gap-2">
            <Network class="size-4 text-muted-foreground" />
            <h3 class="text-sm font-medium text-foreground">后台任务</h3>
            <Badge variant="outline">失败 {{ diagnostics.backgroundJobs.byStatus.failed }}</Badge>
          </div>
          <div class="divide-y divide-border/50 rounded-md border border-default">
            <div v-for="job in diagnostics.backgroundJobs.recentFailures" :key="job.jobId" class="px-3 py-2">
              <div class="flex min-w-0 items-center gap-2">
                <span class="truncate text-sm text-foreground">{{ job.jobId }}</span>
                <Badge variant="outline" class="h-5 shrink-0 text-micro">{{ job.type }}</Badge>
              </div>
              <div class="mt-1 truncate text-xs text-muted-foreground">{{ job.lastError || job.relatedId }}</div>
            </div>
          </div>
        </section>

        <div v-if="!diagnostics && !isDiagnosticsLoading" class="flex h-full min-h-[220px] items-center justify-center px-6 text-sm text-muted-foreground">
          <div class="flex items-center gap-2">
            <FolderSearch class="size-5" />
            <span>输入关键词后显示确定结果</span>
          </div>
        </div>
      </div>

      <div v-else-if="response && response.results.length === 0" class="flex h-full min-h-[320px] items-center justify-center px-6 text-sm text-muted-foreground">
        没有匹配结果
      </div>

      <div v-else class="space-y-6 p-5">
        <section v-for="[type, items] in groupedResults" :key="type" class="space-y-2">
          <div class="flex items-center gap-2">
            <h3 class="text-sm font-medium text-foreground">{{ typeLabelMap.get(type) ?? type }}</h3>
            <Badge variant="secondary" class="h-5">{{ items.length }}</Badge>
          </div>
          <div class="divide-y divide-border/50 rounded-md border border-default">
            <button
              v-for="item in items"
              :key="item.id"
              type="button"
              :class="cn(
                'flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-soft',
                item.type === 'rag' ? 'bg-subtle' : '',
              )"
              @click="openResult(item)"
            >
              <FileText class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span class="min-w-0 flex-1">
                <span class="flex min-w-0 items-center gap-2">
                  <span class="truncate text-sm font-medium text-foreground">{{ item.title }}</span>
                  <Badge variant="outline" class="h-5 shrink-0 text-micro">{{ typeLabelMap.get(item.type) }}</Badge>
                  <span class="shrink-0 text-caption text-muted-foreground">{{ formatTime(item.updatedAt) }}</span>
                </span>
                <span class="mt-1 block truncate text-xs text-muted-foreground">
                  {{ item.sourcePath || item.path || item.targetId }}
                </span>
                <span class="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground/90">
                  {{ item.snippet }}
                </span>
                <span v-if="item.headingPath?.length" class="mt-1 block truncate text-caption text-muted-foreground">
                  {{ item.headingPath.join(" / ") }}<template v-if="item.startLine"> · L{{ item.startLine }}</template>
                </span>
              </span>
              <Button
                v-if="['file', 'memory', 'wiki', 'rag'].includes(item.type)"
                variant="ghost"
                size="icon"
                class="h-7 w-7 shrink-0"
                :disabled="refreshingId === item.id"
                @click.stop="refreshResult(item)"
              >
                <LoaderCircle v-if="refreshingId === item.id" class="size-3.5 animate-spin" />
                <RefreshCcw v-else class="size-3.5" />
              </Button>
            </button>
          </div>
        </section>
      </div>
    </ScrollArea>
  </div>
</template>
