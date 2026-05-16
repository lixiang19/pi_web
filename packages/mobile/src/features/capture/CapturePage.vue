<script setup lang="ts">
import { computed, ref } from "vue";
import { Camera, Image, Mic, RotateCcw, Trash2, Type } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createMobileApiClient } from "@/lib/api/mobile-api-client";
import { createDeviceStorage } from "@/lib/device/device-storage";
import { fileToMobileCaptureAttachment } from "@/lib/media/capture-attachment";
import {
  type MobileMediaDraftAttachment,
  createMediaDraftStorage,
} from "@/lib/media/media-draft-storage";
import {
  createInitialRecordingState,
  reduceRecordingState,
} from "@/lib/media/recording-state";
import { createMobileCaptureSubmitter } from "@/lib/media/mobile-capture-submitter";

const text = ref("");
const attachments = ref<MobileMediaDraftAttachment[]>([]);
const message = ref("");
const submitting = ref(false);
const cameraInput = ref<HTMLInputElement | null>(null);
const galleryInput = ref<HTMLInputElement | null>(null);
const recorder = ref<MediaRecorder | null>(null);
const recordingState = ref(createInitialRecordingState());
const audioChunks: Blob[] = [];

const draftStorage = createMediaDraftStorage();
const submitter = createMobileCaptureSubmitter({
  api: createMobileApiClient(),
  deviceStorage: createDeviceStorage(),
  draftStorage,
});

const hasDraftContent = computed(
  () => text.value.trim().length > 0 || attachments.value.length > 0,
);

const addFiles = async (
  files: FileList | null,
  source: "camera" | "gallery",
) => {
  if (!files) return;
  for (const file of Array.from(files)) {
    attachments.value.push(
      await fileToMobileCaptureAttachment(file, { source }),
    );
  }
};

const removeAttachment = (id: string) => {
  attachments.value = attachments.value.filter((attachment) => attachment.id !== id);
  if (recordingState.value.attachmentId === id) {
    recordingState.value = reduceRecordingState(recordingState.value, { type: "delete" });
  }
};

const startRecording = async () => {
  message.value = "";
  audioChunks.splice(0);
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const nextRecorder = new MediaRecorder(stream);
  nextRecorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) {
      audioChunks.push(event.data);
    }
  });
  nextRecorder.addEventListener("stop", () => {
    void (async () => {
      const file = new File(audioChunks, `recording-${Date.now()}.webm`, {
        type: nextRecorder.mimeType || "audio/webm",
      });
      const attachment = await fileToMobileCaptureAttachment(file, {
        source: "recorder",
      });
      attachments.value.push(attachment);
      recordingState.value = reduceRecordingState(recordingState.value, {
        type: "preview",
        attachmentId: attachment.id,
      });
      stream.getTracks().forEach((track) => track.stop());
    })();
  });
  recorder.value = nextRecorder;
  recordingState.value = reduceRecordingState(recordingState.value, { type: "start" });
  nextRecorder.start();
};

const stopRecording = () => {
  recorder.value?.stop();
  recorder.value = null;
};

const submit = async () => {
  message.value = "";
  if (!hasDraftContent.value || submitting.value) return;
  submitting.value = true;
  recordingState.value = reduceRecordingState(recordingState.value, { type: "upload" });
  const result = await submitter.submitCapture({
    text: text.value.trim(),
    attachments: attachments.value,
  });
  submitting.value = false;
  if (result.ok) {
    text.value = "";
    attachments.value = [];
    recordingState.value = reduceRecordingState(recordingState.value, { type: "done" });
    message.value = "已保存";
    return;
  }
  recordingState.value = reduceRecordingState(recordingState.value, {
    type: "fail",
    error: result.error,
  });
  message.value = "已保留本地草稿，可稍后重试";
};
</script>

<template>
  <main class="mobile-screen" aria-labelledby="capture-title" data-testid="capture-screen">
    <p class="eyebrow">移动捕捉</p>
    <h1 id="capture-title">
      先把闪念留下
    </h1>
    <Textarea
      v-model="text"
      class="capture-textarea"
      placeholder="写下刚冒出来的想法"
      data-testid="capture-textarea"
    />
    <div class="quick-grid" aria-label="捕捉方式">
      <button type="button" class="quick-action">
        <Type class="size-5" aria-hidden="true" />
        <span>文字</span>
      </button>
      <button
        v-if="recordingState.status !== 'recording'"
        type="button"
        class="quick-action"
        data-testid="start-recording-button"
        @click="startRecording"
      >
        <Mic class="size-5" aria-hidden="true" />
        <span>录音</span>
      </button>
      <button
        v-else
        type="button"
        class="quick-action"
        data-testid="stop-recording-button"
        @click="stopRecording"
      >
        <Mic class="size-5" aria-hidden="true" />
        <span>停止</span>
      </button>
      <button type="button" class="quick-action" @click="cameraInput?.click()">
        <Camera class="size-5" aria-hidden="true" />
        <span>拍照</span>
      </button>
      <button type="button" class="quick-action" @click="galleryInput?.click()">
        <Image class="size-5" aria-hidden="true" />
        <span>相册</span>
      </button>
    </div>
    <input
      ref="cameraInput"
      class="sr-only"
      type="file"
      accept="image/*"
      capture="environment"
      data-testid="camera-input"
      @change="addFiles(($event.target as HTMLInputElement).files, 'camera')"
    >
    <input
      ref="galleryInput"
      class="sr-only"
      type="file"
      accept="image/*"
      data-testid="gallery-input"
      @change="addFiles(($event.target as HTMLInputElement).files, 'gallery')"
    >
    <div v-if="attachments.length" class="attachment-list" aria-label="待上传附件">
      <div
        v-for="attachment in attachments"
        :key="attachment.id"
        class="attachment-row"
        data-testid="capture-attachment"
      >
        <span>{{ attachment.kind === "audio" ? "录音" : attachment.source === "camera" ? "拍照" : "相册" }}</span>
        <strong>{{ attachment.name }}</strong>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          :aria-label="`删除 ${attachment.name}`"
          @click="removeAttachment(attachment.id)"
        >
          <Trash2 class="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
    <p v-if="message" class="capture-message" role="status">
      {{ message }}
    </p>
    <div class="capture-submit-row">
      <Button
        type="button"
        class="capture-submit"
        :disabled="!hasDraftContent || submitting"
        data-testid="save-capture-button"
        @click="submit"
      >
        <RotateCcw v-if="submitting" class="size-4" aria-hidden="true" />
        {{ submitting ? "保存中" : "保存闪念" }}
      </Button>
    </div>
  </main>
</template>
