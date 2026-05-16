<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import {
  Camera,
  Image,
  Mic,
  Plus,
  Send,
  Square,
  Trash2,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createMobileApiClient } from "@/lib/api/mobile-api-client";
import { createDeviceStorage } from "@/lib/device/device-storage";
import { fileToMobileCaptureAttachment } from "@/lib/media/capture-attachment";
import {
  createMobileChatApiClient,
} from "@/lib/chat/mobile-chat-api-client";
import {
  createMobileChatDraftStorage,
} from "@/lib/chat/mobile-chat-draft-storage";
import {
  createMobileChatStore,
} from "@/lib/chat/mobile-chat-store";
import {
  createMobileChatEventSource,
  type MobileChatEventSourceSubscription,
} from "@/lib/chat/mobile-chat-sse";

const api = createMobileApiClient();
const deviceStorage = createDeviceStorage();
const route = useRoute() as ReturnType<typeof useRoute> | undefined;
const chatApi = createMobileChatApiClient({
  api,
  registration: () => deviceStorage.getRegistration(),
});
const store = createMobileChatStore({
  api: chatApi,
  draftStorage: createMobileChatDraftStorage(),
});

const cameraInput = ref<HTMLInputElement | null>(null);
const galleryInput = ref<HTMLInputElement | null>(null);
const audioInput = ref<HTMLInputElement | null>(null);
let subscription: MobileChatEventSourceSubscription | null = null;

function closeStream() {
  subscription?.close();
  subscription = null;
}

function connectStream(sessionId: string) {
  closeStream();
  const registration = deviceStorage.getRegistration();
  const serviceBaseUrl = api.getServiceBaseUrl();
  if (!registration || !serviceBaseUrl || typeof EventSource !== "function") {
    return;
  }
  subscription = createMobileChatEventSource({
    serviceBaseUrl,
    sessionId,
    token: registration.token,
    rounds: 3,
    onEvent: store.applyStreamEvent,
    onError: () => {
      store.error = "流式连接已断开";
    },
  });
}

async function newSession() {
  const sessionId = await store.createSession();
  connectStream(sessionId);
}

async function selectSession(sessionId: string) {
  await store.selectSession(sessionId);
  connectStream(sessionId);
}

async function sendMessage() {
  await store.send();
  if (store.selectedSessionId && !subscription) {
    connectStream(store.selectedSessionId);
  }
}

async function addFiles(
  files: FileList | null,
  source: "camera" | "gallery" | "recorder",
) {
  if (!files) return;
  for (const file of Array.from(files)) {
    store.addAttachment(await fileToMobileCaptureAttachment(file, { source }));
  }
}

onMounted(() => {
  void (async () => {
    await store.loadSessions();
    const routeSessionId = route && typeof route.query["sessionId"] === "string" ? route.query["sessionId"] : "";
    if (routeSessionId) {
      await selectSession(routeSessionId);
    }
  })();
});

onBeforeUnmount(() => {
  closeStream();
});
</script>

<template>
  <main class="mobile-screen chat-screen" aria-labelledby="chat-title" data-testid="chat-screen">
    <div class="chat-title-row">
      <div>
        <p class="eyebrow">轻对话</p>
        <h1 id="chat-title">
          普通会话
        </h1>
      </div>
      <Button
        type="button"
        size="icon"
        aria-label="新建移动端普通会话"
        data-testid="new-chat-button"
        @click="newSession"
      >
        <Plus class="size-4" aria-hidden="true" />
      </Button>
    </div>

    <section class="chat-session-list" aria-label="基础会话历史">
      <button
        v-for="session in store.sessions"
        :key="session.id"
        type="button"
        class="chat-session-pill"
        :class="{ active: session.id === store.selectedSessionId }"
        @click="selectSession(session.id)"
      >
        {{ session.title || "移动端会话" }}
      </button>
      <p v-if="!store.sessions.length" class="chat-empty-line">
        暂无会话
      </p>
    </section>

    <section class="chat-message-list" aria-label="移动端消息流">
      <article
        v-for="message in store.messages"
        :key="message.id"
        class="chat-message"
        :class="message.role"
      >
        <span>{{ message.role === "user" ? "我" : "ridge" }}</span>
        <p>{{ message.content }}</p>
      </article>
      <p v-if="store.status === 'streaming'" class="chat-empty-line" role="status">
        正在生成
      </p>
      <p v-if="!store.messages.length && store.status !== 'streaming'" class="chat-empty-line">
        选择或新建会话后开始对话
      </p>
    </section>

    <div v-if="store.composer.attachments.length" class="attachment-list" aria-label="对话待发送附件">
      <div
        v-for="attachment in store.composer.attachments"
        :key="attachment.id"
        class="attachment-row"
      >
        <span>{{ attachment.kind === "audio" ? "录音" : attachment.source === "camera" ? "拍照" : "相册" }}</span>
        <strong>{{ attachment.name }}</strong>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          :aria-label="`删除 ${attachment.name}`"
          @click="store.removeAttachment(attachment.id)"
        >
          <Trash2 class="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>

    <p v-if="store.error" class="capture-message" role="alert">
      {{ store.error }}
    </p>

    <section class="chat-composer" aria-label="移动端普通对话输入">
      <Textarea
        v-model="store.composer.text"
        class="chat-textarea"
        placeholder="发送普通 AI 对话"
        data-testid="chat-composer-textarea"
      />
      <div class="chat-tool-row">
        <Button type="button" variant="outline" size="icon" aria-label="添加对话图片" @click="galleryInput?.click()">
          <Image class="size-4" aria-hidden="true" />
        </Button>
        <Button type="button" variant="outline" size="icon" aria-label="拍照添加到对话" @click="cameraInput?.click()">
          <Camera class="size-4" aria-hidden="true" />
        </Button>
        <Button type="button" variant="outline" size="icon" aria-label="添加录音附件" @click="audioInput?.click()">
          <Mic class="size-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="取消当前生成"
          data-testid="cancel-chat-button"
          :disabled="!store.selectedSessionId"
          @click="store.cancel"
        >
          <Square class="size-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          class="chat-send"
          :disabled="store.isSending"
          data-testid="send-chat-button"
          @click="sendMessage"
        >
          <Send class="size-4" aria-hidden="true" />
          发送
        </Button>
      </div>
    </section>

    <input
      ref="galleryInput"
      class="sr-only"
      type="file"
      accept="image/*"
      multiple
      @change="addFiles(($event.target as HTMLInputElement).files, 'gallery')"
    >
    <input
      ref="cameraInput"
      class="sr-only"
      type="file"
      accept="image/*"
      capture="environment"
      @change="addFiles(($event.target as HTMLInputElement).files, 'camera')"
    >
    <input
      ref="audioInput"
      class="sr-only"
      type="file"
      accept="audio/*"
      @change="addFiles(($event.target as HTMLInputElement).files, 'recorder')"
    >
  </main>
</template>
