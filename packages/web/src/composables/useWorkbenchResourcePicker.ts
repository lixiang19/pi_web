import { computed, ref, type Ref } from "vue";

import type { ChatComposerState, PromptCatalogItem, ResourceCatalogResponse } from "@/lib/types";

type WorkbenchResourcePickerState = {
  composer: ChatComposerState;
  activeSessionId: Readonly<Ref<string>>;
  resources: Readonly<Ref<ResourceCatalogResponse>>;
  refreshResources: (options?: {
    cwd?: string;
    sessionId?: string;
  }) => Promise<ResourceCatalogResponse>;
};

export function useWorkbenchResourcePicker(
  chat: WorkbenchResourcePickerState,
  fileTreeRoot: Readonly<Ref<string>>,
) {
  const resourcePickerPinned = ref(false);

  const slashTrigger = computed(() => {
    const match = chat.composer.draftText.match(/(^|\s)\/([\w:-]*)$/);
    if (!match) {
      return null;
    }

    return {
      query: (match[2] || "").toLowerCase(),
    };
  });

  const resourceQuery = computed(() => slashTrigger.value?.query || "");
  const isResourcePickerVisible = computed(
    () => resourcePickerPinned.value || Boolean(slashTrigger.value),
  );

  const matchesQuery = (value: string, description?: string) => {
    if (!resourceQuery.value) {
      return true;
    }

    const haystack = `${value} ${description || ""}`.toLowerCase();
    return haystack.includes(resourceQuery.value);
  };

  const filteredPrompts = computed(() =>
    chat.resources.value.prompts
      .filter((item) => matchesQuery(item.name, item.description))
      .slice(0, 8),
  );
  const filteredSkills = computed(() =>
    chat.resources.value.skills
      .filter((item) => matchesQuery(item.name, item.description))
      .slice(0, 8),
  );
  const filteredCommands = computed(() =>
    chat.resources.value.commands
      .filter((item) => matchesQuery(item.name, item.description))
      .slice(0, 8),
  );
  const hasVisibleResources = computed(
    () =>
      filteredPrompts.value.length +
        filteredSkills.value.length +
        filteredCommands.value.length >
      0,
  );

  const replaceTrailingSlashToken = (
    replacement: string,
    options?: { trailingSpace?: boolean },
  ) => {
    const next = chat.composer.draftText.match(/(^|\s)\/[\w:-]*$/)
      ? chat.composer.draftText.replace(
          /(^|\s)\/[\w:-]*$/,
          (_match, leading) => `${leading}${replacement}`,
        )
      : chat.composer.draftText.trim()
        ? `${chat.composer.draftText.trim()} ${replacement}`
        : replacement;

    chat.composer.draftText =
      options?.trailingSpace === false
        ? next
        : `${next}${next.endsWith(" ") ? "" : " "}`;
  };

  const applyPrompt = (prompt: PromptCatalogItem) => {
    const content = prompt.content.trim();
    if (!content) {
      return;
    }

    if (slashTrigger.value) {
      replaceTrailingSlashToken(content, { trailingSpace: false });
    } else {
      chat.composer.draftText = chat.composer.draftText.trim()
        ? `${chat.composer.draftText.trim()}\n\n${content}`
        : content;
    }
    resourcePickerPinned.value = false;
  };

  const injectSkill = (invocation: string) => {
    replaceTrailingSlashToken(invocation);
    resourcePickerPinned.value = false;
  };

  const injectCommand = (commandName: string) => {
    replaceTrailingSlashToken(`/${commandName}`);
    resourcePickerPinned.value = false;
  };

  const toggleResourcePicker = async () => {
    resourcePickerPinned.value = !resourcePickerPinned.value;
    if (!resourcePickerPinned.value) {
      return;
    }

    const resourceOptions: { cwd?: string; sessionId?: string } = {};
    const resolvedCwd = fileTreeRoot.value;
    if (resolvedCwd) {
      resourceOptions.cwd = resolvedCwd;
    }

    if (chat.activeSessionId.value) {
      resourceOptions.sessionId = chat.activeSessionId.value;
    }

    await chat.refreshResources(resourceOptions);
  };

  return {
    applyPrompt,
    filteredCommands,
    filteredPrompts,
    filteredSkills,
    hasVisibleResources,
    injectCommand,
    injectSkill,
    isResourcePickerVisible,
    resourcePickerPinned,
    slashTrigger,
    toggleResourcePicker,
  };
}