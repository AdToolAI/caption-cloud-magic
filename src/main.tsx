import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { PostHogProvider } from 'posthog-js/react';
import App from "./App.tsx";
import "./index.css";

// PostHog is loaded via CDN in index.html
// Access it via window.posthog
const posthog = (window as any).posthog;

// Register service worker for PWA
// Temporarily disabled for debugging
/*
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Silently fail if service worker registration fails
    });
  });
}
*/

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <PostHogProvider client={posthog}>
      <App />
    </PostHogProvider>
  </HelmetProvider>
);
