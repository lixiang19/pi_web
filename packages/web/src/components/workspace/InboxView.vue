
<script setup lang="ts">
import { ref, onMounted } from "vue";
import {
	BookOpen,
	Bookmark,
	Lightbulb,
	LoaderCircle,
	Search,
	Trash2,
	CheckSquare,
	Image,
	FileText,
	RefreshCw,
	Flag,
	Archive,
	Sparkles,
	Clock,
	CheckCircle2,
	AlertCircle,
	BrainCircuit,
} from "lucide-vue-next";
import { toast } from "vue-sonner";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useWorkspaceInbox, type InboxItem } from "@/composables/useInbox";
import { useProjects } from "@/composables/useProjects";

const props = defineProps<{
	workspaceDir: string;
}>();

defineEmits<{
	(e: "open-file", path: string): void;
	(e: "refresh-tree"): void;
}>();

const {
	filteredFiles,
	isLoading,
	searchQuery,
	sortKey,
	count,
	analyzingCount,
	deleteItem,
	processToJournal,
	processToClip,
	processToTask,
	processToMilestone,
	processToAttachment,
	retryAnalysis,
	formatTime,
	getNoteAttachments,
} = useWorkspaceInbox(() => props.workspaceDir);

const { projects, load: loadProjects } = useProjects();

onMounted(() => {
	void loadProjects();
});

const activeNote = ref<InboxItem | null>(null);

// Journal dialog
const journalDialogOpen = ref(false);
const journalContent = ref("");

// Clip dialog
const clipDialogOpen = ref(false);
const clipTitle = ref("");
const clipUrl = ref("");
const clipContent = ref("");
const clipSource = ref("闪念");

// Task dialog
const taskDialogOpen = ref(false);
const taskTitle = ref("");
const taskPriority = ref<"normal" | "important" | "urgent">("normal");
const taskAcceptance = ref("");
const taskProjectId = ref<string | null>(null);

// Milestone dialog
const milestoneDialogOpen = ref(false);
const milestoneTitle = ref("");
const milestoneGoal = ref("");
const milestoneAcceptance = ref("");
const milestoneProjectId = ref<string | null>(null);

const openJournalDialog = (note: InboxItem) => {
	activeNote.value = note;
	journalContent.value = note.draft || note.content;
	journalDialogOpen.value = true;
};

const firstUrl = (text: string) => text.match(/https?:\/\/\S+/)?.[0] ?? "";

const openClipDialog = (note: InboxItem) => {
	activeNote.value = note;
	clipContent.value = note.draft || note.content;
	clipUrl.value = firstUrl(note.content);
	clipTitle.value = note.content.split("\n")[0]?.replace(/^https?:\/\/\S+\s*/, "").slice(0, 80) || "未命名剪藏";
	clipSource.value = "闪念";
	clipDialogOpen.value = true;
};

const openTaskDialog = (note: InboxItem) => {
	activeNote.value = note;
	taskTitle.value = note.content.split("\n")[0]?.slice(0, 80) || "未命名任务";
	taskPriority.value = "normal";
	taskAcceptance.value = "";
	taskProjectId.value = null;
	taskDialogOpen.value = true;
};

const openMilestoneDialog = (note: InboxItem) => {
	activeNote.value = note;
	milestoneTitle.value = note.content.split("\n")[0]?.slice(0, 80) || "未命名里程碑";
	milestoneGoal.value = "";
	milestoneAcceptance.value = "";
	milestoneProjectId.value = null;
	milestoneDialogOpen.value = true;
};

const confirmJournal = async () => {
	if (!activeNote.value || !journalContent.value.trim()) return;
	await processToJournal(activeNote.value.id, journalContent.value.trim());
	journalDialogOpen.value = false;
};

const confirmClip = async () => {
	if (!activeNote.value || !clipTitle.value.trim() || !clipContent.value.trim()) return;
	await processToClip(activeNote.value.id, {
		title: clipTitle.value.trim(),
		url: clipUrl.value.trim(),
		content: clipContent.value.trim(),
		source: clipSource.value.trim(),
	});
	clipDialogOpen.value = false;
};

const confirmTask = async () => {
	if (!activeNote.value || !taskTitle.value.trim() || !taskAcceptance.value.trim()) return;
	await processToTask(activeNote.value.id, {
		title: taskTitle.value.trim(),
		priority: taskPriority.value,
		acceptanceCriteria: taskAcceptance.value.trim(),
		projectId: taskProjectId.value,
	});
	taskDialogOpen.value = false;
};

const confirmMilestone = async () => {
	if (!activeNote.value || !milestoneTitle.value.trim() || !milestoneGoal.value.trim() || !milestoneAcceptance.value.trim()) return;
	await processToMilestone(activeNote.value.id, {
		title: milestoneTitle.value.trim(),
		goal: milestoneGoal.value.trim(),
		acceptanceCriteria: milestoneAcceptance.value.trim(),
		projectId: milestoneProjectId.value,
	});
	milestoneDialogOpen.value = false;
};

const handleAttachment = async (note: InboxItem) => {
	const atts = getNoteAttachments(note.id);
	if (atts.length === 0) {
		toast.error("该闪念没有附件");
		return;
	}
	await processToAttachment(note.id);
};

const handleSuggestion = (note: InboxItem) => {
	if (note.recommendationType === "journal") openJournalDialog(note);
	else if (note.recommendationType === "clip") openClipDialog(note);
	else if (note.recommendationType === "task") openTaskDialog(note);
	else if (note.recommendationType === "delete") deleteItem(note.id);
};

const recommendationLabel = (note: InboxItem) => {
	if (note.analysisStatus === "analyzing") return "建议生成中";
	if (note.analysisStatus === "failed") return `分析失败${note.lastError ? `：${note.lastError}` : ""}`;
	if (note.analysisStatus === "unanalyzed") return "等待分析";
	return note.recommendationText || "已有建议";
};

const recommendationIcon = (note: InboxItem) => {
	if (note.analysisStatus === "analyzing") return BrainCircuit;
	if (note.analysisStatus === "failed") return AlertCircle;
	if (note.analysisStatus === "unanalyzed") return Clock;
	if (note.recommendationType === "journal") return BookOpen;
	if (note.recommendationType === "clip") return Bookmark;
	if (note.recommendationType === "task") return CheckSquare;
	if (note.recommendationType === "delete") return Trash2;
	return Sparkles;
};

const getAttachmentIcon = (mimeType: string) => {
	if (mimeType.startsWith("image/")) return Image;
	return FileText;
};

const formatFileSize = (bytes: number) => {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
</script>

<template>
	<div class="flex h-full flex-col bg-background">
		<!-- 顶部标题栏 -->
		<div class="shrink-0 flex items-center justify-between border-b border-default px-5 py-3">
			<div class="flex items-center gap-3">
				<div class="flex size-8 items-center justify-center rounded-lg bg-primary/10">
					<Lightbulb class="size-4 text-primary" />
				</div>
				<div>
					<h1 class="text-base font-semibold text-foreground">闪念收件箱</h1>
				</div>
				<div class="ml-2 flex items-center gap-2 text-caption text-muted-foreground">
					<span>{{ count }} 待处理</span>
					<span v-if="analyzingCount > 0" class="flex items-center gap-1 text-primary">
						<BrainCircuit class="size-3.5 animate-pulse" />
						{{ analyzingCount }} 分析中
					</span>
				</div>
			</div>
			<div class="flex items-center gap-2">
				<div v-if="count > 0" class="flex h-7 items-center gap-1.5 rounded-md border border-default bg-soft px-2">
					<Search class="size-3 text-muted-foreground" />
					<input
						v-model="searchQuery"
						type="text"
						placeholder="搜索闪念..."
						class="w-32 bg-transparent text-caption outline-none placeholder:text-muted-foreground/50"
					/>
				</div>
				<Select v-model="sortKey">
					<SelectTrigger class="h-7 w-[100px] text-caption border-default">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="modified">更新时间</SelectItem>
						<SelectItem value="created">创建时间</SelectItem>
						<SelectItem value="name">内容</SelectItem>
					</SelectContent>
				</Select>
			</div>
		</div>

		<!-- 列表内容 -->
		<div class="flex min-h-0 flex-1 overflow-y-auto">
			<div class="mx-auto w-full max-w-4xl px-5 py-5">
				<!-- 加载状态 -->
				<div v-if="isLoading" class="flex items-center justify-center gap-2 py-12 text-caption text-muted-foreground">
					<LoaderCircle class="size-4 animate-spin" />
					加载中...
				</div>

				<!-- 空状态 -->
				<div v-else-if="count === 0" class="flex flex-col items-center justify-center py-20">
					<div class="mb-4 flex size-16 items-center justify-center rounded-2xl bg-soft">
						<CheckCircle2 class="size-8 text-muted-foreground/40" />
					</div>
					<h3 class="text-sm font-medium text-foreground">闪念已清空</h3>
					<p class="mt-1 text-caption text-muted-foreground">所有闪念已处理完毕，捕捉新的灵感吧</p>
				</div>

				<!-- 无搜索结果 -->
				<div v-else-if="filteredFiles.length === 0 && searchQuery" class="flex flex-col items-center py-16">
					<Search class="mb-3 size-8 text-muted-foreground/30" />
					<p class="text-caption text-muted-foreground">没有匹配的闪念</p>
				</div>

				<!-- 闪念列表 -->
				<div v-else class="space-y-3">
					<div
						v-for="note in filteredFiles"
						:key="note.id"
						class="group relative rounded-lg border border-default bg-card transition-all hover:border-strong"
					>
						<div class="flex">
							<!-- 左侧状态竖线 -->
							<div
								class="w-[3px] shrink-0 rounded-l-lg transition-colors"
								:class="{
									'bg-amber-500': note.analysisStatus === 'analyzing',
									'bg-red-500': note.analysisStatus === 'failed',
									'bg-slate-400': note.analysisStatus === 'unanalyzed',
									'bg-primary': note.analysisStatus === 'suggested',
								}"
							/>
							<div class="flex-1 p-4">
								<div class="flex items-start justify-between gap-3">
									<p class="flex-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{{ note.content }}</p>
									<div class="flex shrink-0 items-center gap-2 pt-0.5">
										<span class="text-caption text-muted-foreground tabular-nums">{{ formatTime(note.createdAt) }}</span>
										<component :is="recommendationIcon(note)" class="size-3.5 shrink-0 text-muted-foreground" />
									</div>
								</div>

								<!-- 附件 -->
								<div v-if="getNoteAttachments(note.id).length > 0" class="mt-2.5 flex flex-wrap gap-1.5">
									<div
										v-for="att in getNoteAttachments(note.id)"
										:key="att.id"
										class="flex items-center gap-1 rounded-md border border-subtle bg-subtle px-2 py-0.5 text-micro text-muted-foreground"
									>
										<component :is="getAttachmentIcon(att.mimeType)" class="size-3" />
										<span class="max-w-[120px] truncate">{{ att.originalName }}</span>
										<span class="tabular-nums">{{ formatFileSize(att.size) }}</span>
									</div>
								</div>

								<!-- 建议状态 -->
								<div class="mt-2.5 flex items-center gap-2">
									<span class="text-caption text-muted-foreground">{{ recommendationLabel(note) }}</span>
									<Button
										v-if="note.analysisStatus === 'failed' || note.lastError"
										variant="ghost"
										size="sm"
										class="h-5 gap-1 px-1.5 text-micro"
										@click="retryAnalysis(note.id)"
									>
										<RefreshCw class="size-3" />
										重试
									</Button>
								</div>

								<!-- 操作按钮 -->
								<div class="mt-3 flex items-center gap-1">
									<!-- 按建议处理 -->
									<Button
										v-if="note.analysisStatus === 'suggested'"
										size="sm"
										class="h-7 gap-1.5 text-xs"
										@click="handleSuggestion(note)"
									>
										<Sparkles class="size-3" />
										按建议处理
									</Button>

									<!-- 工具操作 -->
									<Tooltip>
										<TooltipTrigger as-child>
											<Button variant="ghost" size="icon" class="size-7 text-muted-foreground" aria-label="转为日记" @click="openJournalDialog(note)">
												<BookOpen class="size-3.5" />
											</Button>
										</TooltipTrigger>
										<TooltipContent>日记</TooltipContent>
									</Tooltip>
									<Tooltip>
										<TooltipTrigger as-child>
											<Button variant="ghost" size="icon" class="size-7 text-muted-foreground" aria-label="转为任务" @click="openTaskDialog(note)">
												<CheckSquare class="size-3.5" />
											</Button>
										</TooltipTrigger>
										<TooltipContent>任务</TooltipContent>
									</Tooltip>
									<Tooltip>
										<TooltipTrigger as-child>
											<Button variant="ghost" size="icon" class="size-7 text-muted-foreground" aria-label="转为里程碑" @click="openMilestoneDialog(note)">
												<Flag class="size-3.5" />
											</Button>
										</TooltipTrigger>
										<TooltipContent>里程碑</TooltipContent>
									</Tooltip>
									<Tooltip>
										<TooltipTrigger as-child>
											<Button variant="ghost" size="icon" class="size-7 text-muted-foreground" aria-label="保存剪藏" @click="openClipDialog(note)">
												<Bookmark class="size-3.5" />
											</Button>
										</TooltipTrigger>
										<TooltipContent>剪藏</TooltipContent>
									</Tooltip>
									<Tooltip v-if="getNoteAttachments(note.id).length > 0">
										<TooltipTrigger as-child>
											<Button variant="ghost" size="icon" class="size-7 text-muted-foreground" aria-label="查看附件" @click="handleAttachment(note)">
												<Archive class="size-3.5" />
											</Button>
										</TooltipTrigger>
										<TooltipContent>附件</TooltipContent>
									</Tooltip>

									<div class="flex-1" />

									<Tooltip>
										<TooltipTrigger as-child>
											<Button variant="ghost" size="icon" class="size-7 text-destructive/70 hover:text-destructive" aria-label="删除" @click="deleteItem(note.id)">
												<Trash2 class="size-3.5" />
											</Button>
										</TooltipTrigger>
										<TooltipContent>删除</TooltipContent>
									</Tooltip>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
	<!-- Journal Dialog -->
	<Dialog v-model:open="journalDialogOpen">
		<DialogContent>
			<DialogHeader>
				<DialogTitle>写入今日日记</DialogTitle>
				<DialogDescription>闪念会追加到今天的日记，成功后从收件箱删除。</DialogDescription>
			</DialogHeader>
			<Textarea v-model="journalContent" class="min-h-32" />
			<DialogFooter>
				<Button variant="outline" @click="journalDialogOpen = false">取消</Button>
				<Button :disabled="!journalContent.trim()" @click="confirmJournal">写入日记</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>

	<!-- Clip Dialog -->
	<Dialog v-model:open="clipDialogOpen">
		<DialogContent>
			<DialogHeader>
				<DialogTitle>保存为剪藏</DialogTitle>
				<DialogDescription>剪藏会保存到 DB，成功后从收件箱删除。</DialogDescription>
			</DialogHeader>
			<div class="space-y-3">
				<Input v-model="clipTitle" placeholder="标题" />
				<Input v-model="clipUrl" placeholder="URL，可为空" />
				<Input v-model="clipSource" placeholder="来源说明，可为空" />
				<Textarea v-model="clipContent" class="min-h-32" placeholder="摘录或正文" />
			</div>
			<DialogFooter>
				<Button variant="outline" @click="clipDialogOpen = false">取消</Button>
				<Button :disabled="!clipTitle.trim() || !clipContent.trim()" @click="confirmClip">保存剪藏</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>

	<!-- Task Dialog -->
	<Dialog v-model:open="taskDialogOpen">
		<DialogContent>
			<DialogHeader>
				<DialogTitle>创建任务</DialogTitle>
				<DialogDescription>从闪念创建任务，成功后从收件箱删除。</DialogDescription>
			</DialogHeader>
			<div class="space-y-3">
				<Input v-model="taskTitle" placeholder="任务标题" />
				<Select v-model="taskPriority">
					<SelectTrigger>
						<SelectValue placeholder="优先级" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="normal">普通</SelectItem>
						<SelectItem value="important">重要</SelectItem>
						<SelectItem value="urgent">紧急</SelectItem>
					</SelectContent>
				</Select>
				<Textarea v-model="taskAcceptance" class="min-h-20" placeholder="完成标准 / 验收标准" />
				<Select v-model="taskProjectId">
					<SelectTrigger>
						<SelectValue placeholder="选择项目（可选）" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem :value="null">无项目</SelectItem>
						<SelectItem v-for="project in projects" :key="project.id" :value="project.id">
							{{ project.name }}
						</SelectItem>
					</SelectContent>
				</Select>
			</div>
			<DialogFooter>
				<Button variant="outline" @click="taskDialogOpen = false">取消</Button>
				<Button :disabled="!taskTitle.trim() || !taskAcceptance.trim()" @click="confirmTask">创建任务</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>

	<!-- Milestone Dialog -->
	<Dialog v-model:open="milestoneDialogOpen">
		<DialogContent>
			<DialogHeader>
				<DialogTitle>创建里程碑</DialogTitle>
				<DialogDescription>从闪念创建里程碑，成功后从收件箱删除。</DialogDescription>
			</DialogHeader>
			<div class="space-y-3">
				<Input v-model="milestoneTitle" placeholder="里程碑标题" />
				<Textarea v-model="milestoneGoal" class="min-h-20" placeholder="目标" />
				<Textarea v-model="milestoneAcceptance" class="min-h-20" placeholder="完成标准 / 验收标准" />
				<Select v-model="milestoneProjectId">
					<SelectTrigger>
						<SelectValue placeholder="选择项目（可选）" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem :value="null">无项目</SelectItem>
						<SelectItem v-for="project in projects" :key="project.id" :value="project.id">
							{{ project.name }}
						</SelectItem>
					</SelectContent>
				</Select>
			</div>
			<DialogFooter>
				<Button variant="outline" @click="milestoneDialogOpen = false">取消</Button>
				<Button :disabled="!milestoneTitle.trim() || !milestoneGoal.trim() || !milestoneAcceptance.trim()" @click="confirmMilestone">创建里程碑</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
</template>
