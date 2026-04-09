/**
 * ContentBlock → ai-elements-vue 数据模型适配层
 *
 * 将项目现有的 ContentBlock 类型转换为 ai-elements-vue 兼容的格式
 */

import type { ContentBlock, ChatMessage } from "./types";

// ai-elements-vue 使用的 UIMessage 类型简化版
export interface AiElementsPart {
  type:
    | "text"
    | "reasoning"
    | "image"
    | "tool-invocation"
    | "source"
    | "file";
  text?: string;
  reasoning?: string;
  image?: string;
  toolInvocation?: {
    toolCallId: string;
    toolName: string;
    args?: Record<string, unknown>;
    result?: unknown;
    state?: "input-streaming" | "input-available" | "approval-requested" | "approval-responded" | "output-available" | "output-error" | "output-denied";
    isError?: boolean;
  };
  source?: {
    sourceType: "url" | "file";
    id: string;
    url?: string;
    title?: string;
  };
}

export interface AiElementsMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  parts: AiElementsPart[];
  createdAt: number;
}

/**
 * 将单个 ContentBlock 转换为 ai-elements-vue Part
 */
export function convertContentBlockToPart(block: ContentBlock): AiElementsPart {
  switch (block.type) {
    case "text":
      return {
        type: "text",
        text: block.text,
      };

    case "thinking":
      return {
        type: "reasoning",
        reasoning: block.thinking,
      };

    case "image":
      return {
        type: "image",
        image: block.data,
      };

    case "toolCall":
      return {
        type: "tool-invocation",
        toolInvocation: {
          toolCallId: block.id,
          toolName: block.name,
          args: block.arguments,
          state: "input-available",
        },
      };

    case "toolResult":
      return {
        type: "tool-invocation",
        toolInvocation: {
          toolCallId: block.toolCallId,
          toolName: block.toolName || "未知工具",
          result: block.content,
          state: block.isError ? "output-error" : "output-available",
          isError: block.isError,
        },
      };

    default:
      // 未知类型降级为文本
      return {
        type: "text",
        text: String(block),
      };
  }
}

/**
 * 将 ChatMessage 转换为 ai-elements-vue 消息格式
 */
export function convertMessageToAiElements(
  msg: ChatMessage,
): AiElementsMessage {
  return {
    id: msg.id,
    role: msg.role,
    parts: msg.contentBlocks.map(convertContentBlockToPart),
    createdAt: msg.createdAt,
  };
}

/**
 * 批量转换消息数组
 */
export function convertMessagesToAiElements(
  messages: ChatMessage[],
): AiElementsMessage[] {
  return messages.map(convertMessageToAiElements);
}

/**
 * 提取消息的纯文本内容（用于预览）
 */
export function extractTextFromAiElementsMessage(
  msg: AiElementsMessage,
): string {
  return msg.parts
    .filter((p): p is AiElementsPart & { type: "text" } => p.type === "text")
    .map((p) => p.text)
    .join(" ");
}

/**
 * 检查消息是否包含特定类型的 part
 */
export function hasPartType(
  msg: AiElementsMessage,
  type: AiElementsPart["type"],
): boolean {
  return msg.parts.some((p) => p.type === type);
}

/**
 * 获取消息中的工具调用列表
 */
export function getToolInvocations(
  msg: AiElementsMessage,
): Array<AiElementsPart & { type: "tool-invocation" }> {
  return msg.parts.filter(
    (p): p is AiElementsPart & { type: "tool-invocation" } =>
      p.type === "tool-invocation",
  );
}

/**
 * 获取消息中的推理内容
 */
export function getReasoningParts(
  msg: AiElementsMessage,
): Array<AiElementsPart & { type: "reasoning" }> {
  return msg.parts.filter(
    (p): p is AiElementsPart & { type: "reasoning" } =>
      p.type === "reasoning",
  );
}
