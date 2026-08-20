import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { translations } from "@/lib/translations";
import { translationsFill } from "@/lib/translationsFill";

/**
 * Guards the DE/EN/ES dictionaries against the failure class that produced
 * Spanish buttons inside the German UI: a bulk-translation run writing foreign
 * text into the wrong language block (including the `Object.assign` add-ons at
 * the end of `translations.ts`, which no earlier check covered).
 */
describe("i18n dictionaries", () => {
  it("contain no foreign-language values", () => {
    let output = "";
    try {
      output = execFileSync("node", ["scripts/check-language-purity.mjs"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err: any) {
      output = `${err.stdout ?? ""}${err.stderr ?? ""}`;
      throw new Error(output);
    }
    expect(output).toContain("passed");
  });

  it("has exact key parity across de / en / es (dictionary + fill)", () => {
    const flatten = (obj: any, prefix = "", out = new Set<string>()) => {
      for (const [k, v] of Object.entries(obj ?? {})) {
        const path = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, path, out);
        else out.add(path);
      }
      return out;
    };
    const deepMerge = (base: any, extra: any): any => {
      const out: any = { ...(base ?? {}) };
      for (const [k, v] of Object.entries(extra ?? {})) {
        out[k] =
          v && typeof v === "object" && !Array.isArray(v)
            ? deepMerge(out[k] ?? {}, v)
            : v;
      }
      return out;
    };
    const effective = (lang: "de" | "en" | "es") =>
      flatten(deepMerge((translations as any)[lang], (translationsFill as any)[lang]));

    const de = effective("de");
    const en = effective("en");
    const es = effective("es");
    const missing = (base: Set<string>, other: Set<string>) =>
      [...base].filter((k) => !other.has(k));

    expect(de.size).toBeGreaterThan(0);
    // Every creator-facing key must resolve in its own locale — no cross-locale fallback.
    expect(missing(de, en)).toEqual([]);
    expect(missing(de, es)).toEqual([]);
    expect(missing(en, de)).toEqual([]);
    expect(missing(en, es)).toEqual([]);
    expect(missing(es, de)).toEqual([]);
    expect(missing(es, en)).toEqual([]);
  });

});
