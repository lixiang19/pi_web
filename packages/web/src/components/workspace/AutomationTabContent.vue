<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { ArrowLeft, Bot } from "lucide-vue-next";

import { Button } from "@/components/ui/button";
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
import { useProjects } from "@/composables/useProjects";

const automations = useAutomations();
const core = usePiChatCore();
const projectsStore = useProjects();

type Mode = "list" | "edit";

const mode = ref<Mode>("list");
const selectedId = ref("");

const defaultCwd = computed(() =>
  core.info.value?.chatProjectPath || core.info.value?.workspaceDir || "",
);
const draft = ref<AutomationRuleDraft>(
  createAutomationDraft({ projectPath: defaultCwd.value }),
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
const projectOptions = computed<AutomationOption[]>(() =>
  projectsStore.projects.value
    .filter((project) => project.projectType === "external" && !project.archivedAt)
    .map((project) => ({
      label: project.deviceName
        ? `${project.name} · ${project.deviceName}`
        : project.name,
      value: project.id,
    })),
);
const selectedProject = computed(() =>
  projectsStore.projects.value.find((project) => project.id === draft.value.projectId),
);
const selectedRuns = computed(() =>
  draft.value.id
    ? automations.runs.value.filter((run) => run.automationId === draft.value.id)
    : [],
);

const selectedRule = computed(() =>
  automations.rules.value.find((rule) => rule.id === selectedId.value),
);

const isNew = computed(() => !selectedId.value);

const canSave = computed(() => {
  if (!draft.value.name.trim() || !draft.value.prompt.trim()) {
    return false;
  }

  if (draft.value.scope === "project") {
    return Boolean(draft.value.projectId && draft.value.cwd);
  }

  if (!draft.value.cwd) {
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

const goToList = () => {
  mode.value = "list";
  selectedId.value = "";
};

const goToEdit = (id?: string) => {
  if (id) {
    const rule = automations.rules.value.find((item) => item.id === id);
    if (!rule) return;
    selectedId.value = rule.id;
    draft.value = createAutomationDraft({ rule });
  } else {
    selectedId.value = "";
    draft.value = createAutomationDraft({ projectPath: defaultCwd.value });
  }
  mode.value = "edit";
};

const toggleRule = async (id: string, enabled: boolean) => {
  const rule = await automations.setEnabled(id, enabled);
  if (selectedId.value === id && mode.value === "edit") {
    draft.value = createAutomationDraft({ rule });
  }
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
  goToList();
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

watch(
  () => draft.value.projectId,
  () => {
    if (draft.value.scope !== "project") {
      return;
    }
    if (selectedProject.value) {
      draft.value = { ...draft.value, cwd: selectedProject.value.path };
    }
  },
);

onMounted(async () => {
  await Promise.all([
    automations.load().catch(() => []),
    core.bootPromise.value,
    projectsStore.load().catch(() => []),
  ]);
});
</script>

<template>
  <div class="flex h-full min-h-0 bg-background text-foreground">
    <!-- ===== List Mode ===== -->
    <AutomationRuleList
      v-if="mode === 'list'"
      :rules="automations.rules.value"
      :is-loading="automations.isLoading.value"
      @create="goToEdit()"
      @select="goToEdit"
      @toggle="toggleRule"
    />

    <!-- ===== Edit Mode ===== -->
    <template v-else>
      <div class="flex min-h-0 flex-1 flex-col">
        <!-- Header -->
        <header class="ridge-panel-header flex min-h-14 shrink-0 items-center gap-3 px-5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            class="gap-1.5 text-muted-foreground hover:text-foreground"
            @click="goToList"
          >
            <ArrowLeft class="size-4" />
            返回
          </Button>

          <div class="h-4 w-px bg-border/50" />

          <div class="flex items-center gap-2">
            <Bot class="size-4 text-primary" />
            <h1 class="text-sm font-semibold tracking-tight">
              {{ isNew ? "新建定时会话" : selectedRule?.name }}
            </h1>
          </div>

          <div class="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              :disabled="!draft.id || automations.isLoading.value"
              @click="runRule"
            >
              立即运行
            </Button>
            <Button
              type="button"
              size="sm"
              :disabled="!canSave || automations.isLoading.value"
              @click="saveRule"
            >
              保存
            </Button>
          </div>
        </header>

        <AutomationRuleEditor
          :draft="draft"
          :agent-options="agentOptions"
          :is-saving="automations.isLoading.value"
          :model-options="modelOptions"
          :next-run-text="nextRunText"
          :project-options="projectOptions"
          :recent-runs="selectedRuns"
          :thinking-options="thinkingOptions"
          @delete="deleteRule"
          @update-draft="draft = $event"
        />
      </div>
    </template>
  </div>
</template>
