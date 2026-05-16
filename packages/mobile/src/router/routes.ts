import type { Component } from "vue";
import { Camera, MessageCircle, Settings, SquareCheckBig } from "lucide-vue-next";
import CapturePage from "@/features/capture/CapturePage.vue";
import ChatPage from "@/features/chat/ChatPage.vue";
import SettingsPage from "@/features/settings/SettingsPage.vue";
import TasksPage from "@/features/tasks/TasksPage.vue";

export type MobileRouteName = "capture" | "chat" | "tasks" | "settings";

export interface MobileRouteDefinition {
  path: string;
  name: MobileRouteName;
  label: string;
  component: Component;
}

export interface MainNavItem {
  routeName: Exclude<MobileRouteName, "settings">;
  label: string;
  icon: Component;
}

export const mobileRoutes: MobileRouteDefinition[] = [
  {
    path: "/",
    name: "capture",
    label: "捕捉",
    component: CapturePage,
  },
  {
    path: "/chat",
    name: "chat",
    label: "对话",
    component: ChatPage,
  },
  {
    path: "/tasks",
    name: "tasks",
    label: "任务",
    component: TasksPage,
  },
  {
    path: "/settings",
    name: "settings",
    label: "设置",
    component: SettingsPage,
  },
];

export const mainNavItems: MainNavItem[] = [
  {
    routeName: "capture",
    label: "捕捉",
    icon: Camera,
  },
  {
    routeName: "chat",
    label: "对话",
    icon: MessageCircle,
  },
  {
    routeName: "tasks",
    label: "任务",
    icon: SquareCheckBig,
  },
];

export const settingsNavItem = {
  routeName: "settings" as const,
  label: "设置",
  icon: Settings,
};
