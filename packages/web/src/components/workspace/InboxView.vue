<script setup lang="ts">
import { computed, ref } from "vue";
import {
	BookOpen,
	Bookmark,
	Inbox,
	Lightbulb,
	LoaderCircle,
	Search,
	Trash2,
	CheckSquare,
} from "lucide-vue-next";
import { toast } from "vue-sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspaceInbox, type InboxItem } from "@/composables/useInbox";

const props = defineProps<{
	workspaceDir: string;
}>();

defineEmits<{
	(e: "open-file", path: string): void;
	(e: "refresh-tree"): void;
}>();

const {
	filteredFiles,
	isLoading,
	searchQuery,
	sortKey,
	count,
	analyzingCount,
	captureNote,
	deleteItem,
	processToJournal,
	processToClip,
	processToTask,
	formatTime,
} = useWorkspaceInbox(() => props.workspaceDir);

const fleetingText = ref("");
const isSaving = ref(false);
const activeNote = ref<InboxItem | null>(null);
const journalDialogOpen = ref(false);
const clipDialogOpen = ref(false);
const journalContent = ref("");
const clipTitle = ref("");
const clipUrl = ref("");
const clipContent = ref("");
const clipSource = ref("闪念");

const handleCapture = async () => {
	const text = fleetingText.value.trim();
	if (!text || !props.workspaceDir) return;
	isSaving.value = true;
	try {
		await captureNote(text);
		fleetingText.value = "";
	} catch (err) {
		toast.error("保存闪念失败", {
			description: err instanceof Error ? err.message : String(err),
		});
	} finally {
		isSaving.value = false;
	}
};

const openJournalDialog = (note: InboxItem) => {
	activeNote.value = note;
	journalContent.value = note.draft || note.content;
	journalDialogOpen.value = true;
};

const firstUrl = (text: string) => text.match(/https?:\/\/\S+/)?.[0] ?? "";

const openClipDialog = (note: InboxItem) => {
	activeNote.value = note;
	clipContent.value = note.draft || note.content;
	clipUrl.value = firstUrl(note.content);
	clipTitle.value = note.content.split("\n")[0]?.replace(/^https?:\/\/\S+\s*/, "").slice(0, 80) || "未命名剪藏";
	clipSource.value = "闪念";
	clipDialogOpen.value = true;
};

const confirmJournal = async () => {
	if (!activeNote.value || !journalContent.value.trim()) return;
	await processToJournal(activeNote.value.id, journalContent.value.trim());
	journalDialogOpen.value = false;
};

const confirmClip = async () => {
	if (!activeNote.value || !clipTitle.value.trim() || !clipContent.value.trim()) return;
	await processToClip(activeNote.value.id, {
		title: clipTitle.value.trim(),
		url: clipUrl.value.trim(),
		content: clipContent.value.trim(),
		source: clipSource.value.trim(),
	});
	clipDialogOpen.value = false;
};

const handleSuggestion = (note: InboxItem) => {
	if (note.recommendationType === "journal") openJournalDialog(note);
	else if (note.recommendationType === "clip") openClipDialog(note);
	else if (note.recommendationType === "task") processToTask(note.id);
	else if (note.recommendationType === "delete") deleteItem(note.id);
};

const recommendationLabel = (note: InboxItem) => {
	if (note.analysisStatus === "analyzing") return "建议生成中";
	if (note.analysisStatus === "unanalyzed") return "等待分析";
	return note.recommendationText || "已有建议";
};

const pendingCountText = computed(() => `${count.value} 待处理`);
</script>

<template>
  <div class="h-full overflow-auto p-6">
    <div class="mx-auto max-w-3xl space-y-5">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">收件箱</h1>
          <p class="mt-1 text-sm text-muted-foreground">清空闪念临时队列</p>
        </div>
        <div class="flex items-center gap-2">
          <Badge variant="secondary">{{ pendingCountText }}</Badge>
          <Badge v-if="analyzingCount > 0" variant="outline">{{ analyzingCount }} 分析中</Badge>
        </div>
      </div>

      <div class="rounded-lg border border-border/50 bg-card p-5">
        <div class="mb-3 flex items-center gap-2">
          <Lightbulb class="size-4 text-amber-500" />
          <h2 class="text-sm font-semibold text-foreground">闪念捕捉</h2>
        </div>
        <Textarea
          v-model="fleetingText"
          placeholder="此刻的想法..."
          class="min-h-20 max-h-40 resize-none text-sm"
          @keydown.ctrl.enter="handleCapture"
          @keydown.meta.enter="handleCapture"
        />
        <div class="mt-3 flex items-center justify-between">
          <span class="text-[11px] text-muted-foreground">保存后不会打开收件箱</span>
          <Button size="sm" class="h-7 gap-1.5 text-xs" :disabled="!fleetingText.trim() || isSaving" @click="handleCapture">
            <LoaderCircle v-if="isSaving" class="size-3 animate-spin" />
            <Inbox v-else class="size-3" />
            保存
          </Button>
        </div>
      </div>

      <div class="rounded-lg border border-border/50 bg-card p-5">
        <div class="mb-3 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <Inbox class="size-4 text-muted-foreground" />
            <h2 class="text-sm font-semibold text-foreground">待处理闪念</h2>
          </div>
          <div v-if="count > 0" class="flex items-center gap-2">
            <div class="flex h-7 items-center gap-1.5 rounded-md border border-border/50 bg-muted/30 px-2">
              <Search class="size-3 text-muted-foreground" />
              <input v-model="searchQuery" type="text" placeholder="搜索..." class="w-24 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50" />
            </div>
            <Select v-model="sortKey">
              <SelectTrigger class="h-7 w-24 text-[11px] border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="modified">更新时间</SelectItem>
                <SelectItem value="created">创建时间</SelectItem>
                <SelectItem value="name">内容</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div v-if="isLoading" class="flex items-center gap-2 py-4 text-xs text-muted-foreground">
          <LoaderCircle class="size-3.5 animate-spin" />
          加载中...
        </div>

        <div v-else-if="count === 0" class="flex flex-col items-center py-10">
          <div class="mb-3 flex size-12 items-center justify-center rounded-full bg-muted/40">
            <Lightbulb class="size-5 text-muted-foreground/40" />
          </div>
          <p class="text-sm text-muted-foreground">闪念已清空</p>
        </div>

        <div v-else-if="filteredFiles.length === 0 && searchQuery" class="flex flex-col items-center py-6">
          <Search class="mb-2 size-5 text-muted-foreground/40" />
          <p class="text-xs text-muted-foreground">没有匹配的闪念</p>
        </div>

        <div v-else class="space-y-3">
          <div v-for="note in filteredFiles" :key="note.id" class="rounded-lg border border-border/50 bg-background/60 p-4">
            <div class="flex items-start justify-between gap-3">
              <p class="whitespace-pre-wrap text-sm leading-6 text-foreground">{{ note.content }}</p>
              <span class="shrink-0 text-[11px] text-muted-foreground tabular-nums">{{ formatTime(note.createdAt) }}</span>
            </div>
            <div class="mt-3 rounded-md bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
              {{ recommendationLabel(note) }}
            </div>
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" class="h-7 text-xs" :disabled="note.analysisStatus !== 'suggested'" @click="handleSuggestion(note)">
                按建议处理
              </Button>
              <Button variant="outline" size="sm" class="h-7 gap-1.5 text-xs" @click="openJournalDialog(note)">
                <BookOpen class="size-3" />
                日记
              </Button>
              <Button variant="outline" size="sm" class="h-7 gap-1.5 text-xs" @click="processToTask(note.id)">
                <CheckSquare class="size-3" />
                任务
              </Button>
              <Button variant="outline" size="sm" class="h-7 gap-1.5 text-xs" @click="openClipDialog(note)">
                <Bookmark class="size-3" />
                剪藏
              </Button>
              <Button variant="ghost" size="sm" class="h-7 gap-1.5 text-xs text-destructive hover:text-destructive" @click="deleteItem(note.id)">
                <Trash2 class="size-3" />
                删除
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <Dialog v-model:open="journalDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>写入今日日记</DialogTitle>
          <DialogDescription>闪念会追加到今天的日记，成功后从收件箱删除。</DialogDescription>
        </DialogHeader>
        <Textarea v-model="journalContent" class="min-h-32" />
        <DialogFooter>
          <Button variant="outline" @click="journalDialogOpen = false">取消</Button>
          <Button :disabled="!journalContent.trim()" @click="confirmJournal">写入日记</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="clipDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>保存为剪藏</DialogTitle>
          <DialogDescription>剪藏会保存到 DB，成功后从收件箱删除。</DialogDescription>
        </DialogHeader>
        <div class="space-y-3">
          <Input v-model="clipTitle" placeholder="标题" />
          <Input v-model="clipUrl" placeholder="URL，可为空" />
          <Input v-model="clipSource" placeholder="来源说明，可为空" />
          <Textarea v-model="clipContent" class="min-h-32" placeholder="摘录或正文" />
        </div>
        <DialogFooter>
          <Button variant="outline" @click="clipDialogOpen = false">取消</Button>
          <Button :disabled="!clipTitle.trim() || !clipContent.trim()" @click="confirmClip">保存剪藏</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
