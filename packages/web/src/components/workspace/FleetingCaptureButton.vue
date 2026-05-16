<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { ref, computed } from "vue";
import {
	Lightbulb,
	LoaderCircle,
	X,
	Type,
	Image,
	Monitor,
	FileText,
	Clipboard,
	MousePointerClick,
	Globe,
	Mic,
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
	tauriCaptureBrowserUrl,
	tauriCaptureClipboard,
	tauriCaptureSelection,
	tauriCaptureScreenshotRegion,
	tauriCaptureScreenshotWindow,
	tauriCaptureScreenshotFullscreen,
	syncDesktopStatus,
	isTauri,
} from "@/lib/desktop-bridge";

type CaptureMode =
	| "text"
	| "screenshot_region"
	| "screenshot_window"
	| "screenshot_fullscreen"
	| "file"
	| "clipboard"
	| "selection"
	| "browser_url"
	| "audio";

interface CaptureAction {
	id: CaptureMode;
	label: string;
	icon: typeof Type;
	needsText: boolean;
	acceptsFile: boolean;
	acceptsAudio: boolean;
}

const actions: CaptureAction[] = [
	{ id: "text", label: "文字", icon: Type, needsText: true, acceptsFile: false, acceptsAudio: false },
	{ id: "screenshot_region", label: "区域截图", icon: Image, needsText: false, acceptsFile: false, acceptsAudio: false },
	{ id: "screenshot_window", label: "窗口截图", icon: Monitor, needsText: false, acceptsFile: false, acceptsAudio: false },
	{ id: "screenshot_fullscreen", label: "全屏截图", icon: Monitor, needsText: false, acceptsFile: false, acceptsAudio: false },
	{ id: "file", label: "文件", icon: FileText, needsText: false, acceptsFile: true, acceptsAudio: false },
	{ id: "clipboard", label: "剪贴板", icon: Clipboard, needsText: false, acceptsFile: false, acceptsAudio: false },
	{ id: "selection", label: "当前选区", icon: MousePointerClick, needsText: false, acceptsFile: false, acceptsAudio: false },
	{ id: "browser_url", label: "浏览器网址", icon: Globe, needsText: false, acceptsFile: false, acceptsAudio: false },
	{ id: "audio", label: "录音", icon: Mic, needsText: false, acceptsFile: false, acceptsAudio: true },
];

const open = ref(false);
const mode = ref<CaptureMode>("text");
const content = ref("");
const nativeTitle = ref("");
const nativeSelectedText = ref("");
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
	if (mode.value === "clipboard") return content.value.trim().length > 0;
	if (mode.value === "selection") return content.value.trim().length > 0;
	if (mode.value === "browser_url") return content.value.trim().length > 0;
	if (mode.value === "file") return selectedFiles.value.length > 0;
	if (mode.value === "audio") return recordedBlob.value !== null;
	if (mode.value.startsWith("screenshot_")) return true;
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
	nativeTitle.value = "";
	nativeSelectedText.value = "";
	selectedFiles.value = [];
	recordedBlob.value = null;
	isRecording.value = false;

	if (m === "clipboard") {
		readClipboard();
	}
	if (m === "browser_url") {
		readBrowserUrl();
	}
	if (m === "selection") {
		readSelection();
	}
};

const readClipboard = async () => {
	if (isTauri()) {
		const tauriText = await tauriCaptureClipboard();
		if (tauriText !== null) {
			content.value = tauriText;
		} else {
			content.value = "";
			toast.error("无法读取系统剪贴板");
		}
		return;
	}
	try {
		const text = await navigator.clipboard.readText();
		content.value = text || "";
	} catch {
		content.value = "";
		toast.error("无法读取剪贴板，请手动粘贴");
	}
};

const readBrowserUrl = async () => {
	if (isTauri()) {
		const result = await tauriCaptureBrowserUrl();
		if (result !== null) {
			content.value = result.url;
			nativeTitle.value = result.title;
			nativeSelectedText.value = result.selectedText;
			if (result.title && result.title !== result.url) {
				content.value = `${result.title}\n${result.url}`;
			}
		} else {
			content.value = "";
			toast.error("无法采集当前浏览器网址，请确认浏览器已前台运行");
		}
		return;
	}
	try {
		const url = window.location.href;
		const title = document.title;
		content.value = url;
		nativeTitle.value = title;
		nativeSelectedText.value = "";
		if (title && title !== url) {
			content.value = `${title}\n${url}`;
		}
	} catch {
		content.value = "";
	}
};

const readSelection = async () => {
	if (isTauri()) {
		const tauriText = await tauriCaptureSelection();
		if (tauriText !== null) {
			content.value = tauriText;
		} else {
			content.value = "";
			toast.error("无法采集当前选区文本，请确认已在前台应用中选择文本");
		}
		return;
	}
	try {
		const selection = window.getSelection()?.toString() || "";
		content.value = selection;
	} catch {
		content.value = "";
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

const captureScreenshot = async (type: "region" | "window" | "fullscreen") => {
	if (isTauri()) {
		let bytes: Uint8Array | null = null;
		if (type === "region") {
			bytes = await tauriCaptureScreenshotRegion();
		} else if (type === "window") {
			bytes = await tauriCaptureScreenshotWindow();
		} else {
			bytes = await tauriCaptureScreenshotFullscreen();
		}

		if (bytes !== null && bytes.length > 0) {
			const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
			const blob = new Blob([buffer], { type: "image/png" });
			const base64 = await blobToBase64(blob);
			await doCapture(`screenshot_${type}`, content.value, [
				{ name: `screenshot-${type}.png`, mimeType: "image/png", base64 },
			]);
			return;
		}
		toast.error("桌面截图失败，请检查权限");
		return;
	}

	// Web 端回退到 getDisplayMedia
	try {
		const stream = await navigator.mediaDevices.getDisplayMedia({
			video: { displaySurface: type === "window" ? "window" : type === "region" ? "browser" : "monitor" },
		});
		const video = document.createElement("video");
		video.srcObject = stream;
		await video.play();

		const canvas = document.createElement("canvas");
		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;
		const ctx = canvas.getContext("2d")!;
		ctx.drawImage(video, 0, 0);

		const blob = await new Promise<Blob>((resolve) =>
			canvas.toBlob((b) => resolve(b!), "image/png"),
		);
		const base64 = await blobToBase64(blob);

		stream.getTracks().forEach((t) => t.stop());

		await doCapture(`screenshot_${type}`, content.value, [
			{ name: `screenshot-${type}.png`, mimeType: "image/png", base64 },
		]);
	} catch {
		toast.error("截图失败，请检查权限");
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
		const metadata: Record<string, unknown> = {};
		if (captureType === "browser_url") {
			if (nativeTitle.value) metadata['title'] = nativeTitle.value;
			if (nativeSelectedText.value) metadata['selectedText'] = nativeSelectedText.value;
		}
		if (captureType === "selection") {
			metadata['selectedText'] = text;
		}

		await captureFromDesktop({
			content: text,
			type: captureType,
			metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
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

	if (currentMode.startsWith("screenshot_")) {
		const type = currentMode.replace("screenshot_", "") as "region" | "window" | "fullscreen";
		await captureScreenshot(type);
		return;
	}

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

	if (currentMode === "clipboard" || currentMode === "selection" || currentMode === "browser_url") {
		await doCapture(currentMode as DesktopCaptureType, text);
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
  <div class="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
    <div v-if="open" class="w-[min(calc(100vw-2.5rem),420px)] rounded-xl border border-default bg-card p-4 shadow-2xl">
      <div class="mb-3 flex items-center justify-between">
        <div class="flex items-center gap-2 text-sm font-semibold">
          <Lightbulb class="size-4 text-amber-500" />
          闪念采集
        </div>
        <Button variant="ghost" size="icon" class="size-7" @click="open = false">
          <X class="size-4" />
        </Button>
      </div>

      <!-- 采集类型选择 -->
      <div class="mb-3 grid grid-cols-4 gap-1.5">
        <button
          v-for="action in actions"
          :key="action.id"
          class="flex flex-col items-center gap-1 rounded-lg border p-2 text-caption transition-colors"
          :class="mode === action.id ? 'border-primary bg-primary/10 text-primary' : 'border-default hover:bg-muted'"
          @click="setMode(action.id)"
        >
          <component :is="action.icon" class="size-4" />
          <span>{{ action.label }}</span>
        </button>
      </div>

      <!-- 文字输入区 -->
      <div v-if="mode === 'text' || mode === 'clipboard' || mode === 'selection' || mode === 'browser_url'">
        <Textarea
          v-model="content"
          class="min-h-20 resize-none text-sm"
          :placeholder="
            mode === 'browser_url'
              ? '网址（自动读取当前页面）...'
              : mode === 'clipboard'
                ? '剪贴板内容...'
                : mode === 'selection'
                  ? '当前选中的文本...'
                  : '先写下来，稍后处理...'
          "
          @keydown.ctrl.enter="save"
          @keydown.meta.enter="save"
        />
      </div>

      <!-- 文件选择 -->
      <div v-else-if="mode === 'file'" class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-6">
        <input ref="fileInputRef" type="file" multiple class="hidden" @change="handleFileSelect" />
        <Button variant="outline" size="sm" @click="triggerFileInput">
          选择文件
        </Button>
        <p v-if="selectedFiles.length > 0" class="text-xs text-muted-foreground">
          已选 {{ selectedFiles.length }} 个文件
        </p>
      </div>

      <!-- 截图提示 -->
      <div v-else-if="mode.startsWith('screenshot_')" class="flex flex-col items-center gap-2 rounded-lg border border-border p-4">
        <Image class="size-8 text-muted-foreground" />
        <p class="text-xs text-muted-foreground">点击保存后将弹出屏幕选择</p>
        <Textarea v-model="content" class="min-h-16 resize-none text-sm" placeholder="截图备注（可选）..." />
      </div>

      <!-- 录音 -->
      <div v-else-if="mode === 'audio'" class="flex flex-col items-center gap-2 rounded-lg border border-border p-4">
        <Button v-if="!isRecording && !recordedBlob" variant="outline" size="sm" class="gap-1.5" @click="startRecording">
          <Mic class="size-3.5" />
          开始录音
        </Button>
        <div v-else-if="isRecording" class="flex items-center gap-2">
          <span class="size-2 animate-pulse rounded-full bg-red-500" />
          <span class="text-xs text-muted-foreground">正在录音...</span>
          <Button variant="outline" size="sm" @click="stopRecording">停止</Button>
        </div>
        <p v-else-if="recordedBlob" class="text-xs text-green-600">录音完成</p>
        <Textarea v-model="content" class="min-h-16 resize-none text-sm" placeholder="录音备注（可选）..." />
      </div>

      <!-- 操作栏 -->
      <div v-if="!isAuthenticated || !isOnline" class="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
        <span v-if="!isAuthenticated">桌面端未登录服务器，采集不可用</span>
        <span v-else-if="!isOnline">服务器离线，采集不可用</span>
      </div>

      <div class="mt-3 flex items-center justify-between">
        <span class="text-caption text-muted-foreground">
          {{ mode === 'text' ? '保存后不打断当前工作' : '采集结果进入服务器闪念' }}
        </span>
        <Button size="sm" class="h-8 gap-1.5" :disabled="!canSave" @click="save">
          <LoaderCircle v-if="isSaving" class="size-3.5 animate-spin" />
          保存
        </Button>
      </div>
    </div>

    <Button size="icon" class="size-12 rounded-full shadow-xl" aria-label="打开闪念捕捉" @click="open = !open">
      <Lightbulb class="size-5" />
    </Button>
  </div>
</template>
