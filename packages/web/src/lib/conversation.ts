import type {
  AskQuestion,
  AskToolCallArguments,
  AskToolResultDetails,
  PiAssistantMessage,
  PiImageContent,
  PiMessage,
  PiTextContent,
  PiThinkingContent,
  PiToolCall,
  PiToolResultMessage,
  UiConversationMessage,
} from "@/lib/types";

export const wrapUiConversationMessage = (
  message: PiMessage,
  options?: Partial<Pick<UiConversationMessage, "pending" | "localId">>,
): UiConversationMessage => ({
  message,
  pending: options?.pending,
  localId: options?.localId,
});

export const cloneUiConversationMessage = (
  entry: UiConversationMessage,
): UiConversationMessage => ({
  ...entry,
  message: {
    ...entry.message,
    content:
      typeof entry.message.content === "string"
        ? entry.message.content
        : [...entry.message.content],
  } as PiMessage,
});

export const isAssistantMessage = (
  message: PiMessage,
): message is PiAssistantMessage => message.role === "assistant";

export const isToolResultMessage = (
  message: PiMessage,
): message is PiToolResultMessage => message.role === "toolResult";

export const isTextContent = (content: unknown): content is PiTextContent =>
  Boolean(content) &&
  typeof content === "object" &&
  (content as { type?: string }).type === "text";

export const isThinkingContent = (
  content: unknown,
): content is PiThinkingContent =>
  Boolean(content) &&
  typeof content === "object" &&
  (content as { type?: string }).type === "thinking";

export const isToolCallContent = (content: unknown): content is PiToolCall =>
  Boolean(content) &&
  typeof content === "object" &&
  (content as { type?: string }).type === "toolCall";

export const isImageContent = (content: unknown): content is PiImageContent =>
  Boolean(content) &&
  typeof content === "object" &&
  (content as { type?: string }).type === "image";

export const getAssistantTextContents = (
  message: PiAssistantMessage,
): PiTextContent[] => message.content.filter(isTextContent);

export const hasAssistantText = (message: PiMessage) =>
  isAssistantMessage(message) && getAssistantTextContents(message).some((content) => Boolean(content.text.trim()));

export const getAskToolCallArguments = (
  toolCall: PiToolCall,
): AskToolCallArguments | null => {
  if (toolCall.name !== "ask") {
    return null;
  }

  const args = toolCall.arguments;
  if (!args || typeof args !== "object") {
    return null;
  }

  const questions = (args as Record<string, unknown>).questions;
  if (!Array.isArray(questions)) {
    return null;
  }

  const title = (args as Record<string, unknown>).title;
  const message = (args as Record<string, unknown>).message;
  return {
    title: typeof title === "string" && title.trim() ? title.trim() : undefined,
    message:
      typeof message === "string" && message.trim() ? message.trim() : undefined,
    questions: questions as AskQuestion[],
  };
};

export const getAskToolResultDetails = (
  message: PiToolResultMessage,
): AskToolResultDetails | null => {
  if (message.toolName !== "ask") {
    return null;
  }

  const details = message.details;
  if (!details || typeof details !== "object") {
    return null;
  }

  const request = (details as Record<string, unknown>).request;
  const answers = (details as Record<string, unknown>).answers;
  const dismissed = (details as Record<string, unknown>).dismissed;

  if (
    !request ||
    typeof request !== "object" ||
    !Array.isArray(answers) ||
    typeof dismissed !== "boolean"
  ) {
    return null;
  }

  return details as AskToolResultDetails;
};
