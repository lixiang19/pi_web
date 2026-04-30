<script setup lang="ts">
import { toRef } from "vue";

import WorkbenchGitPanel from "@/components/workbench/WorkbenchGitPanel.vue";
import { useGitRepositoryStatus } from "@/composables/useGitRepositoryStatus";

const props = defineProps<{
	workspaceDir: string;
}>();

const { status: gitStatus } = useGitRepositoryStatus(toRef(() => props.workspaceDir));
</script>

<template>
  <WorkbenchGitPanel :cwd="workspaceDir" :git-status="gitStatus" />
</template>
