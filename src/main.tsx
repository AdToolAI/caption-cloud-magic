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

// CRITICAL FIX: Make window.posthog IMMUTABLE with multiple strategies
try {
  // Strategy 1: Direct assignment first
  (window as any).posthog = posthog;
  
  // Strategy 2: Object.defineProperty for immutability
  Object.defineProperty(window, 'posthog', {
    value: posthog,
    writable: false,
    configurable: false,
    enumerable: true
  });
  
  console.log('✅ PostHog attached to window (immutable)');
  console.log('🔍 Immediate verification:', {
    windowPosthog: (window as any).posthog,
    typeOf: typeof (window as any).posthog,
    hasCapture: typeof (window as any).posthog?.capture === 'function'
  });
} catch (error) {
  console.error('❌ Failed to attach PostHog to window:', error);
  // Fallback: simple assignment
  (window as any).posthog = posthog;
  console.log('⚠️ Fallback: PostHog attached without immutability');
}

// Additional verification after a short delay (to catch HMR issues)
setTimeout(() => {
  console.log('🔍 Delayed verification (100ms):', {
    windowPosthog: typeof (window as any).posthog,
    isUndefined: (window as any).posthog === undefined,
    hasCapture: typeof (window as any).posthog?.capture === 'function'
  });
  
  // If undefined, re-attach
  if (!(window as any).posthog) {
    console.warn('⚠️ PostHog was removed! Re-attaching...');
    (window as any).posthog = posthog;
  }
}, 100);

// Continuous monitoring
setInterval(() => {
  if (!(window as any).posthog || typeof (window as any).posthog.capture !== 'function') {
    console.warn('⚠️ PostHog monitoring: Re-attaching PostHog to window');
    (window as any).posthog = posthog;
  }
}, 500);

console.log('🔍 PostHog Verification:', {
  windowPosthogType: typeof (window as any).posthog,
  windowPosthogCaptureExists: typeof (window as any).posthog?.capture === 'function',
  posthogInitialized: !!posthog,
  captureMethod: typeof posthog.capture
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
