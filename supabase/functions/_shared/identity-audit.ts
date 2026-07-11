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
 * v171 — N=1 Swap-Confirmation against Flash false-positives:
 *   - Prompt hardened: "match" must be the default for plausible same-person
 *     under different lighting/angle/expression. Only "mismatch" when clearly
 *     a different human (different sex, very different age, completely
 *     different face). When in doubt → "uncertain".
 *   - For N=1 (single-cast), a "mismatch" verdict from Flash is re-checked
 *     with Gemini 2.5 Pro; only when BOTH agree do we fail with swap.
 *   - For multi-cast, a lone single "mismatch" without reason==='swap' is
 *     downgraded to soft-warn (logged), not a hard block.
 */
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

export interface IdentityAuditResult {
  ok: boolean;
  reason?: "clone" | "missing" | "ambiguous" | "extra" | "swap";
  missing?: string[];
  duplicated?: string[];
  mismatched?: string[];
  totalPeople?: number;
  extraPeople?: number;
  detail?: string;
  /** v171 — diagnostic trail of the audit decision. */
  v171?: {
    pass1?: string;
    pass2?: string;
    decision?: string;
    note?: string;
  };
}

type RawAudit = {
  reason: string;
  detail: string;
  missing: string[];
  duplicated: string[];
  mismatched: string[];
  totalPeople?: number;
  extraPeople?: number;
};

async function runAuditOnce(
  anchorUrl: string,
  portraitUrls: string[],
  names: string[],
  lovableKey: string,
  model: string,
  timeoutMs: number,
): Promise<RawAudit | null> {
  const N = portraitUrls.length;
  const refLabel = portraitUrls
    .map((_, i) => `reference #${i + 1}${names[i] ? ` = ${names[i]}` : ""}`)
    .join(", ");
  // v170 + v171 — Cast-Integrity audit with hardened "mismatch" gate.
  const text =
    `You will receive a COMPOSED SCENE image followed by ${N} CAST REFERENCE PORTRAIT${N === 1 ? "" : "S"} (${refLabel}). ` +
    `Audit CAST INTEGRITY only — extras and bystanders are ALLOWED. Specifically check: ` +
    `(a) "clone" — the same CAST reference appears two or more times as a real person in the frame (duplicated identity, triptych/panels of the same person, side-by-side variations of the same person, mirror duplicates of the same person); ` +
    `(b) "missing" — a CAST reference person does not appear at all as a real, physically present human; ` +
    `(c) "swap" — a CAST reference is filled by a clearly DIFFERENT person. Be conservative on swap. ` +
    `IMPORTANT — these are NOT failures and must be IGNORED: background pedestrians, bystanders, crowd, coworkers, people walking by, unknown additional humans that do not match any CAST reference, AND any depicted persons on laptop screens, phones, TVs, posters, framed photos, mirrors, statues, mannequins, paintings. Treat depicted persons as scene props, not as humans, and do NOT count them in "appearances". ` +
    `STRICT "mismatch" RULE (v171): If the rendered person is the same sex, similar age range, similar hair, and a plausible same-person under different lighting/angle/expression/wardrobe, you MUST return faceMatch="match". Only return "mismatch" when you are HIGHLY CONFIDENT it is a clearly different human (different sex, very different age, completely different facial structure, completely different hair color). When in doubt → "uncertain", NEVER "mismatch". ` +
    `For each CAST reference, count appearances as a REAL physically present human (not screen/photo) and rate faceMatch. ` +
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
      body: JSON.stringify({ model, messages: [{ role: "user", content }] }),
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
    const perRef: Array<{ ref: number; appearances?: number; faceMatch?: string }> = Array.isArray(parsed?.perReference) ? parsed.perReference : [];

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
    return { reason, detail, missing, duplicated, mismatched, totalPeople, extraPeople };
  } catch {
    return null;
  }
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

  const pass1 = await runAuditOnce(anchorUrl, portraitUrls, names, lovableKey, "google/gemini-2.5-flash", timeoutMs);
  if (!pass1) return null;

  const { reason, detail, missing, duplicated, mismatched, totalPeople, extraPeople } = pass1;

  // Priority: swap > clone > missing > ambiguous.
  const flashSaysSwap = mismatched.length > 0 || reason === "swap";

  if (flashSaysSwap) {
    // v171.1 — N=1 confirmation with Gemini 2.5 Pro before hard-blocking.
    if (N === 1) {
      console.log(`[identity-audit] v171 N=1 swap flagged by Flash (mismatched=${mismatched.join(",") || "—"}, reason=${reason}); confirming with Pro…`);
      const pass2 = await runAuditOnce(anchorUrl, portraitUrls, names, lovableKey, "google/gemini-2.5-pro", Math.max(timeoutMs, 30_000));
      const proSaysSwap = !!pass2 && (pass2.mismatched.length > 0 || pass2.reason === "swap");
      if (!proSaysSwap) {
        console.log(`[identity-audit] v171_n1_swap_softpass: flash=mismatch, pro=${pass2 ? "match" : "null"} → ok`);
        return {
          ok: true,
          totalPeople: pass2?.totalPeople ?? totalPeople,
          extraPeople: pass2?.extraPeople ?? extraPeople,
          v171: {
            pass1: "swap",
            pass2: pass2 ? (pass2.reason || "match") : "null",
            decision: "softpass_ok",
            note: "Flash flagged swap, Pro disagreed — N=1 soft-pass.",
          },
        };
      }
      console.log(`[identity-audit] v171_n1_swap_confirmed: flash + pro both mismatch → hard fail`);
      return {
        ok: false,
        reason: "swap",
        mismatched: pass2.mismatched.length > 0 ? pass2.mismatched : mismatched,
        totalPeople: pass2.totalPeople ?? totalPeople,
        extraPeople: pass2.extraPeople ?? extraPeople,
        detail: pass2.detail || detail || `swap (confirmed): ${mismatched.join(", ") || "unspecified"}`,
        v171: { pass1: "swap", pass2: "swap", decision: "hard_fail" },
      };
    }

    // v171.2 — Multi-cast: a lone single "mismatch" without reason==='swap'
    // is a low-confidence signal → soft-warn instead of hard-block.
    if (mismatched.length === 1 && reason !== "swap") {
      console.log(`[identity-audit] v171_multicast_lowconf_softpass: single mismatch=${mismatched[0]}, reason=${reason} → soft-warn ok`);
      return {
        ok: true,
        totalPeople,
        extraPeople,
        v171: {
          pass1: "swap_lowconf",
          decision: "softpass_ok",
          note: `Single mismatch (${mismatched[0]}) without reason=swap — downgraded to soft-warn.`,
        },
      };
    }

    // v171.3 — Multi-cast Pro-Confirmation for suspiciously high mismatch rates.
    // Gemini Flash on N≥2 anchors occasionally returns "all mismatched" even
    // though the anchor is fine (stylized cinematic renders, uneven lighting).
    // When the mismatch rate is ≥50% (i.e. Flash claims half or more of the
    // cast is wrong), re-check with Gemini 2.5 Pro. Only hard-fail when both
    // agree. Below the threshold → keep the existing v111 hard-fail path so
    // Face-Lock retry (v131.6) can still fire on true single-slot swaps.
    const highMismatchRate = mismatched.length >= 2 && mismatched.length / N >= 0.5;
    if (highMismatchRate) {
      console.log(
        `[identity-audit] v171 N=${N} high-mismatch-rate flagged by Flash (mismatched=${mismatched.join(",") || "—"}, reason=${reason}); confirming with Pro…`,
      );
      const pass2 = await runAuditOnce(
        anchorUrl,
        portraitUrls,
        names,
        lovableKey,
        "google/gemini-2.5-pro",
        Math.max(timeoutMs, 30_000),
      );
      const proSaysSwap = !!pass2 && (pass2.mismatched.length > 0 || pass2.reason === "swap");
      if (!proSaysSwap) {
        console.log(
          `[identity-audit] v171_multicast_swap_softpass: flash=mismatch(${mismatched.length}/${N}), pro=${pass2 ? "match" : "null"} → ok`,
        );
        return {
          ok: true,
          totalPeople: pass2?.totalPeople ?? totalPeople,
          extraPeople: pass2?.extraPeople ?? extraPeople,
          v171: {
            pass1: "swap",
            pass2: pass2 ? (pass2.reason || "match") : "null",
            decision: "softpass_ok_multi",
            note: `Flash flagged ${mismatched.length}/${N} mismatches, Pro disagreed — multi-cast soft-pass.`,
          },
        };
      }
      console.log(
        `[identity-audit] v171_multicast_swap_confirmed: flash + pro both mismatch → hard fail`,
      );
      return {
        ok: false,
        reason: "swap",
        mismatched: pass2.mismatched.length > 0 ? pass2.mismatched : mismatched,
        totalPeople: pass2.totalPeople ?? totalPeople,
        extraPeople: pass2.extraPeople ?? extraPeople,
        detail:
          pass2.detail || detail || `swap (confirmed): ${mismatched.join(", ") || "unspecified"}`,
        v171: { pass1: "swap", pass2: "swap", decision: "hard_fail_multi" },
      };
    }

    return {
      ok: false,
      reason: "swap",
      mismatched: mismatched.length > 0 ? mismatched : undefined,
      totalPeople,
      extraPeople,
      detail: detail || `swap: ${mismatched.join(", ") || "unspecified"}`,
      v171: { pass1: "swap", decision: "hard_fail" },
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
  if (missing.length > 0 || reason === "missing") {
    return { ok: false, reason: "missing", missing, totalPeople, extraPeople, detail };
  }
  if (reason === "ambiguous") {
    return { ok: false, reason: "ambiguous", totalPeople, extraPeople, detail };
  }
  return { ok: true, totalPeople, extraPeople };
}
