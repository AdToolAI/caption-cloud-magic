/**
 * Request-scoped localisation for edge functions.
 *
 * The client sends the active UI language as `x-app-lang` (see
 * `src/lib/functionsLang.ts`). Wrap a handler with `withLang(req, fn)` and use
 * `tl({ de, en, es })` anywhere inside — no need to thread a `lang` argument
 * through every helper.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export type Lang = "de" | "en" | "es";
export type Tri = { de: string; en: string; es?: string };

const store = new AsyncLocalStorage<Lang>();

export function readLang(req: Request): Lang {
  const explicit = req.headers.get("x-app-lang")?.toLowerCase().slice(0, 2);
  if (explicit === "en" || explicit === "es" || explicit === "de") return explicit;
  const accept = req.headers.get("accept-language")?.toLowerCase().slice(0, 2);
  if (accept === "en" || accept === "de" || accept === "es") return accept;
  // Canonical default is English when no explicit language is provided.
  return "en";
}

export function normalizeLang(value?: string | null): Lang {
  const v = value?.toLowerCase().slice(0, 2);
  return v === "de" || v === "es" ? v : "en";
}

/** Run a handler with the request language bound to the async context. */
export function withLang<T>(req: Request, fn: () => T | Promise<T>): Promise<T> {
  return Promise.resolve(store.run(readLang(req), fn as () => T));
}

/** Run with an explicit language (e.g. a profile setting for emails/cron jobs). */
export function withLangValue<T>(lang: string | null | undefined, fn: () => T | Promise<T>): Promise<T> {
  return Promise.resolve(store.run(normalizeLang(lang), fn as () => T));
}

export function currentLang(): Lang {
  return store.getStore() ?? "en";
}

/** Pick the text for the current request language. */
export function tl(text: Tri): string {
  const lang = currentLang();
  if (lang === "de") return text.de;
  if (lang === "es") return text.es ?? text.en;
  return text.en;
}

/** Pick the text for an explicit language. */
export function pick(lang: string | null | undefined, text: Tri): string {
  const l = normalizeLang(lang);
  if (l === "de") return text.de;
  if (l === "es") return text.es ?? text.en;
  return text.en;
}
