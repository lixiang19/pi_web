<script setup lang="ts">
import { ref } from "vue";
import {
	CheckSquare,
	Circle,
	CircleDot,
	CircleCheck,
	Plus,
	LoaderCircle,
	Trash2,
	ChevronDown,
	ChevronRight,
	Pencil,
	X,
	Check,
} from "lucide-vue-next";

import { useWorkspaceTasks } from "@/composables/useWorkspaceTasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
	TabsContent,
} from "@/components/ui/tabs";

defineProps<{
	workspaceDir: string;
}>();

const {
	tasks,
	pendingTasks,
	completedTasks,
	todayTasks,
	stats,
	isLoading,
	addTask,
	toggleStatus,
	removeTask,
	updateTask,
	showCompleted,
} = useWorkspaceTasks();

const viewMode = ref<"list" | "kanban" | "today">("list");
const newTaskTitle = ref("");
const newTaskPriority = ref("medium");
const newTaskDueDate = ref("");
const newTaskTags = ref("");
const isAdding = ref(false);
const isFormExpanded = ref(false);

// Inline editing state
const editingTaskId = ref<string | null>(null);
const editTitle = ref("");
const editPriority = ref("");
const editDueDate = ref("");

const handleAddTask = async () => {
	const title = newTaskTitle.value.trim();
	if (!title) return;
	isAdding.value = true;
	try {
		const dueDate = newTaskDueDate.value
			? new Date(newTaskDueDate.value).getTime()
			: undefined;
		const tags = newTaskTags.value.trim()
			? newTaskTags.value.split(",").map((t) => t.trim()).filter(Boolean)
			: undefined;
		await addTask({
			title,
			priority: newTaskPriority.value,
			dueDate,
			tags,
		});
		newTaskTitle.value = "";
		newTaskPriority.value = "medium";
		newTaskDueDate.value = "";
		newTaskTags.value = "";
		isFormExpanded.value = false;
	} finally {
		isAdding.value = false;
	}
};

const handleExpandForm = () => {
	isFormExpanded.value = true;
};

const handleCollapseForm = () => {
	isFormExpanded.value = false;
};

const startEdit = (task: typeof tasks.value[0]) => {
	editingTaskId.value = task.id;
	editTitle.value = task.title;
	editPriority.value = task.priority;
	editDueDate.value = task.dueDate
		? new Date(task.dueDate).toISOString().slice(0, 10)
		: "";
};

const cancelEdit = () => {
	editingTaskId.value = null;
};

const saveEdit = async () => {
	if (!editingTaskId.value) return;
	const taskId = editingTaskId.value;
	await updateTask(taskId, {
		title: editTitle.value.trim() || undefined,
		priority: editPriority.value || undefined,
		dueDate: editDueDate.value
			? new Date(editDueDate.value).getTime()
			: undefined,
	});
	editingTaskId.value = null;
};

const formatDueDate = (ts: number | null) => {
	if (!ts) return "";
	return new Intl.DateTimeFormat("zh-CN", {
		month: "short",
		day: "numeric",
	}).format(ts);
};

const dueDateClass = (ts: number | null) => {
	if (!ts) return "";
	const now = Date.now();
	if (ts < now) return "text-red-500 font-medium";
	const today = new Date();
	today.setHours(23, 59, 59, 999);
	if (ts <= today.getTime()) return "text-amber-500";
	return "text-muted-foreground";
};

const dueDateLabel = (ts: number | null) => {
	if (!ts) return "";
	const now = Date.now();
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const todayEnd = today.getTime() + 86400000;
	if (ts >= today.getTime() && ts < todayEnd) return "今天";
	if (ts < now) return `${formatDueDate(ts)} (已过期)`;
	return formatDueDate(ts);
};

const priorityLabel = (p: string) =>
	p === "high" ? "高" : p === "low" ? "低" : "中";

const priorityColor = (p: string) =>
	p === "high"
		? "text-red-500"
		: p === "low"
			? "text-green-500"
			: "text-amber-500";

const priorityBarClass = (p: string) =>
	p === "high"
		? "bg-red-500"
		: p === "low"
			? "bg-green-500"
			: "bg-amber-500";

const formatTags = (tags: string[]) => tags.join(", ");

const kanbanGroups = [
	{ key: "pending", label: "待做", icon: Circle },
	{ key: "in_progress", label: "进行中", icon: CircleDot },
	{ key: "done", label: "完成", icon: CircleCheck },
] as const;

const tasksByStatus = (status: string) =>
	tasks.value.filter((t) => t.status === status);
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <!-- 标题栏 -->
    <div class="flex items-center justify-between border-b border-border/40 px-4 py-3">
      <div class="flex items-center gap-3">
        <h2 class="text-sm font-semibold">待办</h2>
        <span class="text-[11px] text-muted-foreground">
          待做 {{ stats.pending }} · 进行中 {{ stats.inProgress }} · 完成 {{ stats.done }}
        </span>
      </div>
      <div class="flex items-center gap-2">
        <Input
          v-model="newTaskTitle"
          placeholder="新建任务..."
          class="h-7 w-48 text-xs"
          @keydown.enter="handleAddTask"
          @focus="handleExpandForm"
        />
        <Button
          size="sm"
          class="h-7 gap-1 text-xs"
          :disabled="!newTaskTitle.trim() || isAdding"
          @click="handleAddTask"
        >
          <Plus class="size-3" />
          添加
        </Button>
      </div>
    </div>

    <!-- 展开式新建表单 -->
    <div v-if="isFormExpanded" class="shrink-0 border-b border-border/30 px-4 py-2.5">
      <div class="flex items-center gap-3 text-xs">
        <div class="flex items-center gap-1.5">
          <span class="text-muted-foreground">优先级</span>
          <div class="flex gap-1">
            <button
              v-for="p in ['high', 'medium', 'low']"
              :key="p"
              type="button"
              class="rounded px-1.5 py-0.5 text-[11px] transition-colors"
              :class="newTaskPriority === p
                ? 'bg-accent text-accent-foreground font-medium'
                : 'text-muted-foreground hover:bg-accent/40'"
              @click="newTaskPriority = p"
            >
              {{ p === 'high' ? '高' : p === 'low' ? '低' : '中' }}
            </button>
          </div>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="text-muted-foreground">截止</span>
          <Input
            v-model="newTaskDueDate"
            type="date"
            class="h-6 w-28 text-[11px]"
          />
        </div>
        <div class="flex items-center gap-1.5">
          <span class="text-muted-foreground">标签</span>
          <Input
            v-model="newTaskTags"
            placeholder="标签1,标签2"
            class="h-6 w-28 text-[11px]"
            @keydown.enter="handleAddTask"
          />
        </div>
        <button
          type="button"
          class="ml-auto text-muted-foreground hover:text-foreground"
          @click="handleCollapseForm"
        >
          <X class="size-3.5" />
        </button>
      </div>
    </div>

    <!-- 视图切换 -->
    <Tabs v-model="viewMode" class="flex flex-1 flex-col overflow-hidden">
      <div class="shrink-0 px-4 pt-2">
        <TabsList class="h-7 w-auto grid grid-cols-3 border border-border/50 bg-transparent p-0.5">
          <TabsTrigger
            value="list"
            class="text-[11px] font-medium rounded data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            清单
          </TabsTrigger>
          <TabsTrigger
            value="kanban"
            class="text-[11px] font-medium rounded data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            看板
          </TabsTrigger>
          <TabsTrigger
            value="today"
            class="text-[11px] font-medium rounded data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            今日
          </TabsTrigger>
        </TabsList>
      </div>

      <!-- 清单视图 -->
      <TabsContent value="list" class="flex-1 overflow-auto m-0 mt-0">
        <div v-if="isLoading" class="flex items-center justify-center py-12 gap-2 text-sm text-muted-foreground">
          <LoaderCircle class="size-4 animate-spin" />
          加载中...
        </div>
        <div v-else-if="pendingTasks.length === 0 && !showCompleted" class="flex flex-col items-center py-12">
          <CheckSquare class="size-8 text-muted-foreground/30 mb-2" />
          <p class="text-xs text-muted-foreground">没有待办任务</p>
        </div>
        <div v-else class="space-y-1 p-4">
          <!-- 待做 + 进行中 -->
          <div
            v-for="task in pendingTasks"
            :key="task.id"
            class="group flex items-start gap-1 rounded-md px-2 py-2 transition-colors hover:bg-accent/40"
          >
            <!-- 优先级色条 -->
            <div class="mt-1.5 w-0.5 shrink-0 self-stretch rounded-full" :class="priorityBarClass(task.priority)" />

            <!-- 状态切换按钮 -->
            <button
              type="button"
              class="mt-0.5 shrink-0"
              @click="toggleStatus(task, task.status === 'pending' ? 'in_progress' : 'done')"
            >
              <Circle v-if="task.status === 'pending'" class="size-4 text-muted-foreground" />
              <CircleDot v-else class="size-4 text-primary" />
            </button>

            <!-- 内容区 -->
            <div class="min-w-0 flex-1">
              <!-- 编辑模式 -->
              <template v-if="editingTaskId === task.id">
                <div class="flex items-center gap-1.5">
                  <Input
                    v-model="editTitle"
                    class="h-6 text-xs flex-1"
                    @keydown.enter="saveEdit"
                    @keydown.escape="cancelEdit"
                  />
                  <button type="button" class="shrink-0 text-green-600 hover:text-green-700" @click="saveEdit">
                    <Check class="size-3.5" />
                  </button>
                  <button type="button" class="shrink-0 text-muted-foreground hover:text-foreground" @click="cancelEdit">
                    <X class="size-3.5" />
                  </button>
                </div>
                <div class="mt-1 flex items-center gap-2">
                  <Select v-model="editPriority" class="h-5 text-[10px]">
                    <SelectTrigger class="h-5 w-16 text-[10px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">高</SelectItem>
                      <SelectItem value="medium">中</SelectItem>
                      <SelectItem value="low">低</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    v-model="editDueDate"
                    type="date"
                    class="h-5 w-28 text-[10px]"
                  />
                </div>
              </template>
              <!-- 普通模式 -->
              <template v-else>
                <p
                  class="text-sm text-foreground"
                  :class="task.status === 'in_progress' ? 'font-medium' : ''"
                >
                  {{ task.title }}
                </p>
                <div class="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span :class="priorityColor(task.priority)">{{ priorityLabel(task.priority) }}</span>
                  <span v-if="task.dueDate" :class="dueDateClass(task.dueDate)">{{ dueDateLabel(task.dueDate) }}</span>
                  <span v-if="task.tags.length">{{ formatTags(task.tags) }}</span>
                </div>
              </template>
            </div>

            <!-- 操作按钮 -->
            <template v-if="editingTaskId !== task.id">
              <button
                type="button"
                class="shrink-0 opacity-0 group-hover:opacity-50 text-muted-foreground hover:text-foreground"
                @click="startEdit(task)"
              >
                <Pencil class="size-3" />
              </button>
              <button
                type="button"
                class="shrink-0 opacity-0 group-hover:opacity-50 text-muted-foreground hover:text-destructive"
                @click="removeTask(task.id)"
              >
                <Trash2 class="size-3" />
              </button>
            </template>
          </div>

          <!-- 已完成 toggle -->
          <div v-if="completedTasks.length > 0" class="mt-3 border-t border-border/30 pt-2">
            <button
              type="button"
              class="flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              @click="showCompleted = !showCompleted"
            >
              <ChevronRight v-if="!showCompleted" class="size-3" />
              <ChevronDown v-else class="size-3" />
              已完成 ({{ completedTasks.length }})
            </button>
            <template v-if="showCompleted">
              <div
                v-for="task in completedTasks"
                :key="task.id"
                class="group flex items-start gap-1 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/40"
              >
                <div class="mt-1.5 w-0.5 shrink-0 self-stretch rounded-full bg-muted-foreground/20" />
                <button
                  type="button"
                  class="mt-0.5 shrink-0"
                  @click="toggleStatus(task, 'pending')"
                >
                  <CircleCheck class="size-4 text-muted-foreground/50" />
                </button>
                <div class="min-w-0 flex-1">
                  <p class="text-sm text-muted-foreground line-through">{{ task.title }}</p>
                </div>
                <button
                  type="button"
                  class="shrink-0 opacity-0 group-hover:opacity-50 text-muted-foreground hover:text-destructive"
                  @click="removeTask(task.id)"
                >
                  <Trash2 class="size-3" />
                </button>
              </div>
            </template>
          </div>
        </div>
      </TabsContent>

      <!-- 看板视图 -->
      <TabsContent value="kanban" class="flex-1 overflow-hidden m-0 mt-0">
        <div class="flex h-full gap-3 p-4">
          <div
            v-for="group in kanbanGroups"
            :key="group.key"
            class="flex min-w-0 flex-1 flex-col rounded-lg border border-border/50 bg-muted/20 p-3"
          >
            <div class="flex items-center gap-1.5 mb-3">
              <component :is="group.icon" class="size-3.5 text-muted-foreground" />
              <span class="text-xs font-semibold">{{ group.label }}</span>
              <span class="text-[10px] text-muted-foreground ml-auto">
                {{ tasksByStatus(group.key).length }}
              </span>
            </div>
            <div class="flex-1 space-y-2 overflow-auto">
              <div
                v-for="task in tasksByStatus(group.key)"
                :key="task.id"
                class="rounded-md border border-border/40 bg-card p-2.5"
              >
                <div class="flex items-start gap-1">
                  <!-- 优先级色条 -->
                  <div class="mt-0.5 w-0.5 shrink-0 self-stretch rounded-full" :class="priorityBarClass(task.priority)" />
                  <p class="text-xs font-medium text-foreground">{{ task.title }}</p>
                </div>
                <div class="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span :class="priorityColor(task.priority)">{{ priorityLabel(task.priority) }}</span>
                  <span v-if="task.dueDate" :class="dueDateClass(task.dueDate)">{{ dueDateLabel(task.dueDate) }}</span>
                  <span v-if="task.tags.length">{{ formatTags(task.tags) }}</span>
                </div>
                <div class="mt-2 flex gap-1">
                  <Button
                    v-if="task.status !== 'done'"
                    variant="ghost"
                    size="sm"
                    class="h-5 text-[10px] px-1.5"
                    @click="toggleStatus(task, group.key === 'pending' ? 'in_progress' : 'done')"
                  >
                    {{ group.key === 'pending' ? '开始' : '完成' }}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-5 text-[10px] px-1.5 text-destructive"
                    @click="removeTask(task.id)"
                  >
                    删除
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </TabsContent>

      <!-- 今日视图 -->
      <TabsContent value="today" class="flex-1 overflow-auto m-0 mt-0">
        <div v-if="todayTasks.length === 0" class="flex flex-col items-center py-12">
          <CircleCheck class="size-8 text-green-500/50 mb-2" />
          <p class="text-xs text-muted-foreground">今天没有待办</p>
        </div>
        <div v-else class="space-y-1 p-4">
          <div
            v-for="task in todayTasks"
            :key="task.id"
            class="group flex items-start gap-1 rounded-md px-2 py-2 transition-colors hover:bg-accent/40"
          >
            <div class="mt-1.5 w-0.5 shrink-0 self-stretch rounded-full" :class="priorityBarClass(task.priority)" />
            <button
              type="button"
              class="mt-0.5 shrink-0"
              @click="toggleStatus(task, task.status === 'pending' ? 'in_progress' : 'done')"
            >
              <Circle v-if="task.status === 'pending'" class="size-4 text-muted-foreground" />
              <CircleDot v-else class="size-4 text-primary" />
            </button>
            <div class="min-w-0 flex-1">
              <p class="text-sm text-foreground" :class="task.status === 'in_progress' ? 'font-medium' : ''">{{ task.title }}</p>
              <div class="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span :class="priorityColor(task.priority)">{{ priorityLabel(task.priority) }}</span>
                <span v-if="task.dueDate" :class="dueDateClass(task.dueDate)">{{ dueDateLabel(task.dueDate) }}</span>
              </div>
            </div>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  </div>
</template>
