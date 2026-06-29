/**
 * Identity audit for multi-character scene anchors.
 *
 * Sends the composed anchor + each reference portrait to Gemini Vision and
 * asks for a STRICT identity bookkeeping:
 *   - total distinct people visible in the anchor
 *   - per reference: how many times that identity appears (0 = missing, 1 = ok, ≥2 = cloned)
 *   - per reference: faceMatch — does the depicted person actually match the
 *     reference portrait (sex, age, hair, jawline)
 *   - extra people that don't match any reference
 *
 * Catches FOUR failure modes BEFORE we burn Hailuo + Sync.so credits:
 *   1. CLONE     — same reference rendered twice (or two anchor faces look identical)
 *   2. EXTRA     — an additional unrelated person appears (3rd colleague, bystander)
 *   3. MISSING   — a reference person did not appear at all
 *   4. SWAP      — a reference slot is filled by the WRONG person (e.g. male
 *                  reference rendered as a woman). v111.
 *
 * Returns:
 *   - { ok: true }
 *   - { ok: false, reason: 'swap' | 'clone' | 'extra' | 'missing' | 'ambiguous', ... }
 *   - null on transport failure (caller decides)
 */
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

export interface IdentityAuditResult {
  ok: boolean;
  reason?: "clone" | "missing" | "ambiguous" | "extra" | "swap";
  /** Names of references that did not appear in the anchor. */
  missing?: string[];
  /** Names of references that appear more than once. */
  duplicated?: string[];
  /** v111 — names of references whose rendered face does NOT match the
   *  reference portrait (wrong person in the slot). */
  mismatched?: string[];
  /** Total number of distinct humans in the anchor (best-effort). */
  totalPeople?: number;
  /** Number of extra humans beyond the reference set. */
  extraPeople?: number;
  detail?: string;
}

export async function auditAnchorIdentity(
  anchorUrl: string,
  portraitUrls: string[],
  names: string[],
  lovableKey: string,
  timeoutMs = 25_000,
): Promise<IdentityAuditResult | null> {
  if (!anchorUrl || portraitUrls.length < 1 || !lovableKey) return null;
  const N = portraitUrls.length;
  const refLabel = portraitUrls
    .map((_, i) => `reference #${i + 1}${names[i] ? ` = ${names[i]}` : ""}`)
    .join(", ");
  // v170 — Cast-Integrity audit (Artlist parity):
  //   We check CAST INTEGRITY (each reference appears exactly once, correct face),
  //   NOT total headcount. Background bystanders, pedestrians, crowd, depicted
  //   persons on screens/posters/photos/mirrors/statues are EXTRAS and are
  //   allowed — they do not break lipsync because face-targeting matches the
  //   cast portrait, not "any face in frame".
  const text =
    `You will receive a COMPOSED SCENE image followed by ${N} CAST REFERENCE PORTRAIT${N === 1 ? "" : "S"} (${refLabel}). ` +
    `Audit CAST INTEGRITY only — extras and bystanders are ALLOWED. Specifically check: ` +
    `(a) "clone" — the same CAST reference appears two or more times as a real person in the frame (duplicated identity, triptych/panels of the same person, side-by-side variations of the same person, mirror duplicates of the same person); ` +
    `(b) "missing" — a CAST reference person does not appear at all as a real, physically present human; ` +
    `(c) "swap" — a CAST reference is filled by a clearly DIFFERENT person (different sex, very different age, different hair color/length, completely different face). Be strict on sex/age. ` +
    `IMPORTANT — these are NOT failures and must be IGNORED: background pedestrians, bystanders, crowd, coworkers, people walking by, unknown additional humans that do not match any CAST reference, AND any depicted persons on laptop screens, phones, TVs, posters, framed photos, mirrors, statues, mannequins, paintings. Treat depicted persons as scene props, not as humans, and do NOT count them in "appearances". ` +
    `For each CAST reference, count how many times that exact identity appears as a REAL physically present human (not as a screen image or photo on the wall), and rate faceMatch as "match" (clearly the same person), "mismatch" (clearly a different person), or "uncertain". ` +
    `Reply with STRICT JSON only, no prose:\n` +
    `{` +
    `"perReference": [{"ref": 1, "appearances": <0|1|2|...>, "faceMatch": "match"|"mismatch"|"uncertain", "mismatchNotes": "<short>"}, ...],` +
    `"reason": "ok|clone|missing|swap|ambiguous",` +
    `"notes": "<short>"` +
    `}.`;

  const content: any[] = [
    { type: "text", text },
    { type: "image_url", image_url: { url: anchorUrl } },
  ];
  for (const url of portraitUrls) content.push({ type: "image_url", image_url: { url } });

  try {
    const resp = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content }],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    const txt = j?.choices?.[0]?.message?.content ?? "";
    const m = String(txt).match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    const reason = String(parsed?.reason ?? "").toLowerCase();
    const detail = String(parsed?.notes ?? "").slice(0, 240);
    const totalPeople = Number.isFinite(Number(parsed?.totalPeople)) ? Number(parsed.totalPeople) : undefined;
    const extraPeople = Number.isFinite(Number(parsed?.extraPeople)) ? Number(parsed.extraPeople) : undefined;
    const perRef: Array<{ ref: number; appearances?: number; faceMatch?: string; mismatchNotes?: string }> = Array.isArray(parsed?.perReference) ? parsed.perReference : [];

    const missing: string[] = [];
    const duplicated: string[] = [];
    const mismatched: string[] = [];
    for (const entry of perRef) {
      const idx = Number(entry?.ref);
      if (!Number.isFinite(idx) || idx < 1 || idx > N) continue;
      const appearances = Number(entry?.appearances ?? 0);
      const name = names[idx - 1] ?? `#${idx}`;
      if (appearances <= 0) missing.push(name);
      else if (appearances >= 2) duplicated.push(name);
      if (appearances >= 1 && String(entry?.faceMatch ?? "").toLowerCase() === "mismatch") {
        mismatched.push(name);
      }
    }

    // Priority of failures: swap > clone > extra > missing > ambiguous. A
    // swap is the most damaging because the lipsync will animate the wrong
    // face and the wardrobe/scene around it looks correct, so the user only
    // notices the bug at preview time. Detect it BEFORE shipping.
    if (mismatched.length > 0 || reason === "swap") {
      return {
        ok: false,
        reason: "swap",
        mismatched: mismatched.length > 0 ? mismatched : undefined,
        totalPeople,
        extraPeople,
        detail: detail || `swap: ${mismatched.join(", ") || "unspecified"}`,
      };
    }
    if (duplicated.length > 0 || reason === "clone") {
      return {
        ok: false,
        reason: "clone",
        duplicated: duplicated.length > 0 ? duplicated : undefined,
        totalPeople,
        extraPeople,
        detail: detail || `duplicated: ${duplicated.join(", ") || "unspecified"}`,
      };
    }
    if ((extraPeople !== undefined && extraPeople > 0) || reason === "extra" || (totalPeople !== undefined && totalPeople > N)) {
      return {
        ok: false,
        reason: "extra",
        totalPeople,
        extraPeople,
        detail: detail || `extra people in frame (total=${totalPeople ?? "?"}, expected=${N})`,
      };
    }
    if (missing.length > 0 || reason === "missing") {
      return { ok: false, reason: "missing", missing, totalPeople, extraPeople, detail };
    }
    if (reason === "ambiguous") {
      return { ok: false, reason: "ambiguous", totalPeople, extraPeople, detail };
    }
    return { ok: true, totalPeople, extraPeople };
  } catch {
    return null;
  }
}
