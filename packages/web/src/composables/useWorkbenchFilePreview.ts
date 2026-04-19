import { computed, onBeforeUnmount, ref, watch, type Ref } from "vue";

import { getFilePreview, getFilePreviewWindow, saveFileContent } from "@/lib/api";
import type {
  FilePreviewKind,
  FilePreviewPayload,
  FilePreviewWindowPayload,
} from "@/lib/types";

const AUTO_SAVE_DELAY_MS = 450;
const FILE_PREVIEW_WINDOW_LINE_COUNT = 1000;

export const DEFAULT_OPERATION_PANEL_WIDTH = 560;
export const MIN_OPERATION_PANEL_WIDTH = 360;
export const MAX_OPERATION_PANEL_WIDTH = 820;

export interface WorkbenchPreviewTabState {
  id: string;
  root: string;
  path: string;
  title: string;
  extension: string;
  mimeType: string;
  previewKind: FilePreviewKind;
  content: string;
  savedContent: string;
  readOnly: boolean;
  isLoading: boolean;
  isSaving: boolean;
  error: string;
  saveRevision: number;
  isLargeFile: boolean;
  previewLineCount: number;
  nextStartLine: number | null;
  isLoadingMore: boolean;
}

const countContentLines = (content: string) => {
  if (!content) {
    return 0;
  }

  return content.split(/\r\n?|\n/).length;
};

const appendContentWindow = (currentContent: string, nextContent: string) => {
  if (!currentContent) {
    return nextContent;
  }

  if (!nextContent) {
    return currentContent;
  }

  return `${currentContent}\n${nextContent}`;
};

const getFileName = (filePath: string) =>
  filePath.replace(/\\/g, "/").split("/").filter(Boolean).at(-1) || filePath;

const createPreviewTab = (
  root: string,
  filePath: string,
): WorkbenchPreviewTabState => ({
  id: filePath,
  root,
  path: filePath,
  title: getFileName(filePath),
  extension: "",
  mimeType: "",
  previewKind: "text",
  content: "",
  savedContent: "",
  readOnly: true,
  isLoading: true,
  isSaving: false,
  error: "",
  saveRevision: 0,
  isLargeFile: false,
  previewLineCount: 0,
  nextStartLine: null,
  isLoadingMore: false,
});

const applyPreviewPayload = (
  tab: WorkbenchPreviewTabState,
  payload: FilePreviewPayload,
) => {
  tab.root = payload.root;
  tab.path = payload.path;
  tab.title = payload.name;
  tab.extension = payload.extension;
  tab.mimeType = payload.mimeType;
  tab.previewKind = payload.previewKind;
  tab.content = payload.content ?? "";
  tab.savedContent = payload.content ?? "";
  tab.readOnly = payload.readOnly;
  tab.isLoading = false;
  tab.isSaving = false;
  tab.isLargeFile = payload.isLargeFile === true;
  tab.previewLineCount = payload.previewLineCount ?? countContentLines(tab.content);
  tab.nextStartLine = payload.nextStartLine ?? null;
  tab.isLoadingMore = false;
  tab.error = "";
};

const applyPreviewWindowPayload = (
  tab: WorkbenchPreviewTabState,
  payload: FilePreviewWindowPayload,
) => {
  tab.root = payload.root;
  tab.path = payload.path;
  tab.content = appendContentWindow(tab.content, payload.content);
  tab.savedContent = tab.content;
  tab.isLargeFile = true;
  tab.previewLineCount += payload.lineCount;
  tab.nextStartLine = payload.nextStartLine ?? null;
  tab.isLoadingMore = false;
  tab.error = "";
};

export function useWorkbenchFilePreview(rootDir: Ref<string>) {
  const tabs = ref<WorkbenchPreviewTabState[]>([]);
  const activeTabId = ref("");
  const saveTimers = new Map<string, number>();

  const activeTab = computed(
    () => tabs.value.find((tab) => tab.id === activeTabId.value) ?? null,
  );

  const findTab = (tabId: string) =>
    tabs.value.find((tab) => tab.id === tabId) ?? null;

  const clearSaveTimer = (tabId: string) => {
    const timer = saveTimers.get(tabId);
    if (timer === undefined) {
      return;
    }

    window.clearTimeout(timer);
    saveTimers.delete(tabId);
  };

  const flushDirtyTabs = async () => {
    for (const tab of tabs.value) {
      clearSaveTimer(tab.id);
    }

    const dirtyTabs = tabs.value.filter(
      (tab) => tab.previewKind === "markdown" && tab.content !== tab.savedContent,
    );

    for (const tab of dirtyTabs) {
      const saved = await saveTab(tab.id);
      if (!saved) {
        return false;
      }
    }

    return true;
  };

  const resetTabs = async () => {
    const canReset = await flushDirtyTabs();
    if (!canReset) {
      return false;
    }

    tabs.value = [];
    activeTabId.value = "";

    return true;
  };

  const saveTab = async (tabId: string): Promise<boolean> => {
    clearSaveTimer(tabId);

    const tab = findTab(tabId);
    if (!tab || tab.previewKind !== "markdown" || tab.isLoading) {
      return true;
    }

    if (tab.content === tab.savedContent) {
      return true;
    }

    const contentSnapshot = tab.content;
    const requestRevision = tab.saveRevision + 1;
    tab.saveRevision = requestRevision;
    tab.isSaving = true;
    tab.error = "";

    try {
      await saveFileContent({
        root: tab.root,
        path: tab.path,
        content: contentSnapshot,
      });

      if (tab.saveRevision !== requestRevision) {
        return true;
      }

      tab.savedContent = contentSnapshot;
      tab.error = "";

      if (tab.content !== contentSnapshot) {
        scheduleSave(tab.id);
      }

      return true;
    } catch (caughtError) {
      if (tab.saveRevision === requestRevision) {
        tab.error =
          caughtError instanceof Error ? caughtError.message : String(caughtError);
      }
      return false;
    } finally {
      if (tab.saveRevision === requestRevision) {
        tab.isSaving = false;
      }
    }
  };

  const scheduleSave = (tabId: string) => {
    const tab = findTab(tabId);
    if (!tab || tab.previewKind !== "markdown") {
      return;
    }

    clearSaveTimer(tabId);
    const timer = window.setTimeout(() => {
      saveTimers.delete(tabId);
      void saveTab(tabId);
    }, AUTO_SAVE_DELAY_MS);
    saveTimers.set(tabId, timer);
  };

  const openFile = async (filePath: string) => {
    const root = rootDir.value;
    if (!root) {
      return;
    }

    const existingTab = tabs.value.find((tab) => tab.id === filePath);
    if (existingTab) {
      await activateTab(existingTab.id);
      return;
    }

    const tab = createPreviewTab(root, filePath);
    tabs.value = [...tabs.value, tab];
    activeTabId.value = tab.id;

    try {
      const payload = await getFilePreview(filePath, root);
      const currentTab = findTab(tab.id);
      if (!currentTab) {
        return;
      }

      applyPreviewPayload(currentTab, payload);
    } catch (caughtError) {
      const currentTab = findTab(tab.id);
      if (!currentTab) {
        return;
      }

      currentTab.isLoading = false;
      currentTab.previewKind = "unsupported";
      currentTab.error =
        caughtError instanceof Error ? caughtError.message : String(caughtError);
    }
  };

  const updateTabContent = (tabId: string, content: string) => {
    const tab = findTab(tabId);
    if (!tab || tab.previewKind !== "markdown" || tab.isLoading) {
      return;
    }

    tab.content = content;
    scheduleSave(tabId);
  };

  const loadMore = async (tabId: string) => {
    const tab = findTab(tabId);
    if (
      !tab
      || tab.isLoading
      || tab.isLoadingMore
      || !tab.isLargeFile
      || tab.nextStartLine === null
      || (tab.previewKind !== "code" && tab.previewKind !== "text")
    ) {
      return;
    }

    const startLine = tab.nextStartLine;
    tab.isLoadingMore = true;
    tab.error = "";

    try {
      const payload = await getFilePreviewWindow(
        tab.path,
        tab.root,
        startLine,
        FILE_PREVIEW_WINDOW_LINE_COUNT,
      );
      const currentTab = findTab(tabId);
      if (!currentTab) {
        return;
      }

      applyPreviewWindowPayload(currentTab, payload);
    } catch (caughtError) {
      const currentTab = findTab(tabId);
      if (!currentTab) {
        return;
      }

      currentTab.isLoadingMore = false;
      currentTab.error =
        caughtError instanceof Error ? caughtError.message : String(caughtError);
    }
  };

  const activateTab = async (tabId: string) => {
    if (activeTabId.value === tabId) {
      return;
    }

    if (activeTabId.value) {
      const canLeaveCurrent = await saveTab(activeTabId.value);
      if (!canLeaveCurrent) {
        return;
      }
    }

    activeTabId.value = tabId;
  };

  const closeTab = async (tabId: string) => {
    const canClose = await saveTab(tabId);
    if (!canClose) {
      return;
    }

    const currentIndex = tabs.value.findIndex((tab) => tab.id === tabId);
    if (currentIndex < 0) {
      return;
    }

    clearSaveTimer(tabId);
    const nextTabs = tabs.value.filter((tab) => tab.id !== tabId);
    tabs.value = nextTabs;

    if (activeTabId.value !== tabId) {
      return;
    }

    const nextActiveTab = nextTabs[currentIndex] ?? nextTabs[currentIndex - 1] ?? null;
    activeTabId.value = nextActiveTab?.id ?? "";
  };

  watch(rootDir, async (nextRoot, previousRoot) => {
    if (previousRoot && nextRoot !== previousRoot) {
      await resetTabs();
    }
  });

  onBeforeUnmount(() => {
    void flushDirtyTabs();
  });

  return {
    tabs,
    activeTabId,
    activeTab,
    openFile,
    activateTab,
    closeTab,
    updateTabContent,
    loadMore,
    flushActiveTab: () => saveTab(activeTabId.value),
  };
}