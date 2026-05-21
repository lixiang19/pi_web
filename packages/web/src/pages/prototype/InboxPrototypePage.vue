<script setup lang="ts">
/**
 * PROTOTYPE: Inbox Page — Seven radically different UI variations
 * Question: "Which design direction should the Inbox (闪念) page take?"
 *
 * Variants:
 *   A — Apple: Binary black/gray rhythm, glass nav, 56px hero, pill CTAs
 *   B — Notion: Warm cream canvas, serif headlines, 708px column, block cards
 *   C — SoulCore: Void dark, purple neural glow, 96px headlines, tech aesthetic
 *   D — Linear: Marketing black, Indigo accent, weight-510 typography, luminance stacking
 *   E — Stripe: White/blue-sky rhythm, Deep Navy headings, purple shadows, weight-300 display
 *   F — Vercel: Pure black/white axis, 12-step grays, single blue accent, Geist precision
 *   G — Ferrari: Chiaroscuro alternation, Rosso Corsa scarcity, 2px radius, zero shadows
 *
 * Switch via ?variant=A|B|C|D|E|F|G or use the floating bottom bar.
 */

import { computed, ref, onMounted, onBeforeUnmount } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
	Lightbulb,
	Send,
	Paperclip,
	Mic,
	ChevronLeft,
	ChevronRight,
	Sparkles,
	Zap,
	Brain,
	FileText,
	Image,
	Clock,
	CheckCircle2,
	AlertCircle,
	RotateCcw,
	Inbox,
	Search,
	Settings,
	Command,
	Triangle,
	Hexagon,
} from "lucide-vue-next";

/* ──────────── Types ──────────── */

interface MockAttachment {
	id: string;
	originalName: string;
	mimeType: string;
	size: number;
}

interface MockNote {
	id: string;
	content: string;
	createdAt: string;
	status: "processed" | "unprocessed";
	analysisStatus: "analyzing" | "failed" | "suggested" | "unanalyzed";
	recommendationText?: string;
	lastError?: string;
	attachments: MockAttachment[];
}

/* ──────────── Mock Data ──────────── */

const MOCK_NOTES: MockNote[] = [
	{
		id: "1",
		content: "想到了一个很好的产品点子：把闪念笔记和AI分析结合起来，自动分类整理每日灵感。",
		createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
		status: "processed",
		analysisStatus: "suggested",
		recommendationText:
			"这是一个有潜力的产品方向。建议：1) 调研现有闪念笔记工具的市场缺口 2) 设计MVP原型 3) 收集种子用户反馈",
		attachments: [],
	},
	{
		id: "2",
		content:
			"https://github.com/some-cool-project\n\n这个开源项目实现了类似我们想要的实时协作功能，值得参考。",
		createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
		status: "unprocessed",
		analysisStatus: "analyzing",
		attachments: [],
	},
	{
		id: "3",
		content: "会议纪要：本周需要完成三个核心模块的API设计，周五review。",
		createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
		status: "processed",
		analysisStatus: "suggested",
		recommendationText:
			"建议将会议要点拆分为具体任务：\n• API 模块 A 设计（分配给后端团队）\n• API 模块 B 设计\n• API 模块 C 设计\n• 周五 Review 会议准备",
		attachments: [
			{
				id: "a1",
				originalName: "meeting-notes.pdf",
				mimeType: "application/pdf",
				size: 245760,
			},
		],
	},
	{
		id: "4",
		content: "拍了一张白板照片，上面有这周的用户故事草图。",
		createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
		status: "unprocessed",
		analysisStatus: "failed",
		lastError: "图像分析服务暂时不可用",
		attachments: [
			{
				id: "a2",
				originalName: "whiteboard.jpg",
				mimeType: "image/jpeg",
				size: 1843200,
			},
		],
	},
	{
		id: "5",
		content:
			"晚上突然想到：如果我们在聊天界面里加入一个'聚焦模式'，只显示当前对话的关键信息，会不会更有沉浸感？",
		createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
		status: "unprocessed",
		analysisStatus: "unanalyzed",
		attachments: [],
	},
];

/* ──────────── Shared State ──────────── */

const activeFilter = ref<"all" | "processed" | "unprocessed">("all");
const expandedNotes = ref<Record<string, boolean>>({});
const newNoteContent = ref("");
const inputFocused = ref(false);

const visibleNotes = computed(() => {
	if (activeFilter.value === "processed") {
		return MOCK_NOTES.filter((n) => n.status === "processed");
	}
	if (activeFilter.value === "unprocessed") {
		return MOCK_NOTES.filter((n) => n.status !== "processed");
	}
	return MOCK_NOTES;
});

const filterItems = computed(() => [
	{ key: "all" as const, label: "全部", count: MOCK_NOTES.length },
	{
		key: "unprocessed" as const,
		label: "未处理",
		count: MOCK_NOTES.filter((n) => n.status !== "processed").length,
	},
	{
		key: "processed" as const,
		label: "已处理",
		count: MOCK_NOTES.filter((n) => n.status === "processed").length,
	},
]);

const toggleExpanded = (noteId: string) => {
	expandedNotes.value = { ...expandedNotes.value, [noteId]: !expandedNotes.value[noteId] };
};

const isProcessed = (note: MockNote) => note.status === "processed";

const formatTime = (iso: string) => {
	const d = new Date(iso);
	const now = new Date();
	const diff = now.getTime() - d.getTime();
	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);
	if (minutes < 1) return "刚刚";
	if (minutes < 60) return `${minutes}分钟前`;
	if (hours < 24) return `${hours}小时前`;
	return `${days}天前`;
};

const previewContent = (text: string) => {
	const stripped = text.replace(/https?:\/\/\S+/g, "").trim();
	return stripped || text;
};

const getAttachmentIcon = (mimeType: string) => {
	if (mimeType.startsWith("image/")) return Image;
	return FileText;
};

const formatFileSize = (bytes: number) => {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/* ──────────── Variant Switcher ──────────── */

const route = useRoute();
const router = useRouter();

const variants = [
	{ key: "A", name: "Apple — 极简舞台" },
	{ key: "B", name: "Notion — 温暖纸张" },
	{ key: "C", name: "SoulCore — 科技紫光" },
	{ key: "D", name: "Linear — 精密深空" },
	{ key: "E", name: "Stripe — 金融基础设施" },
	{ key: "F", name: "Vercel — 极简单色" },
	{ key: "G", name: "Ferrari — 意式激情" },
] as const;

type VariantKey = (typeof variants)[number]["key"];

const currentVariant = computed<VariantKey>({
	get: () => {
		const v = route.query["variant"] as string;
		if (variants.some((x) => x.key === v)) return v as VariantKey;
		return "A";
	},
	set: (v) => {
		router.replace({ query: { ...route.query, variant: v } });
	},
});

const cycleVariant = (dir: 1 | -1) => {
	const idx = variants.findIndex((v) => v.key === currentVariant.value);
	const next = (idx + dir + variants.length) % variants.length;
	const nextVariant = variants[next];
	if (nextVariant) currentVariant.value = nextVariant.key;
};

const onKeydown = (e: KeyboardEvent) => {
	const target = e.target as HTMLElement;
	if (["input", "textarea"].includes(target?.tagName?.toLowerCase())) return;
	if (e.key === "ArrowLeft") cycleVariant(-1);
	if (e.key === "ArrowRight") cycleVariant(1);
};

onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
	<div class="relative">
		<!-- ════════════════════════════════════════
			 VARIANT A — Apple Style
			 Binary rhythm, glass nav, 56px hero, pill CTAs
		═══════════════════════════════════════ -->
		<div
			v-if="currentVariant === 'A'"
			class="apple-prototype min-h-screen"
			style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif;"
		>
			<!-- Glass Nav -->
			<nav
				class="sticky top-0 z-50 flex h-12 items-center justify-between px-8"
				style="background: rgba(0,0,0,0.8); backdrop-filter: saturate(180%) blur(20px);"
			>
				<div class="flex items-center gap-6">
					<span
						class="text-sm font-normal tracking-tight"
						style="color: #f5f5f7; letter-spacing: -0.01em"
					>
						闪念
					</span>
				</div>
				<div class="flex items-center gap-5">
					<Search class="size-4" style="color: rgba(255,255,255,0.8)" />
					<Settings class="size-4" style="color: rgba(255,255,255,0.8)" />
				</div>
			</nav>

			<!-- Hero Section — Pure Black -->
			<section
				class="flex flex-col items-center justify-center px-8 py-20"
				style="background: #000000"
			>
				<h1
					class="text-center font-semibold"
					style="font-size: 56px; line-height: 1.07; letter-spacing: -0.28px; color: #f5f5f7"
				>
					捕捉每一个灵感
				</h1>
				<p
					class="mt-4 text-center"
					style="font-size: 21px; line-height: 1.19; letter-spacing: 0.231px; color: rgba(255,255,255,0.8)"
				>
					语音、文字、附件 — 记录此刻所想
				</p>
				<div class="mt-8 flex items-center gap-4">
					<button
						class="px-4 py-2 text-sm font-normal"
						style="background: #0071e3; color: #ffffff; border-radius: 980px; letter-spacing: -0.224px"
					>
						新建闪念
					</button>
					<button
						class="px-3 py-1 text-sm font-normal"
						style="background: transparent; color: #2997ff; border: 1px solid #2997ff; border-radius: 980px; letter-spacing: -0.224px"
					>
						查看全部 →
					</button>
				</div>
			</section>

			<!-- Input + List — Light Gray -->
			<section style="background: #f5f5f7">
				<div class="mx-auto max-w-[680px] px-8 py-16">
					<!-- Filter pills -->
					<div class="mb-10 flex items-center gap-2">
						<button
							v-for="item in filterItems"
							:key="item.key"
							class="px-3 py-1.5 text-xs font-normal transition-all"
							style="border-radius: 980px; letter-spacing: -0.08px"
							:style="
								activeFilter === item.key
									? { background: '#1d1d1f', color: '#ffffff' }
									: {
											background: 'transparent',
											color: 'rgba(0,0,0,0.8)',
											border: '1px solid rgba(0,0,0,0.16)',
										}
							"
							@click="activeFilter = item.key"
						>
							{{ item.label }}
							<span style="color: rgba(0,0,0,0.48)">{{ item.count }}</span>
						</button>
					</div>

					<!-- Input Card -->
					<div
						class="mb-10 rounded-xl p-6 transition-shadow"
						style="background: #ffffff; border-radius: 12px"
						:class="inputFocused ? 'shadow-lg' : ''"
					>
						<textarea
							v-model="newNoteContent"
							class="w-full resize-none border-0 bg-transparent outline-none"
							style="font-size: 17px; line-height: 1.47; letter-spacing: -0.374px; color: #1d1d1f; min-height: 80px"
							placeholder="捕捉此刻的想法…"
							@focus="inputFocused = true"
							@blur="inputFocused = false"
						></textarea>
						<div class="mt-4 flex items-center justify-between">
							<div class="flex items-center gap-3">
								<button
									class="flex items-center gap-1.5 text-xs"
									style="color: rgba(0,0,0,0.48)"
								>
									<Paperclip class="size-3.5" />
									附件
								</button>
								<button
									class="flex items-center gap-1.5 text-xs"
									style="color: rgba(0,0,0,0.48)"
								>
									<Mic class="size-3.5" />
									语音
								</button>
							</div>
							<button
								class="px-4 py-2 text-xs font-normal"
								style="background: #0071e3; color: #ffffff; border-radius: 8px"
								:disabled="!newNoteContent.trim()"
							>
								<Send class="mr-1 inline size-3.5" />
								发送
							</button>
						</div>
					</div>

					<!-- Notes List -->
					<div v-if="visibleNotes.length === 0" class="py-20 text-center">
						<Lightbulb class="mx-auto mb-4 size-12" style="color: rgba(0,0,0,0.16)" />
						<p style="font-size: 17px; color: rgba(0,0,0,0.48)">还没有闪念</p>
					</div>

					<div v-else class="space-y-4">
						<div
							v-for="note in visibleNotes"
							:key="note.id"
							class="rounded-xl p-5 transition-shadow"
							style="background: #ffffff; border-radius: 12px"
							:class="isProcessed(note) ? 'border border-blue-200' : ''"
						>
							<div class="flex items-start justify-between gap-4">
								<div class="flex-1">
									<div class="mb-2 flex items-center gap-2">
										<span
											v-if="isProcessed(note)"
											class="inline-flex items-center gap-1 px-2 py-0.5 text-xs"
											style="background: rgba(0,113,227,0.1); color: #0066cc; border-radius: 980px"
										>
											<CheckCircle2 class="size-3" />
											已处理
										</span>
										<span
											v-else-if="note.analysisStatus === 'analyzing'"
											class="inline-flex items-center gap-1 px-2 py-0.5 text-xs"
											style="background: rgba(255,159,10,0.15); color: #b45309; border-radius: 980px"
										>
											<span
												class="size-1.5 rounded-full animate-pulse"
												style="background: #ff9f0a"
											></span>
											分析中
										</span>
										<span
											v-else-if="note.analysisStatus === 'failed'"
											class="inline-flex items-center gap-1 px-2 py-0.5 text-xs"
											style="background: rgba(255,59,48,0.12); color: #d70015; border-radius: 980px"
										>
											<AlertCircle class="size-3" />
											分析失败
										</span>
										<span
											style="font-size: 12px; color: rgba(0,0,0,0.48); letter-spacing: -0.12px"
										>
											{{ formatTime(note.createdAt) }}
										</span>
									</div>
									<p
										class="cursor-pointer"
										style="font-size: 17px; line-height: 1.47; letter-spacing: -0.374px; color: #1d1d1f"
										@click="toggleExpanded(note.id)"
									>
										{{ expandedNotes[note.id] ? note.content : previewContent(note.content) }}
									</p>

									<!-- Analysis result -->
									<div
										v-if="expandedNotes[note.id] && note.recommendationText"
										class="mt-3 rounded-lg p-3"
										style="background: rgba(0,113,227,0.06); border-left: 3px solid #0071e3"
									>
										<p
											style="font-size: 12px; font-weight: 600; color: #0071e3; letter-spacing: -0.12px"
										>
											处理结果
										</p>
										<p
											style="font-size: 14px; line-height: 1.5; color: #1d1d1f; margin-top: 4px"
										>
											{{ note.recommendationText }}
										</p>
									</div>

									<!-- Attachments -->
									<div
										v-if="note.attachments.length > 0"
										class="mt-3 flex flex-wrap gap-2"
									>
										<span
											v-for="att in note.attachments"
											:key="att.id"
											class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs"
											style="background: #f5f5f7; color: rgba(0,0,0,0.8); border-radius: 8px"
										>
											<component
												:is="getAttachmentIcon(att.mimeType)"
												class="size-3.5"
											/>
											{{ att.originalName }}
											<span style="color: rgba(0,0,0,0.48)">{{ formatFileSize(att.size) }}</span>
										</span>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</section>
		</div>

		<!-- ════════════════════════════════════════
			 VARIANT B — Notion Style
			 Warm cream canvas, serif headlines, 708px column
		═══════════════════════════════════════ -->
		<div
			v-else-if="currentVariant === 'B'"
			class="notion-prototype min-h-screen"
			style="font-family: system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif"
		>
			<div class="flex min-h-screen">
				<!-- Sidebar -->
				<aside
					class="w-60 shrink-0 border-r px-3 py-4"
					style="background: #f7f6f3; border-color: rgba(55,53,47,0.09)"
				>
					<div class="mb-6 flex items-center gap-2 px-2">
						<div class="size-5 rounded" style="background: #37352f"></div>
						<span class="text-sm font-medium" style="color: #37352f">Ridge</span>
					</div>
					<div class="space-y-0.5">
						<button
							class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm"
							style="color: #37352f; background: rgba(55,53,47,0.08)"
						>
							<Inbox class="size-4" />
							闪念
						</button>
						<button
							v-for="label in ['任务', '文件', '空间', '设置']"
							:key="label"
							class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors"
							style="color: rgba(55,53,47,0.65)"
						>
							{{ label }}
						</button>
					</div>
				</aside>

				<!-- Main Content -->
				<main class="flex-1 overflow-y-auto" style="background: #ffffff">
					<div class="mx-auto max-w-[708px] px-8 py-10">
						<!-- Header with serif -->
						<h1
							class="mb-2"
							style="font-family: ui-serif, Charter, 'Bitstream Charter', 'Sitka Text', Cambria, Georgia, serif; font-size: 40px; font-weight: 600; line-height: 1.1; letter-spacing: -1.4px; color: #37352f"
						>
							闪念
						</h1>
						<p
							class="mb-8"
							style="font-size: 16px; color: rgba(55,53,47,0.65); line-height: 1.55"
						>
							{{ MOCK_NOTES.length }} 条记录 ·
							{{ MOCK_NOTES.filter((n) => n.status !== "processed").length }} 条未处理
						</p>

						<!-- Filter tabs -->
						<div
							class="mb-6 flex items-center gap-1 border-b"
							style="border-color: rgba(55,53,47,0.09)"
						>
							<button
								v-for="item in filterItems"
								:key="item.key"
								class="px-2 py-2 text-sm font-medium transition-colors"
								style="border-bottom: 2px solid transparent; margin-bottom: -1px"
								:style="
									activeFilter === item.key
										? { color: '#37352f', borderColor: '#37352f' }
										: { color: 'rgba(55,53,47,0.65)' }
								"
								@click="activeFilter = item.key"
							>
								{{ item.label }}
								<span class="ml-1 text-xs" style="color: rgba(55,53,47,0.5)">{{ item.count }}</span>
							</button>
						</div>

						<!-- Input Block -->
						<div
							class="mb-8 rounded-lg border p-4 transition-all"
							style="background: #ffffff; border-color: rgba(55,53,47,0.16); border-radius: 4px"
						>
							<textarea
								v-model="newNoteContent"
								class="w-full resize-none border-0 bg-transparent outline-none"
								style="font-size: 16px; line-height: 1.55; color: #37352f; min-height: 60px"
								placeholder="输入内容，或粘贴链接…"
								@focus="inputFocused = true"
								@blur="inputFocused = false"
							></textarea>
							<div class="mt-3 flex items-center justify-between">
								<div class="flex items-center gap-2">
									<button
										class="flex items-center gap-1 rounded p-1.5 text-sm"
										style="color: rgba(55,53,47,0.65)"
									>
										<Paperclip class="size-4" />
									</button>
									<button
										class="flex items-center gap-1 rounded p-1.5 text-sm"
										style="color: rgba(55,53,47,0.65)"
									>
										<Mic class="size-4" />
									</button>
								</div>
								<button
									class="rounded px-3 py-1.5 text-sm font-medium"
									style="background: #2383e2; color: #ffffff"
									:disabled="!newNoteContent.trim()"
								>
									发送
								</button>
							</div>
						</div>

						<!-- Notes as Blocks -->
						<div v-if="visibleNotes.length === 0" class="py-16 text-center">
							<Lightbulb class="mx-auto mb-3 size-10" style="color: rgba(55,53,47,0.25)" />
							<p style="font-size: 14px; color: rgba(55,53,47,0.5)">还没有闪念记录</p>
						</div>

						<div v-else class="space-y-2">
							<div
								v-for="note in visibleNotes"
								:key="note.id"
								class="group cursor-pointer rounded-lg p-3 transition-colors"
								style="border-radius: 4px"
								@click="toggleExpanded(note.id)"
							>
								<div class="flex items-start gap-3">
									<!-- Color dot status -->
									<div class="mt-1.5 shrink-0">
										<div
											class="size-2 rounded-full"
											:style="
												isProcessed(note)
													? { background: '#0f7b6c' }
													: note.analysisStatus === 'analyzing'
														? { background: '#d9730d' }
														: note.analysisStatus === 'failed'
															? { background: '#e03e3e' }
															: { background: 'rgba(55,53,47,0.2)' }
											"
										></div>
									</div>
									<div class="min-w-0 flex-1">
										<div class="mb-1 flex items-center gap-2">
											<!-- Notion-style tag pills -->
											<span
												v-if="isProcessed(note)"
												class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium"
												style="background: #ddedea; color: #0f7b6c"
											>
												<CheckCircle2 class="size-3" />
												已处理
											</span>
											<span
												v-else-if="note.analysisStatus === 'analyzing'"
												class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium"
												style="background: #faebdd; color: #d9730d"
											>
												<Zap class="size-3" />
												分析中
											</span>
											<span
												v-else-if="note.analysisStatus === 'failed'"
												class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium"
												style="background: #fbe4e4; color: #e03e3e"
											>
												<AlertCircle class="size-3" />
												失败
											</span>
											<span
												v-else
												class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium"
												style="background: #e3e2e0; color: #9b9a97"
											>
												<Clock class="size-3" />
												等待
											</span>
											<span style="font-size: 12px; color: rgba(55,53,47,0.5)">
												{{ formatTime(note.createdAt) }}
											</span>
										</div>

										<p style="font-size: 16px; line-height: 1.55; color: #37352f">
											{{ expandedNotes[note.id] ? note.content : previewContent(note.content) }}
										</p>

										<!-- Expanded content -->
										<div v-if="expandedNotes[note.id]" class="mt-3">
											<div
												v-if="note.recommendationText"
												class="mb-3 rounded-lg p-3"
												style="background: #f7f6f3; border-left: 3px solid #2383e2"
											>
												<p class="mb-1 text-xs font-medium" style="color: #0b6e99">AI 分析</p>
												<p style="font-size: 14px; line-height: 1.5; color: #37352f">
													{{ note.recommendationText }}
												</p>
											</div>

											<div
												v-if="note.attachments.length > 0"
												class="flex flex-wrap gap-2"
											>
												<span
													v-for="att in note.attachments"
													:key="att.id"
													class="inline-flex items-center gap-1 rounded px-2 py-1 text-xs"
													style="background: #ebeae8; color: #37352f"
												>
													<component
														:is="getAttachmentIcon(att.mimeType)"
														class="size-3.5"
													/>
													{{ att.originalName }}
												</span>
											</div>

											<div v-if="note.analysisStatus === 'failed'" class="mt-2">
												<button
													class="inline-flex items-center gap-1 rounded p-1 text-xs"
													style="color: #2383e2"
												>
													<RotateCcw class="size-3" />
													重试分析
												</button>
											</div>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</main>
			</div>
		</div>

		<!-- ════════════════════════════════════════
			 VARIANT C — SoulCore Style
			 Void dark, purple neural glow, tech aesthetic
		═══════════════════════════════════════ -->
		<div
			v-else-if="currentVariant === 'C'"
			class="soulcore-prototype min-h-screen"
			style="font-family: Inter, system-ui, -apple-system, sans-serif; background: #0f0f14"
		>
			<!-- Neural Mesh Background (simplified) -->
			<div class="pointer-events-none fixed inset-0 overflow-hidden" style="z-index: 0">
				<div
					class="absolute inset-0"
					style="background: radial-gradient(ellipse at 50% 0%, rgba(139,92,246,0.08) 0%, transparent 60%)"
				></div>
			</div>

			<div class="relative z-10">
				<!-- Glass Nav -->
				<nav
					class="sticky top-0 z-50 flex h-16 items-center justify-between border-b px-6"
					style="background: rgba(15,15,20,0.8); border-color: rgba(255,255,255,0.1); backdrop-filter: blur(12px) saturate(180%)"
				>
					<div class="flex items-center gap-3">
						<div
							class="flex size-8 items-center justify-center rounded-lg"
							style="background: rgba(139,92,246,0.2)"
						>
							<Sparkles class="size-4" style="color: #a78bfa" />
						</div>
						<span class="text-base font-semibold" style="color: #e0e0e5">闪念</span>
					</div>
					<div class="flex items-center gap-4">
						<Search class="size-5" style="color: #a0a0b0" />
						<Settings class="size-5" style="color: #a0a0b0" />
					</div>
				</nav>

				<!-- Hero -->
				<section class="px-6 py-16 text-center">
					<h1
						class="font-extrabold"
						style="font-size: clamp(48px, 8vw, 96px); line-height: 1; letter-spacing: -2.4px; color: #ffffff"
					>
						灵感永存
					</h1>
					<p
						class="mt-4"
						style="
							font-size: clamp(16px, 2vw, 20px);
							line-height: 1.6;
							color: #a0a0b0;
							max-width: 500px;
							margin-left: auto;
							margin-right: auto;
						"
					>
						用 AI 捕捉、分析、整理你的每一个念头
					</p>
					<div class="mt-8 flex items-center justify-center gap-4">
						<button
							class="px-8 py-4 text-base font-semibold"
							style="
								background: #8b5cf6;
								color: #ffffff;
								border-radius: 9999px;
								box-shadow: rgba(139,92,246,0.3) 0px 0px 30px 0px;
							"
						>
							<Zap class="mr-2 inline size-5" />
							新建闪念
						</button>
					</div>
				</section>

				<!-- Content -->
				<section class="mx-auto max-w-3xl px-6 pb-20">
					<!-- Filter -->
					<div class="mb-8 flex items-center gap-2">
						<button
							v-for="item in filterItems"
							:key="item.key"
							class="px-4 py-2 text-sm font-medium transition-all"
							style="border-radius: 9999px"
							:style="
								activeFilter === item.key
									? {
											background: 'rgba(139,92,246,0.2)',
											color: '#a78bfa',
											border: '1px solid rgba(139,92,246,0.4)',
										}
									: {
											background: 'rgba(255,255,255,0.05)',
											color: '#707080',
											border: '1px solid rgba(255,255,255,0.1)',
										}
							"
							@click="activeFilter = item.key"
						>
							{{ item.label }}
							<span style="color: #505060">{{ item.count }}</span>
						</button>
					</div>

					<!-- Input -->
					<div
						class="mb-8 rounded-2xl border p-5 transition-all"
						style="
							background: rgba(22,22,30,0.6);
							border-color: rgba(139,92,246,0.15);
							backdrop-filter: blur(8px);
						"
						:class="inputFocused ? 'shadow-lg' : ''"
					>
						<textarea
							v-model="newNoteContent"
							class="w-full resize-none border-0 bg-transparent outline-none"
							style="font-size: 16px; line-height: 1.5; color: #e0e0e5; min-height: 80px"
							placeholder="写下此刻的想法，AI 会为你分析整理…"
							@focus="inputFocused = true"
							@blur="inputFocused = false"
						></textarea>
						<div class="mt-4 flex items-center justify-between">
							<div class="flex items-center gap-2">
								<button
									class="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm"
									style="color: #707080"
								>
									<Paperclip class="size-4" />
									附件
								</button>
								<button
									class="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm"
									style="color: #707080"
								>
									<Mic class="size-4" />
									语音
								</button>
							</div>
							<button
								class="rounded-lg px-4 py-2 text-sm font-medium"
								style="background: #8b5cf6; color: #ffffff"
								:disabled="!newNoteContent.trim()"
							>
								<Send class="mr-1 inline size-4" />
								发送
							</button>
						</div>
					</div>

					<!-- Notes Cards -->
					<div v-if="visibleNotes.length === 0" class="py-16 text-center">
						<Brain class="mx-auto mb-4 size-12" style="color: rgba(139,92,246,0.3)" />
						<p style="font-size: 16px; color: #707080">还没有灵感记录</p>
					</div>

					<div v-else class="space-y-4">
						<div
							v-for="note in visibleNotes"
							:key="note.id"
							class="rounded-2xl border p-5 transition-all"
							style="
								background: rgba(22,22,30,0.6);
								border-color: rgba(139,92,246,0.1);
								backdrop-filter: blur(8px);
							"
							:style="
								isProcessed(note)
									? {
											borderColor: 'rgba(139,92,246,0.3)',
											boxShadow: 'rgba(139,92,246,0.15) 0px 4px 12px',
										}
									: {}
							"
						>
							<div class="flex items-start justify-between gap-4">
								<div class="flex-1">
									<div class="mb-2 flex flex-wrap items-center gap-2">
										<span
											v-if="isProcessed(note)"
											class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
											style="background: rgba(139,92,246,0.15); color: #a78bfa"
										>
											<Sparkles class="size-3" />
											已处理
										</span>
										<span
											v-else-if="note.analysisStatus === 'analyzing'"
											class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
											style="background: rgba(245,158,11,0.15); color: #f59e0b"
										>
											<span
												class="size-1.5 rounded-full animate-pulse"
												style="background: #f59e0b"
											></span>
											分析中
										</span>
										<span
											v-else-if="note.analysisStatus === 'failed'"
											class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
											style="background: rgba(239,68,68,0.15); color: #f87171"
										>
											<AlertCircle class="size-3" />
											分析失败
										</span>
										<span
											v-else
											class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
											style="background: rgba(255,255,255,0.05); color: #707080"
										>
											<Clock class="size-3" />
											等待分析
										</span>
										<span style="font-size: 12px; color: #505060">{{ formatTime(note.createdAt) }}</span>
									</div>

									<p
										class="cursor-pointer"
										style="font-size: 16px; line-height: 1.5; color: #e0e0e5"
										@click="toggleExpanded(note.id)"
									>
										{{ expandedNotes[note.id] ? note.content : previewContent(note.content) }}
									</p>

									<div v-if="expandedNotes[note.id]" class="mt-4">
										<div
											v-if="note.recommendationText"
											class="mb-3 rounded-xl p-4"
											style="
												background: rgba(139,92,246,0.08);
												border: 1px solid rgba(139,92,246,0.2);
											"
										>
											<div class="mb-2 flex items-center gap-2">
												<Brain class="size-4" style="color: #a78bfa" />
												<span class="text-xs font-medium" style="color: #a78bfa">AI 分析结果</span>
											</div>
											<p style="font-size: 14px; line-height: 1.6; color: #e0e0e5">
												{{ note.recommendationText }}
											</p>
										</div>

										<div
											v-if="note.attachments.length > 0"
											class="flex flex-wrap gap-2"
										>
											<span
												v-for="att in note.attachments"
												:key="att.id"
												class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs"
												style="
													background: rgba(255,255,255,0.05);
													color: #a0a0b0;
													border: 1px solid rgba(255,255,255,0.1);
												"
											>
												<component
													:is="getAttachmentIcon(att.mimeType)"
													class="size-3.5"
												/>
												{{ att.originalName }}
												<span style="color: #505060">{{ formatFileSize(att.size) }}</span>
											</span>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</section>
			</div>
		</div>

		<!-- ════════════════════════════════════════
			 VARIANT D — Linear Style
			 Marketing black, Indigo accent, luminance stacking
		═══════════════════════════════════════ -->
		<div
			v-else-if="currentVariant === 'D'"
			class="linear-prototype min-h-screen"
			style="font-family: Inter, SF Pro Display, system-ui, Segoe UI, Helvetica, Arial, sans-serif; background: #08090a"
		>
			<!-- Ambient glow -->
			<div class="pointer-events-none fixed inset-0 overflow-hidden" style="z-index: 0">
				<div
					class="absolute inset-0"
					style="background: radial-gradient(ellipse at 50% 0%, rgba(94,106,210,0.2) 0%, transparent 60%)"
				></div>
			</div>

			<div class="relative z-10">
				<!-- Glass Nav -->
				<nav
					class="sticky top-0 z-50 flex h-16 items-center justify-between border-b px-6"
					style="
						background: rgba(8,9,10,0.85);
						border-color: rgba(255,255,255,0.08);
						backdrop-filter: blur(12px) saturate(180%);
					"
				>
					<div class="flex items-center gap-3">
						<Command class="size-5" style="color: #f7f8f8" />
						<span
							class="text-sm"
							style="color: #f7f8f8; font-variation-settings: 'wght' 510"
						>
							闪念
						</span>
					</div>
					<div class="flex items-center gap-4">
						<Search class="size-4" style="color: #8a8f98" />
						<Settings class="size-4" style="color: #8a8f98" />
					</div>
				</nav>

				<!-- Hero -->
				<section class="px-6 py-20 text-center">
					<h1
						class="font-semibold"
						style="
							font-size: clamp(40px, 5.5vw, 72px);
							line-height: 1;
							letter-spacing: -1.584px;
							color: #f7f8f8;
							font-variation-settings: 'wght' 590;
						"
					>
						捕捉灵感
					</h1>
					<p
						class="mt-4"
						style="
							font-size: 18px;
							line-height: 1.6;
							color: #d0d6e0;
							max-width: 480px;
							margin-left: auto;
							margin-right: auto;
						"
					>
						记录、分析、行动 —— 让每一刻思考都有迹可循
					</p>
				</section>

				<!-- Content -->
				<section class="mx-auto max-w-2xl px-6 pb-20">
					<!-- Filter pills -->
					<div class="mb-8 flex items-center gap-2">
						<button
							v-for="item in filterItems"
							:key="item.key"
							class="px-3 py-1.5 text-xs transition-all"
							style="border-radius: 6px; font-variation-settings: 'wght' 510"
							:style="
								activeFilter === item.key
									? { background: '#5e6ad2', color: '#f7f8f8' }
									: {
											background: 'rgba(255,255,255,0.02)',
											color: '#8a8f98',
											border: '1px solid rgba(255,255,255,0.05)',
										}
							"
							@click="activeFilter = item.key"
						>
							{{ item.label }}
							<span style="color: #62666d">{{ item.count }}</span>
						</button>
					</div>

					<!-- Input -->
					<div
						class="mb-8 rounded-lg border p-4 transition-all"
						style="
							background: rgba(255,255,255,0.02);
							border-color: rgba(255,255,255,0.05);
							border-radius: 6px;
						"
						:class="inputFocused ? 'border-purple-400' : ''"
					>
						<textarea
							v-model="newNoteContent"
							class="w-full resize-none border-0 bg-transparent outline-none"
							style="font-size: 14px; line-height: 1.5; color: #f7f8f8; min-height: 80px"
							placeholder="写下此刻的想法…"
							@focus="inputFocused = true"
							@blur="inputFocused = false"
						></textarea>
						<div class="mt-4 flex items-center justify-between">
							<div class="flex items-center gap-2">
								<button
									class="flex items-center gap-1.5 rounded px-2 py-1 text-xs"
									style="color: #8a8f98"
								>
									<Paperclip class="size-3.5" />
								</button>
								<button
									class="flex items-center gap-1.5 rounded px-2 py-1 text-xs"
									style="color: #8a8f98"
								>
									<Mic class="size-3.5" />
								</button>
							</div>
							<button
								class="px-4 py-2 text-xs"
								style="
									background: #5e6ad2;
									color: #f7f8f8;
									border-radius: 6px;
									font-variation-settings: 'wght' 510;
								"
								:disabled="!newNoteContent.trim()"
							>
								发送
							</button>
						</div>
					</div>

					<!-- Notes — Luminance stacking cards -->
					<div v-if="visibleNotes.length === 0" class="py-16 text-center">
						<Lightbulb class="mx-auto mb-4 size-10" style="color: #62666d" />
						<p style="font-size: 14px; color: #8a8f98">还没有闪念</p>
					</div>

					<div v-else class="space-y-3">
						<div
							v-for="note in visibleNotes"
							:key="note.id"
							class="rounded-lg border p-5 transition-all"
							style="
								background: rgba(255,255,255,0.05);
								border-color: rgba(255,255,255,0.05);
								border-radius: 8px;
							"
							:hover="{ background: 'rgba(255,255,255,0.07)' }"
						>
							<div class="flex items-start justify-between gap-4">
								<div class="flex-1">
									<div class="mb-2 flex items-center gap-2">
										<span
											v-if="isProcessed(note)"
											class="inline-flex items-center gap-1 px-2 py-0.5 text-xs"
											style="
												background: rgba(94,106,210,0.15);
												color: #828fff;
												border-radius: 9999px;
												font-variation-settings: 'wght' 510;
											"
										>
											<CheckCircle2 class="size-3" />
											已处理
										</span>
										<span
											v-else-if="note.analysisStatus === 'analyzing'"
											class="inline-flex items-center gap-1 px-2 py-0.5 text-xs"
											style="
												background: rgba(245,158,11,0.12);
												color: #f59e0b;
												border-radius: 9999px;
												font-variation-settings: 'wght' 510;
											"
										>
											<span
												class="size-1.5 rounded-full animate-pulse"
												style="background: #f59e0b"
											></span>
											分析中
										</span>
										<span
											v-else-if="note.analysisStatus === 'failed'"
											class="inline-flex items-center gap-1 px-2 py-0.5 text-xs"
											style="
												background: rgba(229,57,53,0.12);
												color: #e53935;
												border-radius: 9999px;
												font-variation-settings: 'wght' 510;
											"
										>
											<AlertCircle class="size-3" />
											失败
										</span>
										<span
											v-else
											class="inline-flex items-center gap-1 px-2 py-0.5 text-xs"
											style="
												background: rgba(255,255,255,0.03);
												color: #62666d;
												border-radius: 9999px;
												font-variation-settings: 'wght' 510;
											"
										>
											<Clock class="size-3" />
											等待
										</span>
										<span style="font-size: 12px; color: #62666d">{{ formatTime(note.createdAt) }}</span>
									</div>

									<p
										class="cursor-pointer"
										style="font-size: 16px; line-height: 1.5; color: #f7f8f8"
										@click="toggleExpanded(note.id)"
									>
										{{ expandedNotes[note.id] ? note.content : previewContent(note.content) }}
									</p>

									<div v-if="expandedNotes[note.id]" class="mt-4">
										<div
											v-if="note.recommendationText"
											class="mb-3 rounded-lg p-3"
											style="
												background: rgba(94,106,210,0.08);
												border: 1px solid rgba(94,106,210,0.2);
												border-radius: 8px;
											"
										>
											<p
												class="mb-1 text-xs"
												style="color: #828fff; font-variation-settings: 'wght' 510"
											>
												处理结果
											</p>
											<p style="font-size: 14px; line-height: 1.6; color: #d0d6e0">
												{{ note.recommendationText }}
											</p>
										</div>

										<div
											v-if="note.attachments.length > 0"
											class="flex flex-wrap gap-2"
										>
											<span
												v-for="att in note.attachments"
												:key="att.id"
												class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs"
												style="
													background: rgba(255,255,255,0.03);
													color: #d0d6e0;
													border: 1px solid rgba(255,255,255,0.05);
													border-radius: 6px;
												"
											>
												<component
													:is="getAttachmentIcon(att.mimeType)"
													class="size-3.5"
												/>
												{{ att.originalName }}
											</span>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</section>
			</div>
		</div>

		<!-- ════════════════════════════════════════
			 VARIANT E — Stripe Style
			 White/blue-sky rhythm, Deep Navy, purple shadows
		═══════════════════════════════════════ -->
		<div
			v-else-if="currentVariant === 'E'"
			class="stripe-prototype min-h-screen"
			style="font-family: 'Helvetica Neue', Arial, sans-serif; background: #ffffff"
		>
			<!-- Nav -->
			<nav
				class="sticky top-0 z-50 flex h-16 items-center justify-between border-b px-8"
				style="background: rgba(255,255,255,0.92); backdrop-filter: blur(8px); border-color: #e5edf5"
			>
				<div class="flex items-center gap-2">
					<div class="size-6 rounded" style="background: #533afd"></div>
					<span class="text-sm font-medium" style="color: #061b31">闪念</span>
				</div>
				<div class="flex items-center gap-4">
					<Search class="size-4" style="color: #64748d" />
					<Settings class="size-4" style="color: #64748d" />
				</div>
			</nav>

			<!-- Hero — Subtle blue wash -->
			<section
				class="px-8 py-16"
				style="background: linear-gradient(180deg, rgba(83,58,253,0.06) 0%, transparent 100%)"
			>
				<div class="mx-auto max-w-2xl text-center">
					<h1
						class="font-light"
						style="
							font-size: clamp(32px, 4.5vw, 56px);
							line-height: 1.07;
							letter-spacing: -1.4px;
							color: #061b31;
						"
					>
						记录每一刻思考
					</h1>
					<p
						class="mt-4"
						style="font-size: 18px; line-height: 1.6; color: #64748d"
					>
						AI 驱动的灵感捕获与整理平台
					</p>
					<div class="mt-8 flex items-center justify-center gap-3">
						<button
							class="px-4 py-2 text-sm"
							style="background: #533afd; color: #ffffff; border-radius: 4px"
						>
							新建闪念
						</button>
						<button
							class="px-4 py-2 text-sm"
							style="
								background: transparent;
								color: #533afd;
								border: 1px solid #b9b9f9;
								border-radius: 4px;
							"
						>
							查看全部
						</button>
						</div>
				</div>
			</section>

			<!-- Content -->
			<section class="mx-auto max-w-2xl px-8 py-10">
				<!-- Filter -->
				<div class="mb-8 flex items-center gap-2">
					<button
						v-for="item in filterItems"
						:key="item.key"
						class="px-3 py-1.5 text-xs font-medium"
						style="border-radius: 4px"
						:style="
							activeFilter === item.key
								? { background: '#533afd', color: '#ffffff' }
								: {
										background: '#f6f9fc',
										color: '#273951',
										border: '1px solid #e5edf5',
									}
						"
						@click="activeFilter = item.key"
					>
						{{ item.label }}
						<span style="color: #64748d">{{ item.count }}</span>
					</button>
				</div>

				<!-- Input -->
				<div
					class="mb-8 rounded-lg border p-4"
					style="background: #ffffff; border-color: #e5edf5; border-radius: 4px"
				>
					<textarea
						v-model="newNoteContent"
						class="w-full resize-none border-0 bg-transparent outline-none"
						style="font-size: 16px; line-height: 1.6; color: #061b31; min-height: 80px"
						placeholder="输入内容，或粘贴链接…"
						@focus="inputFocused = true"
						@blur="inputFocused = false"
					></textarea>
					<div class="mt-4 flex items-center justify-between">
						<div class="flex items-center gap-2">
							<button class="flex items-center gap-1 rounded p-2" style="color: #64748d">
								<Paperclip class="size-4" />
							</button>
							<button class="flex items-center gap-1 rounded p-2" style="color: #64748d">
								<Mic class="size-4" />
							</button>
						</div>
						<button
							class="px-4 py-2 text-sm"
							style="background: #533afd; color: #ffffff; border-radius: 4px"
							:disabled="!newNoteContent.trim()"
						>
							发送
						</button>
					</div>
				</div>

				<!-- Notes — Featured cards with shadow -->
				<div v-if="visibleNotes.length === 0" class="py-16 text-center">
					<Lightbulb class="mx-auto mb-4 size-12" style="color: #e5edf5" />
					<p style="font-size: 16px; color: #64748d">还没有闪念记录</p>
				</div>

				<div v-else class="space-y-4">
					<div
						v-for="note in visibleNotes"
						:key="note.id"
						class="rounded-lg border p-6 transition-all"
						style="
							background: #ffffff;
							border-color: #e5edf5;
							border-radius: 8px;
							box-shadow: rgba(50,50,93,0.25) 0 30px 45px -30px, rgba(0,0,0,0.1) 0 18px 36px -18px;
						"
					>
						<div class="flex items-start justify-between gap-4">
							<div class="flex-1">
								<div class="mb-2 flex items-center gap-2">
									<span
										v-if="isProcessed(note)"
										class="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium"
										style="background: rgba(21,190,83,0.2); color: #108c3d; border: 1px solid rgba(21,190,83,0.4)"
									>
										<CheckCircle2 class="size-3" />
										已处理
									</span>
									<span
										v-else-if="note.analysisStatus === 'analyzing'"
										class="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium"
										style="background: rgba(245,158,11,0.15); color: #92400e; border: 1px solid rgba(245,158,11,0.3)"
									>
										<span
											class="size-1.5 rounded-full animate-pulse"
											style="background: #f59e0b"
										></span>
										分析中
									</span>
									<span
										v-else-if="note.analysisStatus === 'failed'"
										class="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium"
										style="background: rgba(229,57,53,0.1); color: #b71c1c; border: 1px solid rgba(229,57,53,0.25)"
									>
										<AlertCircle class="size-3" />
										失败
									</span>
									<span
										v-else
										class="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium"
										style="background: #f6f9fc; color: #273951; border: 1px solid #e5edf5"
									>
										<Clock class="size-3" />
										等待
									</span>
									<span style="font-size: 12px; color: #64748d">{{ formatTime(note.createdAt) }}</span>
								</div>

								<p
									class="cursor-pointer"
									style="font-size: 16px; line-height: 1.6; color: #061b31"
									@click="toggleExpanded(note.id)"
								>
									{{ expandedNotes[note.id] ? note.content : previewContent(note.content) }}
								</p>

								<div v-if="expandedNotes[note.id]" class="mt-4">
									<div
										v-if="note.recommendationText"
										class="mb-3 rounded-lg border p-4"
										style="
											background: linear-gradient(135deg, rgba(83,58,253,0.03) 0%, transparent 100%);
											border-color: #e5edf5;
										"
									>
										<p class="mb-1 text-xs font-medium" style="color: #533afd">AI 分析</p>
										<p style="font-size: 14px; line-height: 1.6; color: #273951">
											{{ note.recommendationText }}
										</p>
									</div>

									<div
										v-if="note.attachments.length > 0"
										class="flex flex-wrap gap-2"
									>
										<span
											v-for="att in note.attachments"
											:key="att.id"
											class="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs"
											style="background: #f6f9fc; color: #273951; border: 1px solid #e5edf5"
										>
											<component
												:is="getAttachmentIcon(att.mimeType)"
												class="size-3.5"
											/>
											{{ att.originalName }}
										</span>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</section>
		</div>

		<!-- ════════════════════════════════════════
			 VARIANT F — Vercel Style
			 Pure black/white, 12-step grays, single blue accent
		═══════════════════════════════════════ -->
		<div
			v-else-if="currentVariant === 'F'"
			class="vercel-prototype min-h-screen"
			style="font-family: Inter, SF Pro Display, system-ui, sans-serif; background: #000000"
		>
			<!-- Glass Nav -->
			<nav
				class="sticky top-0 z-50 flex h-16 items-center justify-between border-b px-6"
				style="
					background: rgba(0,0,0,0.8);
					border-color: #1a1a1a;
					backdrop-filter: blur(8px) saturate(180%);
				"
			>
				<div class="flex items-center gap-3">
					<Triangle class="size-5 fill-current" style="color: #fafafa" />
					<span class="text-sm font-medium" style="color: #fafafa">闪念</span>
				</div>
				<div class="flex items-center gap-4">
					<Search class="size-4" style="color: #888888" />
					<Settings class="size-4" style="color: #888888" />
				</div>
			</nav>

			<!-- Hero with rainbow accent -->
			<section class="px-6 py-20 text-center">
				<h1
					class="font-bold"
					style="
						font-size: clamp(36px, 6vw, 72px);
						line-height: 1;
						letter-spacing: -3.6px;
						color: #fafafa;
					"
				>
					灵感<span style="color: #0070f3">.</span>
				</h1>
				<p
					class="mt-4"
					style="font-size: 18px; line-height: 1.6; color: #888888; max-width: 480px; margin: 16px auto 0"
				>
					即时记录，智能整理
				</p>
				<div class="mt-8 flex items-center justify-center gap-3">
					<button
						class="px-4 py-2 text-sm font-medium"
						style="background: #fafafa; color: #000000; border-radius: 6px"
					>
						新建闪念
					</button>
					<button
						class="px-4 py-2 text-sm font-medium"
						style="
							background: transparent;
							color: #fafafa;
							border: 1px solid #2e2e2e;
							border-radius: 6px;
						"
					>
						查看全部
					</button>
				</div>
			</section>

			<!-- Content -->
			<section class="mx-auto max-w-2xl px-6 pb-20">
				<!-- Filter -->
				<div class="mb-8 flex items-center gap-2">
					<button
						v-for="item in filterItems"
						:key="item.key"
						class="px-3 py-2 text-sm font-medium transition-all"
						style="border-radius: 6px"
						:style="
							activeFilter === item.key
								? { background: '#fafafa', color: '#000000' }
								: { background: '#0a0a0a', color: '#888888', border: '1px solid #1a1a1a' }
						"
						@click="activeFilter = item.key"
					>
						{{ item.label }}
						<span style="color: #666666">{{ item.count }}</span>
					</button>
				</div>

				<!-- Input -->
				<div
					class="mb-8 rounded-lg border p-4"
					style="background: #0a0a0a; border-color: #1a1a1a; border-radius: 6px"
				>
					<textarea
						v-model="newNoteContent"
						class="w-full resize-none border-0 bg-transparent outline-none"
						style="font-size: 14px; line-height: 1.5; color: #fafafa; min-height: 80px"
						placeholder="写下此刻的想法…"
						@focus="inputFocused = true"
						@blur="inputFocused = false"
					></textarea>
					<div class="mt-4 flex items-center justify-between">
						<div class="flex items-center gap-2">
							<button class="flex items-center gap-1 rounded p-2" style="color: #666666">
								<Paperclip class="size-4" />
							</button>
							<button class="flex items-center gap-1 rounded p-2" style="color: #666666">
								<Mic class="size-4" />
							</button>
						</div>
						<button
							class="px-4 py-2 text-sm font-medium"
							style="background: #0070f3; color: #ffffff; border-radius: 6px"
							:disabled="!newNoteContent.trim()"
						>
							发送
						</button>
					</div>
				</div>

				<!-- Notes — Border depth cards -->
				<div v-if="visibleNotes.length === 0" class="py-16 text-center">
					<Lightbulb class="mx-auto mb-4 size-12" style="color: #2e2e2e" />
					<p style="font-size: 14px; color: #666666">还没有闪念</p>
				</div>

				<div v-else class="space-y-3">
					<div
						v-for="note in visibleNotes"
						:key="note.id"
						class="rounded-lg border p-5 transition-all"
						style="background: #0a0a0a; border-color: #1a1a1a; border-radius: 8px"
						:hover="{ borderColor: '#2e2e2e' }"
					>
						<div class="flex items-start justify-between gap-4">
							<div class="flex-1">
								<div class="mb-2 flex items-center gap-2">
									<span
										v-if="isProcessed(note)"
										class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
										style="background: #0a0a0a; color: #17c964; border: 1px solid #17c964"
									>
										<CheckCircle2 class="size-3" />
										已处理
									</span>
									<span
										v-else-if="note.analysisStatus === 'analyzing'"
										class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
										style="background: #0a0a0a; color: #f5a623; border: 1px solid #f5a623"
									>
										<span
											class="size-1.5 rounded-full animate-pulse"
											style="background: #f5a623"
										></span>
										分析中
									</span>
									<span
										v-else-if="note.analysisStatus === 'failed'"
										class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
										style="background: #0a0a0a; color: #ff6166; border: 1px solid #ff6166"
									>
										<AlertCircle class="size-3" />
										失败
									</span>
									<span
										v-else
										class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
										style="background: #0a0a0a; color: #666666; border: 1px solid #2e2e2e"
									>
										<Clock class="size-3" />
										等待
									</span>
									<span style="font-size: 12px; color: #666666">{{ formatTime(note.createdAt) }}</span>
								</div>

								<p
									class="cursor-pointer"
									style="font-size: 14px; line-height: 1.5; color: #fafafa"
									@click="toggleExpanded(note.id)"
								>
									{{ expandedNotes[note.id] ? note.content : previewContent(note.content) }}
								</p>

								<div v-if="expandedNotes[note.id]" class="mt-4">
									<div
										v-if="note.recommendationText"
										class="mb-3 rounded-lg border p-4"
										style="background: #0a0a0a; border-color: #0070f3"
									>
										<p class="mb-1 text-xs font-medium" style="color: #3291ff">AI 分析</p>
										<p style="font-size: 14px; line-height: 1.6; color: #e0e0e0">
											{{ note.recommendationText }}
										</p>
									</div>

									<div
										v-if="note.attachments.length > 0"
										class="flex flex-wrap gap-2"
									>
										<span
											v-for="att in note.attachments"
											:key="att.id"
											class="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs"
											style="background: #111111; color: #888888; border: 1px solid #1a1a1a"
										>
											<component
												:is="getAttachmentIcon(att.mimeType)"
												class="size-3.5"
											/>
											{{ att.originalName }}
										</span>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</section>
		</div>

		<!-- ════════════════════════════════════════
			 VARIANT G — Ferrari Style
			 Chiaroscuro alternation, Rosso Corsa scarcity, 2px radius
		═══════════════════════════════════════ -->
		<div
			v-else-if="currentVariant === 'G'"
			class="ferrari-prototype min-h-screen"
			style="font-family: Arial, Helvetica, sans-serif"
		>
			<!-- Nav — White -->
			<nav
				class="flex h-14 items-center justify-between px-8"
				style="background: #ffffff"
			>
				<div class="flex items-center gap-3">
					<Hexagon class="size-5" style="color: #181818" />
					<span
						class="text-xs font-semibold uppercase"
						style="color: #181818; letter-spacing: 1px"
					>
						闪念
					</span>
				</div>
				<div class="flex items-center gap-5">
					<Search class="size-4" style="color: #666666" />
					<Settings class="size-4" style="color: #666666" />
				</div>
			</nav>

			<!-- Hero — Cinematic Black -->
			<section
				class="flex flex-col items-center justify-center px-8 py-24"
				style="background: #000000"
			>
				<h1
					class="text-center font-medium"
					style="font-size: 26px; line-height: 1.2; color: #ffffff"
				>
					捕捉灵感
				</h1>
				<p
					class="mt-3 text-center"
					style="font-size: 16px; line-height: 1.5; color: #8f8f8f"
				>
					每一刻思考都值得被记录
				</p>
				<div class="mt-10">
					<button
						class="px-5 py-3 text-xs font-normal uppercase"
						style="
							background: #da291c;
							color: #ffffff;
							border-radius: 2px;
							letter-spacing: 1.28px;
						"
					>
						新建闪念
					</button>
				</div>
			</section>

			<!-- Content — White Editorial -->
			<section style="background: #ffffff">
				<div class="mx-auto max-w-[720px] px-8 py-16">
					<!-- Stats bar -->
					<div
						class="mb-10 flex items-center gap-6 border-b pb-4"
						style="border-color: #d2d2d2"
					>
						<div v-for="item in filterItems" :key="item.key" class="flex items-center gap-2">
							<button
								class="text-xs uppercase transition-colors"
								style="letter-spacing: 1px"
								:style="
									activeFilter === item.key
										? { color: '#181818', fontWeight: 700 }
										: { color: '#8f8f8f' }
								"
								@click="activeFilter = item.key"
							>
								{{ item.label }}
							</button>
							<span class="text-xs" style="color: #cccccc">{{ item.count }}</span>
						</div>
					</div>

					<!-- Input — Minimal -->
					<div
						class="mb-12 border p-4"
						style="background: #ffffff; border-color: #cccccc; border-radius: 2px"
					>
						<textarea
							v-model="newNoteContent"
							class="w-full resize-none border-0 bg-transparent outline-none"
							style="font-size: 16px; line-height: 1.5; color: #181818; min-height: 60px"
							placeholder="输入内容…"
							@focus="inputFocused = true"
							@blur="inputFocused = false"
						></textarea>
						<div class="mt-4 flex items-center justify-between">
							<div class="flex items-center gap-3">
								<button class="flex items-center gap-1 text-xs" style="color: #8f8f8f">
									<Paperclip class="size-3.5" />
								</button>
								<button class="flex items-center gap-1 text-xs" style="color: #8f8f8f">
									<Mic class="size-3.5" />
								</button>
							</div>
							<button
								class="px-4 py-2 text-xs font-normal uppercase"
								style="
									background: #181818;
									color: #ffffff;
									border-radius: 2px;
									letter-spacing: 1.28px;
								"
								:disabled="!newNoteContent.trim()"
							>
								发送
							</button>
						</div>
					</div>

					<!-- Notes — Editorial Cards, zero shadow -->
					<div v-if="visibleNotes.length === 0" class="py-16 text-center">
						<Lightbulb class="mx-auto mb-4 size-10" style="color: #d2d2d2" />
						<p class="text-xs uppercase" style="color: #8f8f8f; letter-spacing: 1px">还没有闪念</p>
					</div>

					<div v-else class="space-y-8">
						<div
							v-for="note in visibleNotes"
							:key="note.id"
							class="border-t pt-6"
							style="border-color: #d2d2d2"
						>
							<div class="flex items-start gap-4">
								<!-- Vertical status line -->
								<div class="mt-1 shrink-0">
									<div
										class="w-1"
										style="height: 24px; border-radius: 1px"
										:style="
											isProcessed(note)
												? { background: '#03904a' }
												: note.analysisStatus === 'analyzing'
													? { background: '#da291c' }
													: note.analysisStatus === 'failed'
														? { background: '#f13a2c' }
														: { background: '#d2d2d2' }
										"
									></div>
								</div>
								<div class="flex-1">
									<div class="mb-2 flex items-center gap-3">
										<span
											class="text-xs uppercase"
											style="letter-spacing: 1px"
											:style="
												isProcessed(note)
													? { color: '#03904a' }
													: note.analysisStatus === 'analyzing'
														? { color: '#da291c' }
														: note.analysisStatus === 'failed'
															? { color: '#f13a2c' }
															: { color: '#8f8f8f' }
											"
										>
											{{ isProcessed(note) ? '已处理' : note.analysisStatus === 'analyzing' ? '分析中' : note.analysisStatus === 'failed' ? '失败' : '等待' }}
										</span>
										<span class="text-xs" style="color: #cccccc">{{ formatTime(note.createdAt) }}</span>
									</div>

									<p
										class="cursor-pointer"
										style="font-size: 16px; line-height: 1.5; color: #181818"
										@click="toggleExpanded(note.id)"
									>
										{{ expandedNotes[note.id] ? note.content : previewContent(note.content) }}
									</p>

									<div v-if="expandedNotes[note.id]" class="mt-4">
										<div
											v-if="note.recommendationText"
											class="mb-3 border-l-2 p-3"
											style="border-color: #da291c"
										>
											<p
												class="mb-1 text-xs uppercase"
												style="color: #da291c; letter-spacing: 1px"
											>
												处理结果
											</p>
											<p style="font-size: 14px; line-height: 1.6; color: #181818">
												{{ note.recommendationText }}
											</p>
										</div>

										<div
											v-if="note.attachments.length > 0"
											class="flex flex-wrap gap-3"
										>
											<span
												v-for="att in note.attachments"
												:key="att.id"
												class="inline-flex items-center gap-2 border px-3 py-1.5 text-xs"
												style="background: #f5f5f5; color: #181818; border-color: #cccccc; border-radius: 2px"
											>
												<component
													:is="getAttachmentIcon(att.mimeType)"
													class="size-3.5"
												/>
												{{ att.originalName }}
											</span>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</section>
		</div>

		<!-- ════════════════════════════════════════
			 FLOATING SWITCHER (always visible)
		═══════════════════════════════════════ -->
		<div
			class="fixed bottom-6 left-1/2 z-[9999] flex -translate-x-1/2 items-center gap-3 rounded-full px-4 py-2.5 shadow-xl"
			style="background: #1d1d1f; border: 1px solid rgba(255,255,255,0.1)"
		>
			<button
				class="flex items-center justify-center rounded-full p-1.5 transition-colors"
				style="color: rgba(255,255,255,0.6)"
				@click="cycleVariant(-1)"
			>
				<ChevronLeft class="size-4" />
			</button>
			<div class="flex items-center gap-2">
				<span class="text-xs font-medium" style="color: rgba(255,255,255,0.9)">
					{{ currentVariant }}
				</span>
				<span class="text-xs" style="color: rgba(255,255,255,0.5)">
					{{ variants.find((v) => v.key === currentVariant)?.name }}
				</span>
			</div>
			<button
				class="flex items-center justify-center rounded-full p-1.5 transition-colors"
				style="color: rgba(255,255,255,0.6)"
				@click="cycleVariant(1)"
			>
				<ChevronRight class="size-4" />
			</button>
		</div>
	</div>
</template>
