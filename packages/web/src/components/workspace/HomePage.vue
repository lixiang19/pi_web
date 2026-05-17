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
	Paperclip,
	X,
	ArrowUpRight,
	Bot,
	LoaderCircle,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "@/components/ui/select";
import { fileIconByExtension } from "@/composables/useFileIcons";
import type { RecentActivityItem } from "@/composables/useRecentActivity";
import type { RecentFileItem } from "@/lib/api";
import type { AgentSummary, ThinkingLevel } from "@/lib/types";
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
	recentFiles: RecentFileItem[];
	recentActivity: RecentActivityItem[];
	isRecentLoading: boolean;
	models: Array<{ label: string; value: string }>;
	agents: AgentSummary[];
	defaultModel: string;
	defaultAgent: string;
	defaultThinkingLevel: ThinkingLevel;
	isSending?: boolean;
}>();

const emit = defineEmits<{
	(e: "submit", payload: HomeSubmitPayload): void;
	(e: "open-file", path: string): void;
	(e: "open-session", sessionId: string): void;
	(e: "open-tasks"): void;
}>();

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

// ===== 图标映射 =====
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
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden bg-background">
    <ScrollArea class="flex-1">
      <div class="mx-auto w-full max-w-3xl px-6 py-10 lg:px-12 lg:py-14">

        <!-- ===== AI Hero 区域：问候语 + 输入框 ===== -->
        <section data-testid="home-ai-hero" class="flex min-h-[280px] w-full flex-col items-center justify-center gap-6 pt-10 pb-4">
          <!-- 问候语 -->
          <div class="flex flex-col items-center gap-1.5 text-center">
            <h1 class="text-2xl font-semibold tracking-tight text-foreground">{{ greeting }}</h1>
            <p class="text-sm text-muted-foreground/70">今天想做什么？</p>
          </div>

          <!-- AI 输入区域：固定宽度 -->
          <div data-testid="home-command-center" class="w-full">
            <form @submit.prevent="handleSubmit">
              <!-- 输入卡片主体 -->
              <div class="relative rounded-xl bg-card shadow-[0_1px_4px_rgba(61,50,41,0.06),0_0_0_1px_rgba(45,52,54,0.05)] transition-shadow duration-200 hover:shadow-[0_2px_8px_rgba(61,50,41,0.08),0_0_0_1px_rgba(45,52,54,0.06)]">
                <div class="relative overflow-hidden rounded-xl">
                  <!-- 附件 chips -->
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

                  <!-- 输入框 -->
                  <Textarea
                    v-model="draftText"
                    placeholder="问我任何事…"
                    class="min-h-[96px] resize-none border-0 bg-transparent px-4 py-3 pr-14 text-sm leading-6 text-foreground shadow-none outline-none ring-0 placeholder:text-muted-foreground/50 focus-visible:ring-0 focus-visible:ring-offset-0"
                    :rows="isExpanded ? 5 : 3"
                    @focus="handleFocus"
                    @blur="handleBlur"
                  />

                  <!-- 发送按钮（右下角） -->
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

                <!-- 分隔线 -->
                <div class="mx-4 h-px bg-border/60" />

                <!-- 底部工具栏 -->
                <div class="flex flex-wrap items-center justify-between gap-2 px-2 py-2.5">
                  <div class="flex flex-wrap items-center gap-1">
                    <!-- 附件 -->
                    <button
                      type="button"
                      data-testid="home-attachment-btn"
                      class="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-all duration-200 hover:bg-soft hover:text-foreground"
                      @click="handleAttachmentClick"
                    >
                      <Paperclip class="size-3.5" />
                      <span class="font-medium">附件</span>
                    </button>

                    <!-- Model -->
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

                    <!-- Agent -->
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

                    <!-- Thinking -->
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

        <!-- ===== 工作台动态 ===== -->
        <section data-testid="home-info-grid" class="mt-10">
          <div class="mb-4 flex items-center gap-3">
            <div class="flex size-7 items-center justify-center rounded-lg bg-primary/10">
              <Calendar class="size-3.5 text-primary" />
            </div>
            <span class="text-sm font-semibold text-foreground">工作台动态</span>
            <span class="h-px flex-1 bg-subtle"></span>
          </div>

          <!-- 加载状态 -->
          <div v-if="isRecentLoading" class="flex items-center gap-2 py-8 text-caption text-muted-foreground">
            <LoaderCircle class="size-4 animate-spin" />
            加载中…
          </div>

          <!-- 空状态 -->
          <div v-else-if="visibleActivity.length === 0 && visibleRecentFiles.length === 0" class="flex flex-col items-center justify-center py-16">
            <div class="mb-4 flex size-14 items-center justify-center rounded-2xl bg-soft">
              <Calendar class="size-7 text-muted-foreground/30" />
            </div>
            <p class="text-sm font-medium text-foreground">暂无动态</p>
            <p class="mt-1 text-caption text-muted-foreground">开始工作，你的动态将出现在这里</p>
          </div>

          <!-- 动态卡片网格 -->
          <div v-else class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <!-- 活动项卡片 -->
            <Card
              v-for="item in visibleActivity"
              :key="item.id"
              class="group cursor-pointer border-default bg-card transition-all hover:border-strong hover:bg-soft hover:shadow-sm"
              @click="handleActivityClick(item)"
            >
              <div class="flex items-start gap-3 p-4">
                <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-soft group-hover:bg-primary/10">
                  <component :is="kindIconMap[item.kind]" class="size-4 text-muted-foreground/60 group-hover:text-primary" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-body-sm font-medium text-foreground">{{ item.title }}</p>
                  <div class="mt-1 flex items-center gap-2 text-caption text-muted-foreground/70">
                    <span>{{ kindLabelMap[item.kind] }}</span>
                    <span class="text-muted-foreground/30">·</span>
                    <span class="tabular-nums">{{ formatDate(item.timestamp) }}</span>
                  </div>
                </div>
              </div>
            </Card>

            <!-- 文件项卡片 -->
            <Card
              v-for="file in visibleRecentFiles"
              :key="file.path"
              class="group cursor-pointer border-default bg-card transition-all hover:border-strong hover:bg-soft hover:shadow-sm"
              @click="emit('open-file', file.path)"
            >
              <div class="flex items-start gap-3 p-4">
                <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-soft group-hover:bg-primary/10">
                  <component :is="fileIconByExtension(file.extension)" class="size-4 text-muted-foreground/60 group-hover:text-primary" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-body-sm font-medium text-foreground">{{ file.name }}</p>
                  <div class="mt-1 flex items-center gap-2 text-caption text-muted-foreground/70">
                    <span>文件</span>
                    <ArrowUpRight class="size-3 text-muted-foreground/40" />
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </section>
      </div>
    </ScrollArea>
  </div>
</template>
