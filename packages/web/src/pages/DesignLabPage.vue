<script setup lang="ts">
import { computed, ref } from "vue";
import {
  BadgeCheck,
  Bell,
  Boxes,
  ChevronRight,
  CircleHelp,
  Clock3,
  Command,
  FolderKanban,
  LayoutGrid,
  Pin,
  Search,
  Sparkles,
  Star,
} from "lucide-vue-next";
import EditorialSessionList from "@/components/chat/EditorialSessionList.vue";

type SessionDraft = {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
  pinned?: boolean;
  tag: "research" | "ui" | "agent" | "spec";
};

type StylePreset = {
  id: string;
  vendor: string;
  title: string;
  summary: string;
  note: string;
  fontFamily: string;
  shellClass: string;
  sidebarClass: string;
  logoClass: string;
  searchClass: string;
  sectionLabelClass: string;
  navItemClass: string;
  navItemActiveClass: string;
  navIconClass: string;
  navIconActiveClass: string;
  navTitleClass: string;
  navTitleActiveClass: string;
  navMetaClass: string;
  contentClass: string;
  contentTopbarClass: string;
  headlineClass: string;
  bodyClass: string;
  heroClass: string;
  heroEyebrowClass: string;
  heroTitleClass: string;
  heroTextClass: string;
  cardClass: string;
  statValueClass: string;
  statLabelClass: string;
  progressTrackClass: string;
  progressFillClass: string;
  chipClass: string;
};

const presets: StylePreset[] = [
  {
    id: "google",
    vendor: "Google",
    title: "Material Workspace",
    summary: "柔和色面、胶囊导航、轻量阴影。",
    note: "适合产品感很强、希望显得友好且稳定的工作台。",
    fontFamily: '"Google Sans Text", "Segoe UI", sans-serif',
    shellClass: "bg-[#f6f8fc]",
    sidebarClass: "w-[272px] border-r border-[#dde3ea] bg-[#eef3fd] px-4 py-4",
    logoClass: "flex h-10 items-center gap-3 rounded-full bg-white px-4 text-[#1f1f1f] shadow-[0_1px_2px_rgba(60,64,67,0.15)]",
    searchClass: "mt-4 flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[#5f6368] shadow-[inset_0_0_0_1px_rgba(95,99,104,0.12)]",
    sectionLabelClass: "mt-6 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#5f6368]",
    navItemClass: "mt-1 flex items-center gap-3 rounded-full px-3 py-2 text-[#3c4043] transition-colors",
    navItemActiveClass: "bg-[#d3e3fd] text-[#0b57d0]",
    navIconClass: "text-[#5f6368]",
    navIconActiveClass: "text-[#0b57d0]",
    navTitleClass: "text-[13px] font-medium",
    navTitleActiveClass: "text-[13px] font-semibold",
    navMetaClass: "ml-auto rounded-full bg-white px-2 py-0.5 text-[10px] text-[#5f6368]",
    contentClass: "flex-1 bg-[#f6f8fc] p-5",
    contentTopbarClass: "flex h-12 items-center justify-between rounded-[24px] bg-white px-5 shadow-[0_1px_2px_rgba(60,64,67,0.12)]",
    headlineClass: "text-[13px] font-semibold text-[#1f1f1f]",
    bodyClass: "text-[12px] text-[#5f6368]",
    heroClass: "mt-5 rounded-[28px] bg-[linear-gradient(135deg,#e8f0fe_0%,#ffffff_100%)] px-7 py-7 shadow-[0_12px_30px_rgba(66,133,244,0.12)]",
    heroEyebrowClass: "text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0b57d0]",
    heroTitleClass: "mt-3 text-[28px] font-semibold tracking-tight text-[#1f1f1f]",
    heroTextClass: "mt-3 max-w-[460px] text-[13px] leading-6 text-[#5f6368]",
    cardClass: "rounded-[24px] bg-white p-5 shadow-[0_1px_2px_rgba(60,64,67,0.1)]",
    statValueClass: "text-[24px] font-semibold text-[#1f1f1f]",
    statLabelClass: "mt-2 text-[11px] uppercase tracking-[0.16em] text-[#5f6368]",
    progressTrackClass: "h-2 rounded-full bg-[#e8eaed]",
    progressFillClass: "h-2 rounded-full bg-[#1a73e8]",
    chipClass: "inline-flex rounded-full bg-[#e8f0fe] px-3 py-1 text-[11px] font-medium text-[#0b57d0]",
  },
  {
    id: "apple",
    vendor: "Apple",
    title: "Glass Sidebar",
    summary: "透明材质、微妙层次、留白驱动。",
    note: "适合高端感和系统级工具，强调材质和静谧气质。",
    fontFamily: '"SF Pro Display", "PingFang SC", sans-serif',
    shellClass: "bg-[linear-gradient(180deg,#f6f6f8_0%,#ececef_100%)]",
    sidebarClass: "w-[264px] border-r border-white/60 bg-white/55 px-4 py-4 backdrop-blur-xl",
    logoClass: "flex h-10 items-center gap-3 rounded-2xl border border-white/70 bg-white/70 px-4 text-[#111111] shadow-[0_10px_24px_rgba(15,23,42,0.08)]",
    searchClass: "mt-4 flex h-10 items-center gap-2 rounded-2xl border border-white/70 bg-white/65 px-4 text-[#6b7280] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]",
    sectionLabelClass: "mt-6 px-2 text-[10px] font-medium uppercase tracking-[0.2em] text-[#8f8f97]",
    navItemClass: "mt-1 flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[#3f3f46] transition-all",
    navItemActiveClass: "bg-white text-[#111111] shadow-[0_10px_30px_rgba(15,23,42,0.08)]",
    navIconClass: "text-[#8f8f97]",
    navIconActiveClass: "text-[#111111]",
    navTitleClass: "text-[13px] font-medium",
    navTitleActiveClass: "text-[13px] font-semibold",
    navMetaClass: "ml-auto rounded-full bg-black/[0.04] px-2 py-0.5 text-[10px] text-[#71717a]",
    contentClass: "flex-1 p-5",
    contentTopbarClass: "flex h-12 items-center justify-between rounded-[22px] border border-white/65 bg-white/70 px-5 backdrop-blur-xl",
    headlineClass: "text-[13px] font-medium text-[#111111]",
    bodyClass: "text-[12px] text-[#71717a]",
    heroClass: "mt-5 rounded-[32px] border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.85),rgba(245,245,247,0.68))] px-7 py-8 shadow-[0_24px_60px_rgba(15,23,42,0.10)]",
    heroEyebrowClass: "text-[11px] font-medium uppercase tracking-[0.2em] text-[#71717a]",
    heroTitleClass: "mt-3 text-[30px] font-semibold tracking-[-0.03em] text-[#111111]",
    heroTextClass: "mt-3 max-w-[480px] text-[13px] leading-6 text-[#71717a]",
    cardClass: "rounded-[28px] border border-white/70 bg-white/70 p-5 shadow-[0_14px_40px_rgba(15,23,42,0.08)]",
    statValueClass: "text-[24px] font-semibold tracking-[-0.03em] text-[#111111]",
    statLabelClass: "mt-2 text-[11px] uppercase tracking-[0.16em] text-[#8f8f97]",
    progressTrackClass: "h-2 rounded-full bg-black/[0.06]",
    progressFillClass: "h-2 rounded-full bg-[#111111]",
    chipClass: "inline-flex rounded-full border border-black/[0.08] bg-white/70 px-3 py-1 text-[11px] font-medium text-[#111111]",
  },
  {
    id: "vercel",
    vendor: "Vercel",
    title: "Monochrome Console",
    summary: "黑白对比、密度更高、轮廓明确。",
    note: "适合工程团队后台，强调克制、精准和执行速度。",
    fontFamily: 'Geist, "SF Pro Display", sans-serif',
    shellClass: "bg-[#0a0a0a]",
    sidebarClass: "w-[256px] border-r border-white/10 bg-[#050505] px-3 py-3 text-white",
    logoClass: "flex h-10 items-center gap-3 border border-white/10 bg-white/[0.03] px-3 text-white",
    searchClass: "mt-4 flex h-10 items-center gap-2 border border-white/10 bg-white/[0.03] px-3 text-white/40",
    sectionLabelClass: "mt-6 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30",
    navItemClass: "mt-1 flex items-center gap-3 px-3 py-2.5 text-white/65 transition-colors",
    navItemActiveClass: "border border-white/12 bg-white/[0.06] text-white",
    navIconClass: "text-white/30",
    navIconActiveClass: "text-white",
    navTitleClass: "text-[12px] font-medium",
    navTitleActiveClass: "text-[12px] font-semibold",
    navMetaClass: "ml-auto border border-white/10 px-2 py-0.5 text-[10px] text-white/40",
    contentClass: "flex-1 bg-[#0a0a0a] p-5 text-white",
    contentTopbarClass: "flex h-12 items-center justify-between border border-white/10 bg-white/[0.02] px-5",
    headlineClass: "text-[13px] font-semibold text-white",
    bodyClass: "text-[12px] text-white/45",
    heroClass: "mt-5 border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_35%),#0f0f0f] px-7 py-7",
    heroEyebrowClass: "text-[10px] font-semibold uppercase tracking-[0.24em] text-white/35",
    heroTitleClass: "mt-3 text-[28px] font-semibold tracking-[-0.04em] text-white",
    heroTextClass: "mt-3 max-w-[460px] text-[13px] leading-6 text-white/55",
    cardClass: "border border-white/10 bg-white/[0.03] p-5",
    statValueClass: "text-[24px] font-semibold text-white",
    statLabelClass: "mt-2 text-[11px] uppercase tracking-[0.16em] text-white/35",
    progressTrackClass: "h-2 bg-white/10",
    progressFillClass: "h-2 bg-white",
    chipClass: "inline-flex border border-white/12 bg-white/[0.03] px-3 py-1 text-[11px] font-medium text-white/70",
  },
  {
    id: "stripe",
    vendor: "Stripe",
    title: "Gradient Ops",
    summary: "浅紫色系统、细边框、金融感分层。",
    note: "适合要同时呈现秩序感和品牌视觉能量的产品。",
    fontFamily: '"Soehne", "Helvetica Neue", sans-serif',
    shellClass: "bg-[linear-gradient(180deg,#f7f5ff_0%,#f5f7ff_100%)]",
    sidebarClass: "w-[264px] border-r border-[#ddd6fe] bg-[linear-gradient(180deg,#f5f3ff_0%,#eef2ff_100%)] px-4 py-4",
    logoClass: "flex h-10 items-center gap-3 rounded-2xl bg-[#635bff] px-4 text-white shadow-[0_16px_40px_rgba(99,91,255,0.22)]",
    searchClass: "mt-4 flex h-10 items-center gap-2 rounded-2xl border border-[#ddd6fe] bg-white/80 px-4 text-[#7c3aed]",
    sectionLabelClass: "mt-6 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7c3aed]",
    navItemClass: "mt-1 flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[#4c1d95] transition-all",
    navItemActiveClass: "bg-white text-[#4338ca] shadow-[0_12px_26px_rgba(99,91,255,0.16)]",
    navIconClass: "text-[#8b5cf6]",
    navIconActiveClass: "text-[#4338ca]",
    navTitleClass: "text-[13px] font-medium",
    navTitleActiveClass: "text-[13px] font-semibold",
    navMetaClass: "ml-auto rounded-full bg-[#ede9fe] px-2 py-0.5 text-[10px] text-[#6d28d9]",
    contentClass: "flex-1 p-5",
    contentTopbarClass: "flex h-12 items-center justify-between rounded-[22px] border border-[#ddd6fe] bg-white/80 px-5",
    headlineClass: "text-[13px] font-semibold text-[#312e81]",
    bodyClass: "text-[12px] text-[#6b7280]",
    heroClass: "mt-5 rounded-[30px] bg-[linear-gradient(135deg,#ffffff_0%,#ede9fe_45%,#dbeafe_100%)] px-7 py-8 shadow-[0_24px_60px_rgba(99,91,255,0.15)]",
    heroEyebrowClass: "text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6d28d9]",
    heroTitleClass: "mt-3 text-[29px] font-semibold tracking-[-0.03em] text-[#312e81]",
    heroTextClass: "mt-3 max-w-[460px] text-[13px] leading-6 text-[#6b7280]",
    cardClass: "rounded-[24px] border border-[#ddd6fe] bg-white/85 p-5 shadow-[0_12px_24px_rgba(99,91,255,0.10)]",
    statValueClass: "text-[24px] font-semibold text-[#312e81]",
    statLabelClass: "mt-2 text-[11px] uppercase tracking-[0.16em] text-[#7c3aed]",
    progressTrackClass: "h-2 rounded-full bg-[#e9d5ff]",
    progressFillClass: "h-2 rounded-full bg-[linear-gradient(90deg,#635bff,#0ea5e9)]",
    chipClass: "inline-flex rounded-full bg-[#ede9fe] px-3 py-1 text-[11px] font-medium text-[#5b21b6]",
  },
  {
    id: "notion",
    vendor: "Notion",
    title: "Editorial Sidebar",
    summary: "米白底色、弱化装饰、内容优先。",
    note: "适合需要长时间阅读和信息组织的工作台。",
    fontFamily: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    shellClass: "bg-[#f7f6f3]",
    sidebarClass: "w-[252px] border-r border-[#e7e5e4] bg-[#fbfbfa] px-3 py-3",
    logoClass: "flex h-10 items-center gap-3 rounded-xl px-3 text-[#191919]",
    searchClass: "mt-4 flex h-9 items-center gap-2 rounded-xl bg-[#f1f1ef] px-3 text-[#78716c]",
    sectionLabelClass: "mt-6 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a8a29e]",
    navItemClass: "mt-1 flex items-center gap-3 rounded-xl px-3 py-2 text-[#44403c] transition-colors",
    navItemActiveClass: "bg-[#f1f1ef] text-[#191919]",
    navIconClass: "text-[#a8a29e]",
    navIconActiveClass: "text-[#191919]",
    navTitleClass: "text-[13px] font-medium",
    navTitleActiveClass: "text-[13px] font-medium",
    navMetaClass: "ml-auto text-[10px] text-[#a8a29e]",
    contentClass: "flex-1 bg-[#ffffff] p-6",
    contentTopbarClass: "flex h-12 items-center justify-between border-b border-[#f1f1ef] px-1",
    headlineClass: "text-[13px] font-medium text-[#191919]",
    bodyClass: "text-[12px] text-[#78716c]",
    heroClass: "mt-6 border-b border-[#e7e5e4] pb-7",
    heroEyebrowClass: "text-[11px] font-semibold uppercase tracking-[0.18em] text-[#a8a29e]",
    heroTitleClass: "mt-3 text-[31px] font-semibold tracking-[-0.04em] text-[#191919]",
    heroTextClass: "mt-3 max-w-[500px] text-[14px] leading-7 text-[#57534e]",
    cardClass: "rounded-2xl border border-[#f1f1ef] bg-[#fcfcfb] p-5",
    statValueClass: "text-[24px] font-semibold text-[#191919]",
    statLabelClass: "mt-2 text-[11px] uppercase tracking-[0.14em] text-[#a8a29e]",
    progressTrackClass: "h-2 rounded-full bg-[#ecebe7]",
    progressFillClass: "h-2 rounded-full bg-[#191919]",
    chipClass: "inline-flex rounded-full bg-[#f1f1ef] px-3 py-1 text-[11px] font-medium text-[#44403c]",
  },
  {
    id: "linear",
    vendor: "Linear",
    title: "Precision Dark",
    summary: "深色精密面板、细线边框、紫色强调。",
    note: "适合开发者工具和高密度生产力界面。",
    fontFamily: '"Circular", "SF Pro Display", sans-serif',
    shellClass: "bg-[linear-gradient(180deg,#0f0f14_0%,#09090d_100%)]",
    sidebarClass: "w-[260px] border-r border-white/8 bg-[#0d0d12] px-3 py-3 text-white",
    logoClass: "flex h-10 items-center gap-3 rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] px-3 text-white",
    searchClass: "mt-4 flex h-10 items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.03] px-3 text-white/35",
    sectionLabelClass: "mt-6 px-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/25",
    navItemClass: "mt-1 flex items-center gap-3 rounded-2xl px-3 py-2.5 text-white/55 transition-all",
    navItemActiveClass: "border border-[#5e6ad2]/30 bg-[#5e6ad2]/12 text-white shadow-[0_0_0_1px_rgba(94,106,210,0.10)]",
    navIconClass: "text-white/25",
    navIconActiveClass: "text-[#9aa5ff]",
    navTitleClass: "text-[12px] font-medium",
    navTitleActiveClass: "text-[12px] font-semibold",
    navMetaClass: "ml-auto rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/35",
    contentClass: "flex-1 p-5 text-white",
    contentTopbarClass: "flex h-12 items-center justify-between rounded-[20px] border border-white/8 bg-white/[0.03] px-5",
    headlineClass: "text-[13px] font-semibold text-white",
    bodyClass: "text-[12px] text-white/45",
    heroClass: "mt-5 rounded-[28px] border border-white/8 bg-[radial-gradient(circle_at_top_right,rgba(94,106,210,0.22),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] px-7 py-7 shadow-[0_30px_80px_rgba(0,0,0,0.45)]",
    heroEyebrowClass: "text-[10px] font-semibold uppercase tracking-[0.24em] text-[#9aa5ff]",
    heroTitleClass: "mt-3 text-[28px] font-semibold tracking-[-0.04em] text-white",
    heroTextClass: "mt-3 max-w-[460px] text-[13px] leading-6 text-white/55",
    cardClass: "rounded-[24px] border border-white/8 bg-white/[0.03] p-5",
    statValueClass: "text-[24px] font-semibold text-white",
    statLabelClass: "mt-2 text-[11px] uppercase tracking-[0.16em] text-white/35",
    progressTrackClass: "h-2 rounded-full bg-white/10",
    progressFillClass: "h-2 rounded-full bg-[linear-gradient(90deg,#5e6ad2,#9aa5ff)]",
    chipClass: "inline-flex rounded-full border border-[#5e6ad2]/30 bg-[#5e6ad2]/12 px-3 py-1 text-[11px] font-medium text-[#c7ceff]",
  },
];

const selectedPresetId = ref("google");

const selectedPreset = computed<StylePreset>(() => {
  const matchedPreset = presets.find((preset) => preset.id === selectedPresetId.value);
  return matchedPreset ?? presets[0]!;
});

const navGroups = [
  {
    label: "Workspace",
    items: [
      { label: "Overview", meta: "12", icon: LayoutGrid },
      { label: "Projects", meta: "4", icon: FolderKanban },
      { label: "Search", meta: "K", icon: Search },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Releases", meta: "3", icon: Sparkles },
      { label: "Alerts", meta: "2", icon: Bell },
      { label: "Support", meta: "?", icon: CircleHelp },
    ],
  },
];

const sessions = ref<SessionDraft[]>([
  {
    id: "s-001",
    title: "输入区布局重构：对齐与留白",
    preview: "把输入区的主次层级拆成 3 层，让操作按钮退后，文本先被看见。",
    updatedAt: "2分钟前",
    pinned: true,
    tag: "ui",
  },
  {
    id: "s-002",
    title: "会话树交互节奏梳理",
    preview: "展开层级时保持固定缩进与文字灰度变化，避免动画抢戏。",
    updatedAt: "10分钟前",
    tag: "research",
  },
  {
    id: "s-003",
    title: "插件渲染协议草案",
    preview: "只保留 SDK 接入路径，去掉中间态桥接方案，统一入口。",
    updatedAt: "27分钟前",
    tag: "spec",
  },
  {
    id: "s-004",
    title: "Agent 能力边界文档",
    preview: "划清工具调用与 UI 渲染责任，前端只消费结构化事件。",
    updatedAt: "1小时前",
    tag: "agent",
  },
  {
    id: "s-005",
    title: "工作台主题资产清单",
    preview: "定义基础 token 与品牌 token，避免颜色在业务组件里散落。",
    updatedAt: "3小时前",
    tag: "ui",
  },
]);

const activeSessionId = ref("s-001");
const activeSession = computed(
  () =>
    sessions.value.find((session) => session.id === activeSessionId.value) ??
    sessions.value[0],
);

const statCards = [
  { value: "24.8k", label: "活跃工作项" },
  { value: "98.4%", label: "发布成功率" },
  { value: "6.2m", label: "平均响应时间" },
];
</script>

<template>
  <div class="flex h-full bg-background">
    <aside class="flex w-[308px] shrink-0 flex-col border-r bg-background">
      <div class="border-b px-6 py-6">
        <p class="text-[10px] font-black uppercase tracking-[0.22em] text-foreground/35">
          Vendor Sidebar Library
        </p>
        <h1 class="mt-3 text-[28px] font-semibold tracking-tight text-foreground">
          六个厂商方向
        </h1>
        <p class="mt-3 max-w-[240px] text-[13px] leading-6 text-muted-foreground">
          左侧只负责选方案，右侧只负责看预览。现在保留六个厂商参考，不再展示旧的概念组件。
        </p>
      </div>

      <div class="flex-1 overflow-y-auto px-3 py-3">
        <button
          v-for="preset in presets"
          :key="preset.id"
          type="button"
          class="mb-2 w-full border px-4 py-4 text-left transition-colors"
          :class="
            selectedPresetId === preset.id
              ? 'border-foreground bg-accent'
              : 'border-border bg-background hover:bg-muted/40'
          "
          @click="selectedPresetId = preset.id"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-[10px] font-black uppercase tracking-[0.22em] text-foreground/35">
                {{ preset.vendor }}
              </p>
              <h2 class="mt-2 text-[16px] font-semibold tracking-tight text-foreground">
                {{ preset.title }}
              </h2>
            </div>
            <ChevronRight
              class="mt-1 size-4 shrink-0"
              :class="selectedPresetId === preset.id ? 'text-foreground' : 'text-foreground/25'"
            />
          </div>
          <p class="mt-3 text-[12px] leading-5 text-muted-foreground">
            {{ preset.summary }}
          </p>
        </button>
      </div>
    </aside>

    <section class="flex-1 overflow-auto bg-[linear-gradient(180deg,rgba(15,23,42,0.02),transparent)] p-8 xl:p-10">
      <div class="mx-auto max-w-[1180px] space-y-6">
        <div>
          <p class="text-[10px] font-black uppercase tracking-[0.22em] text-foreground/35">
            {{ selectedPreset.vendor }} Inspired
          </p>
          <div class="mt-3 flex items-end justify-between gap-6">
            <div>
              <h2 class="text-[34px] font-semibold tracking-tight text-foreground">
                {{ selectedPreset.title }}
              </h2>
              <p class="mt-3 max-w-[640px] text-[14px] leading-7 text-muted-foreground">
                {{ selectedPreset.note }}
              </p>
            </div>
            <span class="hidden border px-3 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-foreground/35 lg:inline-flex">
              Sidebar Preview Only
            </span>
          </div>
        </div>

        <div class="overflow-hidden border bg-background shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <div class="flex min-h-[760px]" :class="selectedPreset.shellClass" :style="{ fontFamily: selectedPreset.fontFamily }">
            <div :class="selectedPreset.sidebarClass">
              <div :class="selectedPreset.logoClass">
                <Command class="size-4" />
                <div>
                  <p class="text-[11px] font-semibold tracking-tight">{{ selectedPreset.vendor }}</p>
                  <p class="text-[10px] opacity-60">Sidebar System</p>
                </div>
              </div>

              <div :class="selectedPreset.searchClass">
                <Search class="size-4" />
                <span class="text-[12px]">Search workspace</span>
              </div>

              <!-- Editorial Style Session List -->
              <div 
                v-if="selectedPreset.id === 'notion'"
                class="flex-1 mt-6 overflow-hidden flex flex-col min-h-0"
              >
                <div class="px-2 mb-2 flex items-center justify-between">
                  <p :class="selectedPreset.sectionLabelClass" class="mt-0">RECENT SESSIONS</p>
                  <button class="text-[10px] text-[#a8a29e] hover:text-[#191919]">Clear All</button>
                </div>
                <div class="flex-1 overflow-y-auto">
                  <EditorialSessionList 
                    :sessions="sessions" 
                    :active-id="activeSessionId"
                    @select="id => activeSessionId = id"
                  />
                </div>
              </div>

              <div v-else class="flex flex-col gap-1">
                <div v-for="group in navGroups" :key="group.label">
                  <p :class="selectedPreset.sectionLabelClass">
                    {{ group.label }}
                  </p>

                  <button
                    v-for="item in group.items"
                    :key="item.label"
                    type="button"
                    :class="[
                      selectedPreset.navItemClass,
                      item.label === 'Projects' ? selectedPreset.navItemActiveClass : ''
                    ]"
                  >
                    <component
                      :is="item.icon"
                      class="size-4 shrink-0"
                      :class="item.label === 'Projects' ? selectedPreset.navIconActiveClass : selectedPreset.navIconClass"
                    />
                    <span :class="item.label === 'Projects' ? selectedPreset.navTitleActiveClass : selectedPreset.navTitleClass">
                      {{ item.label }}
                    </span>
                    <span :class="selectedPreset.navMetaClass">
                      {{ item.meta }}
                    </span>
                  </button>
                </div>
              </div>

              <div class="mt-8 border-t border-current/10 pt-5">
                <p :class="selectedPreset.sectionLabelClass" class="mt-0">
                  Highlights
                </p>
                <div class="mt-3 flex flex-wrap gap-2 px-1">
                  <span :class="selectedPreset.chipClass">Design QA</span>
                  <span :class="selectedPreset.chipClass">Nav Audit</span>
                </div>
              </div>
            </div>

            <div :class="selectedPreset.contentClass">
              <div :class="selectedPreset.contentTopbarClass">
                <div>
                  <p :class="selectedPreset.headlineClass">Workspace Overview</p>
                  <p :class="selectedPreset.bodyClass">Preview shell for navigation comparison</p>
                </div>
                <span :class="selectedPreset.chipClass">Preview Mode</span>
              </div>

              <div :class="selectedPreset.heroClass">
                <div class="flex items-center gap-2">
                  <p :class="selectedPreset.heroEyebrowClass">Navigation Reference</p>
                  <span v-if="selectedPreset.id === 'notion' && activeSession" class="text-[10px] font-bold text-[#a8a29e] uppercase tracking-widest border px-1.5 rounded ml-auto">
                    {{ activeSession.tag }}
                  </span>
                </div>
                <h3 :class="selectedPreset.heroTitleClass">
                  {{ selectedPreset.id === 'notion' && activeSession ? activeSession.title : '用厂商语言对比侧栏气质与信息层级。' }}
                </h3>
                <p :class="selectedPreset.heroTextClass">
                  {{ selectedPreset.id === 'notion' && activeSession ? activeSession.preview : '同一套信息结构，通过不同厂商的品牌语法、面板层次、选中态和色彩策略，呈现完全不同的产品气质。' }}
                </p>

                <div class="mt-5 flex flex-wrap gap-2">
                  <span :class="selectedPreset.chipClass">
                    <Clock3 class="size-3 mr-1 inline-block" />
                    {{ selectedPreset.id === 'notion' && activeSession ? activeSession.updatedAt : 'Realtime' }}
                  </span>
                  <span v-if="selectedPreset.id === 'notion' && activeSession?.pinned" :class="selectedPreset.chipClass">
                    <Pin class="size-3 mr-1 inline-block" />
                    Pinned
                  </span>
                  <span :class="selectedPreset.chipClass">{{ selectedPreset.vendor }}</span>
                </div>
              </div>

              <div class="mt-5 grid gap-4 lg:grid-cols-3">
                <div v-for="card in statCards" :key="card.label" :class="selectedPreset.cardClass">
                  <p :class="selectedPreset.statValueClass">{{ card.value }}</p>
                  <p :class="selectedPreset.statLabelClass">{{ card.label }}</p>
                  <div class="mt-4" :class="selectedPreset.progressTrackClass">
                    <div class="w-2/3" :class="selectedPreset.progressFillClass" />
                  </div>
                </div>
              </div>

              <div class="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <div :class="selectedPreset.cardClass">
                  <div class="flex items-center justify-between">
                    <p :class="selectedPreset.headlineClass">Active Modules</p>
                    <Boxes class="size-4 opacity-40" />
                  </div>
                  <div class="mt-4 space-y-3">
                    <div class="flex items-center justify-between border-b border-current/10 pb-3">
                      <div>
                        <p :class="selectedPreset.headlineClass">Workbench</p>
                        <p :class="selectedPreset.bodyClass">主工作区与会话联动</p>
                      </div>
                      <BadgeCheck class="size-4 opacity-60" />
                    </div>
                    <div class="flex items-center justify-between border-b border-current/10 pb-3">
                      <div>
                        <p :class="selectedPreset.headlineClass">Theme Tokens</p>
                        <p :class="selectedPreset.bodyClass">亮暗模式与品牌实验</p>
                      </div>
                      <Star class="size-4 opacity-60" />
                    </div>
                    <div class="flex items-center justify-between">
                      <div>
                        <p :class="selectedPreset.headlineClass">Extension Hooks</p>
                        <p :class="selectedPreset.bodyClass">插件入口和自定义渲染</p>
                      </div>
                      <Sparkles class="size-4 opacity-60" />
                    </div>
                  </div>
                </div>

                <div :class="selectedPreset.cardClass">
                  <p :class="selectedPreset.headlineClass">Design Summary</p>
                  <p class="mt-3" :class="selectedPreset.bodyClass">
                    {{ selectedPreset.summary }}
                  </p>
                  <div class="mt-5 space-y-3">
                    <div>
                      <p :class="selectedPreset.statLabelClass">Vendor Cue</p>
                      <p class="mt-1" :class="selectedPreset.headlineClass">{{ selectedPreset.vendor }}</p>
                    </div>
                    <div>
                      <p :class="selectedPreset.statLabelClass">Navigation Focus</p>
                      <p class="mt-1" :class="selectedPreset.headlineClass">Projects as active state</p>
                    </div>
                    <div>
                      <p :class="selectedPreset.statLabelClass">Usage Fit</p>
                      <p class="mt-1" :class="selectedPreset.bodyClass">适合作为你后续全站侧栏重构的参考母版。</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>