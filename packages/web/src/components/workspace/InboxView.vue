<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
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
	ChevronDown,
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

const pendingCountText = computed(() => `${count.value} 待处理`);

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
  <div class="h-full overflow-auto p-6">
    <div class="mx-auto max-w-3xl space-y-5">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">收件箱</h1>
          <p class="mt-1 text-sm text-muted-foreground">清空闪念临时队列</p>
        </div>
        <div class="flex items-center gap-2">
          <Badge variant="secondary">{{ pendingCountText }}</Badge>
          <Badge v-if="analyzingCount > 0" variant="outline">{{ analyzingCount }} 分析中</Badge>
        </div>
      </div>

      <div
        class="rounded-lg border border-border/50 bg-card p-5"
        :class="{ 'ring-2 ring-primary/30': isDragging }"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
      >
        <div class="mb-3 flex items-center gap-2">
          <Lightbulb class="size-4 text-amber-500" />
          <h2 class="text-sm font-semibold text-foreground">闪念捕捉</h2>
        </div>
        <Textarea
          v-model="fleetingText"
          placeholder="此刻的想法..."
          class="min-h-20 max-h-40 resize-none text-sm"
          @keydown.ctrl.enter="handleCapture"
          @keydown.meta.enter="handleCapture"
        />

        <!-- Selected files preview -->
        <div v-if="selectedFiles.length > 0" class="mt-3 space-y-2">
          <div
            v-for="(file, index) in selectedFiles"
            :key="index"
            class="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs"
          >
            <Paperclip class="size-3.5 text-muted-foreground" />
            <span class="flex-1 truncate">{{ file.name }}</span>
            <span class="text-muted-foreground">{{ formatFileSize(file.size) }}</span>
            <button class="ml-1 text-muted-foreground hover:text-destructive" @click="removeSelectedFile(index)">
              <X class="size-3.5" />
            </button>
          </div>
        </div>

        <div class="mt-3 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <input
              ref="attachmentInput"
              type="file"
              multiple
              class="hidden"
              accept="image/*,application/pdf,.doc,.docx,.txt,.md,.csv,.json,.yaml,.yml"
              @change="handleFileSelect"
            />
            <Button
              variant="ghost"
              size="sm"
              class="h-7 gap-1.5 text-xs text-muted-foreground"
              @click="attachmentInput?.click()"
            >
              <Paperclip class="size-3.5" />
              添加附件
            </Button>
            <span v-if="isDragging" class="text-xs text-primary">松开以添加附件</span>
          </div>
		<Button size="sm" class="h-7 gap-1.5 text-xs" :disabled="!fleetingText.trim() || isSaving || isUploadingAttachments" @click="handleCapture">
            <LoaderCircle v-if="isSaving || isUploadingAttachments" class="size-3 animate-spin" />
            <Inbox v-else class="size-3" />
            {{ isUploadingAttachments ? '上传中...' : '保存' }}
          </Button>
        </div>
      </div>

      <div class="rounded-lg border border-border/50 bg-card p-5">
        <div class="mb-3 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <Inbox class="size-4 text-muted-foreground" />
            <h2 class="text-sm font-semibold text-foreground">待处理闪念</h2>
          </div>
          <div v-if="count > 0" class="flex items-center gap-2">
            <div class="flex h-7 items-center gap-1.5 rounded-md border border-border/50 bg-muted/30 px-2">
              <Search class="size-3 text-muted-foreground" />
              <input v-model="searchQuery" type="text" placeholder="搜索..." class="w-24 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50" />
            </div>
            <Select v-model="sortKey">
              <SelectTrigger class="h-7 w-24 text-[11px] border-border/50">
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

        <div v-if="isLoading" class="flex items-center gap-2 py-4 text-xs text-muted-foreground">
          <LoaderCircle class="size-3.5 animate-spin" />
          加载中...
        </div>

        <div v-else-if="count === 0" class="flex flex-col items-center py-10">
          <div class="mb-3 flex size-12 items-center justify-center rounded-full bg-muted/40">
            <Lightbulb class="size-5 text-muted-foreground/40" />
          </div>
          <p class="text-sm text-muted-foreground">闪念已清空</p>
        </div>

        <div v-else-if="filteredFiles.length === 0 && searchQuery" class="flex flex-col items-center py-6">
          <Search class="mb-2 size-5 text-muted-foreground/40" />
          <p class="text-xs text-muted-foreground">没有匹配的闪念</p>
        </div>

        <div v-else class="space-y-3">
          <div v-for="note in filteredFiles" :key="note.id" class="rounded-lg border border-border/50 bg-background/60 p-4">
            <div class="flex items-start justify-between gap-3">
              <p class="whitespace-pre-wrap text-sm leading-6 text-foreground">{{ note.content }}</p>
              <span class="shrink-0 text-[11px] text-muted-foreground tabular-nums">{{ formatTime(note.createdAt) }}</span>
            </div>

            <!-- Attachments display -->
            <div v-if="getNoteAttachments(note.id).length > 0" class="mt-2 flex flex-wrap gap-2">
              <div
                v-for="att in getNoteAttachments(note.id)"
                :key="att.id"
                class="flex items-center gap-1.5 rounded-md bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground"
              >
                <component :is="getAttachmentIcon(att.mimeType)" class="size-3" />
                <span class="max-w-[150px] truncate">{{ att.originalName }}</span>
                <span>{{ formatFileSize(att.size) }}</span>
              </div>
            </div>

            <div class="mt-3 rounded-md bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
              {{ recommendationLabel(note) }}
            </div>
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" class="h-7 text-xs" :disabled="note.analysisStatus !== 'suggested'" @click="handleSuggestion(note)">
                按建议处理
              </Button>
              <Button v-if="note.analysisStatus === 'failed' || note.lastError" variant="outline" size="sm" class="h-7 gap-1.5 text-xs" @click="retryAnalysis(note.id)">
                <RefreshCw class="size-3" />
                重新分析
              </Button>
              <Button variant="outline" size="sm" class="h-7 gap-1.5 text-xs" @click="openJournalDialog(note)">
                <BookOpen class="size-3" />
                日记
              </Button>
              <Button variant="outline" size="sm" class="h-7 gap-1.5 text-xs" @click="openTaskDialog(note)">
                <CheckSquare class="size-3" />
                任务
              </Button>
              <Button variant="outline" size="sm" class="h-7 gap-1.5 text-xs" @click="openMilestoneDialog(note)">
                <Flag class="size-3" />
                里程碑
              </Button>
              <Button variant="outline" size="sm" class="h-7 gap-1.5 text-xs" @click="openClipDialog(note)">
                <Bookmark class="size-3" />
                剪藏
              </Button>
              <Button v-if="getNoteAttachments(note.id).length > 0" variant="outline" size="sm" class="h-7 gap-1.5 text-xs" @click="handleAttachment(note)">
                <Archive class="size-3" />
                附件
              </Button>
              <Button variant="ghost" size="sm" class="h-7 gap-1.5 text-xs text-destructive hover:text-destructive" @click="deleteItem(note.id)">
                <Trash2 class="size-3" />
                删除
              </Button>
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
