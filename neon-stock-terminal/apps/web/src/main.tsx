import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthGateProvider } from "./auth/AuthGateProvider";
import { LocaleProvider } from "./i18n/LocaleProvider";
import { analytics } from "./analytics";
import { applyFontMode, readFontMode } from "./lib/fontMode";
import "./styles/global.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false
    }
  }
});

function resolveRouterBasename(): string {
  return import.meta.env.BASE_URL || "/";
}

if (typeof window !== "undefined") {
  applyFontMode(readFontMode());
  analytics.init();
  window.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={resolveRouterBasename()}>
        <AuthGateProvider>
          <LocaleProvider>
            <App />
          </LocaleProvider>
        </AuthGateProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
