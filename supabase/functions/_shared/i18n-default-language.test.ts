import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { normalizeLang, pick, readLang } from "./i18n.ts";

const req = (headers: Record<string, string>) =>
  new Request("https://example.test", { headers });

Deno.test("readLang: no headers -> English (canonical default)", () => {
  assertEquals(readLang(req({})), "en");
});

Deno.test("readLang: explicit x-app-lang wins", () => {
  assertEquals(readLang(req({ "x-app-lang": "de" })), "de");
  assertEquals(readLang(req({ "x-app-lang": "es" })), "es");
  assertEquals(readLang(req({ "x-app-lang": "en", "accept-language": "de-DE" })), "en");
});

Deno.test("readLang: accept-language / browser locale NEVER selects de/es", () => {
  assertEquals(readLang(req({ "accept-language": "de-DE,de;q=0.9" })), "en");
  assertEquals(readLang(req({ "accept-language": "es-ES" })), "en");
  assertEquals(readLang(req({ "accept-language": "fr-FR" })), "en");
});

Deno.test("readLang: invalid x-app-lang falls back to English, not browser locale", () => {
  assertEquals(readLang(req({ "x-app-lang": "fr", "accept-language": "de-DE,de;q=0.9" })), "en");
  assertEquals(readLang(req({ "x-app-lang": "", "accept-language": "es-ES" })), "en");
});

Deno.test("normalizeLang: unknown/absent -> English", () => {
  assertEquals(normalizeLang(null), "en");
  assertEquals(normalizeLang(undefined), "en");
  assertEquals(normalizeLang("fr"), "en");
  assertEquals(normalizeLang("de-DE"), "de");
  assertEquals(normalizeLang("es-ES"), "es");
});

Deno.test("pick: falls back to English, never German", () => {
  const tri = { de: "DE", en: "EN", es: "ES" };
  assertEquals(pick(null, tri), "EN");
  assertEquals(pick("fr", tri), "EN");
  assertEquals(pick("de", tri), "DE");
  assertEquals(pick("es", { de: "DE", en: "EN" }), "EN");
});
