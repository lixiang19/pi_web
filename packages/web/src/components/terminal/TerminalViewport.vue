<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { WebSocketTransport, WTerm } from "@wterm/dom";
import "@wterm/dom/css";

import { getTerminalStreamUrl } from "@/lib/api";
import type { TerminalSnapshot } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

const props = defineProps<{
  terminal: TerminalSnapshot;
  autofocus?: boolean;
}>();

const hostRef = ref<HTMLElement | null>(null);
const connectionState = ref<"connecting" | "connected" | "error">("connecting");
const errorMessage = ref("");

let terminalInstance: WTerm | null = null;
let transport: WebSocketTransport | null = null;
let isDisposed = false;

const statusLabel = computed(() => {
  if (connectionState.value === "error") {
    return "连接异常";
  }

  if (connectionState.value === "connecting") {
    return "连接中";
  }

  if (props.terminal.status === "exited") {
    return "已退出";
  }

  if (props.terminal.status === "error") {
    return "错误";
  }

  if (props.terminal.status === "disconnected") {
    return "待重连";
  }

  return "运行中";
});

const statusVariant = computed(() => {
  if (connectionState.value === "error" || props.terminal.status === "error") {
    return "destructive" as const;
  }

  if (props.terminal.status === "exited") {
    return "secondary" as const;
  }

  return "outline" as const;
});

const terminalStyle = computed(() => ({
  "--term-bg": "hsl(var(--card))",
  "--term-fg": "hsl(var(--foreground))",
  "--term-color-0": "hsl(var(--muted-foreground) / 0.75)",
  "--term-color-1": "hsl(var(--destructive))",
  "--term-color-2": "hsl(var(--primary))",
  "--term-color-3": "hsl(var(--accent-foreground) / 0.9)",
  "--term-color-4": "hsl(var(--ring))",
  "--term-color-5": "hsl(var(--primary) / 0.82)",
  "--term-color-6": "hsl(var(--accent-foreground))",
  "--term-color-7": "hsl(var(--foreground) / 0.95)",
  "--term-color-8": "hsl(var(--muted-foreground) / 0.55)",
  "--term-color-9": "hsl(var(--destructive) / 0.84)",
  "--term-color-10": "hsl(var(--primary) / 0.7)",
  "--term-color-11": "hsl(var(--accent-foreground))",
  "--term-color-12": "hsl(var(--ring) / 0.82)",
  "--term-color-13": "hsl(var(--primary))",
  "--term-color-14": "hsl(var(--accent-foreground) / 0.85)",
  "--term-color-15": "hsl(var(--foreground))",
  fontFamily: '"IBM Plex Mono", monospace',
}));

const focusTerminal = () => {
  terminalInstance?.focus();
};

const disposeTransport = () => {
  transport?.close();
  transport = null;
};

const disposeTerminal = () => {
  terminalInstance?.destroy();
  terminalInstance = null;
};

const mountTerminal = async () => {
  const host = hostRef.value;
  if (!host) {
    return;
  }

  isDisposed = false;
  errorMessage.value = "";
  connectionState.value = "connecting";
  disposeTransport();
  disposeTerminal();
  host.innerHTML = "";

  try {
    const transportUrl = getTerminalStreamUrl(props.terminal.id);
    const instance = new WTerm(host, {
      autoResize: true,
      cursorBlink: true,
      onData(data) {
        transport?.send(data);
      },
      onResize(cols, rows) {
        transport?.send(`\x1b[RESIZE:${cols};${rows}]`);
      },
    });

    await instance.init();
    terminalInstance = instance;

    transport = new WebSocketTransport({
      url: transportUrl,
      reconnect: true,
      onData(data) {
        terminalInstance?.write(data);
      },
      onOpen() {
        connectionState.value = "connected";
        if (props.autofocus) {
          terminalInstance?.focus();
        }
      },
      onClose() {
        if (!isDisposed) {
          connectionState.value = "connecting";
        }
      },
      onError() {
        connectionState.value = "error";
        errorMessage.value = "终端流连接失败";
      },
    });

    transport.connect();

    if (props.autofocus) {
      terminalInstance.focus();
    }
  } catch (caughtError) {
    connectionState.value = "error";
    errorMessage.value =
      caughtError instanceof Error ? caughtError.message : String(caughtError);
  }
};

watch(
  () => props.terminal.id,
  () => {
    void mountTerminal();
  },
);

watch(
  () => props.autofocus,
  (nextValue) => {
    if (nextValue) {
      terminalInstance?.focus();
    }
  },
);

onMounted(() => {
  void mountTerminal();
});

onBeforeUnmount(() => {
  isDisposed = true;
  disposeTransport();
  disposeTerminal();
});
</script>

<template>
  <section
    class="relative flex h-full min-h-[360px] flex-col overflow-hidden rounded-[28px] border border-border/70 bg-card/70 shadow-sm"
    :style="terminalStyle"
    @click="focusTerminal"
  >
    <div class="flex items-center justify-between border-b border-border/60 px-4 py-3">
      <div class="min-w-0">
        <p class="truncate text-sm font-semibold text-foreground">
          {{ terminal.title }}
        </p>
        <p class="truncate text-xs text-muted-foreground">
          {{ terminal.cwd }}
        </p>
      </div>

      <Badge :variant="statusVariant" class="shrink-0 text-[11px]">
        {{ statusLabel }}
      </Badge>
    </div>

    <div class="relative min-h-0 flex-1 overflow-hidden px-3 py-3">
      <div ref="hostRef" class="ridge-terminal-host h-full overflow-hidden rounded-2xl" />

      <div
        v-if="errorMessage"
        class="absolute inset-x-6 top-6 rounded-2xl border border-destructive/40 bg-background/95 px-4 py-3 text-sm text-destructive shadow-sm"
      >
        {{ errorMessage }}
      </div>
    </div>
  </section>
</template>

<style scoped>
.ridge-terminal-host {
  background: var(--term-bg);
}

.ridge-terminal-host :deep(.wterm) {
  height: 100%;
}

.ridge-terminal-host :deep(.wterm-root) {
  height: 100%;
  border-radius: 1rem;
}

.ridge-terminal-host :deep(textarea) {
  font-family: "IBM Plex Mono", monospace;
}
</style>