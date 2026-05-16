import { createRouter, createWebHistory } from "vue-router";
import { mobileRoutes } from "@/router/routes";

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: mobileRoutes,
});
