export type MobileChatRole = "user" | "assistant" | "system" | "tool";
export type MobileChatStatus = "idle" | "streaming" | "error";

export interface MobileRawChatMessage {
  role: MobileChatRole;
  content: string;
  timestamp?: number;
}

export interface MobileChatMessage extends MobileRawChatMessage {
  id: string;
  pending?: boolean;
}

export type MobileChatStreamEvent =
  | {
      type: "snapshot";
      status?: MobileChatStatus;
      messages?: MobileRawChatMessage[];
      interactiveRequests?: unknown[];
      permissionRequests?: unknown[];
    }
  | { type: "status"; status?: MobileChatStatus }
  | { type: "message_start"; message?: MobileRawChatMessage }
  | { type: "message_end"; message?: MobileRawChatMessage }
  | { type: "error"; error?: string };

export interface MobileChatStreamPatch {
  messages: MobileChatMessage[];
  status?: MobileChatStatus;
  error?: string;
  hasFinalAssistantMessage?: boolean;
}

export interface MobileChatEventSourceSubscription {
  close(): void;
}

export interface MobileChatEventSourceOptions {
  serviceBaseUrl: string;
  sessionId: string;
  token: string;
  rounds?: number;
  onEvent: (event: MobileChatStreamEvent) => void;
  onError?: () => void;
  eventSourceFactory?: (url: string) => EventSource;
}

function createMessageId(prefix: string, index: number) {
  return `${prefix}-${index}`;
}

function normalizeMessage(
  message: MobileRawChatMessage,
  id: string,
  pending?: boolean,
): MobileChatMessage {
  return {
    id,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp ?? Date.now(),
    pending,
  };
}

export function applyMobileChatStreamEvent(
  currentMessages: MobileChatMessage[],
  event: MobileChatStreamEvent,
): MobileChatStreamPatch {
  if (event.type === "snapshot") {
    return {
      messages: (event.messages ?? []).map((message, index) =>
        normalizeMessage(message, createMessageId("snapshot", index)),
      ),
      status: event.status,
    };
  }

  if (event.type === "status") {
    return {
      messages: [...currentMessages],
      status: event.status,
    };
  }

  if (event.type === "message_start" && event.message) {
    return {
      messages: [
        ...currentMessages,
        normalizeMessage(
          event.message,
          createMessageId("assistant-pending", currentMessages.length),
          true,
        ),
      ],
      status: "streaming",
    };
  }

  if (event.type === "message_end" && event.message) {
    const next = normalizeMessage(
      event.message,
      createMessageId("assistant-final", currentMessages.length),
      false,
    );
    const pendingIndex = currentMessages.findIndex(
      (message) => message.pending === true && message.role === "assistant",
    );
    const messages =
      pendingIndex >= 0
        ? currentMessages.map((message, index) =>
            index === pendingIndex ? next : message,
          )
        : [...currentMessages, next];
    return {
      messages,
      status: "idle",
      hasFinalAssistantMessage: true,
    };
  }

  if (event.type === "error") {
    return {
      messages: [...currentMessages],
      status: "error",
      error: event.error ?? "生成失败",
    };
  }

  return { messages: [...currentMessages] };
}

export function createMobileChatEventSource(
  options: MobileChatEventSourceOptions,
): MobileChatEventSourceSubscription {
  const params = new URLSearchParams();
  params.set("rounds", String(options.rounds ?? 3));
  params.set("token", options.token);
  const sourceUrl = `${options.serviceBaseUrl}/api/sessions/${encodeURIComponent(options.sessionId)}/events?${params.toString()}`;
  const source = options.eventSourceFactory
    ? options.eventSourceFactory(sourceUrl)
    : new EventSource(sourceUrl);

  source.onmessage = (messageEvent) => {
    options.onEvent(JSON.parse(messageEvent.data) as MobileChatStreamEvent);
  };
  source.onerror = () => {
    options.onError?.();
  };

  return {
    close() {
      source.close();
    },
  };
}
