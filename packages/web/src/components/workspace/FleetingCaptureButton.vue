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

const doCapture = async (
	captureType: DesktopCaptureType,
	text: string,
	attachments?: { name: string; mimeType: string; base64: string }[],
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
		await captureFromDesktop({
			content: text,
			type: captureType,
			attachments,
		});

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
		const attachments = await Promise.all(
			selectedFiles.value.map(async (file) => ({
				name: file.name,
				mimeType: file.type || "application/octet-stream",
				base64: await blobToBase64(file),
			})),
		);
		await doCapture("file", text, attachments);
		return;
	}

	if (currentMode === "audio" && recordedBlob.value) {
		const base64 = await blobToBase64(recordedBlob.value);
		await doCapture("audio", text, [
			{ name: "recording.webm", mimeType: "audio/webm", base64 },
		]);
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
			class="w-[min(calc(100vw-3rem),400px)] rounded-2xl border border-default bg-card shadow-2xl"
		>
			<!-- 头部 -->
			<div class="flex items-center justify-between border-b border-subtle px-4 py-3">
				<div class="flex items-center gap-2">
					<div class="flex size-7 items-center justify-center rounded-lg bg-primary/10">
						<Sparkles class="size-4 text-primary" />
					</div>
					<span class="text-sm font-medium text-foreground">捕捉灵感</span>
				</div>
				<Button variant="ghost" size="icon" class="size-7 text-muted-foreground" @click="open = false">
					<X class="size-4" />
				</Button>
			</div>

			<!-- 内容区 -->
			<div class="px-4 pt-3 pb-4">
				<!-- 文字输入 -->
				<div v-if="mode === 'text'">
					<Textarea
						v-model="content"
						class="min-h-[120px] resize-none border-0 bg-transparent p-0 text-sm leading-relaxed shadow-none outline-none ring-0 placeholder:text-muted-foreground/40 focus-visible:ring-0"
						placeholder="写下此刻的想法，稍后处理..."
						@keydown.ctrl.enter="save"
						@keydown.meta.enter="save"
					/>
				</div>

				<!-- 文件 -->
				<div v-else-if="mode === 'file'" class="flex flex-col items-center gap-3 rounded-xl border border-dashed border-default bg-subtle/50 py-8">
					<input ref="fileInputRef" type="file" multiple class="hidden" @change="handleFileSelect" />
					<div class="flex size-12 items-center justify-center rounded-full bg-soft">
						<Paperclip class="size-5 text-muted-foreground" />
					</div>
					<Button variant="outline" size="sm" class="h-8" @click="triggerFileInput">
						选择文件
					</Button>
					<p v-if="selectedFiles.length > 0" class="text-caption text-muted-foreground">
						已选 {{ selectedFiles.length }} 个文件
					</p>
				</div>

				<!-- 录音 -->
				<div v-else-if="mode === 'audio'" class="flex flex-col items-center gap-3 rounded-xl border border-default py-8">
					<div class="flex size-12 items-center justify-center rounded-full bg-red-50">
						<Mic class="size-5 text-red-500" />
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
						<span class="size-2.5 animate-pulse rounded-full bg-red-500" />
						<span class="text-sm text-muted-foreground">正在录音...</span>
						<Button variant="outline" size="sm" class="h-7" @click="stopRecording">停止</Button>
					</div>
					<p v-else-if="recordedBlob" class="text-sm text-green-600">录音完成</p>
				</div>

				<!-- 模式切换 + 保存 -->
				<div class="mt-3 flex items-center justify-between">
					<div class="flex items-center gap-1">
						<Button
							variant="ghost"
							size="icon"
							class="size-8"
							:class="mode === 'text' ? 'text-primary bg-primary/10' : 'text-muted-foreground'"
							@click="setMode('text')"
						>
							<Lightbulb class="size-4" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							class="size-8"
							:class="mode === 'file' ? 'text-primary bg-primary/10' : 'text-muted-foreground'"
							@click="setMode('file')"
						>
							<FileText class="size-4" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							class="size-8"
							:class="mode === 'audio' ? 'text-primary bg-primary/10' : 'text-muted-foreground'"
							@click="setMode('audio')"
						>
							<Mic class="size-4" />
						</Button>
					</div>

					<Button
						size="sm"
						class="h-8 gap-1.5 px-4"
						:disabled="!canSave"
						@click="save"
					>
						<LoaderCircle v-if="isSaving" class="size-3.5 animate-spin" />
						保存
					</Button>
				</div>

				<!-- 离线/未登录提示 -->
				<div v-if="!isAuthenticated || !isOnline" class="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-micro text-destructive">
					<span v-if="!isAuthenticated">未登录，采集不可用</span>
					<span v-else-if="!isOnline">服务器离线，采集不可用</span>
				</div>
			</div>
		</div>

		<!-- 触发按钮 -->
		<Button
			size="icon"
			class="size-12 rounded-full shadow-xl transition-transform hover:scale-105"
			aria-label="打开闪念捕捉"
			@click="open = !open"
		>
			<Lightbulb class="size-5" />
		</Button>
	</div>
</template>
