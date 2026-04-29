import { createRouter, createWebHistory } from "vue-router";

import PlatformShell from "@/layouts/PlatformShell.vue";
import AutomationsPage from "@/pages/AutomationsPage.vue";
import DatasetsPage from "@/pages/DatasetsPage.vue";
import NotFoundPage from "@/pages/NotFoundPage.vue";
import SearchPage from "@/pages/SearchPage.vue";
import SettingsPage from "@/pages/SettingsPage.vue";
import SpacesPage from "@/pages/SpacesPage.vue";
import TerminalPage from "@/pages/TerminalPage.vue";
import WorkbenchPage from "@/pages/WorkbenchPage.vue";
import WorkspacePage from "@/pages/WorkspacePage.vue";

const router = createRouter({
	history: createWebHistory(),
	routes: [
		{
			path: "/",
			component: PlatformShell,
			children: [
				{
					path: "",
					redirect: { name: "chat" },
				},
				{
					path: "chat",
					name: "chat",
					component: WorkbenchPage,
					meta: {
						title: "会话",
						description: "左侧统一导航下的会话工作台。",
					},
				},
				{
					path: "search",
					name: "search",
					component: SearchPage,
					meta: {
						title: "搜索",
						description: "统一搜索入口。",
					},
				},
				{
					path: "workspace",
					name: "workspace",
					component: WorkspacePage,
					meta: {
						title: "工作空间",
						description: "个人内容平台：笔记、待办、日历、白板、数据库。",
					},
				},
				{
					path: "terminal",
					name: "terminal",
					component: TerminalPage,
					meta: {
						title: "终端",
						description: "终端能力主路由。",
					},
				},
				{
					path: "automations",
					name: "automations",
					component: AutomationsPage,
					meta: {
						title: "自动化",
						description: "自动化与周期任务入口。",
					},
				},
				{
					path: "datasets",
					name: "datasets",
					component: DatasetsPage,
					meta: {
						title: "数据集",
						description: "数据集能力主路由。",
					},
				},
				{
					path: "spaces",
					name: "spaces",
					component: SpacesPage,
					meta: {
						title: "空间",
						description: "空间协作与资源组织入口。",
					},
				},
				{
					path: "settings",
					name: "settings",
					component: SettingsPage,
					meta: {
						title: "系统设置",
						description: "工作台外观、主题和其他配置选项。",
					},
				},
			],
		},
		{
			path: "/:pathMatch(.*)*",
			name: "not-found",
			component: NotFoundPage,
		},
	],
});

export default router;
