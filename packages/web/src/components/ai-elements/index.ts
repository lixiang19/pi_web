// AiElements Adapter Components
// 包装 ai-elements-vue 组件，适配项目现有的 ContentBlock 数据模型

export { default as AiElementsMessage } from "./AiElementsMessage.vue";
export { default as AiElementsConversation } from "./AiElementsConversation.vue";
export { default as AiElementsPromptInput } from "./AiElementsPromptInput.vue";

// Re-export original ai-elements-vue components
export * from "./message";
export * from "./conversation";
export * from "./prompt-input";
export * from "./reasoning";
export * from "./tool";
export * from "./shimmer";
export * from "./code-block";
