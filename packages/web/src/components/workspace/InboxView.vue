<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import {
	LoaderCircle,
	Image,
	FileText,
	RefreshCw,
	Mic,
	Paperclip,
	Lightbulb,
	Link,
	Send,
	StopCircle,
	ChevronUp,
	X,
} from "lucide-vue-next";
import { toast } from "vue-sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspaceInbox, type InboxItem } from "@/composables/useInbox";
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
	captureNote,
	uploadAttachments,
	retryAnalysis,
	formatTime,
	getNoteAttachments,
} = useWorkspaceInbox(() => props.workspaceDir);

onMounted(() => {
	isOnline.value = navigator.onLine;
	void checkAuth();
});

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

const analysisSummary = (note: InboxItem) => {
	if (note.status !== "processed" && note.analysisStatus !== "processed") return "";
	return note.recommendationText?.trim() ?? "";
};

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
	return "已分析";
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
const inputFocused = ref(false);
const isRecording = ref(false);
const recordedBlob = ref<Blob | null>(null);
const mediaRecorder = ref<MediaRecorder | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const isAuthenticated = ref(true);
const isOnline = ref(true);

const inputExpanded = computed(() => inputFocused.value || canSave.value || selectedFiles.value.length > 0 || isRecording.value);

const checkAuth = async () => {
	try {
		const session = await getAuthSession();
		isAuthenticated.value = session.authenticated;
	} catch {
		isAuthenticated.value = false;
	}
};

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
		const chunks: Blob[] = [];
		recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
		recorder.onstop = () => {
			recordedBlob.value = new Blob(chunks, { type: "audio/webm" });
			stream.getTracks().forEach((t) => t.stop());
			// auto-send on stop
			if (canSave.value) void handleSave();
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

const canSave = computed(() => {
	if (isSaving.value) return false;
	return newNoteContent.value.trim().length > 0 || selectedFiles.value.length > 0 || recordedBlob.value !== null;
});

const doCapture = async (type: DesktopCaptureType, text: string, files?: File[]) => {
	if (!isAuthenticated.value) { toast.error("未登录，采集不可用"); return; }
	if (!isOnline.value) { toast.error("服务器离线，采集不可用"); return; }

	isSaving.value = true;
	try {
		if (files && files.length > 0) {
			const created = await captureFromDesktop({
				content: text,
				type,
				attachments: [],
				delayAnalysis: true,
			});
			await uploadAttachments(String(created.note.id), files, { successToast: false });
			await retryAnalysis(String(created.note.id), { successToast: false });
		} else {
			await captureFromDesktop({ content: text, type });
		}
		window.dispatchEvent(new CustomEvent("ridge:fleeting-created"));
		newNoteContent.value = "";
		selectedFiles.value = [];
		recordedBlob.value = null;
		toast.success(files && files.length > 0 ? `已保存闪念，${files.length} 个附件已进入分析` : "已保存闪念");
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

	if (hasText || hasFiles || hasAudio) {
		if (hasFiles) {
			await doCapture("file", text, selectedFiles.value);
		} else if (hasAudio && recordedBlob.value) {
			const audioFile = new File([recordedBlob.value], "recording.webm", {
				type: "audio/webm",
			});
			await doCapture("audio", text, [audioFile]);
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
	<div class="flex h-full flex-col overflow-hidden bg-background">
		<!-- Filter + analyzing row -->
		<div class="flex shrink-0 items-center justify-between border-b border-default px-7 py-2.5">
			<div class="flex items-center gap-1.5">
				<button v-for="item in filterItems" :key="item.key"
					class="rounded-lg px-2.5 py-1 text-caption font-medium transition-colors"
					:class="activeFilter === item.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-soft hover:text-foreground'"
					@click="activeFilter = item.key"
				>
					{{ item.label }}
					<span class="ml-1 tabular-nums opacity-60">{{ item.count }}</span>
				</button>
			</div>
			<button v-if="analyzingCount > 0" class="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-caption text-primary">
				<span class="size-1.5 rounded-full bg-primary animate-pulse" />
				{{ analyzingCount }}
			</button>
		</div>

		<!-- Timeline: input + notes -->
		<div class="flex-1 overflow-y-auto px-7 pt-5 pb-8">
			<div class="mx-auto max-w-2xl">
				<div v-if="isLoading" class="flex flex-col items-center justify-center gap-3 py-24">
					<div class="size-7 rounded-full border-2 border-muted/50 border-t-primary animate-spin" />
					<p class="text-body-sm text-muted-foreground/50">加载中…</p>
				</div>

				<template v-else>
				<!-- ──── Input as first timeline item ──── -->
				<div class="group flex gap-3.5">
					<div class="flex w-5 shrink-0 flex-col items-center">
						<div
							class="mt-4 size-3 rounded-full border-2 transition-all duration-200"
							:class="inputExpanded || isRecording || selectedFiles.length > 0 || newNoteContent.trim() ? 'border-primary bg-primary/20' : 'border-muted-foreground/30 bg-background'"
						/>
						<div class="mt-1.5 w-px flex-1 bg-border/60" />
					</div>
					<div class="flex-1 pb-2">
						<div
							class="rounded-xl border bg-card transition-all"
							:class="inputExpanded ? 'border-primary/40 px-4 py-3.5 shadow-xs' : 'border-dashed border-muted-foreground/20 px-3.5 py-3 hover:border-muted-foreground/40 hover:shadow-xs'"
						>
							<div class="flex flex-col gap-3">
								<Textarea
									v-model="newNoteContent"
									:disabled="isSaving"
									class="min-h-6 max-h-32 resize-none border-0 bg-transparent p-0 text-body leading-relaxed shadow-none outline-none ring-0 placeholder:text-muted-foreground/40 focus-visible:ring-0"
									:class="inputExpanded ? 'min-h-[52px]' : ''"
									placeholder="捕捉此刻的想法…"
									@focus="inputFocused = true"
									@blur="inputFocused = false"
									@keydown="handleCaptureKeydown"
								/>

								<!-- Attachments preview -->
								<div v-if="selectedFiles.length > 0" class="flex flex-wrap gap-1.5">
									<span v-for="(f, i) in selectedFiles" :key="i" class="inline-flex items-center gap-1.5 rounded-lg border border-default bg-soft px-2 py-1 text-caption text-muted-foreground">
										<Paperclip class="size-3.5 shrink-0" />
										<span class="max-w-28 truncate">{{ f.name }}</span>
										<button class="rounded p-0.5 text-muted-foreground/50 transition-colors hover:text-destructive" @click="removeFile(i)"><X class="size-3" /></button>
									</span>
								</div>

								<!-- Recording indicator -->
								<div v-if="isRecording">
									<div class="inline-flex items-center gap-2 rounded-full bg-destructive/10 px-3 py-1 text-caption text-destructive">
										<span class="relative flex size-2"><span class="absolute inline-flex size-full animate-ping rounded-full bg-destructive opacity-60" /><span class="relative inline-flex size-2 rounded-full bg-destructive" /></span>
										录音中… 松手自动发送
									</div>
								</div>

								<!-- Toolbar — always visible -->
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-1.5">
										<input ref="fileInputRef" type="file" multiple class="hidden" @change="handleFileSelect" />
										<Button variant="ghost" size="sm" class="h-7 gap-1.5 px-2.5 text-caption text-muted-foreground/60 hover:bg-soft hover:text-foreground" @click="triggerFileInput">
											<Paperclip class="size-3.5" />
											附件
										</Button>
										<button
											class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-caption font-medium transition-all"
											:class="isRecording
												? 'bg-destructive/10 text-destructive animate-pulse'
												: 'bg-primary/10 text-primary hover:bg-primary/20'"
											@click="isRecording ? stopRecording() : startRecording()"
										>
											<Mic v-if="!isRecording" class="size-3.5" />
											<StopCircle v-else class="size-3.5" />
											{{ isRecording ? '停止录音' : '语音输入' }}
										</button>
									</div>
									<Button size="sm" class="h-8 gap-1.5 px-3 rounded-[10px]" :disabled="!canSave" @click="handleSave">
										<LoaderCircle v-if="isSaving" class="size-3.5 animate-spin" />
										<Send v-else class="size-3.5" />
										发送
									</Button>
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- ──── Notes list ──── -->
				<div v-if="visibleNotes.length === 0" class="flex flex-col items-center justify-center py-16">
					<div class="mb-4 flex size-14 items-center justify-center rounded-2xl bg-soft text-muted-foreground/40">
						<Lightbulb class="size-6" />
					</div>
					<p class="text-body-sm font-medium text-muted-foreground/70">还没有闪念</p>
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
									data-testid="fleeting-note-collapsed"
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
										v-if="!isProcessed(note) && (note.analysisStatus === 'failed' || note.lastError)"
										class="mt-1 hidden items-center gap-1 border-t border-default/60 pt-1.5 group-hover:flex"
										@click.stop
									>
										<Button variant="ghost" size="icon" class="size-6 text-muted-foreground" aria-label="重试分析" @click="retryAnalysis(note.id)">
											<RefreshCw class="size-3" />
										</Button>
									</div>
								</div>

								<div v-else>
									<div class="mb-3 flex items-start justify-between gap-3">
										<div class="flex flex-wrap items-center gap-2">
											<div v-if="hasUrl(note.content)" class="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-caption font-medium text-primary">
												<Link class="size-3.5" />
												链接
											</div>
											<span class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-micro font-medium" :class="statusPillClass(note)">
												<span class="size-1.5 rounded-full" :class="statusDotClass(note)" />
												{{ statusLabel(note) }}
											</span>
											<span class="text-micro text-muted-foreground/55 tabular-nums">{{ formatTime(note.createdAt) }}</span>
										</div>
										<Button variant="ghost" size="icon" class="size-7 shrink-0 text-muted-foreground" aria-label="收起闪念详情" @click="toggleExpanded(note.id)">
											<ChevronUp class="size-4" />
										</Button>
									</div>

									<section v-if="analysisSummary(note)" class="mb-3 rounded-lg border border-primary/15 bg-primary/[0.04] px-3 py-2.5">
										<p class="text-micro font-medium text-primary">处理结果</p>
										<p class="mt-1 whitespace-pre-wrap break-words text-body-sm leading-relaxed text-foreground">{{ analysisSummary(note) }}</p>
									</section>

									<section>
										<p class="mb-1.5 text-micro font-medium text-muted-foreground">原始内容</p>
										<p class="whitespace-pre-wrap break-words text-body leading-relaxed text-foreground">{{ note.content }}</p>
									</section>

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

									<div v-if="!isProcessed(note) && (note.analysisStatus === 'failed' || note.lastError)" class="mt-3 border-t border-default pt-2.5">
										<Button variant="ghost" size="sm" class="h-7 gap-1.5 px-2.5 text-caption text-muted-foreground" aria-label="重试分析" @click="retryAnalysis(note.id)">
											<RefreshCw class="size-3" />
											重试分析
										</Button>
									</div>
								</div>
							</div>
						</article>
					</div>
			</div>
		</template>
		</div>
	</div>
</div>

</template>
