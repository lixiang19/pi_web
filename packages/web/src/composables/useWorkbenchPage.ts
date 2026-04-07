import { usePiChat } from "@/composables/usePiChat";
import {
  AUTO_MODEL_VALUE,
  AUTO_THINKING_VALUE,
  NO_AGENT_VALUE,
  thinkingOptions,
  useWorkbenchSessionState,
} from "@/composables/useWorkbenchSessionState";
import { useWorkbenchResourcePicker } from "@/composables/useWorkbenchResourcePicker";

export function useWorkbenchPage() {
  const chat = usePiChat();
  const sessionState = useWorkbenchSessionState(chat);
  const resourcePicker = useWorkbenchResourcePicker(chat, sessionState.fileTreeRoot);

  return {
    ...chat,
    ...resourcePicker,
    ...sessionState,
    AUTO_MODEL_VALUE,
    AUTO_THINKING_VALUE,
    NO_AGENT_VALUE,
    thinkingOptions,
  };
}