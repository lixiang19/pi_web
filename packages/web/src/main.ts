import { createApp } from "vue";
import "./style.css";
import App from "./App.vue";
import { initializeThemeSystem } from "./lib/theme";
import router from "./router";

initializeThemeSystem();

const app = createApp(App);

app.use(router);
app.mount("#app");
