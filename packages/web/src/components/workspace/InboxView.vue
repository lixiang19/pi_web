<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import {
	BookOpen,
	Bookmark,
	LoaderCircle,
	Trash2,
	CheckSquare,
	Image,
	FileText,
	RefreshCw,
	Flag,
	Archive,
	Mic,
	Paperclip,
	Wand2,
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
import { Textarea } from "@/components/ui/textarea";
import { useWorkspaceInbox, type InboxItem } from "@/composables/useInbox";
import { useProjects } from "@/composables/useProjects";
import { captureFromDesktop, getAuthSession, type DesktopCaptureType } from "@/lib/api";

const props = defineProps<{
	workspaceDir: string;
}>();

const {
	inboxFiles,
	isLoading,
	count,
	analyzingCount,
	deleteItem,
	captureNote,
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
	isOnline.value = navigator.onLine;
	void checkAuth();
});

const activeNote = ref<InboxItem | null>(null);

/* ───────── 新建闪念 ───────── */

const newNoteContent = ref("");
const isSaving = ref(false);
const selectedFiles = ref<File[]>([]);
const isRecording = ref(false);
const recordedBlob = ref<Blob | null>(null);
const mediaRecorder = ref<MediaRecorder | null>(null);
const audioChunks = ref<Blob[]>([]);
const fileInputRef = ref<HTMLInputElement | null>(null);
const isAuthenticated = ref(true);
const isOnline = ref(true);

const checkAuth = async () => {
	try {
		const session = await getAuthSession();
		isAuthenticated.value = session.authenticated;
	} catch {
		isAuthenticated.value = false;
	}
};

const blobToBase64 = (blob: Blob): Promise<string> =>
	new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => {
			const result = reader.result as string;
			const parts = result.split(",");
			resolve(parts[1] ?? "");
		};
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});

const handleFileSelect = (event: Event) => {
	const target = event.target as HTMLInputElement;
	if (target.files && target.files.length > 0) {
		selectedFiles.value = Array.from(target.files);
	}
};

const triggerFileInput = () => {
	fileInputRef.value?.click();
};

const removeFile = (index: number) => {
	selectedFiles.value = selectedFiles.value.filter((_, i) => i !== index);
};

const startRecording = async () => {
	try {
		const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		const recorder = new MediaRecorder(stream);
		mediaRecorder.value = recorder;
		audioChunks.value = [];
		recorder.ondataavailable = (e) => {
			if (e.data.size > 0) audioChunks.value.push(e.data);
		};
		recorder.onstop = () => {
			recordedBlob.value = new Blob(audioChunks.value, { type: "audio/webm" });
			stream.getTracks().forEach((t) => t.stop());
		};
		recorder.start();
		isRecording.value = true;
	} catch {
		toast.error("无法启动录音，请检查麦克风权限");
	}
};

const stopRecording = () => {
	mediaRecorder.value?.stop();
	isRecording.value = false;
};

const clearRecording = () => {
	recordedBlob.value = null;
};

const canSave = computed(() => {
	if (isSaving.value) return false;
	return newNoteContent.value.trim().length > 0 || selectedFiles.value.length > 0 || recordedBlob.value !== null;
});

const doCapture = async (type: DesktopCaptureType, text: string, attachments?: { name: string; mimeType: string; base64: string }[]) => {
	if (!isAuthenticated.value) { toast.error("未登录，采集不可用"); return; }
	if (!isOnline.value) { toast.error("服务器离线，采集不可用"); return; }

	isSaving.value = true;
	try {
		await captureFromDesktop({ content: text, type, attachments });
		window.dispatchEvent(new CustomEvent("ridge:fleeting-created"));
		newNoteContent.value = "";
		selectedFiles.value = [];
		recordedBlob.value = null;
		toast.success("已保存闪念");
	} catch (err) {
		toast.error("保存闪念失败", { description: err instanceof Error ? err.message : String(err) });
	} finally {
		isSaving.value = false;
	}
};

const handleSave = async () => {
	const text = newNoteContent.value.trim();
	const hasFiles = selectedFiles.value.length > 0;
	const hasAudio = recordedBlob.value !== null;
	const hasText = text.length > 0;

	// 构建附件数组
	const attachments: { name: string; mimeType: string; base64: string }[] = [];

	if (hasFiles) {
		const fileAttachments = await Promise.all(
			selectedFiles.value.map(async (file) => ({
				name: file.name,
				mimeType: file.type || "application/octet-stream",
				base64: await blobToBase64(file),
			}))
		);
		attachments.push(...fileAttachments);
	}

	if (hasAudio) {
		attachments.push({
			name: "recording.webm",
			mimeType: "audio/webm",
			base64: await blobToBase64(recordedBlob.value!),
		});
	}

	if (hasText || attachments.length > 0) {
		if (attachments.length > 0) {
			await doCapture("file", text, attachments);
		} else {
			await captureNote(text);
			newNoteContent.value = "";
		}
	}
};

const handleCaptureKeydown = (e: KeyboardEvent) => {
	if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
		e.preventDefault();
		void handleSave();
	}
};

/* ───────── 列表卡片操作 ───────── */

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

const handleAttachment = async (note: InboxItem) => {
	const atts = getNoteAttachments(note.id);
	if (atts.length === 0) { toast.error("该闪念没有附件"); return; }
	await processToAttachment(note.id);
};

const handleSuggestion = (note: InboxItem) => {
	if (note.recommendationType === "journal") openJournalDialog(note);
	else if (note.recommendationType === "clip") openClipDialog(note);
	else if (note.recommendationType === "task") openTaskDialog(note);
	else if (note.recommendationType === "delete") deleteItem(note.id);
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

/* ───────── Dialog 状态 ───────── */

const journalDialogOpen = ref(false);
const journalContent = ref("");

const clipDialogOpen = ref(false);
const clipTitle = ref("");
const clipUrl = ref("");
const clipContent = ref("");
const clipSource = ref("闪念");

const taskDialogOpen = ref(false);
const taskTitle = ref("");
const taskPriority = ref<"normal" | "important" | "urgent">("normal");
const taskAcceptance = ref("");
const taskProjectId = ref<string | null>(null);

const milestoneDialogOpen = ref(false);
const milestoneTitle = ref("");
const milestoneGoal = ref("");
const milestoneAcceptance = ref("");
const milestoneProjectId = ref<string | null>(null);

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
</script>

<template>
	<div class="flex h-full flex-col bg-background">
		<!-- 新建闪念卡片 -->
		<div class="shrink-0 px-6 pt-5 pb-2">
			<div
			class="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-white/15 bg-background/55 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.1)] ring-1 ring-black/[0.02] backdrop-blur-md"
			>
			<!-- 内容区 —— 输入 + 附件 + 录音 + 工具 -->
			<div class="px-4 pt-4 pb-3">
				<!-- 文字输入（始终可见，可空） -->
				<div class="min-h-[100px]">
					<Textarea
						v-model="newNoteContent"
						:disabled="isSaving"
						class="h-full resize-none border-0 bg-transparent p-0 text-sm leading-relaxed shadow-none outline-none ring-0 placeholder:text-muted-foreground/30 focus-visible:ring-0"
						placeholder="写下此刻的想法，稍后处理…"
						@keydown="handleCaptureKeydown"
					/>
				</div>

				<!-- 附件预览条 -->
				<div v-if="selectedFiles.length > 0" class="mt-2 flex flex-wrap gap-1.5">
					<span
						v-for="(file, i) in selectedFiles"
						:key="i"
						class="group/att inline-flex items-center gap-1 rounded-lg border border-subtle bg-muted/[0.3] px-2.5 py-1 text-xs text-muted-foreground"
					>
						<Paperclip class="size-3.5 shrink-0" />
						<span class="max-w-[140px] truncate">{{ file.name }}</span>
						<button
							class="ml-0.5 rounded-sm p-0.5 text-muted-foreground/40 hover:text-destructive"
							@click="removeFile(i)"
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
						</button>
					</span>
				</div>

				<!-- 录音状态条 -->
				<div v-if="isRecording || recordedBlob" class="mt-2 flex items-center gap-2">
					<!-- 录音中 -->
					<div v-if="isRecording" class="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-600 dark:border-rose-800/30 dark:bg-rose-500/10">
						<span class="relative flex size-2">
							<span class="absolute inline-flex size-full animate-ping rounded-full bg-rose-400 opacity-75" />
							<span class="relative inline-flex size-2 rounded-full bg-rose-500" />
						</span>
						<span>正在录音…</span>
						<button class="rounded-full p-0.5 hover:bg-rose-100 dark:hover:bg-rose-500/20" @click="stopRecording">
							<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" class="text-rose-500"><rect width="16" height="16" x="4" y="4" rx="2"/></svg>
						</button>
					</div>
					<!-- 录音完成 -->
					<div v-else-if="recordedBlob" class="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-600 dark:border-emerald-800/30 dark:bg-emerald-500/10">
						<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" class="text-emerald-500"><path d="M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm5.5 11.5L18 9l-1.414-1.414L11.5 12.672 8.914 10.086 7.5 11.5l3.5 3.5 1.5-1.5z"/></svg>
						<span>录音已就绪</span>
						<button class="rounded-full p-0.5 hover:bg-emerald-100 dark:hover:bg-emerald-500/20" @click="clearRecording">
							<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
						</button>
					</div>
				</div>

				<!-- 底部工具栏 -->
				<div class="mt-3 flex items-center justify-between gap-3">
					<div class="flex items-center gap-3">
						<span v-if="count > 0" class="text-xs text-muted-foreground/70">{{ count }} 条</span>
						<span v-if="analyzingCount > 0" class="inline-flex items-center gap-1 text-xs text-primary">
							<span class="size-1.5 rounded-full bg-primary animate-pulse" />
							{{ analyzingCount }} 分析中
						</span>
						<span v-if="!isAuthenticated" class="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">未登录</span>
						<span v-else-if="!isOnline" class="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">离线</span>
					</div>

					<div class="flex items-center gap-1.5">
						<input ref="fileInputRef" type="file" multiple class="hidden" @change="handleFileSelect" />
						<!-- 附件按钮 -->
						<button
							class="flex size-7 items-center justify-center rounded-md text-xs text-muted-foreground/60 transition-colors hover:text-foreground hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
							aria-label="上传文件"
							@click="triggerFileInput"
						>
							<Paperclip class="size-3.5" />
						</button>
						<!-- 录音按钮 -->
						<button
							class="flex size-7 items-center justify-center rounded-md text-xs text-muted-foreground/60 transition-colors hover:text-foreground hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
							:class="{ 'text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10': isRecording }"
							aria-label="录音"
							@click="startRecording"
						>
							<Mic class="size-3.5" />
						</button>

						<Button
							size="sm"
							class="h-8 gap-1.5 px-4 text-xs font-medium shadow-sm transition-shadow hover:shadow-md"
							:disabled="!canSave"
							@click="handleSave"
						>
							<LoaderCircle v-if="isSaving" class="size-3.5 animate-spin" />
							{{ isSaving ? "保存中" : "保存" }}
						</Button>
					</div>
				</div>
			</div>
			</div>
		</div>

		<!-- 内容区 -->
		<div class="flex-1 overflow-y-auto px-6 pb-8">
			<div class="mx-auto max-w-2xl">
				<!-- 加载状态 -->
				<div v-if="isLoading" class="flex flex-col items-center justify-center gap-3 py-24">
					<div class="relative size-8">
						<div class="absolute inset-0 rounded-full border-2 border-muted" />
						<div class="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
					</div>
					<p class="text-sm text-muted-foreground/60">加载中…</p>
				</div>

				<!-- 空状态 -->
				<div v-else-if="count === 0" class="flex flex-col items-center justify-center py-28">
					<div class="relative mb-5 flex size-16 items-center justify-center">
						<div class="absolute inset-0 rounded-2xl bg-primary/[0.04] ring-1 ring-primary/[0.06]" />
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="28"
							height="28"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="relative text-muted-foreground/40"
						>
							<path d="M12 6v6l4 2" />
							<circle cx="12" cy="12" r="10" />
						</svg>
					</div>
					<p class="text-sm font-medium text-muted-foreground/60">没有待处理的闪念</p>
					<p class="mt-1 text-xs text-muted-foreground/35">先捕捉灵感，AI 会帮你分类处理</p>
				</div>

				<!-- 列表 -->
				<div v-else class="space-y-3">
					<div
						v-for="note in inboxFiles"
						:key="note.id"
						class="group relative overflow-hidden rounded-xl border border-default bg-card shadow-[0_1px_2px_0_rgba(0,0,0,0.03)] ring-1 ring-black/[0.02] transition-all duration-200 hover:border-strong hover:shadow-[0_2px_8px_0_rgba(0,0,0,0.05)]"
					>
						<div class="p-5">
							<div class="flex items-start justify-between gap-4">
								<p class="flex-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{{ note.content }}</p>
								<div class="flex shrink-0 items-center gap-2 pt-0.5">
									<span class="text-caption text-muted-foreground/50 tabular-nums">{{ formatTime(note.createdAt) }}</span>
								</div>
							</div>

							<!-- 附件 -->
							<div v-if="getNoteAttachments(note.id).length > 0" class="mt-3 flex flex-wrap gap-1.5">
								<div
									v-for="att in getNoteAttachments(note.id)"
									:key="att.id"
									class="inline-flex items-center gap-1.5 rounded-lg border border-subtle bg-muted/[0.3] px-2.5 py-1 text-xs text-muted-foreground"
								>
									<component :is="getAttachmentIcon(att.mimeType)" class="size-3.5 shrink-0" />
									<span class="max-w-[120px] truncate">{{ att.originalName }}</span>
									<span class="tabular-nums text-muted-foreground/50">{{ formatFileSize(att.size) }}</span>
								</div>
							</div>

							<!-- 建议状态 -->
							<div class="mt-3 flex items-center gap-2">
								<span
									class="inline-flex items-center gap-1.5 text-caption"
									:class="{
										'text-amber-600': note.analysisStatus === 'analyzing',
										'text-rose-600': note.analysisStatus === 'failed',
										'text-muted-foreground/50': note.analysisStatus === 'unanalyzed',
										'text-primary/80': note.analysisStatus === 'suggested',
									}"
								>
									<span
										v-if="note.analysisStatus === 'analyzing'"
										class="size-1.5 rounded-full bg-amber-400 animate-pulse"
									/>
									<span
										v-if="note.analysisStatus === 'failed'"
										class="size-1.5 rounded-full bg-rose-400"
									/>
									<span
										v-if="note.analysisStatus === 'suggested'"
										class="size-1.5 rounded-full bg-primary/60"
									/>
									{{ note.analysisStatus === 'analyzing' ? '建议生成中' : note.analysisStatus === 'failed' ? `分析失败${note.lastError ? `：${note.lastError}` : ''}` : note.analysisStatus === 'unanalyzed' ? '等待分析' : note.recommendationText || '已有建议' }}
								</span>
								<Button
									v-if="note.analysisStatus === 'failed' || note.lastError"
									variant="ghost"
									size="sm"
									class="h-5 gap-1 px-1.5 text-micro text-muted-foreground hover:text-foreground"
									@click="retryAnalysis(note.id)"
								>
									<RefreshCw class="size-3" />
									重试
								</Button>
							</div>

							<!-- 操作按钮 -->
							<div class="mt-3.5 flex items-center gap-1">
								<Button
									v-if="note.analysisStatus === 'suggested'"
									size="sm"
									class="h-7 gap-1.5 text-xs font-medium"
									@click="handleSuggestion(note)"
								>
									<Wand2 class="size-3" />
									按建议处理
								</Button>
								<Button variant="ghost" size="icon" class="size-7 text-muted-foreground/60 hover:text-foreground" aria-label="转为日记" @click="openJournalDialog(note)">
									<BookOpen class="size-3.5" />
								</Button>
								<Button variant="ghost" size="icon" class="size-7 text-muted-foreground/60 hover:text-foreground" aria-label="转为任务" @click="openTaskDialog(note)">
									<CheckSquare class="size-3.5" />
								</Button>
								<Button variant="ghost" size="icon" class="size-7 text-muted-foreground/60 hover:text-foreground" aria-label="转为里程碑" @click="openMilestoneDialog(note)">
									<Flag class="size-3.5" />
								</Button>
								<Button variant="ghost" size="icon" class="size-7 text-muted-foreground/60 hover:text-foreground" aria-label="保存剪藏" @click="openClipDialog(note)">
									<Bookmark class="size-3.5" />
								</Button>
								<Button v-if="getNoteAttachments(note.id).length > 0" variant="ghost" size="icon" class="size-7 text-muted-foreground/60 hover:text-foreground" aria-label="查看附件" @click="handleAttachment(note)">
									<Archive class="size-3.5" />
								</Button>
								<div class="flex-1" />
								<Button variant="ghost" size="icon" class="size-7 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/5" aria-label="删除" @click="deleteItem(note.id)">
									<Trash2 class="size-3.5" />
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
</template>
