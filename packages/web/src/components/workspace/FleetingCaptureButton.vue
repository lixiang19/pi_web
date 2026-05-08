<script setup lang="ts">
import { ref } from "vue";
import { Lightbulb, LoaderCircle, X } from "lucide-vue-next";
import { toast } from "vue-sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createFleetingNote } from "@/lib/api";

const open = ref(false);
const content = ref("");
const isSaving = ref(false);

const save = async () => {
	const text = content.value.trim();
	if (!text) return;
	isSaving.value = true;
	try {
		await createFleetingNote(text);
		window.dispatchEvent(new CustomEvent("ridge:fleeting-created"));
		content.value = "";
		open.value = false;
		toast.success("已保存闪念");
	} catch (err) {
		toast.error("保存闪念失败", {
			description: err instanceof Error ? err.message : String(err),
		});
	} finally {
		isSaving.value = false;
	}
};
</script>

<template>
  <div class="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
    <div v-if="open" class="w-[min(calc(100vw-2.5rem),360px)] rounded-xl border border-border/60 bg-card p-4 shadow-2xl">
      <div class="mb-3 flex items-center justify-between">
        <div class="flex items-center gap-2 text-sm font-semibold">
          <Lightbulb class="size-4 text-amber-500" />
          闪念
        </div>
        <Button variant="ghost" size="icon" class="size-7" @click="open = false">
          <X class="size-4" />
        </Button>
      </div>
      <Textarea v-model="content" class="min-h-28 resize-none text-sm" placeholder="先写下来，稍后处理..." @keydown.ctrl.enter="save" @keydown.meta.enter="save" />
      <div class="mt-3 flex items-center justify-between">
        <span class="text-[11px] text-muted-foreground">保存后不打断当前工作</span>
        <Button size="sm" class="h-8 gap-1.5" :disabled="!content.trim() || isSaving" @click="save">
          <LoaderCircle v-if="isSaving" class="size-3.5 animate-spin" />
          保存
        </Button>
      </div>
    </div>
    <Button size="icon" class="size-12 rounded-full shadow-xl" aria-label="打开闪念捕捉" @click="open = !open">
      <Lightbulb class="size-5" />
    </Button>
  </div>
</template>
