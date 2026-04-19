<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { WebSocketTransport, WTerm } from "@wterm/dom";
import "@wterm/dom/css";

import { getTerminalStreamUrl } from "@/lib/api";
import type { TerminalSnapshot } from "@/lib/types";

const props = defineProps<{
  terminal: TerminalSnapshot;
  autofocus?: boolean;
}>();

const hostRef = ref<HTMLElement | null>(null);
let terminalInstance: WTerm | null = null;
let transport: WebSocketTransport | null = null;
let isDisposed = false;

const terminalStyle = {
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
} as const;

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
  if (!host) return;

  isDisposed = false;
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
        if (props.autofocus) {
          terminalInstance?.focus();
        }
      },
      onClose() {
        if (!isDisposed) {
          // transport handles reconnect internally
        }
      },
      onError() {
        // transport will retry
      },
    });

    transport.connect();

    if (props.autofocus) {
      terminalInstance.focus();
    }
  } catch (caughtError) {
    // WASM 或网络初始化失败时静默记录，避免崩溃
    console.error("[TerminalViewport] 终端初始化失败:", caughtError);
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
    class="relative h-full overflow-hidden"
    :style="terminalStyle"
    @click="focusTerminal"
  >
    <div ref="hostRef" class="ridge-terminal-host absolute inset-0" />
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
}

.ridge-terminal-host :deep(textarea) {
  font-family: "IBM Plex Mono", monospace;
}
</style>
