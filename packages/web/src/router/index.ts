import { createRouter, createWebHistory } from "vue-router";

import PlatformShell from "@/layouts/PlatformShell.vue";
import NotFoundPage from "@/pages/NotFoundPage.vue";
import SessionDetailPage from "@/pages/SessionDetailPage.vue";
import SettingsPage from "@/pages/SettingsPage.vue";
import WorkbenchPage from "@/pages/WorkbenchPage.vue";
import DesignLabPage from "@/pages/DesignLabPage.vue";

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
          path: "design",
          name: "design",
          component: DesignLabPage,
          meta: {
            title: "界面设计",
            description: "界面概念实验室与组件研究。",
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