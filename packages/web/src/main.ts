import { createApp } from "vue";
import { createPinia } from "pinia";
import "./style.css";
import App from "./App.vue";
import { initializeThemeSystem } from "./lib/theme";
import router from "./router";
import { useSettingsStore } from "./stores/settings";
import { useFavoritesStore } from "./stores/favorites";

async function initialize() {
  initializeThemeSystem();

  const app = createApp(App);
  const pinia = createPinia();

  app.use(pinia);
  app.use(router);

  const settingsStore = useSettingsStore();
  const favoritesStore = useFavoritesStore();

  await Promise.all([settingsStore.load(), favoritesStore.load()]);

  app.mount("#app");
}

initialize();
