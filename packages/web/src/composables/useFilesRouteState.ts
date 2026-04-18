import { computed } from "vue";
import { usePiChatCore } from "@/composables/usePiChatCore";
import { useSessionLruPool } from "@/composables/useSessionLruPool";
import { formatProjectLabel } from "@/composables/useWorkbenchSessionState";

export function useFilesRouteState() {
  const core = usePiChatCore();
  const lru = useSessionLruPool();

  const activeSession = computed(() => {
    const sessionId = lru.activeSessionId.value;
    if (!sessionId) {
      return null;
    }

    return (
      core.getCachedSessionSnapshot(sessionId) ||
      core.sessions.value.find((session) => session.id === sessionId) ||
      null
    );
  });

  const rootDir = computed(() => {
    return core.info.value?.workspaceDir || "";
  });

  const projectLabel = computed(() => {
    if (!rootDir.value) {
      return "workspace";
    }

    return formatProjectLabel(rootDir.value);
  });

  return {
    activeSession,
    rootDir,
    projectLabel,
  };
}
