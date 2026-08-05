/**
 * Gemeinsame Validierungslogik für Gutscheincodes (v411).
 * Einzige Wahrheit für `validate-promo-code` und `redeem-promo-code`.
 */

export type PromoRow = {
  id: string;
  code: string;
  stripe_promo_id: string;
  discount_percent: number | null;
  duration_months: number | null;
  max_redemptions: number | null;
  redemptions_count: number | null;
  active: boolean | null;
  valid_until: string | null;
  kind: string | null;
  benefit_label_de: string | null;
  benefit_label_en: string | null;
  benefit_label_es: string | null;
  affiliate_id: string | null;
};

export const PROMO_SELECT =
  "id, code, stripe_promo_id, discount_percent, duration_months, max_redemptions, redemptions_count, active, valid_until, kind, benefit_label_de, benefit_label_en, benefit_label_es, affiliate_id";

export type PromoReason =
  | "invalid"
  | "expired"
  | "exhausted"
  | "already_redeemed"
  | "has_subscription";

export function normalizeCode(code: unknown): string {
  return String(code ?? "").trim().toUpperCase();
}

/** Statische Prüfung des Codes (ohne Nutzerbezug). */
export function checkPromoRow(row: PromoRow | null): { ok: boolean; reason?: PromoReason } {
  if (!row || row.active === false) return { ok: false, reason: "invalid" };
  if (row.valid_until && new Date(row.valid_until).getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  if (row.max_redemptions != null && (row.redemptions_count ?? 0) >= row.max_redemptions) {
    return { ok: false, reason: "exhausted" };
  }
  return { ok: true };
}

export function benefitLabel(row: PromoRow, lang: string): string {
  const l = (lang || "de").slice(0, 2).toLowerCase();
  const picked =
    l === "en" ? row.benefit_label_en : l === "es" ? row.benefit_label_es : row.benefit_label_de;
  if (picked) return picked;
  const pct = row.discount_percent ?? 0;
  const months = row.duration_months ?? 1;
  if (pct >= 100) return `${months} Monate gratis`;
  return `${pct}% Rabatt für ${months} Monate`;
}
