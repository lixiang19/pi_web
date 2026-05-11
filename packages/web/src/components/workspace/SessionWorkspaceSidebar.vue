<script setup lang="ts">
import { ref, computed } from "vue";
import { ScrollArea } from "@/components/ui/scroll-area";
import FileTreePanel from "@/components/common/FileTreePanel.vue";
import { useFileTreeData } from "@/composables/useFileTreeData";

const props = defineProps<{
  sessionId: string;
  sessionTitle: string;
  fileTreeRoot: string;
  projectType?: "internal" | "external";
  isGit?: boolean;
  isOnline?: boolean;
  messageCount?: number;
  roundCount?: number;
}>();

const activeTab = ref<"summary" | "filetree" | "git" | "diff">("summary");

const {
  rootPath,
  visibleNodes,
  fileTreeError,
  isDirectoryExpanded,
  isDirectoryLoading,
  toggleDirectory,
} = useFileTreeData(() => props.fileTreeRoot);

const gitAvailable = computed(() => props.projectType === "external" && props.isGit);
const diffKind = computed(() => {
  if (props.projectType === "internal" || props.projectType === undefined) return "hidden";
  if (props.isGit) return "git";
  return "unavailable";
});

const messageCount = computed(() => props.messageCount ?? 0);
const roundCount = computed(() => props.roundCount ?? 0);
</script>

<template>
  <div class="flex h-full flex-col border-l border-border bg-background">
    <div class="flex border-b border-border">
      <button
        v-for="tab in ([
          { key: 'summary', label: '摘要' },
          { key: 'filetree', label: '文件树' },
          { key: 'git', label: 'Git' },
          { key: 'diff', label: 'Diff' },
        ] as const)"
        :key="tab.key"
        data-test="sidebar-tab"
        class="flex-1 px-2 py-2 text-[12px] font-medium transition-colors"
        :class="activeTab === tab.key ? 'text-foreground bg-accent/50' : 'text-muted-foreground hover:text-foreground'"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <ScrollArea class="flex-1">
      <div v-if="activeTab === 'summary'" class="space-y-3 p-3 text-[13px]">
        <div class="space-y-1">
          <div class="text-muted-foreground">会话</div>
          <div class="font-medium">{{ sessionTitle || "未命名会话" }}</div>
        </div>
        <div class="space-y-1">
          <div class="text-muted-foreground">运行位置</div>
          <div class="font-medium">{{ fileTreeRoot || "-" }}</div>
        </div>
        <div class="space-y-1">
          <div class="text-muted-foreground">项目类型</div>
          <div class="font-medium">{{ projectType === "internal" ? "内部项目" : "外部项目" }}</div>
        </div>
        <div class="space-y-1">
          <div class="text-muted-foreground">状态</div>
          <div class="font-medium">{{ isOnline ? "在线" : "离线" }}</div>
        </div>
        <div class="space-y-1">
          <div class="text-muted-foreground">消息 / 轮次</div>
          <div class="font-medium">{{ messageCount }} / {{ roundCount }}</div>
        </div>
        <div class="space-y-1">
          <div class="text-muted-foreground">来源 / 产物 / Todo</div>
          <div class="text-muted-foreground text-[12px]">暂无</div>
        </div>
      </div>

      <div v-else-if="activeTab === 'filetree'" class="h-full">
        <FileTreePanel
          v-if="fileTreeRoot"
          :error="fileTreeError"
          :is-expanded="isDirectoryExpanded"
          :is-loading="isDirectoryLoading"
          :is-root-loading="false"
          :nodes="visibleNodes"
          :root-path="rootPath"
          @toggle-expand="toggleDirectory"
        />
        <div v-else class="p-4 text-[13px] text-muted-foreground">无法确定文件树根目录</div>
      </div>

      <div v-else-if="activeTab === 'git'" class="p-3 text-[13px]">
        <div v-if="!gitAvailable" class="text-muted-foreground">
          Git 不可用：{{ projectType === "internal" ? "内部项目不显示显式 Git 操作" : "外部非 Git 项目" }}
        </div>
        <div v-else class="space-y-2">
          <div class="font-medium">Git 仓库</div>
          <div class="text-muted-foreground text-[12px]">分支: main</div>
          <div class="text-muted-foreground text-[12px]">未提交变更: 0</div>
        </div>
      </div>

      <div v-else-if="activeTab === 'diff'" class="p-3 text-[13px]">
        <div v-if="diffKind === 'hidden'" class="text-muted-foreground">
          使用工作空间隐藏版本管理 Diff（占位）
        </div>
        <div v-else-if="diffKind === 'git'" class="text-muted-foreground">
          工作区变更（占位）
        </div>
        <div v-else class="text-muted-foreground">Diff 不可用：外部非 Git 项目</div>
      </div>
    </ScrollArea>
  </div>
</template>
