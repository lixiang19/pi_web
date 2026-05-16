
<script setup lang="ts">
import { ref, onMounted } from "vue";
import {
	BookOpen,
	Bookmark,
	Inbox,
	Lightbulb,
	LoaderCircle,
	Search,
	Trash2,
	CheckSquare,
	Paperclip,
	X,
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

import { Badge } from "@/components/ui/badge";
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
	captureNote,
	deleteItem,
	processToJournal,
	processToClip,
	processToTask,
	processToMilestone,
	processToAttachment,
	retryAnalysis,
	formatTime,
	uploadAttachments,
	isUploadingAttachments,
	getNoteAttachments,
} = useWorkspaceInbox(() => props.workspaceDir);

const { projects, load: loadProjects } = useProjects();

onMounted(() => {
	void loadProjects();
});

const fleetingText = ref("");
const isSaving = ref(false);
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

const attachmentInput = ref<HTMLInputElement | null>(null);
const selectedFiles = ref<File[]>([]);
const isDragging = ref(false);

const handleCapture = async () => {
	const text = fleetingText.value.trim();
	if (!text || !props.workspaceDir) return;
	isSaving.value = true;
	try {
		const hasAttachments = selectedFiles.value.length > 0;
		const note = await captureNote(text, hasAttachments);
		if (note && hasAttachments) {
			await uploadAttachments(note.id, selectedFiles.value);
			await retryAnalysis(note.id);
		}
		fleetingText.value = "";
		selectedFiles.value = [];
	} catch (err) {
		toast.error("保存闪念失败", {
			description: err instanceof Error ? err.message : String(err),
		});
	} finally {
		isSaving.value = false;
	}
};

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

const handleFileSelect = (event: Event) => {
	const input = event.target as HTMLInputElement;
	if (input.files && input.files.length > 0) {
		selectedFiles.value = [...selectedFiles.value, ...Array.from(input.files)];
	}
	if (attachmentInput.value) attachmentInput.value.value = "";
};

const removeSelectedFile = (index: number) => {
	selectedFiles.value = selectedFiles.value.filter((_, i) => i !== index);
};

const handleDragOver = (e: DragEvent) => {
	e.preventDefault();
	isDragging.value = true;
};

const handleDragLeave = (e: DragEvent) => {
	e.preventDefault();
	isDragging.value = false;
};

const handleDrop = (e: DragEvent) => {
	e.preventDefault();
	isDragging.value = false;
	if (e.dataTransfer?.files.length) {
		selectedFiles.value = [...selectedFiles.value, ...Array.from(e.dataTransfer.files)];
	}
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
	<div class="flex h-full overflow-hidden">
		<!-- 左侧：闪念捕捉区 -->
		<div class="flex w-[380px] shrink-0 flex-col border-r border-default bg-background">
			<div class="shrink-0 px-5 pt-5 pb-3">
				<div class="flex items-center gap-2">
					<div class="flex size-8 items-center justify-center rounded-lg bg-primary/10">
						<Lightbulb class="size-4 text-primary" />
					</div>
					<div>
						<h1 class="text-base font-semibold text-foreground">闪念收件箱</h1>
					</div>
				</div>
			</div>

			<!-- 统计 -->
			<div class="shrink-0 px-5 pb-4">
				<div class="flex items-center gap-2 text-caption text-muted-foreground">
					<Inbox class="size-3.5" />
					<span>{{ count }} 待处理</span>
					<span v-if="analyzingCount > 0" class="flex items-center gap-1 text-primary">
						<BrainCircuit class="size-3.5 animate-pulse" />
						{{ analyzingCount }} 分析中
					</span>
				</div>
			</div>

			<!-- 输入区 -->
			<div class="flex min-h-0 flex-1 flex-col px-5 pb-5">
				<div
					class="flex min-h-0 flex-1 flex-col rounded-xl border border-default bg-card transition-all"
					:class="{ 'ring-2 ring-primary/30 border-primary/30': isDragging }"
					@dragover="handleDragOver"
					@dragleave="handleDragLeave"
					@drop="handleDrop"
				>
					<div class="flex-1 px-4 pt-4">
						<Textarea
							v-model="fleetingText"
							placeholder="此刻的想法… 按 ⌘+Enter 保存"
							class="min-h-0 h-full resize-none border-0 bg-transparent p-0 text-base leading-relaxed shadow-none outline-none ring-0 placeholder:text-muted-foreground/40 focus-visible:ring-0"
							@keydown.ctrl.enter="handleCapture"
							@keydown.meta.enter="handleCapture"
						/>
					</div>

					<!-- 附件预览 -->
					<div v-if="selectedFiles.length > 0" class="shrink-0 border-t border-subtle px-4 py-3">
						<div class="space-y-1.5">
							<div
								v-for="(file, index) in selectedFiles"
								:key="index"
								class="flex items-center gap-2 rounded-md bg-soft px-2.5 py-1.5 text-caption"
							>
								<Paperclip class="size-3 text-muted-foreground" />
								<span class="flex-1 truncate">{{ file.name }}</span>
								<span class="tabular-nums text-muted-foreground">{{ formatFileSize(file.size) }}</span>
								<button class="ml-1 rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-subtle" @click="removeSelectedFile(index)">
									<X class="size-3" />
								</button>
							</div>
						</div>
					</div>

					<!-- 底部工具栏 -->
					<div class="shrink-0 flex items-center justify-between border-t border-subtle px-3 py-2.5">
						<div class="flex items-center gap-1">
							<input
								ref="attachmentInput"
								type="file"
								multiple
								class="hidden"
								accept="image/*,application/pdf,.doc,.docx,.txt,.md,.csv,.json,.yaml,.yml"
								@change="handleFileSelect"
							/>
							<Tooltip>
								<TooltipTrigger as-child>
									<Button
										variant="ghost"
										size="icon"
										class="size-8 text-muted-foreground"
										@click="attachmentInput?.click()"
									>
										<Paperclip class="size-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>添加附件</TooltipContent>
							</Tooltip>
							<span v-if="isDragging" class="ml-1 text-caption text-primary">松开以添加</span>
						</div>
						<Button
							size="sm"
							class="h-7 gap-1.5 px-3"
							:disabled="!fleetingText.trim() || isSaving || isUploadingAttachments"
							@click="handleCapture"
						>
							<LoaderCircle v-if="isSaving || isUploadingAttachments" class="size-3.5 animate-spin" />
							<Inbox v-else class="size-3.5" />
							{{ isUploadingAttachments ? '上传中' : '保存' }}
						</Button>
					</div>
				</div>
			</div>
		</div>

		<!-- 右侧：闪念列表 -->
		<div class="flex min-h-0 flex-1 flex-col bg-background">
			<!-- 顶部工具栏 -->
			<div class="shrink-0 flex items-center justify-between border-b border-default px-5 py-3">
				<div class="flex items-center gap-3">
					<h2 class="text-sm font-semibold text-foreground">待处理</h2>
					<Badge variant="secondary" class="text-micro">{{ count }}</Badge>
				</div>
				<div class="flex items-center gap-2">
					<div v-if="count > 0" class="flex h-7 items-center gap-1.5 rounded-md border border-default bg-soft px-2">
						<Search class="size-3 text-muted-foreground" />
						<input
							v-model="searchQuery"
							type="text"
							placeholder="搜索闪念..."
							class="w-32 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
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
				<div class="mx-auto w-full max-w-3xl px-5 py-5">
					<!-- 加载状态 -->
					<div v-if="isLoading" class="flex items-center justify-center gap-2 py-12 text-caption text-muted-foreground">
						<LoaderCircle class="size-4 animate-spin" />
						加载中...
					</div>

					<!-- 空状态 -->
					<div v-else-if="count === 0" class="flex flex-col items-center justify-center py-16">
						<div class="mb-4 flex size-14 items-center justify-center rounded-2xl bg-soft">
							<CheckCircle2 class="size-7 text-muted-foreground/40" />
						</div>
						<h3 class="text-sm font-medium text-foreground">闪念已清空</h3>
						<p class="mt-1 text-caption text-muted-foreground">所有闪念已处理完毕，捕捉新的灵感吧</p>
					</div>

					<!-- 无搜索结果 -->
					<div v-else-if="filteredFiles.length === 0 && searchQuery" class="flex flex-col items-center py-12">
						<Search class="mb-2 size-6 text-muted-foreground/30" />
						<p class="text-caption text-muted-foreground">没有匹配的闪念</p>
					</div>

					<!-- 闪念列表 -->
					<div v-else class="space-y-4">
						<div
							v-for="note in filteredFiles"
							:key="note.id"
							class="group relative rounded-xl border border-default bg-card transition-all hover:border-strong hover:shadow-sm"
						>
							<div class="p-5">
								<!-- 顶部：内容 + 时间 -->
								<div class="flex items-start justify-between gap-4">
									<p class="whitespace-pre-wrap flex-1 text-sm leading-relaxed text-foreground">{{ note.content }}</p>
									<span class="shrink-0 pt-0.5 text-caption text-muted-foreground tabular-nums">{{ formatTime(note.createdAt) }}</span>
								</div>

								<!-- 附件 -->
								<div v-if="getNoteAttachments(note.id).length > 0" class="mt-3 flex flex-wrap gap-2">
									<div
										v-for="att in getNoteAttachments(note.id)"
										:key="att.id"
										class="flex items-center gap-1.5 rounded-md border border-subtle bg-soft px-2.5 py-1 text-caption text-muted-foreground"
									>
										<component :is="getAttachmentIcon(att.mimeType)" class="size-3" />
										<span class="max-w-[140px] truncate">{{ att.originalName }}</span>
										<span class="tabular-nums">{{ formatFileSize(att.size) }}</span>
									</div>
								</div>

								<!-- 建议状态条 -->
								<div
									class="mt-4 flex items-center gap-2 rounded-lg px-3 py-2"
									:class="{
										'bg-amber-50/50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400': note.analysisStatus === 'analyzing',
										'bg-red-50/50 text-red-700 dark:bg-red-950/30 dark:text-red-400': note.analysisStatus === 'failed',
										'bg-slate-50/50 text-slate-600 dark:bg-slate-900/30 dark:text-slate-400': note.analysisStatus === 'unanalyzed',
										'bg-primary/5 text-primary dark:bg-primary/10': note.analysisStatus === 'suggested',
									}"
								>
									<component :is="recommendationIcon(note)" class="size-3.5 shrink-0" />
									<span class="text-caption font-medium">{{ recommendationLabel(note) }}</span>
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
								<div class="mt-4 flex flex-wrap items-center gap-1.5">
									<!-- 主要操作：按建议处理 -->
									<Button
										v-if="note.analysisStatus === 'suggested'"
										size="sm"
										class="h-7 gap-1.5 text-xs"
										@click="handleSuggestion(note)"
									>
										<Sparkles class="size-3" />
										按建议处理
									</Button>

									<!-- 次要操作 -->
									<Button variant="ghost" size="sm" class="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground" @click="openJournalDialog(note)">
										<BookOpen class="size-3" />
										日记
									</Button>
									<Button variant="ghost" size="sm" class="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground" @click="openTaskDialog(note)">
										<CheckSquare class="size-3" />
										任务
									</Button>
									<Button variant="ghost" size="sm" class="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground" @click="openMilestoneDialog(note)">
										<Flag class="size-3" />
										里程碑
									</Button>
									<Button variant="ghost" size="sm" class="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground" @click="openClipDialog(note)">
										<Bookmark class="size-3" />
										剪藏
									</Button>
									<Button
										v-if="getNoteAttachments(note.id).length > 0"
										variant="ghost"
										size="sm"
										class="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
										@click="handleAttachment(note)"
									>
										<Archive class="size-3" />
										附件
									</Button>

									<div class="flex-1" />

									<Button
										variant="ghost"
										size="sm"
										class="h-7 gap-1.5 text-xs text-destructive/80 hover:text-destructive"
										@click="deleteItem(note.id)"
									>
										<Trash2 class="size-3" />
										删除
									</Button>
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
	</div>
</template>
