import { createRouter, createWebHistory } from "vue-router";

import PlatformShell from "@/layouts/PlatformShell.vue";
import NotFoundPage from "@/pages/NotFoundPage.vue";
import SessionDetailPage from "@/pages/SessionDetailPage.vue";
import SettingsPage from "@/pages/SettingsPage.vue";
import ThemesPage from "@/pages/ThemesPage.vue";
import WorkbenchPage from "@/pages/WorkbenchPage.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      component: PlatformShell,
      children: [
        {
          path: "",
          name: "workbench",
          component: WorkbenchPage,
          meta: {
            title: "工作台",
            description: "左侧会话、中间对话与右侧文件树的主工作区。",
          },
        },
        {
          path: "settings",
          name: "settings",
          component: SettingsPage,
          meta: {
            title: "系统设置",
            description: "查看运行态摘要、导航入口和平台设置扩展位。",
          },
        },
        {
          path: "themes",
          name: "themes",
          component: ThemesPage,
          meta: {
            title: "主题实验室",
            description: "管理主题 token 与明暗模式，直接作用到整个工作台。",
          },
        },
        {
          path: "sessions/:sessionId",
          name: "session-detail",
          component: SessionDetailPage,
          meta: {
            title: "会话详情",
            description: "聚焦单个会话的消息流、目录上下文与运行配置。",
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