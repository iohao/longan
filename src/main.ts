import { createApp } from "vue";
import App from "./App.vue";
import { pinia } from "./stores";
import { router } from "./router";
import { i18n, initializeLanguage } from "./i18n";
import { initTheme } from "./utils/theme";
import "./assets/main.css";

const app = createApp(App);

app.use(pinia);
app.use(router);
app.use(i18n);

initTheme();
void initializeLanguage();

app.mount("#app");
