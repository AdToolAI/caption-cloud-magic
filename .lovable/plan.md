## Ziel
Weg B (Multi-Ref-Compose + Audit + Retry) so ausbauen, dass Clone/Missing/Swap-Fehler entweder **verhindert** oder **vor Credit-Spend abgefangen** werden. Kein Architektur-Umbau, kein Refund-Risiko.

Drei aufeinander aufbauende Stufen, alle vor Launch (26.07.) umsetzbar.

---

## Stufe 1 — Retry-Ladder ehrlich ausschöpfen *(v262 Fix)*

### Problem
Aktuell fällt `clone+missing` durch den Soft-Pass (Headcount 4/4 → durchgewinkt), obwohl ein Charakter fehlt und ein anderer doppelt ist. Face-Lock-Retry feuert nur bei `reason='swap'`, nicht bei `clone`.

### Fixes

**1a. `supabase/functions/_shared/identity-audit.ts`**
`missing`-Liste auch im `clone`-Return mitgeben, damit der Composer die kombinierte Realität sieht:
```ts
if (duplicated.length > 0 || reason === "clone") {
  return {
    ok: false, reason: "clone",
    duplicated: duplicated.length > 0 ? duplicated : undefined,
    missing: missing.length > 0 ? missing : undefined,   // NEU
    totalPeople, extraPeople, detail,
  };
}
```

**1b. `supabase/functions/compose-video-clips/index.ts`** (~Z. 2852–2875)
Soft-Pass nur wenn `missing.length === 0`:
```ts
const hasMissingCast =
  Array.isArray(identityAudit?.missing) && identityAudit.missing.length > 0;
const softPassEligible =
  headcountOk && !hasMissingCast &&
  (identityFailure === "clone" || identityFailure === "swap");
```

**1c. `supabase/functions/compose-video-clips/index.ts`** (~Z. 2760, Attempt-3 Trigger)
Face-Lock-Retry auch bei `clone` mit `missing` triggern (aktuell nur bei `swap`):
```ts
const shouldFaceLock =
  identityFailure === "swap" ||
  (identityFailure === "clone" && hasMissingCast);
if (shouldFaceLock && identityPortraitUrls.length === portraitUrls.length) {
  // Attempt 3 mit faceLockMode: true
}
```

**1d. Forensik-Log** — `anchor_attempts[]` speichert `missing: [...]` + `duplicated: [...]`, damit das Debug-Panel den Grund für Skip/Retry-Entscheidungen zeigt.

### Erwartete Wirkung
Restfehlerrate von ~10% auf ~3-5%. Kein zusätzlicher Credit-Cost (Retry-Cap bleibt 3).

---

## Stufe 2 — Anchor-Preview-vor-Commit *(der Game-Changer)*

### Problem
User zahlt heute den vollen Preis (Anchor + Hailuo + Sync.so ≈ 10 Cr) bevor er sieht, ob der Anchor richtig ist. Bei Fail: Refund-Diskussion.

### Lösung
Zweiphasiger Render-Flow, wie Runway/HeyGen es machen:

**Phase A — Anchor-Preview** (~1 Cr, nur Nano-Banana-Compose)
1. `compose-video-clips` neuen Modus `previewOnly: true` akzeptieren
2. Rendert nur den Anchor + Identity-Audit, **kein** Hailuo, **kein** Sync.so
3. Speichert `preview_anchor_url` + `preview_audit` in `composer_scenes`
4. Setzt `clip_status = 'awaiting_confirmation'`

**Phase B — Full-Render** (nach User-Bestätigung)
1. Neuer Button in `SceneDialogStudio.tsx`: „✅ Anchor OK — Video + Lip-Sync erstellen" bzw. „🎲 Anchor neu würfeln"
2. „Neu würfeln" ruft `compose-video-clips` mit `previewOnly: true` + `regenerate: true` (kostet nur den Anchor, ~1 Cr)
3. „OK" ruft `compose-video-clips` mit `skipAnchor: true, useExistingAnchor: preview_anchor_url` → Hailuo + Sync.so laufen mit dem bestätigten Bild

### UI-Komponente
Neue Komponente `AnchorPreviewGate.tsx`:
- Zeigt `preview_anchor_url` groß + Audit-Warnung wenn `soft_pass`
- Zwei Buttons: „Anchor OK" (grün) / „Neu würfeln — 1 Cr" (gelb)
- Zeigt Face-Boxes overlay wenn AWS Rekognition Ergebnisse hat

### DB-Änderung
`composer_scenes` neue Spalten:
- `preview_anchor_url TEXT`
- `preview_audit JSONB`
- `anchor_confirmed_at TIMESTAMPTZ`

Migration + Grants für `authenticated` / `service_role`.

### Erwartete Wirkung
- Refund-Anfragen fallen auf nahe null (User bestätigt vor Full-Spend)
- User-Perception: „Fair, ich entscheide"
- Kosten pro Fehl-Anchor: ~1 Cr statt ~10 Cr

---

## Stufe 3 — Refund-Policy & Auto-Refund-Klassifikation

### Ziel
Klare, in UI + AGB dokumentierte Regel, welche Fails automatisch refunded werden — juristisch sauber, User-erwartbar.

### Refund-Matrix

| Fail-Typ | Auto-Refund | Umsetzung |
|---|---|---|
| Model-Timeout / 5xx | ✅ Voll | Bereits via `credit-refund-automation` (v226) |
| Content-Filter (NSFW) | ✅ Voll | Erweitern für Happy-Horse/Kling Safety |
| Face-Detection-Fail | ✅ Voll | Nach 2 Retries in `sync-face-gate` |
| Anchor Hard-Fail nach 3 Attempts | ✅ Video+Sync-Anteil | Neu — Anchor-Cost verbleibt (User hat gesehen) |
| Anchor Soft-Pass + User bestätigt | ❌ Nein | User-Entscheidung |
| Identity-Drift nach Bestätigung | ❌ Nein | Wie Artlist |
| „Gefällt mir nicht" | ❌ Nein | Wie Runway |

### Implementierung

**3a. `supabase/functions/credit-refund-automation/index.ts`** erweitern
Neue Fail-Codes registrieren + Partial-Refund für Anchor-Hard-Fail (nur Hailuo+Sync-Anteil, nicht Anchor).

**3b. Neue Komponente `RefundPolicyDialog.tsx`**
Modal, das die Matrix als Tabelle zeigt. Verlinkt aus:
- Anchor-Preview-Gate („Was passiert bei Problemen?")
- Fail-Toasts („Warum wurde ich (nicht) refunded?")
- AGB §7 (Erstattung)

**3c. AGB §7 aktualisieren**
Refund-Regel in bestehende AGB-Seite einfügen (nur Text, keine neue Route).

**3d. UI-Tooltips**
Im Anchor-Preview-Gate erklären: „Wenn du bestätigst, laufen Video + Lip-Sync (~8 Cr). Kein Refund nach Bestätigung."

### Erwartete Wirkung
- Support-Tickets zu Refunds: strukturell reduziert
- Rechtssicherheit für Launch
- User-Vertrauen: transparente Regeln statt „hoffen und beten"

---

## Was NICHT in diesem Plan ist

- **Weg A (Per-Character-Render + Compositing)** — bleibt als Nuke-Option in der Hinterhand, wird erst gebaut wenn nach 2 Wochen Live-Daten Restfehler noch > 5% ist
- **Preflight-Similarity-Check** (Cosine der Cast-Portraits) — als Stufe 4 nach Launch, wenn Daten zeigen dass ähnliche Refs der Haupttreiber sind
- **„Insurance Credits" als Marketing-Feature** — separate Marketing-Entscheidung
- Änderungen an SPF, Min-Face-Size-Gate, Row-Major-Sort, Sync.so-Pipeline — bleiben unangetastet

---

## Reihenfolge & Aufwand

1. **Stufe 1** (v262 Fix): ~2h — sofort umsetzbar, kein UI, kein Migration
2. **Stufe 2** (Anchor-Preview-Gate): ~1 Tag — Migration + Edge-Function-Modus + UI-Komponente
3. **Stufe 3** (Refund-Policy): ~4h — Edge-Function-Erweiterung + Dialog + AGB-Text

**Alles gemeinsam vor 26.07. gut machbar.** Empfohlene Reihenfolge: 1 → 2 → 3 (Stufe 2 baut auf Stufe 1 auf; Stufe 3 dokumentiert das Verhalten von 1+2).

## Betroffene Dateien

- `supabase/functions/_shared/identity-audit.ts` (Stufe 1a)
- `supabase/functions/compose-video-clips/index.ts` (Stufe 1b, 1c, 1d, 2)
- `supabase/functions/credit-refund-automation/index.ts` (Stufe 3a)
- `src/components/video-composer/SceneDialogStudio.tsx` (Stufe 2 UI-Hook)
- `src/components/video-composer/AnchorPreviewGate.tsx` (NEU, Stufe 2)
- `src/components/legal/RefundPolicyDialog.tsx` (NEU, Stufe 3b)
- 1 Migration: `composer_scenes` neue Spalten + Grants
- AGB §7 Textänderung (bestehende Seite)
