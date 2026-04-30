import { createRouter, createWebHistory } from "vue-router";
import NotFoundPage from "@/pages/NotFoundPage.vue";
import WorkspacePage from "@/pages/WorkspacePage.vue";

const router = createRouter({
	history: createWebHistory(),
	routes: [
		{
			path: "/",
			name: "workspace",
			component: WorkspacePage,
			meta: {
				title: "工作空间",
				description: "个人内容平台：笔记、待办、日历、白板、数据库。",
			},
		},
		{
			path: "/:pathMatch(.*)*",
			name: "not-found",
			component: NotFoundPage,
		},
	],
});

export default router;
