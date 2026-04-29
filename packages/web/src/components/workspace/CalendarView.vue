<script setup lang="ts">
import { ref, computed, watch } from "vue";
import {
	ChevronLeft,
	ChevronRight,
	FileText,
} from "lucide-vue-next";

import { Button } from "@/components/ui/button";
import { getJournalMonths, getJournalEntries } from "@/lib/api";

const props = defineProps<{
	workspaceDir: string;
}>();

const emit = defineEmits<{
	(e: "open-file", path: string): void;
	(e: "create-journal", date: string): void;
}>();

const now = new Date();
const currentYear = ref(now.getFullYear());
const currentMonth = ref(now.getMonth() + 1);

const journalMonths = ref<number[]>([]);
const journalEntries = ref<string[]>([]);

const loadJournalInfo = async () => {
	const dir = props.workspaceDir;
	if (!dir) return;

	const monthRes = await getJournalMonths(dir, currentYear.value);
	journalMonths.value = monthRes.months;

	const entryRes = await getJournalEntries(
		dir,
		currentYear.value,
		currentMonth.value,
	);
	journalEntries.value = entryRes.entries;
};

watch(
	() => props.workspaceDir,
	(dir) => {
		if (dir) loadJournalInfo();
	},
	{ immediate: true },
);

watch([currentYear, currentMonth], () => {
	loadJournalInfo();
});

const monthNames = [
	"一月",
	"二月",
	"三月",
	"四月",
	"五月",
	"六月",
	"七月",
	"八月",
	"九月",
	"十月",
	"十一月",
	"十二月",
];

const weekDays = ["一", "二", "三", "四", "五", "六", "日"];

const calendarDays = computed(() => {
	const year = currentYear.value;
	const month = currentMonth.value;
	const firstDay = new Date(year, month - 1, 1);
	const startWeekDay = (firstDay.getDay() + 6) % 7; // Monday=0
	const daysInMonth = new Date(year, month, 0).getDate();

	const days: Array<{
		date: number;
		isCurrentMonth: boolean;
		isToday: boolean;
		hasJournal: boolean;
		dateStr: string;
	}> = [];

	// 前月填充
	const prevMonthDays = new Date(year, month - 1, 0).getDate();
	for (let i = startWeekDay - 1; i >= 0; i--) {
		days.push({
			date: prevMonthDays - i,
			isCurrentMonth: false,
			isToday: false,
			hasJournal: false,
			dateStr: "",
		});
	}

	// 当月
	const today = new Date();
	const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

	for (let d = 1; d <= daysInMonth; d++) {
		const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
		days.push({
			date: d,
			isCurrentMonth: true,
			isToday: dateStr === todayStr,
			hasJournal: journalEntries.value.includes(dateStr),
			dateStr,
		});
	}

	// 后月填充
	const totalCells = Math.ceil(days.length / 7) * 7;
	const remaining = totalCells - days.length;
	for (let d = 1; d <= remaining; d++) {
		days.push({
			date: d,
			isCurrentMonth: false,
			isToday: false,
			hasJournal: false,
			dateStr: "",
		});
	}

	return days;
});

const prevMonth = () => {
	if (currentMonth.value === 1) {
		currentMonth.value = 12;
		currentYear.value--;
	} else {
		currentMonth.value--;
	}
};

const nextMonth = () => {
	if (currentMonth.value === 12) {
		currentMonth.value = 1;
		currentYear.value++;
	} else {
		currentMonth.value++;
	}
};

const goToday = () => {
	const today = new Date();
	currentYear.value = today.getFullYear();
	currentMonth.value = today.getMonth() + 1;
};

const handleDayClick = (day: (typeof calendarDays.value)[0]) => {
	if (!day.isCurrentMonth) return;
	const absPath = `${props.workspaceDir}/日记/${currentYear.value}/${String(currentMonth.value).padStart(2, "0")}/${day.dateStr}.md`;
	if (day.hasJournal) {
		emit("open-file", absPath);
	} else {
		emit("create-journal", day.dateStr);
	}
};
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <!-- 标题栏 -->
    <div class="flex items-center justify-between border-b border-border/40 px-4 py-3">
      <h2 class="text-sm font-semibold">日历</h2>
      <Button variant="ghost" size="sm" class="h-6 text-[11px]" @click="goToday">
        今天
      </Button>
    </div>

    <!-- 月份导航 -->
    <div class="flex items-center justify-between px-4 py-2">
      <Button variant="ghost" size="icon" class="size-6" @click="prevMonth">
        <ChevronLeft class="size-3.5" />
      </Button>
      <span class="text-sm font-medium">
        {{ currentYear }} 年 {{ monthNames[currentMonth - 1] }}
      </span>
      <Button variant="ghost" size="icon" class="size-6" @click="nextMonth">
        <ChevronRight class="size-3.5" />
      </Button>
    </div>

    <!-- 日历网格 -->
    <div class="flex-1 overflow-auto px-4 pb-4">
      <!-- 星期头 -->
      <div class="grid grid-cols-7 mb-1">
        <div
          v-for="day in weekDays"
          :key="day"
          class="py-1 text-center text-[10px] text-muted-foreground font-medium"
        >
          {{ day }}
        </div>
      </div>

      <!-- 日期格 -->
      <div class="grid grid-cols-7 gap-px">
        <button
          v-for="(day, idx) in calendarDays"
          :key="idx"
          type="button"
          class="relative flex h-12 items-center justify-center rounded-md text-xs transition-colors"
          :class="{
            'text-muted-foreground/40': !day.isCurrentMonth,
            'hover:bg-accent/40': day.isCurrentMonth,
            'bg-primary text-primary-foreground font-bold': day.isToday,
            'text-foreground font-medium': day.isCurrentMonth && !day.isToday,
          }"
          @click="handleDayClick(day)"
        >
          {{ day.date }}
          <span
            v-if="day.hasJournal"
            class="absolute bottom-1 size-1 rounded-full bg-primary"
            :class="{ 'bg-primary-foreground': day.isToday }"
          />
        </button>
      </div>
    </div>

    <!-- 当月日记列表 -->
    <div v-if="journalEntries.length > 0" class="border-t border-border/40 p-4">
      <h3 class="mb-2 text-xs font-semibold text-muted-foreground">本月日记</h3>
      <div class="space-y-1">
        <button
          v-for="entry in journalEntries"
          :key="entry"
          type="button"
          class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent/40 transition-colors"
          @click="emit('open-file', `${workspaceDir}/日记/${currentYear}/${String(currentMonth).padStart(2, '0')}/${entry}.md`)"
        >
          <FileText class="size-3.5 shrink-0 text-muted-foreground" />
          <span class="text-foreground">{{ entry }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
