import { describe, expect, it } from "vitest";
import {
  buildGenderConstraint,
  classifyIdentityVerdict,
  normalizeGender,
} from "../../../supabase/functions/_shared/v506-identity-verdict";

const CAST = [
  { name: "Sarah Dusatko", gender: "female" },
  { name: "Samuel Dusatko", gender: "male" },
  { name: "Matthew Dusatko", gender: "male" },
  { name: "Kay Mark", gender: "male" },
];

describe("V506 — gender constraint", () => {
  it("normalizes localized gender values", () => {
    expect(normalizeGender("weiblich")).toBe("female");
    expect(normalizeGender("MALE")).toBe("male");
    expect(normalizeGender("")).toBeNull();
    expect(normalizeGender(null)).toBeNull();
  });

  it("builds an exact-count clause for the cast", () => {
    const clause = buildGenderConstraint(CAST);
    expect(clause).toContain("1 woman (Sarah Dusatko)");
    expect(clause).toContain("3 men (");
    expect(clause).toContain("no gender swaps");
  });

  it("stays empty when no gender is known (prompt unchanged)", () => {
    expect(buildGenderConstraint([{ name: "X" }, { name: "Y", gender: null }])).toBe("");
  });
});

describe("V506 — verdict classification", () => {
  it("passes a clean audit", () => {
    expect(
      classifyIdentityVerdict({ identityFailure: null, expectedFaces: 4 }).severity,
    ).toBe("ok");
  });

  it("never blocks on extras", () => {
    expect(
      classifyIdentityVerdict({ identityFailure: "extra", expectedFaces: 4 }).severity,
    ).toBe("ok");
  });

  it("keeps a single uncertain slot soft", () => {
    const v = classifyIdentityVerdict({
      identityFailure: "swap",
      expectedFaces: 4,
      mismatched: ["Kay Mark"],
    });
    expect(v.severity).toBe("uncertain");
    expect(v.brokenSlots).toBe(1);
  });

  it("blocks when the whole cast is unrecognized (S02 case)", () => {
    const v = classifyIdentityVerdict({
      identityFailure: "swap",
      expectedFaces: 4,
      mismatched: ["Sarah Dusatko", "Samuel Dusatko", "Matthew Dusatko", "Kay Mark"],
    });
    expect(v.severity).toBe("gross");
    expect(v.code).toBe("anchor_cast_not_recognized");
  });

  it("blocks on any gender-lock violation", () => {
    const v = classifyIdentityVerdict({
      identityFailure: null,
      expectedFaces: 4,
      genderMismatched: ["Kay Mark"],
    });
    expect(v.severity).toBe("gross");
    expect(v.code).toBe("anchor_cast_gender_mismatch");
  });

  it("blocks when at least half the slots are broken", () => {
    const v = classifyIdentityVerdict({
      identityFailure: "missing",
      expectedFaces: 4,
      missing: ["Samuel Dusatko", "Matthew Dusatko"],
    });
    expect(v.severity).toBe("gross");
  });

  it("treats ambiguous single-slot audits as uncertain", () => {
    expect(
      classifyIdentityVerdict({ identityFailure: "ambiguous", expectedFaces: 2 }).severity,
    ).toBe("uncertain");
  });
});
