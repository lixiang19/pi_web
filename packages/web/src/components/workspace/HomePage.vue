<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
	ArrowRight,
	Bot,
	CheckSquare,
	FileText,
	Lightbulb,
	MessageSquare,
	Paperclip,
	SendHorizontal,
	Sparkles,
	TrendingUp,
	X,
	LoaderCircle,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "@/components/ui/select";
import type { AgentSummary, ThinkingLevel, TodayRecommendation, YesterdayReview } from "@/lib/types";
import type { AIDashboardStatIcon } from "@/lib/types";
import { thinkingOptions } from "@/composables/useWorkbenchSessionState";

export type HomeSubmitPayload = {
	text: string;
	model: string;
	agent: string;
	thinkingLevel: ThinkingLevel;
	attachments?: File[];
};

const props = defineProps<{
	workspaceDir: string;
	models: Array<{ label: string; value: string }>;
	agents: AgentSummary[];
	defaultModel: string;
	defaultAgent: string;
	defaultThinkingLevel: ThinkingLevel;
	isSending?: boolean;
	yesterdayReview: YesterdayReview;
	todayRecommendations: TodayRecommendation[];
}>();

const emit = defineEmits<{
	(e: "submit", payload: HomeSubmitPayload): void;
	(e: "recommendation-click", rec: TodayRecommendation): void;
}>();

// ===== AI 输入 =====

const draftText = ref("");
const isFocused = ref(false);
const isSending = computed(() => props.isSending ?? false);

const resolveAgentSelection = (candidate: string, agents: AgentSummary[]) => {
	const agentNames = new Set(agents.map((agent) => agent.name));
	if (candidate && agentNames.has(candidate)) {
		return candidate;
	}
	return agents[0]?.name ?? "";
};

const selectedModel = ref(props.defaultModel);
const selectedAgent = ref(resolveAgentSelection(props.defaultAgent, props.agents));
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

watch(
	() => [props.defaultAgent, props.agents] as const,
	([defaultAgent, agents]) => {
		const agentNames = new Set(agents.map((agent) => agent.name));
		if (!selectedAgent.value || !agentNames.has(selectedAgent.value)) {
			selectedAgent.value = resolveAgentSelection(defaultAgent, agents);
		}
	},
);

const isExpanded = computed(() => isFocused.value || draftText.value.length > 0);

function handleSubmit() {
	const text = draftText.value.trim();
	if (!text || isSending.value) return;
	emit("submit", {
		text,
		model: selectedModel.value,
		agent: selectedAgent.value,
		thinkingLevel: selectedThinkingLevel.value,
		attachments: pendingAttachments.value.length > 0 ? [...pendingAttachments.value] : undefined,
	});
}

function handleFocus() {
	isFocused.value = true;
}

function handleBlur() {
	if (!draftText.value.trim()) {
		isFocused.value = false;
	}
}

// ===== 附件上传 =====
const pendingAttachments = ref<File[]>([]);
const fileInputRef = ref<HTMLInputElement | null>(null);

function handleAttachmentClick() {
	fileInputRef.value?.click();
}

function handleFileChange(event: Event) {
	const target = event.target as HTMLInputElement;
	const files = target.files;
	if (!files) return;
	for (const file of files) {
		pendingAttachments.value.push(file);
	}
	target.value = "";
}

function removeAttachment(index: number) {
	pendingAttachments.value.splice(index, 1);
}

// ===== 问候与工具 =====

const greeting = computed(() => {
	const hour = new Date().getHours();
	if (hour < 6) return "夜深了";
	if (hour < 12) return "上午好";
	if (hour < 18) return "下午好";
	return "晚上好";
});

const agentOptions = computed(() => {
	return props.agents.map((agent) => ({
		name: agent.name,
		label: agent.displayName || agent.name,
	}));
});

// ===== 仪表盘图标映射 =====

const statIconMap: Record<AIDashboardStatIcon, typeof FileText> = {
	session: MessageSquare,
	file: FileText,
	task: CheckSquare,
	moment: Lightbulb,
};

const recIconMap: Record<AIDashboardStatIcon, typeof FileText> = {
	session: MessageSquare,
	file: FileText,
	task: CheckSquare,
	moment: Lightbulb,
};

function handleRecommendationClick(rec: TodayRecommendation) {
	emit("recommendation-click", rec);
}
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden bg-background">
    <ScrollArea class="flex-1">
      <div class="mx-auto w-full max-w-3xl px-6 py-10 lg:px-12 lg:py-14">

        <!-- ===== AI Hero 区域：问候语 + 输入框 ===== -->
        <section data-testid="home-ai-hero" class="flex min-h-[280px] w-full flex-col items-center justify-center gap-6 pt-10 pb-4">
          <div class="flex flex-col items-center gap-1.5 text-center">
            <h1 class="text-2xl font-semibold tracking-tight text-foreground">{{ greeting }}</h1>
            <p class="text-sm text-muted-foreground/70">今天想做什么？</p>
          </div>

          <div data-testid="home-command-center" class="w-full">
            <form @submit.prevent="handleSubmit">
              <div class="relative rounded-xl bg-card shadow-[0_1px_4px_rgba(61,50,41,0.06),0_0_0_1px_rgba(45,52,54,0.05)] transition-shadow duration-200 hover:shadow-[0_2px_8px_rgba(61,50,41,0.08),0_0_0_1px_rgba(45,52,54,0.06)]">
                <div class="relative overflow-hidden rounded-xl">
                  <div v-if="pendingAttachments.length > 0" class="flex flex-wrap gap-1.5 px-4 pt-3">
                    <span
                      v-for="(file, index) in pendingAttachments"
                      :key="`${file.name}-${index}`"
                      class="inline-flex items-center gap-1.5 rounded-md border border-subtle bg-subtle px-2 py-1 text-caption text-muted-foreground"
                      data-testid="home-pending-attachment"
                    >
                      <Paperclip class="size-3 shrink-0" />
                      <span class="max-w-[180px] truncate">{{ file.name }}</span>
                      <button
                        type="button"
                        class="inline-flex size-4 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:text-foreground"
                        @click="removeAttachment(index)"
                      >
                        <X class="size-2.5" />
                      </button>
                    </span>
                  </div>

                  <Textarea
                    v-model="draftText"
                    placeholder="问我任何事…"
                    class="min-h-[96px] resize-none border-0 bg-transparent px-4 py-3 pr-14 text-sm leading-6 text-foreground shadow-none outline-none ring-0 placeholder:text-muted-foreground/50 focus-visible:ring-0 focus-visible:ring-offset-0"
                    :rows="isExpanded ? 5 : 3"
                    @focus="handleFocus"
                    @blur="handleBlur"
                  />

                  <div class="absolute bottom-3 right-3">
                    <Button
                      type="submit"
                      size="icon"
                      class="size-9 rounded-lg"
                      :disabled="!draftText.trim() || isSending"
                      data-testid="home-send-btn"
                    >
                      <LoaderCircle v-if="isSending" class="size-4 animate-spin" />
                      <SendHorizontal v-else class="size-4" />
                    </Button>
                  </div>
                </div>

                <div class="mx-4 h-px bg-border/60" />

                <div class="flex flex-wrap items-center justify-between gap-2 px-2 py-2.5">
                  <div class="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      data-testid="home-attachment-btn"
                      class="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-all duration-200 hover:bg-soft hover:text-foreground"
                      @click="handleAttachmentClick"
                    >
                      <Paperclip class="size-3.5" />
                      <span class="font-medium">附件</span>
                    </button>

                    <Select v-model="selectedModel" data-testid="select">
                      <SelectTrigger size="sm" class="h-8 gap-1.5 rounded-md border-0 bg-transparent px-2 text-xs text-muted-foreground transition-all duration-200 hover:bg-soft hover:text-foreground">
                        <Sparkles class="size-3.5 shrink-0" />
                        <span class="font-medium">{{ models.find(m => m.value === selectedModel)?.label || selectedModel }}</span>
                      </SelectTrigger>
                      <SelectContent data-testid="select-content" class="max-h-72 min-w-[200px]">
                        <SelectItem v-for="model in models" :key="model.value" :value="model.value" class="text-xs">
                          {{ model.label }}
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    <Select v-model="selectedAgent" data-testid="select">
                      <SelectTrigger size="sm" class="h-8 max-w-[140px] gap-1.5 rounded-md border-0 bg-transparent px-2 text-xs text-muted-foreground transition-all duration-200 hover:bg-soft hover:text-foreground">
                        <Bot class="size-3.5 shrink-0" />
                        <span class="truncate font-medium">{{ agentOptions.find(a => a.name === selectedAgent)?.label || agentOptions[0]?.label || '默认' }}</span>
                      </SelectTrigger>
                      <SelectContent data-testid="select-content" class="max-h-72">
                        <SelectItem v-for="agent in agentOptions" :key="agent.name" :value="agent.name" class="text-xs">
                          {{ agent.label }}
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    <Select v-model="selectedThinkingLevel" data-testid="select">
                      <SelectTrigger size="sm" class="h-8 gap-1.5 rounded-md border-0 bg-transparent px-2 text-xs text-muted-foreground transition-all duration-200 hover:bg-soft hover:text-foreground">
                        <Lightbulb class="size-3.5 shrink-0" />
                        <span class="font-medium">{{ thinkingOptions.find(t => t.value === selectedThinkingLevel)?.label || selectedThinkingLevel }}</span>
                      </SelectTrigger>
                      <SelectContent data-testid="select-content" class="max-h-72">
                        <SelectItem v-for="opt in thinkingOptions" :key="opt.value" :value="opt.value" class="text-xs">
                          {{ opt.label }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <input
                ref="fileInputRef"
                type="file"
                multiple
                class="hidden"
                @change="handleFileChange"
              />
            </form>
          </div>
        </section>

        <!-- ===== 今日推荐 ===== -->
        <section v-if="todayRecommendations.length > 0" data-testid="home-today-recommendations" class="mt-10">
          <div class="mb-5 flex items-center gap-3">
            <div class="flex size-7 items-center justify-center rounded-lg bg-primary/10">
              <Lightbulb class="size-3.5 text-primary" />
            </div>
            <span class="text-sm font-semibold text-foreground">今日推荐</span>
            <span class="h-px flex-1 bg-subtle" />
          </div>

          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Card
              v-for="rec in todayRecommendations"
              :key="rec.id"
              data-testid="recommendation-card"
              class="group cursor-pointer border-default bg-card transition-all hover:border-strong hover:bg-soft hover:shadow-sm"
              @click="handleRecommendationClick(rec)"
            >
              <div class="flex items-start gap-3 p-4">
                <div
                  :class="[
                    'flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                    rec.priority === 'high'
                      ? 'bg-amber-500/10 group-hover:bg-amber-500/20'
                      : rec.priority === 'medium'
                        ? 'bg-primary/10 group-hover:bg-primary/20'
                        : 'bg-soft group-hover:bg-primary/10',
                  ]"
                >
                  <component
                    :is="recIconMap[rec.icon]"
                    :class="[
                      'size-4 transition-colors',
                      rec.priority === 'high'
                        ? 'text-amber-600 dark:text-amber-400 group-hover:text-amber-500'
                        : 'text-muted-foreground/60 group-hover:text-primary',
                    ]"
                  />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <p class="truncate text-body-sm font-medium text-foreground">{{ rec.title }}</p>
                    <Badge
                      v-if="rec.priority === 'high'"
                      variant="destructive"
                      class="h-4 text-[10px] px-1.5"
                    >
                      紧急
                    </Badge>
                  </div>
                  <p class="mt-1 text-xs leading-relaxed text-muted-foreground">{{ rec.reason }}</p>
                  <div class="mt-2 flex items-center gap-1 text-xs font-medium text-primary/80 group-hover:text-primary">
                    <span>{{ rec.action }}</span>
                    <ArrowRight class="size-3" />
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </section>

        <!-- ===== 昨日回顾 ===== -->
        <section data-testid="home-yesterday-review" class="mt-10">
          <div class="mb-4 flex items-center gap-2">
            <Sparkles class="size-3.5 text-muted-foreground" />
            <span class="text-xs font-medium text-muted-foreground">昨日回顾</span>
          </div>

          <p class="text-sm leading-relaxed text-foreground/80">{{ yesterdayReview.summary }}</p>

          <div v-if="yesterdayReview.stats.length > 0" class="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            <div
              v-for="stat in yesterdayReview.stats"
              :key="stat.label"
              class="flex items-center gap-1 text-xs text-muted-foreground"
            >
              <component :is="statIconMap[stat.icon]" class="size-3" />
              <span class="font-medium tabular-nums text-foreground/70">{{ stat.value }}</span>
              <span>{{ stat.label }}</span>
            </div>
          </div>

          <div v-if="yesterdayReview.highlights.length > 0" class="mt-3 space-y-1">
            <div
              v-for="(highlight, i) in yesterdayReview.highlights"
              :key="i"
              class="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <TrendingUp v-if="highlight.kind === 'trend'" class="size-3 shrink-0 text-emerald-500" />
              <MessageSquare v-else class="size-3 shrink-0 text-blue-500" />
              <span>{{ highlight.text }}</span>
            </div>
          </div>
        </section>

      </div>
    </ScrollArea>
  </div>
</template>