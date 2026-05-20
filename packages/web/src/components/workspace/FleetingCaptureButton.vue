<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { ref, computed } from "vue";
import {
	Lightbulb,
	LoaderCircle,
	X,
	FileText,
	Mic,
	Paperclip,
	Sparkles,
} from "lucide-vue-next";
import { toast } from "vue-sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
	captureFleetingWithFiles,
	captureFromDesktop,
	getAuthSession,
	type DesktopCaptureType,
} from "@/lib/api";
import {
	syncDesktopStatus,
} from "@/lib/desktop-bridge";

type CaptureMode = "text" | "file" | "audio";

const open = ref(false);
const mode = ref<CaptureMode>("text");
const content = ref("");
const isSaving = ref(false);
const selectedFiles = ref<File[]>([]);
const isRecording = ref(false);
const recordedBlob = ref<Blob | null>(null);
const mediaRecorder = ref<MediaRecorder | null>(null);
const audioChunks = ref<Blob[]>([]);
const fileInputRef = ref<HTMLInputElement | null>(null);
const isAuthenticated = ref(true);
const isOnline = ref(true);

const canSave = computed(() => {
	if (isSaving.value) return false;
	if (mode.value === "text") return content.value.trim().length > 0;
	if (mode.value === "file") return selectedFiles.value.length > 0;
	if (mode.value === "audio") return recordedBlob.value !== null;
	return false;
});

const checkAuth = async () => {
	try {
		const session = await getAuthSession();
		isAuthenticated.value = session.authenticated;
		void syncDesktopStatus(navigator.onLine, session.authenticated);
	} catch {
		isAuthenticated.value = false;
		void syncDesktopStatus(navigator.onLine, false);
	}
};

const setMode = (m: CaptureMode) => {
	mode.value = m;
	content.value = "";
	selectedFiles.value = [];
	recordedBlob.value = null;
	isRecording.value = false;
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

const doCapture = async (
	captureType: DesktopCaptureType,
	text: string,
	files?: File[],
) => {
	if (!isAuthenticated.value) {
		toast.error("桌面端未登录服务器，请先登录");
		return;
	}
	if (!isOnline.value) {
		toast.error("服务器离线，采集不可用");
		return;
	}

	isSaving.value = true;
	try {
		if ((captureType === "file" || captureType === "audio") && files && files.length > 0) {
			await captureFleetingWithFiles(text, captureType, files);
		} else {
			await captureFromDesktop({
				content: text,
				type: captureType,
			});
		}

		window.dispatchEvent(new CustomEvent("ridge:fleeting-created"));
		content.value = "";
		selectedFiles.value = [];
		recordedBlob.value = null;
		open.value = false;
		toast.success("已保存闪念");
	} catch (err) {
		toast.error("保存闪念失败", {
			description: err instanceof Error ? err.message : String(err),
		});
	} finally {
		isSaving.value = false;
	}
};

const save = async () => {
	if (!isAuthenticated.value) {
		toast.error("桌面端未登录服务器，请先登录");
		return;
	}
	if (!isOnline.value) {
		toast.error("服务器离线，采集不可用");
		return;
	}

	const text = content.value.trim();
	const currentMode = mode.value;

	if (currentMode === "file" && selectedFiles.value.length > 0) {
		await doCapture("file", text, selectedFiles.value);
		return;
	}

	if (currentMode === "audio" && recordedBlob.value) {
		const audioFile = new File([recordedBlob.value], "recording.webm", {
			type: "audio/webm",
		});
		await doCapture("audio", text, [audioFile]);
		return;
	}

	if (currentMode === "text" && text) {
		await doCapture("text", text);
		return;
	}
};

// 监听桌面端菜单栏/托盘发来的采集事件
const handleDesktopCapture = (event: CustomEvent<{ type: CaptureMode }>) => {
	const captureType = event.detail?.type;
	if (!captureType) return;
	if (!isAuthenticated.value) {
		toast.error("桌面端未登录服务器，请先登录");
		return;
	}
	if (!isOnline.value) {
		toast.error("服务器离线，采集不可用");
		return;
	}
	open.value = true;
	setMode(captureType);
};

const handleOnline = () => {
	isOnline.value = true;
};

const handleOffline = () => {
	isOnline.value = false;
	toast.error("服务器离线，采集功能暂不可用");
};

const handleDesktopError = (event: CustomEvent<{ message: string }>) => {
	toast.error(event.detail?.message ?? "桌面端采集失败");
};

onMounted(() => {
	window.addEventListener("ridge:capture-desktop", handleDesktopCapture as EventListener);
	window.addEventListener("ridge:desktop-error", handleDesktopError as EventListener);
	window.addEventListener("online", handleOnline);
	window.addEventListener("offline", handleOffline);
	isOnline.value = navigator.onLine;
	void checkAuth();
});

onUnmounted(() => {
	window.removeEventListener("ridge:capture-desktop", handleDesktopCapture as EventListener);
	window.removeEventListener("ridge:desktop-error", handleDesktopError as EventListener);
	window.removeEventListener("online", handleOnline);
	window.removeEventListener("offline", handleOffline);
});
</script>

<template>
	<div class="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
		<!-- 采集面板 -->
		<div
			v-if="open"
			class="w-[min(calc(100vw-3rem),400px)] rounded-xl border border-default bg-card shadow-lg"
		>
			<!-- 头部 -->
			<div class="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-default">
				<div class="flex items-center gap-2.5">
					<div class="flex size-7 items-center justify-center rounded-lg bg-primary/10">
						<Sparkles class="size-4 text-primary" />
					</div>
					<span class="text-sm font-medium text-foreground">捕捉灵感</span>
				</div>
				<Button variant="ghost" size="icon" class="size-7 text-muted-foreground/50 hover:text-foreground hover:bg-soft" @click="open = false">
					<X class="size-4" />
				</Button>
			</div>

			<!-- 内容区 -->
			<div class="px-5 pt-4 pb-5">
				<!-- 文字输入 -->
				<div v-if="mode === 'text'">
					<Textarea
						v-model="content"
						class="min-h-[128px] resize-none border-0 bg-transparent p-0 text-sm leading-relaxed shadow-none outline-none ring-0 placeholder:text-muted-foreground/40 focus-visible:ring-0"
						placeholder="写下此刻的想法，稍后处理..."
						@keydown.ctrl.enter="save"
						@keydown.meta.enter="save"
					/>
				</div>

				<!-- 文件 -->
				<div v-else-if="mode === 'file'" class="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-default bg-soft/50 py-10 transition-colors hover:bg-soft">
					<input ref="fileInputRef" type="file" multiple class="hidden" @change="handleFileSelect" />
					<div class="flex size-12 items-center justify-center rounded-full bg-soft">
						<Paperclip class="size-5 text-muted-foreground/60" />
					</div>
					<div class="text-center">
						<Button variant="outline" size="sm" class="h-8" @click="triggerFileInput">
							选择文件
						</Button>
						<p v-if="selectedFiles.length > 0" class="mt-2 text-caption text-muted-foreground">
							已选 {{ selectedFiles.length }} 个文件
						</p>
						<p v-else class="mt-1.5 text-caption text-muted-foreground/50">或拖拽文件到此处</p>
					</div>
				</div>

				<!-- 录音 -->
				<div v-else-if="mode === 'audio'" class="flex flex-col items-center gap-4 rounded-xl border border-default bg-soft/30 py-10">
					<div class="flex size-12 items-center justify-center rounded-full bg-destructive/10">
						<Mic class="size-5 text-destructive" />
					</div>
					<Button
						v-if="!isRecording && !recordedBlob"
						variant="outline"
						size="sm"
						class="h-8 gap-1.5"
						@click="startRecording"
					>
						<Mic class="size-3.5" />
						开始录音
					</Button>
					<div v-else-if="isRecording" class="flex items-center gap-3">
						<span class="relative flex size-2.5">
							<span class="absolute inline-flex size-full animate-ping rounded-full bg-destructive opacity-60" />
							<span class="relative inline-flex size-2.5 rounded-full bg-destructive" />
						</span>
						<span class="text-sm text-muted-foreground">正在录音…</span>
						<Button variant="outline" size="sm" class="h-7" @click="stopRecording">停止</Button>
					</div>
					<p v-else-if="recordedBlob" class="flex items-center gap-1.5 text-sm text-primary">
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
						录音已就绪
					</p>
				</div>

				<!-- 模式切换 + 保存 -->
				<div class="mt-4 flex items-center justify-between">
					<div class="flex items-center gap-0.5 rounded-lg bg-soft p-0.5">
						<Button
							variant="ghost"
							size="sm"
							class="h-7 gap-1.5 px-2.5 text-xs"
							:class="mode === 'text' ? 'text-foreground bg-card shadow-xs' : 'text-muted-foreground hover:text-foreground'"
							aria-label="文字采集"
							@click="setMode('text')"
						>
							<Lightbulb class="size-3.5" />
							文字
						</Button>
						<Button
							variant="ghost"
							size="sm"
							class="h-7 gap-1.5 px-2.5 text-xs"
							:class="mode === 'file' ? 'text-foreground bg-card shadow-xs' : 'text-muted-foreground hover:text-foreground'"
							aria-label="文件采集"
							@click="setMode('file')"
						>
							<FileText class="size-3.5" />
							文件
						</Button>
						<Button
							variant="ghost"
							size="sm"
							class="h-7 gap-1.5 px-2.5 text-xs"
							:class="mode === 'audio' ? 'text-foreground bg-card shadow-xs' : 'text-muted-foreground hover:text-foreground'"
							aria-label="录音采集"
							@click="setMode('audio')"
						>
							<Mic class="size-3.5" />
							录音
						</Button>
					</div>

					<Button
						size="sm"
						class="h-8 gap-1.5 px-4 text-xs font-medium shadow-xs"
						:disabled="!canSave"
						@click="save"
					>
						<LoaderCircle v-if="isSaving" class="size-3.5 animate-spin" />
						保存
					</Button>
				</div>

				<!-- 离线/未登录提示 -->
				<div v-if="!isAuthenticated || !isOnline" class="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-micro text-destructive">
					<span v-if="!isAuthenticated">未登录，采集不可用</span>
					<span v-else-if="!isOnline">服务器离线，采集不可用</span>
				</div>
			</div>
		</div>

		<!-- 触发按钮 -->
		<Button
			size="icon"
			class="size-12 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/20 transition-all duration-200 hover:scale-110 hover:shadow-xl hover:shadow-primary/30 active:scale-105"
			aria-label="打开闪念捕捉"
			@click="open = !open"
		>
			<Lightbulb class="size-5" />
		</Button>
	</div>
</template>
