import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import posthog from "posthog-js";
import { PostHogProvider } from 'posthog-js/react';
import App from "./App.tsx";
import "./index.css";

// Initialize PostHog
const posthogKey = 'phc_ckHbHYgHPy5bQuaVlkHzA9Cjt7Ip3wJDVsyUL5AHGq7';
const posthogHost = 'https://eu.i.posthog.com';

posthog.init(posthogKey, {
  api_host: posthogHost,
  autocapture: true,
  capture_pageview: true,
  capture_pageleave: true,
});

// Opt-out only on localhost
if (window.location.hostname === 'localhost') {
  posthog.opt_out_capturing();
  console.log('📊 PostHog: Deactivated on localhost');
} else {
  console.log('📊 PostHog: Active on', window.location.hostname);
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
