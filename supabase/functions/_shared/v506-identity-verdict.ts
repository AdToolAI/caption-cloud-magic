/**
 * V506 — Zweistufiger Identity-Verdict für Szenen-Anker.
 *
 * Vorgeschichte: seit v267 war der Gemini-Identity-Audit ein reines
 * Soft-Signal. Ein Anker, der KEINEN einzigen Cast-Charakter zeigt (S02,
 * 2026-08-24: 2 fremde Frauen + 2 fremde Männer statt 1 Frau + 3 Männer),
 * lief dadurch trotzdem in den bezahlten Provider-Dispatch und scheiterte
 * erst am Ende der Kette mit `fa4_fail_closed:count_mismatch`.
 *
 * V506 trennt deshalb zwei Klassen:
 *   - "gross"     → grob falsche Besetzung. Nach den Recompose-Versuchen
 *                   HART blocken, VOR jedem Provider-Dispatch (null Kosten).
 *   - "uncertain" → unsicherer Audit (ähnliche Gesichter, ein einzelner
 *                   unklarer Slot). Bleibt Soft-Pass wie bisher, damit
 *                   falsch-positive Audits keine Szene blockieren.
 *
 * Reine Funktionen — bewusst ohne Deno/Supabase-Abhängigkeiten, damit sie
 * im Frontend-Testrunner unit-getestet werden können.
 */

export type IdentityFailure =
  | "clone"
  | "extra"
  | "missing"
  | "ambiguous"
  | "swap"
  | null;

export type IdentitySeverity = "ok" | "uncertain" | "gross";

export interface CastGenderMember {
  name: string;
  gender?: string | null;
}

export interface IdentityVerdictInput {
  identityFailure: IdentityFailure;
  expectedFaces: number;
  missing?: string[];
  duplicated?: string[];
  mismatched?: string[];
  /** Namen, deren gerendertes Geschlecht dem Cast widerspricht (V506). */
  genderMismatched?: string[];
}

export interface IdentityVerdict {
  severity: IdentitySeverity;
  /** Stabiler Fehlercode für UI / Telemetrie. */
  code: string;
  /** Menschenlesbare Gründe (kurz, für Telemetrie). */
  reasons: string[];
  /** Anzahl der Cast-Slots, die als eindeutig falsch gelten. */
  brokenSlots: number;
}

function uniq(list: string[] | undefined): string[] {
  return Array.from(new Set((list ?? []).filter((n) => typeof n === "string" && n.length > 0)));
}

/**
 * Normalisiert Geschlechtsangaben aus `brand_characters.gender` auf
 * "male" | "female" | null (unbekannt → null, blockiert nie).
 */
export function normalizeGender(raw?: string | null): "male" | "female" | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (["male", "m", "mann", "männlich", "maennlich", "man", "hombre", "masculino"].includes(v)) {
    return "male";
  }
  if (["female", "f", "frau", "weiblich", "woman", "mujer", "femenino"].includes(v)) {
    return "female";
  }
  return null;
}

/**
 * Verbindliche Geschlechter-Klausel für den Anker-Prompt.
 * Leerer String, wenn keine belastbare Angabe existiert — dann bleibt der
 * Prompt exakt so wie vorher.
 */
export function buildGenderConstraint(cast: CastGenderMember[]): string {
  const known = cast
    .map((c) => ({ name: String(c.name ?? "").trim(), gender: normalizeGender(c.gender) }))
    .filter((c) => c.name.length > 0 && c.gender !== null) as Array<{
      name: string;
      gender: "male" | "female";
    }>;
  if (known.length === 0) return "";

  const women = known.filter((c) => c.gender === "female");
  const men = known.filter((c) => c.gender === "male");
  const parts: string[] = [];
  if (women.length > 0) {
    parts.push(
      `${women.length} woman${women.length === 1 ? "" : "en"} (${women.map((c) => c.name).join(", ")})`,
    );
  }
  if (men.length > 0) {
    parts.push(`${men.length} man${men.length === 1 ? "" : "men"} (${men.map((c) => c.name).join(", ")})`);
  }
  return (
    `MANDATORY CAST GENDER LOCK: the frame must contain exactly ${parts.join(" and ")}. ` +
    `Each named person must match their reference portrait's sex and face — no substitutions, ` +
    `no gender swaps, no generic stand-ins.`
  );
}

/**
 * Klassifiziert das Audit-Ergebnis in ok / uncertain / gross.
 *
 * "gross" (harter Block) genau dann, wenn mindestens einer gilt:
 *   - alle erwarteten Cast-Slots sind kaputt (kein einziger Treffer),
 *   - mindestens die Hälfte der Slots ist kaputt UND mindestens 2 Slots,
 *   - ein Geschlecht-Konflikt wurde erkannt (Cast-Gender-Lock verletzt).
 * "extra" (Statisten) ist NIE gross.
 */
export function classifyIdentityVerdict(input: IdentityVerdictInput): IdentityVerdict {
  const { identityFailure, expectedFaces } = input;
  const missing = uniq(input.missing);
  const duplicated = uniq(input.duplicated);
  const mismatched = uniq(input.mismatched);
  const genderMismatched = uniq(input.genderMismatched);

  if (!identityFailure && genderMismatched.length === 0) {
    return { severity: "ok", code: "anchor_identity_ok", reasons: [], brokenSlots: 0 };
  }

  if (identityFailure === "extra" && genderMismatched.length === 0) {
    return {
      severity: "ok",
      code: "anchor_identity_ok",
      reasons: ["extras_ignored"],
      brokenSlots: 0,
    };
  }

  const broken = uniq([...missing, ...mismatched, ...genderMismatched]);
  const brokenSlots = broken.length;
  const expected = Math.max(1, Number(expectedFaces) || 1);
  const reasons: string[] = [];
  if (identityFailure) reasons.push(`audit:${identityFailure}`);
  if (missing.length > 0) reasons.push(`missing:${missing.join("/")}`);
  if (mismatched.length > 0) reasons.push(`mismatched:${mismatched.join("/")}`);
  if (duplicated.length > 0) reasons.push(`duplicated:${duplicated.join("/")}`);
  if (genderMismatched.length > 0) reasons.push(`gender:${genderMismatched.join("/")}`);

  const genderBreak = genderMismatched.length > 0;
  const allSlotsBroken = brokenSlots >= expected;
  const majoritySlotsBroken = brokenSlots >= 2 && brokenSlots / expected >= 0.5;

  if (genderBreak || allSlotsBroken || majoritySlotsBroken) {
    return {
      severity: "gross",
      code: genderBreak ? "anchor_cast_gender_mismatch" : "anchor_cast_not_recognized",
      reasons,
      brokenSlots,
    };
  }

  return { severity: "uncertain", code: "anchor_identity_uncertain", reasons, brokenSlots };
}
