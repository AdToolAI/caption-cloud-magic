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
  if (!anchorUrl || portraitUrls.length < 2 || !lovableKey) return null;
  const N = portraitUrls.length;
  const refLabel = portraitUrls
    .map((_, i) => `reference #${i + 1}${names[i] ? ` = ${names[i]}` : ""}`)
    .join(", ");
  const text =
    `You will receive a COMPOSED SCENE image followed by ${N} REFERENCE PORTRAITS (${refLabel}). ` +
    `The composed scene MUST contain EXACTLY ${N} distinct humans, with each reference person appearing EXACTLY ONCE and matching the reference. ` +
    `Audit it carefully. Watch for: ` +
    `(a) "cloning" — the same reference appears twice, or two anchor faces look identical; ` +
    `(b) "extra people" — additional humans in the frame (colleagues at the desk, bystanders, posters/photos of people, mirror reflections of people, mannequins, statues, on-screen people); ` +
    `(c) "missing" — a reference person does not appear at all; ` +
    `(d) "swap" — for some reference, a person APPEARS in the slot but is OBVIOUSLY a different person (different sex, very different age, different hair color/length, completely different face). Be strict: if a male reference is rendered as a clearly female person (or vice versa), that is a SWAP. ` +
    `Count posters/screens/mirrors/statues showing a human face as a "person" for this audit. ` +
    `For each reference, also rate faceMatch as "match" (clearly the same person), "mismatch" (clearly a different person — different sex/age/face), or "uncertain". ` +
    `Reply with STRICT JSON only, no prose:\n` +
    `{` +
    `"totalPeople": <integer — distinct humans visible, including extras>,` +
    `"perReference": [{"ref": 1, "appearances": <0|1|2|...>, "faceMatch": "match"|"mismatch"|"uncertain", "mismatchNotes": "<short>"}, ...],` +
    `"extraPeople": <integer — humans not matching any reference>,` +
    `"reason": "ok|clone|extra|missing|swap|ambiguous",` +
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
