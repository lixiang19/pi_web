import { createApp } from "vue";
import App from "@/app/App.vue";
import { router } from "@/router";
import { initializeMobileTheme } from "@/theme/mobile-theme";
import "@/style.css";

initializeMobileTheme();

createApp(App).use(router).mount("#app");
