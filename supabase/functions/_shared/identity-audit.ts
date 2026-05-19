/**
 * Identity audit for multi-character scene anchors.
 *
 * Sends the composed anchor + each reference portrait to Gemini Vision and
 * asks whether all reference identities appear distinctly in the anchor.
 * Catches the "Nano Banana 2 cloned one character" failure mode BEFORE we
 * spend Hailuo + Sync.so credits.
 *
 * Returns:
 *   - { ok: true }                   — all references map to distinct faces
 *   - { ok: false, reason: 'clone' } — at least one reference appears twice
 *                                       or two faces in anchor look identical
 *   - { ok: false, reason: 'missing', missing: [names] } — references not found
 *   - null                            — call failed; caller decides
 */
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

export interface IdentityAuditResult {
  ok: boolean;
  reason?: "clone" | "missing" | "ambiguous";
  missing?: string[];
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
  const refLabel = portraitUrls
    .map((_, i) => `reference #${i + 1}${names[i] ? ` = ${names[i]}` : ""}`)
    .join(", ");
  const text =
    `You will receive a COMPOSED SCENE image followed by ${portraitUrls.length} REFERENCE PORTRAITS (${refLabel}). ` +
    `Decide whether each reference person appears as a CLEARLY DISTINCT individual in the composed scene. ` +
    `A common failure is "cloning": the same reference person appears twice (or two faces look almost identical). ` +
    `Reply STRICT JSON only, no prose: ` +
    `{"matches":[{"ref":1,"present":true|false,"distinctFromOthers":true|false}, ...],` +
    `"clonedPair":[i,j]|null,"reason":"ok|clone|missing|ambiguous","notes":"<short>"}.`;

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
    const matches: Array<{ ref: number; present?: boolean; distinctFromOthers?: boolean }> = Array.isArray(parsed?.matches) ? parsed.matches : [];
    const missing = matches.filter((x) => x?.present === false).map((x) => names[(x.ref ?? 1) - 1] ?? `#${x.ref}`);
    const cloned = Array.isArray(parsed?.clonedPair) && parsed.clonedPair.length === 2;
    const reason = String(parsed?.reason ?? "").toLowerCase();
    if (cloned || reason === "clone") return { ok: false, reason: "clone", detail: String(parsed?.notes ?? "").slice(0, 200) };
    if (missing.length > 0 || reason === "missing") return { ok: false, reason: "missing", missing, detail: String(parsed?.notes ?? "").slice(0, 200) };
    const allDistinct = matches.every((x) => x?.distinctFromOthers !== false);
    if (!allDistinct) return { ok: false, reason: "ambiguous", detail: String(parsed?.notes ?? "").slice(0, 200) };
    return { ok: true };
  } catch {
    return null;
  }
}
