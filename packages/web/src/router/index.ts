import { createRouter, createWebHistory } from "vue-router";
import { ensureAuthSession } from "@/lib/auth";
import LoginPage from "@/pages/LoginPage.vue";
import NotFoundPage from "@/pages/NotFoundPage.vue";
import WorkspacePage from "@/pages/WorkspacePage.vue";
const router = createRouter({
 history: createWebHistory(),
 routes: [
  {
   path: "/login",
   name: "login",
   component: LoginPage,
   meta: {
    title: "登录",
   },
  },
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

router.beforeEach(async (to) => {
	const authenticated = await ensureAuthSession();
	if (to.name === "login") {
		return authenticated ? { name: "workspace" } : true;
	}
	if (!authenticated) {
		return { name: "login", query: { redirect: to.fullPath } };
	}
	return true;
});

export default router;
