<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
	CheckSquare,
	FileText,
	Lightbulb,
	MessageSquare,
	SendHorizontal,
	Sparkles,
	Calendar,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { fileIconByExtension } from "@/composables/useFileIcons";
import type { RecentActivityItem } from "@/composables/useRecentActivity";
import type { RecentFileItem } from "@/lib/api";
import type { AgentSummary, ThinkingLevel } from "@/lib/types";
import { NO_AGENT_VALUE, thinkingOptions } from "@/composables/useWorkbenchSessionState";

export type HomeSubmitPayload = {
	text: string;
	model: string;
	agent: string;
	thinkingLevel: ThinkingLevel;
};

const props = defineProps<{
	workspaceDir: string;
	recentFiles: RecentFileItem[];
	recentActivity: RecentActivityItem[];
	isRecentLoading: boolean;
	models: Array<{ label: string; value: string }>;
	agents: AgentSummary[];
	defaultModel: string;
	defaultAgent: string;
	defaultThinkingLevel: ThinkingLevel;
}>();

const emit = defineEmits<{
	(e: "submit", payload: HomeSubmitPayload): void;
	(e: "open-file", path: string): void;
	(e: "open-session", sessionId: string): void;
	(e: "open-tasks"): void;
}>();

// ===== AI 输入框状态 =====
const draftText = ref("");
const isFocused = ref(false);

// ===== 选择器状态 =====
const selectedModel = ref(props.defaultModel);
const selectedAgent = ref(props.defaultAgent || NO_AGENT_VALUE);
const selectedThinkingLevel = ref<ThinkingLevel>(props.defaultThinkingLevel);

watch(
	() => [props.defaultModel, props.models] as const,
	([defaultModel, models]) => {
		if (!defaultModel) return;
		const modelValues = new Set(models.map((model) => model.value));
		if (!selectedModel.value || !modelValues.has(selectedModel.value)) {
			selectedModel.value = defaultModel;
		}
	},
);

const isExpanded = computed(() => isFocused.value || draftText.value.length > 0);

function handleSubmit() {
	const text = draftText.value.trim();
	if (!text) return;
	emit("submit", {
		text,
		model: selectedModel.value,
		agent: selectedAgent.value,
		thinkingLevel: selectedThinkingLevel.value,
	});
	draftText.value = "";
}

function handleFocus() {
	isFocused.value = true;
}

function handleBlur() {
	if (!draftText.value.trim()) {
		isFocused.value = false;
	}
}

// ===== 最近事情图标映射 =====
const kindIconMap: Record<string, typeof FileText> = {
	file: FileText,
	task: CheckSquare,
	moment: Lightbulb,
	journal: Calendar,
	session: MessageSquare,
};

const kindLabelMap: Record<string, string> = {
	file: "文件",
	task: "待办",
	moment: "闪念",
	journal: "日记",
	session: "会话",
};

function handleActivityClick(item: RecentActivityItem) {
	if (item.kind === "file" || item.kind === "journal" || item.kind === "moment") {
		if (item.filePath) emit("open-file", item.filePath);
	} else if (item.kind === "session") {
		if (item.sessionId) emit("open-session", item.sessionId);
	} else if (item.kind === "task") {
		emit("open-tasks");
	}
}

const visibleActivity = computed(() => props.recentActivity.slice(0, 10));
const visibleRecentFiles = computed(() => props.recentFiles.slice(0, 5));

const formatDate = (timestamp: number) =>
	new Intl.DateTimeFormat("zh-CN", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(timestamp);

// 构建带 "无 Agent" 选项的 agent 列表
const agentOptions = computed(() => {
	const list: Array<{ name: string; label: string }> = [
		{ name: NO_AGENT_VALUE, label: "无 Agent（直接对话）" },
	];
	for (const agent of props.agents) {
		list.push({ name: agent.name, label: agent.name });
	}
	return list;
});
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden bg-background">
    <ScrollArea class="flex-1">
      <div class="mx-auto flex w-full max-w-5xl flex-col px-6 pb-8">

        <!-- AI 启动输入框 -->
        <div data-testid="home-ai-hero" class="flex min-h-[42vh] w-full flex-col justify-center pt-8">
          <p class="sr-only">开始对话</p>
          <form class="mx-auto w-full max-w-2xl" @submit.prevent="handleSubmit">
            <div
              class="rounded-2xl border border-border/50 bg-card p-2.5 shadow-sm ring-1 ring-border/20 transition-all duration-200 focus-within:border-primary/30 focus-within:ring-primary/20"
            >
              <!-- 输入区 -->
              <div class="flex items-end gap-3 px-2 pt-2">
                <Textarea
                  v-model="draftText"
                  placeholder="问我任何事…"
                  class="min-h-[84px] max-h-[180px] min-w-0 flex-1 resize-none border-0 bg-transparent p-0 text-[16px] leading-7 text-foreground shadow-none outline-none ring-0 placeholder:text-muted-foreground/50 focus-visible:ring-0"
                  :rows="isExpanded ? 4 : 3"
                  @focus="handleFocus"
                  @blur="handleBlur"
                />
                <Button
                  type="submit"
                  size="icon"
                  class="size-8 shrink-0 rounded-full"
                  :disabled="!draftText.trim()"
                >
                  <SendHorizontal class="size-4" />
                </Button>
              </div>

              <!-- 默认展示真实控件，保持首页输入框像完整 AI 对话 composer。 -->
              <div class="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/20 px-1 pt-2">
                <Select v-model="selectedModel">
                  <SelectTrigger class="h-7 w-auto min-w-[180px] max-w-[260px] gap-1.5 rounded-md border-border/40 bg-muted/35 px-2.5 text-[13px] shadow-none ring-0 hover:bg-muted/60 focus:ring-0">
                    <Sparkles class="size-3.5 text-primary/70" />
                    <SelectValue placeholder="模型" />
                  </SelectTrigger>
                  <SelectContent class="max-h-72 min-w-[280px]">
                    <SelectItem
                      v-for="model in models"
                      :key="model.value"
                      :value="model.value"
                      class="text-xs"
                    >
                      {{ model.label }}
                    </SelectItem>
                  </SelectContent>
                </Select>

                <Select v-model="selectedAgent">
                  <SelectTrigger class="h-7 w-auto min-w-[160px] max-w-[240px] gap-1.5 rounded-md border-border/40 bg-muted/35 px-2.5 text-[13px] shadow-none ring-0 hover:bg-muted/60 focus:ring-0">
                    <MessageSquare class="size-3.5 text-foreground/50" />
                    <SelectValue placeholder="Agent" />
                  </SelectTrigger>
                  <SelectContent class="max-h-72">
                    <SelectItem
                      v-for="agent in agentOptions"
                      :key="agent.name"
                      :value="agent.name"
                      class="text-xs"
                    >
                      {{ agent.label }}
                    </SelectItem>
                  </SelectContent>
                </Select>

                <Select v-model="selectedThinkingLevel">
                  <SelectTrigger class="h-7 w-auto min-w-[120px] max-w-[160px] gap-1.5 rounded-md border-border/40 bg-muted/35 px-2.5 text-[13px] shadow-none ring-0 hover:bg-muted/60 focus:ring-0">
                    <Lightbulb class="size-3.5 text-foreground/50" />
                    <SelectValue placeholder="思考" />
                  </SelectTrigger>
                  <SelectContent class="max-h-72">
                    <SelectItem
                      v-for="opt in thinkingOptions"
                      :key="opt.value"
                      :value="opt.value"
                      class="text-xs"
                    >
                      {{ opt.label }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </form>
        </div>

        <!-- 下方信息区：左时间线 + 右侧卡片 -->
        <div data-testid="home-info-grid" class="grid w-full grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_280px]">

          <!-- 左侧：最近事情混合时间线 -->
          <Card class="border border-border/50 bg-card shadow-sm">
            <CardHeader class="px-4 pt-4 pb-2">
              <CardTitle class="text-sm font-semibold text-foreground">最近事情</CardTitle>
            </CardHeader>
            <CardContent class="px-4 pb-4 pt-0">
              <div v-if="isRecentLoading" class="flex items-center gap-2 py-4 text-xs text-muted-foreground">
                加载中…
              </div>
              <div v-else-if="visibleActivity.length === 0" class="py-4 text-xs text-muted-foreground">
                暂无最近活动
              </div>
              <div v-else class="space-y-1">
                <button
                  v-for="item in visibleActivity"
                  :key="item.id"
                  type="button"
                  class="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent/40"
                  @click="handleActivityClick(item)"
                >
                  <component :is="kindIconMap[item.kind]" class="size-3.5 shrink-0 text-muted-foreground" />
                  <span class="min-w-0 flex-1 truncate text-[13px] text-foreground">{{ item.title }}</span>
                  <Badge variant="outline" class="h-4 shrink-0 px-1 text-[9px] font-normal text-muted-foreground">
                    {{ kindLabelMap[item.kind] }}
                  </Badge>
                  <span class="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {{ formatDate(item.timestamp) }}
                  </span>
                </button>
              </div>
            </CardContent>
          </Card>

          <!-- 右侧：最近文件 + AI 建议占位 -->
          <div class="flex flex-col gap-4">
            <!-- 最近文件 -->
            <Card class="border border-border/50 bg-card shadow-sm">
              <CardHeader class="px-4 pt-4 pb-2">
                <CardTitle class="text-sm font-semibold text-foreground">最近文件</CardTitle>
              </CardHeader>
              <CardContent class="px-4 pb-4 pt-0">
                <div v-if="visibleRecentFiles.length === 0" class="py-2 text-xs text-muted-foreground">
                  暂无文件
                </div>
                <div v-else class="space-y-1">
                  <button
                    v-for="file in visibleRecentFiles"
                    :key="file.path"
                    type="button"
                    class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent/40"
                    @click="emit('open-file', file.path)"
                  >
                    <component :is="fileIconByExtension(file.extension)" class="size-3.5 shrink-0 text-muted-foreground" />
                    <span class="min-w-0 flex-1 truncate text-[13px] text-foreground">{{ file.name }}</span>
                  </button>
                </div>
              </CardContent>
            </Card>

            <!-- AI 建议占位 -->
            <Card class="border border-border/30 bg-muted/20 shadow-none">
              <CardHeader class="px-4 pt-4 pb-2">
                <div class="flex items-center gap-1.5">
                  <Sparkles class="size-3.5 text-primary/60" />
                  <CardTitle class="text-sm font-semibold text-foreground/70">AI 建议</CardTitle>
                </div>
              </CardHeader>
              <CardContent class="px-4 pb-4 pt-0">
                <p class="text-xs text-muted-foreground/60">
                  AI 建议功能即将推出，届时会根据你的工作习惯给出智能推荐。
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ScrollArea>
  </div>
</template>
