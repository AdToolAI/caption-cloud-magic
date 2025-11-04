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

// CRITICAL FIX: Getter-based property (cannot be overwritten!)
let attachAttempt = 0;
const attachPostHogToWindow = () => {
  attachAttempt++;
  console.log(`🔄 Attempt ${attachAttempt}: Attaching PostHog to window`);
  
  try {
    // Check if property already exists
    const descriptor = Object.getOwnPropertyDescriptor(window, 'posthog');
    console.log('🔍 Current property descriptor:', descriptor);
    
    // If exists and configurable: false, we cannot override
    if (descriptor && !descriptor.configurable) {
      console.log('✅ PostHog already attached and immutable');
      return true;
    }
    
    // Define as getter (always returns posthog instance)
    Object.defineProperty(window, 'posthog', {
      get: () => posthog,
      configurable: false,
      enumerable: true
    });
    
    console.log('✅ PostHog attached as getter-based property');
    console.log('🔍 Verification:', {
      type: typeof (window as any).posthog,
      hasCapture: typeof (window as any).posthog?.capture === 'function',
      isPosthogInstance: (window as any).posthog === posthog
    });
    
    return true;
  } catch (error) {
    console.error('❌ Failed to attach PostHog:', error);
    console.error('Error details:', {
      name: (error as Error).name,
      message: (error as Error).message,
      stack: (error as Error).stack
    });
    
    // Fallback: Simple assignment
    try {
      (window as any).posthog = posthog;
      console.log('⚠️ Fallback: Simple assignment used');
    } catch (fallbackError) {
      console.error('❌ Even fallback failed:', fallbackError);
    }
    
    return false;
  }
};

// Initial attachment
attachPostHogToWindow();

// Delayed check
setTimeout(() => {
  console.log('🔍 100ms check:', {
    typeOf: typeof (window as any).posthog,
    isUndefined: (window as any).posthog === undefined,
    isNull: (window as any).posthog === null,
    hasCapture: typeof (window as any).posthog?.capture === 'function'
  });
  
  if (!(window as any).posthog || typeof (window as any).posthog.capture !== 'function') {
    console.warn('⚠️ PostHog lost after 100ms! Re-attaching...');
    attachPostHogToWindow();
  } else {
    console.log('✅ PostHog still available after 100ms');
  }
}, 100);

// Aggressive monitoring with detailed logging
let monitoringCount = 0;
setInterval(() => {
  monitoringCount++;
  
  if (!(window as any).posthog || typeof (window as any).posthog.capture !== 'function') {
    console.warn(`⚠️ [${monitoringCount}] PostHog monitoring: window.posthog is ${(window as any).posthog === undefined ? 'undefined' : 'invalid'}`);
    console.warn('🔄 Attempting re-attachment...');
    attachPostHogToWindow();
    
    // Verify re-attachment worked
    setTimeout(() => {
      console.log('🔍 Re-attachment verification:', {
        success: typeof (window as any).posthog?.capture === 'function',
        type: typeof (window as any).posthog
      });
    }, 10);
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
