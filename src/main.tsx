import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import posthog from "posthog-js";
import { PostHogProvider } from 'posthog-js/react';
import App from "./App.tsx";
import "./index.css";

// Initialize PostHog Analytics
const posthogKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
const posthogHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com';

if (posthogKey) {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,
    // Disable in development (unless explicitly enabled for testing)
    loaded: (posthogInstance) => {
      // Make PostHog available globally on window
      (window as any).posthog = posthogInstance;
      
      if (import.meta.env.DEV && !import.meta.env.VITE_POSTHOG_DEBUG) {
        posthogInstance.opt_out_capturing();
      }
      
      // Debug logging
      console.log('🔍 PostHog Loaded & Available:', {
        keyPresent: !!posthogKey,
        host: posthogHost,
        isDev: import.meta.env.DEV,
        debugFlag: import.meta.env.VITE_POSTHOG_DEBUG,
        isOptedOut: posthogInstance.has_opted_out_capturing(),
        windowPosthogAvailable: !!(window as any).posthog,
        posthogType: typeof posthogInstance
      });
      
      // Enable verbose PostHog logging
      if (import.meta.env.VITE_POSTHOG_DEBUG) {
        posthogInstance.debug();
      }
    }
  });
}

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
