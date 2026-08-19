import { describe, expect, it, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { getLang, pickText } from "@/lib/i18nText";
import { useTranslationState } from "@/hooks/useTranslation";

/**
 * Canonical product language is ENGLISH.
 *
 * Guards two release-critical invariants:
 *  1. A fresh visitor (any browser locale / country) resolves to English and
 *     nothing is silently persisted as German.
 *  2. An English UI never falls back to German or Spanish copy.
 */
describe("canonical language default", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("resolves English when no explicit preference is stored", () => {
    expect(getLang()).toBe("en");
    const { result } = renderHook(() => useTranslationState());
    expect(result.current.language).toBe("en");
  });

  it("does not persist a language before the user chooses one", () => {
    renderHook(() => useTranslationState());
    expect(localStorage.getItem("adtool-ai-lang")).toBeNull();
  });

  it("ignores browser locale (de-DE / es-ES stay English)", () => {
    for (const locale of ["de-DE", "es-ES", "en-US"]) {
      Object.defineProperty(window.navigator, "language", {
        value: locale,
        configurable: true,
      });
      localStorage.clear();
      const { result } = renderHook(() => useTranslationState());
      expect(result.current.language).toBe("en");
    }
  });

  it("honours an explicit stored preference", () => {
    localStorage.setItem("adtool-ai-lang", "de");
    expect(getLang()).toBe("de");
    expect(renderHook(() => useTranslationState()).result.current.language).toBe("de");

    localStorage.setItem("adtool-ai-lang", "es");
    expect(getLang()).toBe("es");
    expect(renderHook(() => useTranslationState()).result.current.language).toBe("es");
  });

  it("switching language persists the explicit choice", () => {
    const { result } = renderHook(() => useTranslationState());
    act(() => result.current.setLanguage("de"));
    expect(localStorage.getItem("adtool-ai-lang")).toBe("de");
  });

  it("pickText falls back to English for unknown languages", () => {
    expect(pickText("fr", { de: "DE", en: "EN", es: "ES" })).toBe("EN");
    expect(pickText("en", { de: "DE", en: "EN", es: "ES" })).toBe("EN");
    expect(pickText("es", { de: "DE", en: "EN" })).toBe("EN");
    expect(pickText("de", { de: "DE", en: "EN" })).toBe("DE");
  });

  it("English UI never falls back to German copy", () => {
    const { result } = renderHook(() => useTranslationState());
    const value = result.current.t("__missing__.key.that.does.not.exist");
    expect(value).toBe("__missing__.key.that.does.not.exist");
  });
});
