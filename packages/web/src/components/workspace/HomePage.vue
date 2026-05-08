<script setup lang="ts">
import { computed, ref } from "vue";
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
import { Separator } from "@/components/ui/separator";
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
const selectedAgent = ref(props.defaultAgent);
const selectedThinkingLevel = ref<ThinkingLevel>(props.defaultThinkingLevel);

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
      <div class="mx-auto flex max-w-2xl flex-col items-center gap-6 px-6 pt-16 pb-8">

        <!-- AI 启动输入框 -->
        <div class="w-full max-w-lg">
          <h1 class="mb-6 text-center text-xl font-light tracking-wide text-foreground/80">
            开始对话
          </h1>

          <form class="w-full" @submit.prevent="handleSubmit">
            <div
              class="rounded-lg border border-border/60 bg-card px-4 py-3 shadow-sm transition-all duration-200"
              :class="isExpanded ? 'shadow-md' : 'shadow-sm'"
            >
              <!-- 输入区 -->
              <div class="flex items-start gap-3">
                <Textarea
                  v-model="draftText"
                  placeholder="问我任何事…"
                  class="min-h-[24px] max-h-[160px] min-w-0 flex-1 resize-none border-0 bg-transparent p-0 text-[15px] text-foreground shadow-none outline-none ring-0 placeholder:text-muted-foreground/50 focus-visible:ring-0"
                  :rows="isExpanded ? 3 : 1"
                  @focus="handleFocus"
                  @blur="handleBlur"
                />
                <Button
                  type="submit"
                  size="icon"
                  variant="ghost"
                  class="mt-0.5 shrink-0 text-muted-foreground hover:text-primary"
                  :disabled="!draftText.trim()"
                >
                  <SendHorizontal class="size-4" />
                </Button>
              </div>

              <!-- 展开态：真实控件 -->
              <div v-if="isExpanded" class="mt-3 flex flex-wrap items-center gap-2 border-t border-border/40 pt-2">
                <Select v-model="selectedModel">
                  <SelectTrigger class="h-6 w-[130px] gap-1 border-0 bg-muted/60 px-2 text-[11px] shadow-none ring-0 focus:ring-0">
                    <SelectValue placeholder="模型" />
                  </SelectTrigger>
                  <SelectContent>
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
                  <SelectTrigger class="h-6 w-[130px] gap-1 border-0 bg-muted/60 px-2 text-[11px] shadow-none ring-0 focus:ring-0">
                    <SelectValue placeholder="Agent" />
                  </SelectTrigger>
                  <SelectContent>
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
                  <SelectTrigger class="h-6 w-[90px] gap-1 border-0 bg-muted/60 px-2 text-[11px] shadow-none ring-0 focus:ring-0">
                    <SelectValue placeholder="思考" />
                  </SelectTrigger>
                  <SelectContent>
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

        <Separator class="w-full max-w-lg" />

        <!-- 下方信息区：左时间线 + 右侧卡片 -->
        <div class="grid w-full max-w-2xl grid-cols-1 gap-4 md:grid-cols-[1fr_240px]">

          <!-- 左侧：最近事情混合时间线 -->
          <Card class="border-0 bg-card shadow-none">
            <CardHeader class="pb-2 pt-4 px-4">
              <CardTitle class="text-sm font-semibold text-foreground">最近事情</CardTitle>
            </CardHeader>
            <CardContent class="px-4 pb-4 pt-0">
              <div v-if="isRecentLoading" class="flex items-center gap-2 py-4 text-xs text-muted-foreground">
                加载中…
              </div>
              <div v-else-if="visibleActivity.length === 0" class="py-4 text-xs text-muted-foreground">
                暂无最近活动
              </div>
              <div v-else class="space-y-0.5">
                <button
                  v-for="item in visibleActivity"
                  :key="item.id"
                  type="button"
                  class="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/30"
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
            <Card class="border-0 bg-card shadow-none">
              <CardHeader class="pb-2 pt-4 px-4">
                <CardTitle class="text-sm font-semibold text-foreground">最近文件</CardTitle>
              </CardHeader>
              <CardContent class="px-4 pb-4 pt-0">
                <div v-if="visibleRecentFiles.length === 0" class="py-2 text-xs text-muted-foreground">
                  暂无文件
                </div>
                <div v-else class="space-y-0.5">
                  <button
                    v-for="file in visibleRecentFiles"
                    :key="file.path"
                    type="button"
                    class="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-accent/30"
                    @click="emit('open-file', file.path)"
                  >
                    <component :is="fileIconByExtension(file.extension)" class="size-3.5 shrink-0 text-muted-foreground" />
                    <span class="min-w-0 flex-1 truncate text-[13px] text-foreground">{{ file.name }}</span>
                  </button>
                </div>
              </CardContent>
            </Card>

            <!-- AI 建议占位 -->
            <Card class="border-0 bg-muted/30 shadow-none">
              <CardHeader class="pb-2 pt-4 px-4">
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
