<script setup lang="ts">
import { nextTick, ref, computed, watch } from "vue";
import {
	Database,
	LoaderCircle,
	Plus,
	Trash2,
	LayoutGrid,
	Table2,
	CalendarDays,
	Columns3,
	X,
} from "lucide-vue-next";

import {
	getBaseData,
	saveBaseData,
	type BaseData,
	type BaseColumn,
	type BaseRow,
	type BaseView as BaseViewType,
} from "@/lib/api";
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
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const props = defineProps<{
	filePath: string;
	workspaceDir: string;
}>();

const emit = defineEmits<{
	(e: "open-file", path: string): void;
}>();

const data = ref<BaseData | null>(null);
const isLoading = ref(false);
const error = ref("");
const isSaving = ref(false);
const editingCell = ref<{ rowId: string; colId: string } | null>(null);
const editValue = ref("");
const editingColName = ref<string | null>(null);
const colNameValue = ref("");

const load = async () => {
	if (!props.filePath) return;
	isLoading.value = true;
	error.value = "";
	try {
		data.value = await getBaseData(props.filePath);
	} catch (err) {
		error.value = err instanceof Error ? err.message : String(err);
	} finally {
		isLoading.value = false;
	}
};

const save = async () => {
	if (!data.value || !props.filePath) return;
	isSaving.value = true;
	try {
		await saveBaseData(props.filePath, data.value);
	} catch (err) {
		console.error("Failed to save base", err);
	} finally {
		isSaving.value = false;
	}
};

let saveTimer: ReturnType<typeof setTimeout> | null = null;
const debouncedSave = () => {
	if (saveTimer) clearTimeout(saveTimer);
	saveTimer = setTimeout(save, 1000);
};

watch(() => props.filePath, load, { immediate: true });

const activeView = computed(() => {
	if (!data.value) return null;
	return (
		data.value.views.find((v) => v.id === data.value!.activeViewId) ||
		data.value.views[0]
	);
});

// 排序逻辑
const sortedRows = computed(() => {
	if (!data.value || !activeView.value) return [];
	const rows = [...data.value.rows];
	const sort = activeView.value.sort;
	if (sort) {
		const col = data.value.columns.find((c) => c.id === sort.column);
		if (col) {
			rows.sort((a, b) => {
				const va = a.cells[col.id] ?? "";
				const vb = b.cells[col.id] ?? "";
				let cmp = 0;
				if (col.type === "number") {
					cmp = (Number(va) || 0) - (Number(vb) || 0);
				} else {
					cmp = String(va).localeCompare(String(vb), "zh-CN");
				}
				return sort.direction === "desc" ? -cmp : cmp;
			});
		}
	}
	return rows;
});

const toggleSort = (colId: string) => {
	if (!activeView.value || !data.value) return;
	const view = data.value.views.find((v) => v.id === activeView.value!.id);
	if (!view) return;
	if (view.sort?.column === colId) {
		if (view.sort.direction === "asc") {
			view.sort = { column: colId, direction: "desc" };
		} else {
			view.sort = null;
		}
	} else {
		view.sort = { column: colId, direction: "asc" };
	}
	debouncedSave();
};

const addRow = () => {
	if (!data.value) return;
	const id = `r${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
	data.value.rows.push({ id, type: "independent", cells: {} });
	// 自动进入首列编辑
	const firstCol = data.value.columns[0];
	if (firstCol) {
		nextTick(() => {
			editingCell.value = { rowId: id, colId: firstCol.id };
			editValue.value = "";
		});
	}
	debouncedSave();
};

const deleteRow = (rowId: string) => {
	if (!data.value) return;
	data.value.rows = data.value.rows.filter((r) => r.id !== rowId);
	debouncedSave();
};

const addColumn = (type: BaseColumn["type"] = "text") => {
	if (!data.value) return;
	const id = `c${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
	const name = type === "text" ? "文本" : type === "select" ? "选择" : type === "number" ? "数字" : type === "date" ? "日期" : type === "checkbox" ? "复选框" : "列";
	const col: BaseColumn = {
		id,
		name,
		type,
		...(type === "select" ? { options: ["选项1", "选项2"] } : {}),
	};
	data.value.columns.push(col);
	debouncedSave();
};

const deleteColumn = (colId: string) => {
	if (!data.value) return;
	data.value.columns = data.value.columns.filter((c) => c.id !== colId);
	for (const row of data.value.rows) {
		delete row.cells[colId];
	}
	debouncedSave();
};

const startEdit = (rowId: string, colId: string, currentValue: unknown) => {
	editingCell.value = { rowId, colId };
	editValue.value = currentValue != null ? String(currentValue) : "";
};

const commitEdit = () => {
	if (!editingCell.value || !data.value) return;
	const { rowId, colId } = editingCell.value;
	const row = data.value.rows.find((r) => r.id === rowId);
	if (row) {
		const col = data.value.columns.find((c) => c.id === colId);
		if (col?.type === "number") {
			row.cells[colId] = Number(editValue.value) || 0;
		} else if (col?.type === "checkbox") {
			row.cells[colId] = editValue.value === "true";
		} else {
			row.cells[colId] = editValue.value;
		}
		debouncedSave();
	}
	editingCell.value = null;
};

const toggleCheckbox = (rowId: string, colId: string, current: unknown) => {
	if (!data.value) return;
	const row = data.value.rows.find((r) => r.id === rowId);
	if (row) {
		row.cells[colId] = !current;
		debouncedSave();
	}
};

// 列头重命名
const startRenameCol = (colId: string) => {
	const col = data.value?.columns.find((c) => c.id === colId);
	if (!col) return;
	editingColName.value = colId;
	colNameValue.value = col.name;
};

const commitRenameCol = () => {
	if (!editingColName.value || !data.value) return;
	const col = data.value.columns.find((c) => c.id === editingColName.value);
	if (col && colNameValue.value.trim()) {
		col.name = colNameValue.value.trim();
		debouncedSave();
	}
	editingColName.value = null;
};

const addView = (type: BaseViewType["type"]) => {
	if (!data.value) return;
	const id = `v${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
	const name = type === "table" ? "表格" : type === "kanban" ? "看板" : type === "gallery" ? "画廊" : "日历";
	data.value.views.push({
		id,
		name,
		type,
		sort: null,
		filters: [],
		...(type === "kanban" ? { groupColumn: data.value.columns.find((c) => c.type === "select")?.id } : {}),
	});
	data.value.activeViewId = id;
	debouncedSave();
};

const deleteView = (viewId: string) => {
	if (!data.value || data.value.views.length <= 1) return;
	data.value.views = data.value.views.filter((v) => v.id !== viewId);
	if (data.value.activeViewId === viewId) {
		data.value.activeViewId = data.value.views[0]?.id ?? "";
	}
	debouncedSave();
};

const switchView = (viewId: string) => {
	if (!data.value) return;
	data.value.activeViewId = viewId;
	debouncedSave();
};

const firstColumnId = computed(() => data.value?.columns[0]?.id ?? "");

const isFirstColumn = (colId: string) => colId === firstColumnId.value;

const getCellValue = (row: BaseRow, colId: string): unknown => {
	if (row.type === "file" && row.fileTitle && isFirstColumn(colId)) {
		return row.fileTitle;
	}
	return row.cells[colId] ?? "";
};

const getRowTitle = (row: BaseRow) => {
	if (row.type === "file") return row.fileTitle ?? "—";
	const colId = firstColumnId.value;
	return colId ? String(row.cells[colId] ?? "—") : "—";
};

const updateSelectCell = (row: BaseRow, colId: string, value: unknown) => {
	if (typeof value !== "string") return;
	row.cells[colId] = value;
	debouncedSave();
};

// 看板分组
const kanbanGroupColumn = computed(() => {
	if (!data.value || !activeView.value || activeView.value.type !== "kanban") return null;
	const groupColId = activeView.value.groupColumn;
	return data.value.columns.find((c) => c.id === groupColId) || null;
});

const kanbanGroups = computed(() => {
	if (!kanbanGroupColumn.value) return [];
	return kanbanGroupColumn.value.options ?? [];
});

const rowsByKanbanGroup = computed(() => {
	if (!data.value || !kanbanGroupColumn.value) return {};
	const groups: Record<string, BaseRow[]> = {};
	for (const opt of kanbanGroups.value) {
		groups[opt] = [];
	}
	groups["未分组"] = [];
	for (const row of data.value.rows) {
		const val = String(row.cells[kanbanGroupColumn.value.id] ?? "");
		if (val && groups[val]) {
			groups[val].push(row);
		} else {
			groups["未分组"].push(row);
		}
	}
	return groups;
});

const galleryRows = computed(() => data.value?.rows ?? []);

// 日历视图
const calendarDateColumn = computed(() => {
	if (!data.value || !activeView.value || activeView.value.type !== "calendar") return null;
	return data.value.columns.find((c) => c.type === "date") ?? null;
});

const calendarRowsByDate = computed(() => {
	if (!data.value || !calendarDateColumn.value) return {};
	const map: Record<string, BaseRow[]> = {};
	for (const row of data.value.rows) {
		const dateVal = String(row.cells[calendarDateColumn.value!.id] ?? "");
		if (!dateVal) continue;
		if (!map[dateVal]) map[dateVal] = [];
		map[dateVal].push(row);
	}
	return map;
});

const sortIndicator = (colId: string) => {
	const sort = activeView.value?.sort;
	if (!sort || sort.column !== colId) return "";
	return sort.direction === "asc" ? " ↑" : " ↓";
};
</script>

<template>
  <div v-if="isLoading" class="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
    <LoaderCircle class="size-4 animate-spin" />
    加载中...
  </div>

  <div v-else-if="error" class="flex h-full items-center justify-center text-sm text-destructive">
    {{ error }}
  </div>

  <div v-else-if="data" class="flex h-full flex-col overflow-hidden">
    <!-- 标题栏 + 视图切换 -->
    <div class="flex items-center gap-2 border-b border-border/40 px-4 py-2.5">
      <Database class="size-4 text-muted-foreground" />
      <span class="text-sm font-semibold">{{ data.name }}</span>

      <div class="ml-4 flex items-center gap-1">
        <div
          v-for="view in data.views"
          :key="view.id"
          class="group/view flex items-center gap-0.5"
        >
          <Button
            :variant="view.id === data.activeViewId ? 'secondary' : 'ghost'"
            size="sm"
            class="h-6 text-[11px]"
            @click="switchView(view.id)"
          >
            {{ view.name }}
          </Button>
          <button
            v-if="data.views.length > 1"
            type="button"
            class="opacity-0 group-hover/view:opacity-50 text-muted-foreground hover:text-destructive"
            @click="deleteView(view.id)"
          >
            <X class="size-3" />
          </button>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="ghost" size="icon" class="size-6">
              <Plus class="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem @click="addView('table')">
              <Table2 class="mr-2 size-3.5" /> 新建表格视图
            </DropdownMenuItem>
            <DropdownMenuItem @click="addView('kanban')">
              <Columns3 class="mr-2 size-3.5" /> 新建看板视图
            </DropdownMenuItem>
            <DropdownMenuItem @click="addView('gallery')">
              <LayoutGrid class="mr-2 size-3.5" /> 新建画廊视图
            </DropdownMenuItem>
            <DropdownMenuItem @click="addView('calendar')">
              <CalendarDays class="mr-2 size-3.5" /> 新建日历视图
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div class="ml-auto flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="outline" size="sm" class="h-6 gap-1 text-[11px]">
              <Plus class="size-3" />
              添加列
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem @click="addColumn('text')">文本列</DropdownMenuItem>
            <DropdownMenuItem @click="addColumn('select')">选择列</DropdownMenuItem>
            <DropdownMenuItem @click="addColumn('number')">数字列</DropdownMenuItem>
            <DropdownMenuItem @click="addColumn('date')">日期列</DropdownMenuItem>
            <DropdownMenuItem @click="addColumn('checkbox')">复选框列</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <span v-if="isSaving" class="text-[10px] text-muted-foreground">保存中...</span>
      </div>
    </div>

    <!-- 表格视图 -->
    <div v-if="activeView?.type === 'table'" class="flex-1 overflow-auto">
      <table class="w-full border-collapse text-sm">
        <thead class="sticky top-0 bg-background z-10">
          <tr>
            <th
              v-for="col in data.columns"
              :key="col.id"
              class="group/col border-b border-r border-border/40 px-3 py-2 text-left text-xs font-semibold text-muted-foreground"
            >
              <div class="flex items-center justify-between gap-1">
                <div class="flex items-center gap-1 min-w-0 flex-1">
                  <!-- 列名编辑 -->
                  <Input
                    v-if="editingColName === col.id"
                    v-model="colNameValue"
                    class="h-5 w-24 text-[11px] font-semibold"
                    autofocus
                    @blur="commitRenameCol"
                    @keydown.enter="commitRenameCol"
                    @keydown.escape="editingColName = null"
                  />
                  <button
                    v-else
                    type="button"
                    class="truncate hover:text-foreground transition-colors cursor-pointer"
                    @dblclick="startRenameCol(col.id)"
                    @click="toggleSort(col.id)"
                  >
                    {{ col.name }}{{ sortIndicator(col.id) }}
                  </button>
                </div>
                <button
                  type="button"
                  class="shrink-0 opacity-0 group-hover/col:opacity-60 text-muted-foreground hover:text-destructive transition-opacity"
                  @click="deleteColumn(col.id)"
                >
                  <Trash2 class="size-3" />
                </button>
              </div>
              <div class="mt-0.5 text-[10px] font-normal text-muted-foreground/60">
                {{ col.type }}
              </div>
            </th>
            <th class="w-10 border-b border-border/40" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in sortedRows"
            :key="row.id"
            class="group border-b border-border/30 hover:bg-accent/20"
          >
            <td
              v-for="col in data.columns"
              :key="col.id"
              class="border-r border-border/20 px-3 py-2"
            >
              <!-- 文件引用行首列 -->
              <button
                v-if="row.type === 'file' && col.id === data.columns[0]?.id && row.fileTitle"
                type="button"
                class="text-primary underline text-sm"
                @click="emit('open-file', row.path ?? '')"
              >
                {{ row.fileTitle }}
              </button>

              <!-- checkbox -->
              <label v-else-if="col.type === 'checkbox'" class="flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  :checked="!!getCellValue(row, col.id)"
                  class="size-3.5 rounded border-border"
                  @change="toggleCheckbox(row.id, col.id, getCellValue(row, col.id))"
                />
              </label>

              <!-- select -->
              <Select
                v-else-if="col.type === 'select' && col.options"
                :model-value="String(getCellValue(row, col.id) ?? '')"
                @update:model-value="updateSelectCell(row, col.id, $event)"
              >
                <SelectTrigger class="h-6 w-full border-none bg-transparent text-xs shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="opt in col.options" :key="opt" :value="opt">
                    {{ opt }}
                  </SelectItem>
                </SelectContent>
              </Select>

              <!-- 编辑中 -->
              <Input
                v-else-if="editingCell?.rowId === row.id && editingCell?.colId === col.id"
                v-model="editValue"
                class="h-6 w-full border-primary text-xs"
                :type="col.type === 'number' ? 'number' : 'text'"
                autofocus
                @blur="commitEdit"
                @keydown.enter="commitEdit"
                @keydown.escape="editingCell = null"
              />

              <!-- 普通显示 -->
              <span
                v-else
                class="block cursor-default truncate text-sm"
                @dblclick="startEdit(row.id, col.id, getCellValue(row, col.id))"
              >
                {{ getCellValue(row, col.id) || "—" }}
              </span>
            </td>
            <td class="px-1">
              <button
                type="button"
                class="opacity-0 group-hover:opacity-50 text-muted-foreground hover:text-destructive"
                @click="deleteRow(row.id)"
              >
                <Trash2 class="size-3" />
              </button>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td :colspan="data.columns.length + 1" class="px-3 py-2">
              <Button variant="ghost" size="sm" class="h-6 gap-1 text-xs text-muted-foreground" @click="addRow">
                <Plus class="size-3" />
                新增行
              </Button>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- 看板视图 -->
    <div v-else-if="activeView?.type === 'kanban' && kanbanGroupColumn" class="flex-1 overflow-auto p-4">
      <div class="flex gap-3 h-full">
        <div
          v-for="(group, groupIdx) in kanbanGroups"
          :key="groupIdx"
          class="flex-1 min-w-[200px] rounded-lg border border-border/50 bg-muted/20 p-3"
        >
          <div class="mb-3 flex items-center gap-1.5">
            <span class="text-xs font-semibold">{{ group }}</span>
            <span class="text-[10px] text-muted-foreground ml-auto">
              {{ (rowsByKanbanGroup[group] ?? []).length }}
            </span>
          </div>
          <div class="space-y-2 overflow-auto max-h-[calc(100vh-14rem)]">
            <div
              v-for="row in rowsByKanbanGroup[group] ?? []"
              :key="row.id"
              class="rounded-md border border-border/40 bg-card p-2.5"
            >
              <p class="text-xs font-medium text-foreground">
                {{ getRowTitle(row) }}
              </p>
              <div class="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <template v-for="col in data.columns.filter(c => !isFirstColumn(c.id) && c.id !== kanbanGroupColumn?.id)" :key="col.id">
                  <span v-if="row.cells[col.id]">{{ col.name }}: {{ row.cells[col.id] }}</span>
                </template>
              </div>
            </div>
          </div>
        </div>
        <div
          v-if="(rowsByKanbanGroup['未分组'] ?? []).length > 0"
          class="flex-1 min-w-[200px] rounded-lg border border-border/50 border-dashed bg-muted/10 p-3"
        >
          <div class="mb-3 flex items-center gap-1.5">
            <span class="text-xs font-semibold text-muted-foreground">未分组</span>
            <span class="text-[10px] text-muted-foreground ml-auto">
              {{ rowsByKanbanGroup["未分组"]?.length ?? 0 }}
            </span>
          </div>
          <div class="space-y-2">
            <div
              v-for="row in rowsByKanbanGroup['未分组'] ?? []"
              :key="row.id"
              class="rounded-md border border-border/40 bg-card p-2.5"
            >
              <p class="text-xs font-medium text-foreground">
                {{ getRowTitle(row) }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 画廊视图 -->
    <div v-else-if="activeView?.type === 'gallery'" class="flex-1 overflow-auto p-4">
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <div
          v-for="row in galleryRows"
          :key="row.id"
          class="rounded-lg border border-border/50 bg-card p-4 hover:shadow-sm transition-shadow"
        >
          <p class="text-sm font-medium text-foreground">
            {{ getRowTitle(row) }}
          </p>
          <div class="mt-2 space-y-1">
            <template v-for="col in data.columns.filter(c => !isFirstColumn(c.id))" :key="col.id">
              <p v-if="row.cells[col.id] != null" class="text-[11px] text-muted-foreground">
                {{ col.name }}: {{ row.cells[col.id] }}
              </p>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- 日历视图 -->
    <div v-else-if="activeView?.type === 'calendar'" class="flex-1 overflow-auto p-4">
      <div v-if="!calendarDateColumn" class="text-sm text-muted-foreground">
        需要一个日期列才能显示日历视图。请添加日期类型的列。
      </div>
      <div v-else class="space-y-4">
        <div
          v-for="[date, rows] in Object.entries(calendarRowsByDate).sort()"
          :key="date"
          class="rounded-lg border border-border/50 bg-card p-3"
        >
          <h3 class="text-xs font-semibold text-muted-foreground mb-2">{{ date }}</h3>
          <div class="space-y-1.5">
            <div
              v-for="row in rows"
              :key="row.id"
              class="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent/30 transition-colors"
            >
              <span class="text-sm text-foreground">
                {{ getRowTitle(row) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
