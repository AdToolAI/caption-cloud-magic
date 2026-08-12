import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { translations } from "@/lib/translations";

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

  it("reports key parity across de / en / es", () => {
    const flatten = (obj: any, prefix = "", out = new Set<string>()) => {
      for (const [k, v] of Object.entries(obj ?? {})) {
        const path = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, path, out);
        else out.add(path);
      }
      return out;
    };

    const de = flatten(translations.de);
    const en = flatten(translations.en);
    const es = flatten(translations.es);
    const missing = (base: Set<string>, other: Set<string>) =>
      [...base].filter((k) => !other.has(k));

    // Missing keys fall back (language -> fill -> EN -> DE), so this is a
    // signal, not a hard failure — but the counts must stay visible.
    const gaps = {
      enMissing: missing(de, en).length,
      esMissing: missing(de, es).length,
      deMissing: missing(en, de).length,
    };
    if (gaps.enMissing || gaps.esMissing || gaps.deMissing) {
      console.warn("i18n key parity gaps:", gaps);
    }
    expect(de.size).toBeGreaterThan(0);
  });
});
