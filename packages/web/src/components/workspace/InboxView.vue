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
	Lightbulb,
	Link,
	Send,
	StopCircle,
	X,
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
	totalCount,
	processedCount,
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
const activeFilter = ref<"all" | "processed" | "unprocessed">("all");
const expandedNotes = ref<Record<string, boolean>>({});

const visibleNotes = computed(() => {
	if (activeFilter.value === "processed") {
		return inboxFiles.value.filter((note) => note.status === "processed");
	}
	if (activeFilter.value === "unprocessed") {
		return inboxFiles.value.filter((note) => note.status !== "processed");
	}
	return inboxFiles.value;
});

const filterItems = computed(() => [
	{ key: "all" as const, label: "全部", count: totalCount.value },
	{ key: "unprocessed" as const, label: "未处理", count: count.value },
	{ key: "processed" as const, label: "已处理", count: processedCount.value },
]);

const toggleExpanded = (noteId: string) => {
	expandedNotes.value = {
		...expandedNotes.value,
		[noteId]: !expandedNotes.value[noteId],
	};
};

const isProcessed = (note: InboxItem) => note.status === "processed";

const hasUrl = (text: string) => /https?:\/\/\S+/.test(text);

const previewContent = (text: string) => {
	const stripped = text.replace(/https?:\/\/\S+/g, "").trim();
	return stripped || text;
};

const statusLabel = (note: InboxItem) => {
	if (note.status === "processed") return "已处理";
	if (note.analysisStatus === "analyzing") return "分析中";
	if (note.analysisStatus === "failed") return note.lastError ? `分析失败：${note.lastError}` : "分析失败";
	if (note.analysisStatus === "unanalyzed") return "等待分析";
	return note.recommendationText || "已分析";
};

const statusPillClass = (note: InboxItem) => {
	if (note.status === "processed") return "bg-primary/10 text-primary";
	if (note.analysisStatus === "analyzing") return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
	if (note.analysisStatus === "failed") return "bg-destructive/10 text-destructive";
	if (note.analysisStatus === "suggested") return "bg-primary/10 text-primary";
	return "bg-soft text-muted-foreground";
};

const statusDotClass = (note: InboxItem) => {
	if (note.status === "processed") return "bg-primary";
	if (note.analysisStatus === "analyzing") return "bg-amber-400 animate-pulse";
	if (note.analysisStatus === "failed") return "bg-destructive";
	if (note.analysisStatus === "suggested") return "bg-primary";
	return "bg-muted-foreground/30";
};

/* ───────── 新建闪念 ───────── */

const newNoteContent = ref("");
const isSaving = ref(false);
const selectedFiles = ref<File[]>([]);
const captureFocused = ref(false);
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

const captureExpanded = computed(
	() => captureFocused.value || canSave.value || selectedFiles.value.length > 0 || recordedBlob.value !== null || isRecording.value,
);

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
	if (isProcessed(note)) return;
	activeNote.value = note;
	journalContent.value = note.draft || note.content;
	journalDialogOpen.value = true;
};

const firstUrl = (text: string) => text.match(/https?:\/\/\S+/)?.[0] ?? "";

const openClipDialog = (note: InboxItem) => {
	if (isProcessed(note)) return;
	activeNote.value = note;
	clipContent.value = note.draft || note.content;
	clipUrl.value = firstUrl(note.content);
	clipTitle.value = note.content.split("\n")[0]?.replace(/^https?:\/\/\S+\s*/, "").slice(0, 80) || "未命名剪藏";
	clipSource.value = "闪念";
	clipDialogOpen.value = true;
};

const openTaskDialog = (note: InboxItem) => {
	if (isProcessed(note)) return;
	activeNote.value = note;
	taskTitle.value = note.content.split("\n")[0]?.slice(0, 80) || "未命名任务";
	taskPriority.value = "normal";
	taskAcceptance.value = "";
	taskProjectId.value = null;
	taskDialogOpen.value = true;
};

const openMilestoneDialog = (note: InboxItem) => {
	if (isProcessed(note)) return;
	activeNote.value = note;
	milestoneTitle.value = note.content.split("\n")[0]?.slice(0, 80) || "未命名里程碑";
	milestoneGoal.value = "";
	milestoneAcceptance.value = "";
	milestoneProjectId.value = null;
	milestoneDialogOpen.value = true;
};

const handleAttachment = async (note: InboxItem) => {
	if (isProcessed(note)) return;
	const atts = getNoteAttachments(note.id);
	if (atts.length === 0) { toast.error("该闪念没有附件"); return; }
	await processToAttachment(note.id);
};

const handleSuggestion = (note: InboxItem) => {
	if (isProcessed(note)) return;
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
	<div class="relative flex h-full flex-col overflow-hidden bg-background text-foreground">
		<header class="flex shrink-0 items-center justify-between border-b border-default px-7 py-4">
			<div class="flex items-center gap-2.5">
				<div class="flex size-8 items-center justify-center rounded-[10px] bg-primary/10 text-primary">
					<Lightbulb class="size-[18px]" />
				</div>
				<div>
					<h1 class="text-hero font-semibold leading-tight">闪念</h1>
					<p class="text-caption text-muted-foreground">{{ count }} 条待处理</p>
				</div>
			</div>
			<div class="flex items-center gap-2">
				<span v-if="analyzingCount > 0" class="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-caption text-primary">
					<span class="size-1.5 rounded-full bg-primary animate-pulse" />
					{{ analyzingCount }} 分析中
				</span>
				<span v-if="!isAuthenticated" class="inline-flex items-center rounded-md bg-destructive/10 px-2 py-1 text-micro font-medium text-destructive">未登录</span>
				<span v-else-if="!isOnline" class="inline-flex items-center rounded-md bg-destructive/10 px-2 py-1 text-micro font-medium text-destructive">离线</span>
			</div>
		</header>

		<div class="flex shrink-0 gap-1 border-b border-default px-7 py-2.5">
			<button
				v-for="item in filterItems"
				:key="item.key"
				class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-caption font-medium transition-colors"
				:class="activeFilter === item.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-soft hover:text-foreground'"
				@click="activeFilter = item.key"
			>
				<span
					v-if="item.key !== 'all'"
					class="size-1.5 rounded-full"
					:class="activeFilter === item.key ? 'bg-primary-foreground' : item.key === 'processed' ? 'bg-primary' : 'bg-muted-foreground/30'"
				/>
				{{ item.label }}
				<span class="tabular-nums opacity-70">{{ item.count }}</span>
			</button>
		</div>

		<div class="flex-1 overflow-y-auto px-7 pt-3 pb-36">
			<div class="mx-auto max-w-2xl">
				<div v-if="isLoading" class="flex flex-col items-center justify-center gap-3 py-24">
					<div class="size-7 rounded-full border-2 border-muted/50 border-t-primary animate-spin" />
					<p class="text-body-sm text-muted-foreground/50">加载中…</p>
				</div>

				<div v-else-if="visibleNotes.length === 0" class="flex flex-col items-center justify-center py-24">
					<div class="mb-4 flex size-14 items-center justify-center rounded-2xl bg-soft text-muted-foreground/40">
						<Lightbulb class="size-6" />
					</div>
					<p class="text-body-sm font-medium text-muted-foreground/70">没有闪念</p>
				</div>

				<div v-else>
					<div
						v-for="(note, index) in visibleNotes"
						:key="note.id"
						class="group flex gap-3.5"
					>
						<div class="flex w-5 shrink-0 flex-col items-center">
							<button
								class="mt-4 rounded-full bg-background transition-all duration-200"
								:class="expandedNotes[note.id] ? 'size-3.5 border-[3px] border-primary' : 'size-3 border-[2.5px] hover:border-primary/80'"
								:style="{ borderColor: expandedNotes[note.id] ? undefined : isProcessed(note) ? 'var(--primary)' : 'color-mix(in oklab, var(--muted-foreground), transparent 65%)' }"
								:aria-label="expandedNotes[note.id] ? '收起闪念' : '展开闪念'"
								@click="toggleExpanded(note.id)"
							/>
							<div
								v-if="index < visibleNotes.length - 1"
								class="mt-1.5 w-px flex-1 transition-colors"
								:class="expandedNotes[note.id] ? 'bg-primary/30' : 'bg-border/60'"
							/>
						</div>

						<article class="flex-1 pb-2">
							<div
								class="rounded-xl border bg-card shadow-xs transition-all duration-200 hover:shadow-sm"
								:class="[
									isProcessed(note) ? 'border-primary/20' : note.analysisStatus === 'suggested' ? 'border-primary/20 hover:border-primary/40' : 'border-default hover:border-strong',
									expandedNotes[note.id] ? 'px-4 py-3.5' : 'px-3.5 py-2.5',
								]"
							>
								<div
									v-if="!expandedNotes[note.id]"
									class="cursor-pointer"
									@click="toggleExpanded(note.id)"
								>
									<div class="flex min-h-6 items-center gap-1.5">
										<component
											:is="getAttachmentIcon(getNoteAttachments(note.id)[0]?.mimeType || '')"
											v-if="getNoteAttachments(note.id).length > 0"
											class="size-3.5 shrink-0 text-muted-foreground/50"
										/>
										<Link v-if="hasUrl(note.content)" class="size-3.5 shrink-0 text-primary/60" />
										<span class="min-w-0 flex-1 truncate text-body text-foreground/85">
											{{ previewContent(note.content) }}
										</span>
										<span
											v-if="isProcessed(note)"
											class="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-micro font-medium text-primary"
										>
											<span class="size-1 rounded-full bg-primary" />
											已处理
										</span>
										<span class="shrink-0 text-micro text-muted-foreground/50 tabular-nums">{{ formatTime(note.createdAt) }}</span>
									</div>

									<div
										class="mt-1 hidden items-center gap-1 border-t border-default/60 pt-1.5 group-hover:flex"
										@click.stop
									>
										<Button v-if="!isProcessed(note) && note.analysisStatus === 'suggested'" size="sm" class="h-6 gap-1 px-2 text-micro" @click="handleSuggestion(note)">
											<Wand2 class="size-3" />
											按建议
										</Button>
										<Button v-if="!isProcessed(note)" variant="outline" size="sm" class="h-6 gap-1 px-2 text-micro" aria-label="转为日记" @click="openJournalDialog(note)">
											<BookOpen class="size-3" />
											日记
										</Button>
										<Button v-if="!isProcessed(note)" variant="outline" size="sm" class="h-6 gap-1 px-2 text-micro" aria-label="转为任务" @click="openTaskDialog(note)">
											<CheckSquare class="size-3" />
											任务
										</Button>
										<Button v-if="!isProcessed(note)" variant="outline" size="sm" class="h-6 gap-1 px-2 text-micro" aria-label="转为里程碑" @click="openMilestoneDialog(note)">
											<Flag class="size-3" />
											里程碑
										</Button>
										<Button v-if="!isProcessed(note)" variant="outline" size="sm" class="h-6 gap-1 px-2 text-micro" aria-label="保存剪藏" @click="openClipDialog(note)">
											<Bookmark class="size-3" />
											剪藏
										</Button>
										<Button v-if="!isProcessed(note) && (note.analysisStatus === 'failed' || note.lastError)" variant="ghost" size="icon" class="size-6 text-muted-foreground" aria-label="重试分析" @click="retryAnalysis(note.id)">
											<RefreshCw class="size-3" />
										</Button>
										<div class="flex-1" />
										<Button variant="ghost" size="icon" class="size-6 text-muted-foreground/60 hover:text-destructive" aria-label="删除" @click="deleteItem(note.id)">
											<Trash2 class="size-3" />
										</Button>
									</div>
								</div>

								<div v-else>
									<div v-if="hasUrl(note.content)" class="mb-2 inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-caption font-medium text-primary">
										<Link class="size-3.5" />
										链接
									</div>
									<p class="whitespace-pre-wrap break-words text-body leading-relaxed text-foreground">{{ note.content }}</p>

									<div v-if="getNoteAttachments(note.id).length > 0" class="mt-3 flex flex-wrap gap-1.5">
										<span
											v-for="att in getNoteAttachments(note.id)"
											:key="att.id"
											class="inline-flex items-center gap-1.5 rounded-lg border border-default bg-soft px-2.5 py-1 text-caption text-muted-foreground"
										>
											<component :is="getAttachmentIcon(att.mimeType)" class="size-3.5 shrink-0" />
											<span class="max-w-24 truncate">{{ att.originalName }}</span>
											<span class="text-micro tabular-nums text-muted-foreground/50">{{ formatFileSize(att.size) }}</span>
										</span>
									</div>

									<div class="mt-3 border-t border-default pt-2.5">
										<div class="mb-2.5 flex items-center gap-2">
											<span class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-micro font-medium" :class="statusPillClass(note)">
												<span class="size-1.5 rounded-full" :class="statusDotClass(note)" />
												{{ statusLabel(note) }}
											</span>
											<span class="text-micro text-muted-foreground/55 tabular-nums">{{ formatTime(note.createdAt) }}</span>
											<Button v-if="!isProcessed(note) && (note.analysisStatus === 'failed' || note.lastError)" variant="ghost" size="icon" class="size-6 text-muted-foreground" aria-label="重试分析" @click="retryAnalysis(note.id)">
												<RefreshCw class="size-3" />
											</Button>
										</div>

										<div class="flex flex-wrap items-center gap-1">
											<Button v-if="!isProcessed(note) && note.analysisStatus === 'suggested'" size="sm" class="h-7 gap-1.5 px-3 text-micro" @click="handleSuggestion(note)">
												<Wand2 class="size-3" />
												按建议处理
											</Button>
											<template v-if="!isProcessed(note)">
												<Button variant="outline" size="sm" class="h-7 gap-1 px-2 text-micro" aria-label="转为日记" @click="openJournalDialog(note)">
													<BookOpen class="size-3.5" />
													日记
												</Button>
												<Button variant="outline" size="sm" class="h-7 gap-1 px-2 text-micro" aria-label="转为任务" @click="openTaskDialog(note)">
													<CheckSquare class="size-3.5" />
													任务
												</Button>
												<Button variant="outline" size="sm" class="h-7 gap-1 px-2 text-micro" aria-label="转为里程碑" @click="openMilestoneDialog(note)">
													<Flag class="size-3.5" />
													里程碑
												</Button>
												<Button variant="outline" size="sm" class="h-7 gap-1 px-2 text-micro" aria-label="保存剪藏" @click="openClipDialog(note)">
													<Bookmark class="size-3.5" />
													剪藏
												</Button>
												<Button v-if="getNoteAttachments(note.id).length > 0" variant="outline" size="sm" class="h-7 gap-1 px-2 text-micro" aria-label="查看附件" @click="handleAttachment(note)">
													<Archive class="size-3.5" />
													附件
												</Button>
											</template>
											<div class="flex-1" />
											<Button variant="ghost" size="sm" class="h-7 gap-1 px-2 text-micro text-muted-foreground/70 hover:text-destructive" aria-label="删除" @click="deleteItem(note.id)">
												<Trash2 class="size-3.5" />
												删除
											</Button>
										</div>
									</div>
								</div>
							</div>
						</article>
					</div>
				</div>
			</div>
		</div>

		<div class="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-b from-background/0 via-background to-background px-7 pt-5 pb-6">
			<div
				class="pointer-events-auto mx-auto max-w-2xl overflow-hidden rounded-[14px] border bg-card shadow-[0_4px_20px_rgba(0,0,0,0.06)] transition-all"
				:class="captureExpanded ? 'border-primary/40' : 'border-default'"
			>
				<div :class="captureExpanded ? 'px-4 pt-3.5' : 'px-3.5 py-2.5'">
					<Textarea
						v-model="newNoteContent"
						:disabled="isSaving"
						class="max-h-32 resize-none border-0 bg-transparent p-0 text-body leading-relaxed shadow-none outline-none ring-0 placeholder:text-muted-foreground/40 focus-visible:ring-0"
						:class="captureExpanded ? 'min-h-[60px]' : 'min-h-6'"
						placeholder="捕捉此刻的想法…"
						@focus="captureFocused = true"
						@blur="captureFocused = false"
						@keydown="handleCaptureKeydown"
					/>
				</div>

				<div v-if="captureExpanded && selectedFiles.length > 0" class="flex flex-wrap gap-1.5 px-4 pt-2">
					<span
						v-for="(file, i) in selectedFiles"
						:key="i"
						class="inline-flex items-center gap-1.5 rounded-lg border border-default bg-soft px-2.5 py-1 text-caption text-muted-foreground"
					>
						<Paperclip class="size-3.5 shrink-0" />
						<span class="max-w-36 truncate">{{ file.name }}</span>
						<button class="rounded-sm p-0.5 text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive" @click="removeFile(i)">
							<X class="size-3" />
						</button>
					</span>
				</div>

				<div v-if="captureExpanded && (isRecording || recordedBlob)" class="px-4 pt-2">
					<div v-if="isRecording" class="inline-flex items-center gap-2 rounded-full bg-destructive/10 px-3 py-1.5 text-caption text-destructive">
						<span class="relative flex size-2">
							<span class="absolute inline-flex size-full animate-ping rounded-full bg-destructive opacity-60" />
							<span class="relative inline-flex size-2 rounded-full bg-destructive" />
						</span>
						<span>正在录音…</span>
						<button class="rounded-full p-0.5 text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive" @click="stopRecording">
							<StopCircle class="size-3.5" />
						</button>
					</div>
					<div v-else-if="recordedBlob" class="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-caption text-primary">
						<span class="size-1.5 rounded-full bg-primary" />
						<span>录音已就绪</span>
						<button class="rounded-full p-0.5 text-primary/70 transition-colors hover:bg-primary/10 hover:text-primary" @click="clearRecording">
							<X class="size-3.5" />
						</button>
					</div>
				</div>

				<div class="flex items-center justify-between px-3.5 transition-all" :class="captureExpanded ? 'py-3' : 'py-1.5'">
					<div class="flex items-center gap-1">
						<input ref="fileInputRef" type="file" multiple class="hidden" @change="handleFileSelect" />
						<Button variant="ghost" size="icon" class="size-7 text-muted-foreground/60 hover:bg-soft hover:text-foreground" aria-label="上传文件" @click="triggerFileInput">
							<Paperclip class="size-3.5" />
						</Button>
						<Button variant="ghost" size="icon" class="size-7 text-muted-foreground/60 hover:bg-soft hover:text-foreground" :class="{ 'text-destructive hover:text-destructive hover:bg-destructive/10': isRecording }" aria-label="录音" @click="isRecording ? stopRecording() : startRecording()">
							<Mic class="size-3.5" />
						</Button>
					</div>
					<Button size="icon" class="size-8 rounded-[10px]" :disabled="!canSave" aria-label="保存闪念" @click="handleSave">
						<LoaderCircle v-if="isSaving" class="size-4 animate-spin" />
						<Send v-else class="size-4" />
					</Button>
				</div>
			</div>
		</div>
	</div>

	<!-- Journal Dialog -->
	<Dialog v-model:open="journalDialogOpen">
		<DialogContent>
			<DialogHeader>
				<DialogTitle>写入今日日记</DialogTitle>
				<DialogDescription>闪念会追加到今天的日记，成功后标记为已处理。</DialogDescription>
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
				<DialogDescription>剪藏会保存到 DB，成功后标记为已处理。</DialogDescription>
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
				<DialogDescription>从闪念创建任务，成功后标记为已处理。</DialogDescription>
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
				<DialogDescription>从闪念创建里程碑，成功后标记为已处理。</DialogDescription>
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
