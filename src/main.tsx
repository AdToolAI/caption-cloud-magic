import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import posthog from "posthog-js";
import App from "./App.tsx";
import "./index.css";

// Initialize PostHog Analytics
const posthogKey = import.meta.env.VITE_POSTHOG_API_KEY;
if (posthogKey) {
  posthog.init(posthogKey, {
    api_host: 'https://app.posthog.com',
    // Disable in development
    loaded: (posthog) => {
      if (import.meta.env.DEV) posthog.opt_out_capturing();
    }
  });
}

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Silently fail if service worker registration fails
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
