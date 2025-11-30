import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import posthog from "posthog-js";
import { PostHogProvider } from 'posthog-js/react';
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";

// Initialize Sentry
Sentry.init({
  dsn: "https://107ea857a2b43472c3c60ae6da9829b5e@o4510408780480512.ingest.de.sentry.io/4510408787886160",
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: false,
      blockAllMedia: false,
    }),
  ],
  // Performance Monitoring
  tracesSampleRate: 0.1,
  // Session Replay
  replaysSessionSampleRate: 0.02,
  replaysOnErrorSampleRate: 1.0,
  // Environment
  environment: window.location.hostname === 'localhost' ? 'development' : 'production',
  // PostHog Integration
  beforeSend(event, hint) {
    // Add PostHog distinct_id to Sentry events
    if (posthog) {
      event.user = {
        ...event.user,
        id: posthog.get_distinct_id(),
      };
    }
    return event;
  },
});

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
} else {
  posthog.opt_in_capturing();
}

// Link PostHog to Sentry
if (posthog) {
  Sentry.setUser({
    id: posthog.get_distinct_id(),
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
  <Sentry.ErrorBoundary fallback={<div>An error has occurred</div>}>
    <HelmetProvider>
      <PostHogProvider client={posthog}>
        <App />
      </PostHogProvider>
    </HelmetProvider>
  </Sentry.ErrorBoundary>
);
