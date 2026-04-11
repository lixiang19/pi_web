<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useVModel } from "@vueuse/core";
import { GitBranch, LoaderCircle } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { validateWorktree, createWorktree, getGitBranches } from "@/lib/api";

const props = defineProps<{
  open: boolean;
  projectId: string;
  projectRoot: string;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "created", worktreePath: string): void;
}>();

const open = useVModel(props, "open", emit);

// Mode
const mode = ref<"new" | "existing">("new");

// New branch
const newBranchName = ref("");
const newWorktreeName = ref("");
const syncWorktreeName = ref(true);
const startRef = ref("");

// Existing branch
const existingBranch = ref("");
const existingWorktreeName = ref("");

// Branches
const branches = ref<string[]>([]);
const isLoadingBranches = ref(false);

// Validation
const branchError = ref("");
const worktreeError = ref("");
const isValidating = ref(false);
const isCreating = ref(false);

const localBranches = computed(() =>
  branches.value.filter((b) => !b.startsWith("remotes/")),
);

const canSubmit = computed(() => {
  if (isValidating.value || isCreating.value) return false;
  if (mode.value === "new") {
    return Boolean(newBranchName.value.trim());
  }
  return Boolean(existingBranch.value.trim());
});

const loadBranches = async () => {
  if (!props.projectRoot) return;
  isLoadingBranches.value = true;
  try {
    const result = await getGitBranches(props.projectRoot);
    branches.value = result.all;
  } catch {
    branches.value = [];
  } finally {
    isLoadingBranches.value = false;
  }
};

const resetForm = () => {
  mode.value = "new";
  newBranchName.value = "";
  newWorktreeName.value = "";
  syncWorktreeName.value = true;
  startRef.value = "";
  existingBranch.value = "";
  existingWorktreeName.value = "";
  branchError.value = "";
  worktreeError.value = "";
  isValidating.value = false;
  isCreating.value = false;
};

watch(open, (nextOpen) => {
  if (nextOpen) {
    resetForm();
    void loadBranches();
  }
});

// 自动同步 worktree name
watch(newBranchName, (value) => {
  if (syncWorktreeName.value) {
    newWorktreeName.value = value;
  }
});

watch(existingBranch, (value) => {
  existingWorktreeName.value = value;
});

const handleSubmit = async () => {
  branchError.value = "";
  worktreeError.value = "";

  const payload =
    mode.value === "new"
      ? {
          mode: "new" as const,
          branchName: newBranchName.value.trim(),
          worktreeName: newWorktreeName.value.trim() || newBranchName.value.trim(),
        }
      : {
          mode: "existing" as const,
          existingBranch: existingBranch.value.trim(),
          worktreeName: existingWorktreeName.value.trim() || existingBranch.value.trim(),
        };

  // Validate
  isValidating.value = true;
  try {
    const validation = await validateWorktree(props.projectId, payload);
    if (!validation.ok) {
      branchError.value = validation.branchError || "";
      worktreeError.value = validation.worktreeError || "";
      return;
    }
  } catch (error) {
    worktreeError.value =
      error instanceof Error ? error.message : "校验失败";
    return;
  } finally {
    isValidating.value = false;
  }

  // Create
  isCreating.value = true;
  try {
    const createPayload = {
      ...payload,
      ...(mode.value === "new" && startRef.value.trim()
        ? { startRef: startRef.value.trim() }
        : {}),
    };
    const metadata = await createWorktree(props.projectId, createPayload);
    emit("created", metadata.path);
  } catch (error) {
    worktreeError.value =
      error instanceof Error ? error.message : "创建失败";
  } finally {
    isCreating.value = false;
  }
};
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-[480px]">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <GitBranch class="size-4" />
          新建 Worktree
        </DialogTitle>
        <DialogDescription>
          在项目下创建新的 worktree 工作目录，由系统统一管理。
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-2">
        <Tabs v-model="mode" class="w-full">
          <TabsList class="grid w-full grid-cols-2">
            <TabsTrigger value="new">新分支</TabsTrigger>
            <TabsTrigger value="existing">现有分支</TabsTrigger>
          </TabsList>
        </Tabs>

        <!-- 新分支模式 -->
        <template v-if="mode === 'new'">
          <div class="space-y-2">
            <Label for="new-branch-name">分支名称</Label>
            <Input
              id="new-branch-name"
              v-model="newBranchName"
              placeholder="feature/my-feature"
              :class="branchError ? 'border-destructive' : ''"
            />
            <p v-if="branchError" class="text-xs text-destructive">{{ branchError }}</p>
          </div>

          <div class="space-y-2">
            <Label for="start-ref">起始点（可选）</Label>
            <Input
              id="start-ref"
              v-model="startRef"
              placeholder="HEAD（默认）"
            />
          </div>
        </template>

        <!-- 现有分支模式 -->
        <template v-if="mode === 'existing'">
          <div class="space-y-2">
            <Label>选择分支</Label>
            <Select v-model="existingBranch">
              <SelectTrigger :class="branchError ? 'border-destructive' : ''">
                <SelectValue placeholder="选择一个本地分支" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="branch in localBranches"
                  :key="branch"
                  :value="branch"
                >
                  {{ branch }}
                </SelectItem>
              </SelectContent>
            </Select>
            <p v-if="branchError" class="text-xs text-destructive">{{ branchError }}</p>
            <p v-if="isLoadingBranches" class="flex items-center gap-2 text-xs text-muted-foreground">
              <LoaderCircle class="size-3 animate-spin" />
              加载分支列表...
            </p>
          </div>
        </template>

        <p v-if="worktreeError" class="text-xs text-destructive">{{ worktreeError }}</p>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="open = false">取消</Button>
        <Button
          :disabled="!canSubmit"
          @click="handleSubmit"
        >
          <LoaderCircle
            v-if="isValidating || isCreating"
            class="mr-2 size-4 animate-spin"
          />
          {{ isValidating ? "校验中..." : isCreating ? "创建中..." : "创建" }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
