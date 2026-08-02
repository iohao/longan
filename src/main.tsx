import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initializeLanguage } from "./i18n";
import "./App.css";
import AppErrorBoundary from "./components/AppErrorBoundary";
import { installGlobalErrorLogging } from "./logging";

installGlobalErrorLogging();

void initializeLanguage().finally(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </React.StrictMode>,
  );
});
