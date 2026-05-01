import { useEffect } from "react";

/**
 * Lightweight ring-buffer for the last 20 console.error entries.
 * Mounted ONCE in App.tsx. Read via getRecentConsoleErrors() in support
 * context collector to attach diagnostic info to tickets.
 */

const MAX = 20;
const buffer: Array<{ ts: string; message: string }> = [];

let installed = false;

export function installConsoleErrorBuffer() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    try {
      const message = args
        .map((a) => {
          if (a instanceof Error) return `${a.name}: ${a.message}`;
          if (typeof a === "string") return a;
          try {
            return JSON.stringify(a);
          } catch {
            return String(a);
          }
        })
        .join(" ")
        .slice(0, 500);
      buffer.push({ ts: new Date().toISOString(), message });
      if (buffer.length > MAX) buffer.shift();
    } catch {
      /* ignore buffer errors */
    }
    origError(...args);
  };

  // Capture uncaught errors too
  window.addEventListener("error", (ev) => {
    try {
      buffer.push({
        ts: new Date().toISOString(),
        message: `UNCAUGHT: ${ev.message} @ ${ev.filename}:${ev.lineno}`.slice(0, 500),
      });
      if (buffer.length > MAX) buffer.shift();
    } catch { /* noop */ }
  });

  window.addEventListener("unhandledrejection", (ev) => {
    try {
      const reason = ev.reason instanceof Error ? ev.reason.message : String(ev.reason);
      buffer.push({
        ts: new Date().toISOString(),
        message: `UNHANDLED PROMISE: ${reason}`.slice(0, 500),
      });
      if (buffer.length > MAX) buffer.shift();
    } catch { /* noop */ }
  });
}

export function getRecentConsoleErrors(): Array<{ ts: string; message: string }> {
  return [...buffer];
}

/** Hook wrapper for App.tsx mount */
export function useConsoleErrorBuffer() {
  useEffect(() => {
    installConsoleErrorBuffer();
  }, []);
}
