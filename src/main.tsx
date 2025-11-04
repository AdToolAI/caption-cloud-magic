import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import posthog from "posthog-js";
import { PostHogProvider } from 'posthog-js/react';
import App from "./App.tsx";
import "./index.css";

// Initialize PostHog via npm (avoids CORS issues with CDN)
const posthogKey = 'phc_ckHbHYgHPy5bQuaVlkHzA9Cjt7Ip3wJDVsyUL5AHGq7';
const posthogHost = 'https://eu.i.posthog.com';

posthog.init(posthogKey, {
  api_host: posthogHost,
  autocapture: true,
  capture_pageview: true,
  capture_pageleave: true,
});

// Opt-out in development
if (window.location.hostname === 'localhost' || window.location.hostname.includes('lovableproject.com')) {
  posthog.opt_out_capturing();
  console.log('🔍 PostHog: Opted out in development');
}

// CRITICAL FIX: Make PostHog globally available
(window as any).posthog = posthog;

// Re-attach PostHog to window every 100ms to prevent HMR from removing it
setInterval(() => {
  if (!(window as any).posthog || typeof (window as any).posthog.capture !== 'function') {
    (window as any).posthog = posthog;
    console.log('✅ PostHog re-attached to window');
  }
}, 100);

console.log('🔍 PostHog Initialized:', {
  windowPosthogAvailable: !!(window as any).posthog,
  posthogType: typeof posthog,
  captureExists: typeof posthog.capture === 'function'
});

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
