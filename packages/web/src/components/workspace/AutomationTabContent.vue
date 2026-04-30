<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import AutomationRuleEditor from "@/components/automation/AutomationRuleEditor.vue";
import AutomationRuleList from "@/components/automation/AutomationRuleList.vue";
import {
  automationDraftToInput,
  computeAutomationDraftNextRunAt,
  createAutomationDraft,
} from "@/components/automation/automation-rule-draft";
import type {
  AutomationOption,
  AutomationRuleDraft,
} from "@/components/automation/types";
import { useAutomations } from "@/composables/useAutomations";
import { usePiChatCore } from "@/composables/usePiChatCore";
import {
  thinkingOptions as workbenchThinkingOptions,
} from "@/composables/useWorkbenchSessionState";

const automations = useAutomations();
const core = usePiChatCore();

const selectedId = ref("");

const defaultCwd = computed(() =>
  core.info.value?.chatProjectPath || core.info.value?.workspaceDir || "",
);

const modelOptions = computed<AutomationOption[]>(() => core.models.value);
const agentOptions = computed<AutomationOption[]>(() =>
  core.agents.value.map((agent) => ({
    label: agent.displayName || agent.name,
    value: agent.name,
  })),
);
const thinkingOptions = computed<AutomationOption[]>(() =>
  workbenchThinkingOptions.map((option) => ({
    label: option.label,
    value: option.value,
  })),
);
const draft = ref<AutomationRuleDraft>(
  createAutomationDraft({ projectPath: defaultCwd.value }),
);

const canSave = computed(() => {
  if (!draft.value.name.trim() || !draft.value.cwd || !draft.value.prompt.trim()) {
    return false;
  }

  if (draft.value.scheduleType === "weekly" && draft.value.weekdays.length === 0) {
    return false;
  }

  return draft.value.everyMinutes >= 1;
});

const nextRunText = computed(() => {
  if (!draft.value.enabled) {
    return "暂停后不会自动创建";
  }

  const nextRunAt = computeAutomationDraftNextRunAt(draft.value);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(nextRunAt);
});

const selectRule = (id: string) => {
  const rule = automations.rules.value.find((item) => item.id === id);
  if (!rule) {
    return;
  }

  selectedId.value = rule.id;
  draft.value = createAutomationDraft({ rule });
};

const createNewRule = () => {
  selectedId.value = "";
  draft.value = createAutomationDraft({ projectPath: defaultCwd.value });
};

const saveRule = async () => {
  if (!canSave.value) {
    return;
  }

  const saved = await automations.save(
    automationDraftToInput(draft.value),
    draft.value.id,
  );
  if (saved) {
    selectedId.value = saved.id;
    draft.value = createAutomationDraft({ rule: saved });
  }
};

const toggleRule = async (id: string, enabled: boolean) => {
  const rule = await automations.setEnabled(id, enabled);
  if (selectedId.value === id) {
    draft.value = createAutomationDraft({ rule });
  }
};

const runRule = async () => {
  if (!draft.value.id) {
    return;
  }

  await automations.runNow(draft.value.id);
  await core.refreshSessions();
  await core.refreshSessionContexts();
};

const deleteRule = async () => {
  if (!draft.value.id) {
    return;
  }

  await automations.remove(draft.value.id);
  createNewRule();
};

watch(
  () => defaultCwd.value,
  (cwd) => {
    if (!draft.value.cwd && cwd) {
      draft.value = { ...draft.value, cwd };
    }
  },
  { immediate: true },
);

watch(
  () => draft.value.cwd,
  (cwd) => {
    if (cwd) {
      void core.refreshAgents(cwd);
    }
  },
  { immediate: true },
);

onMounted(async () => {
  await Promise.all([
    automations.load().catch(() => []),
    core.bootPromise.value,
  ]);

  if (automations.rules.value[0]) {
    selectRule(automations.rules.value[0].id);
  } else {
    createNewRule();
  }
});
</script>

<template>
  <div class="flex h-full min-h-0 bg-background text-foreground">
    <AutomationRuleList
      class="w-[340px] shrink-0"
      :rules="automations.rules.value"
      :selected-id="selectedId"
      @create="createNewRule"
      @select="selectRule"
      @toggle="toggleRule"
    />

    <AutomationRuleEditor
      :draft="draft"
      :agent-options="agentOptions"
      :is-runnable="Boolean(draft.id)"
      :is-saving="automations.isLoading.value"
      :model-options="modelOptions"
      :next-run-text="nextRunText"
      :thinking-options="thinkingOptions"
      @delete="deleteRule"
      @run="runRule"
      @save="saveRule"
      @update-draft="draft = $event"
    />
  </div>
</template>
