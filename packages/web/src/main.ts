import { createApp } from "vue";
import "./style.css";
import App from "./App.vue";
import { initializeThemeSystem } from "./lib/theme";

initializeThemeSystem();
createApp(App).mount("#app");
