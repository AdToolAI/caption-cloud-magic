## Problem

Szene S03 wird mit `anchor_identity_swap_detected: reference 1 is not the same person` hart geblockt — obwohl im Bild eindeutig derselbe Founder (Samuel) wie im Avatar-Portrait zu sehen ist. Gleichzeitig wird S02 mit demselben Setup als "Generiert" durchgewunken.

## Root Cause

`supabase/functions/_shared/identity-audit.ts` ruft Gemini 2.5 Flash auf und vertraut dessen `faceMatch: "mismatch"` blind. Flash ist bei N=1 + leichten Pose-/Lichtunterschieden zwischen Studio-Portrait und Szenen-Plate notorisch unzuverlässig (gleicher Mann, andere Lichtstimmung → "mismatch"). Ergebnis: **False-positive Swap** trotz korrekter Identität.

Aktuelle Logik in `identity-audit.ts` (Z. 116–134) feuert Swap bereits, wenn **ein einziger** `mismatched`-Eintrag kommt — ohne zweite Meinung, ohne Konfidenz, ohne Sonderbehandlung für N=1.

## Fix — v171 N=1 Swap-Confirmation (chirurgisch, additiv)

Drei kleine Änderungen, ausschließlich in `supabase/functions/_shared/identity-audit.ts`. Pipeline (Compose, Hailuo, Sync.so, Webhook) wird **nicht** berührt.

### 1. Prompt-Härtung gegen False-Positives
Im Audit-Prompt ergänzen:
- "If the rendered person is the same sex, similar age, similar hair, and a plausible same-person under different lighting/angle/expression, you MUST return `match`, not `mismatch`."
- "Only return `mismatch` if you are highly confident it is a clearly different human (different sex, very different age, completely different facial structure). When in doubt → `uncertain`."

### 2. N=1 Single-Face Soft-Pass
Wenn `portraitUrls.length === 1`:
- Vor dem Hard-Fail einen zweiten Audit-Call gegen **Gemini 2.5 Pro** (statt Flash) absetzen.
- Nur wenn **beide** Pässe (Flash + Pro) `mismatch` für ref #1 melden → Swap.
- Sonst: `ok: true` mit Log `v171_n1_swap_softpass: flash=mismatch, pro=match`.

### 3. Konfidenz-Schwelle für Multi-Cast
Wenn `mismatched.length === 1` UND `reason !== "swap"` (Modell selbst sagt nicht swap, nur einzelne Slot-Bewertung):
- Soft-Warn, kein Hard-Block. Verhindert, dass ein Wackel-Match in 4-Cast-Szenen den ganzen Render killt.

### Telemetrie
- Logs: `v171_swap_confirm: pass1=<flash>, pass2=<pro>, decision=<final>`
- Persistiert in `audio_plan.twoshot.anchor_face_audit.v171`.

## Was NICHT angefasst wird

- `compose-scene-anchor` (Anchor-Generierung, Anti-Triptych v168) — unverändert.
- `compose-dialog-segments` + Sync.so-Payload-Contract (v153/v160/v181) — unverändert.
- Hailuo/HappyHorse-Plate-Pipeline — unverändert.
- `compose-video-clips` Hard-Abort-Logik (Z. 1916) — unverändert; bekommt durch v171 nur seltener `ok:false` geliefert.
- UI / Frontend — unverändert.

## Recovery für aktuelle Szene S03

Nach Deploy: User drückt "🔄 Neu rendern" auf S03 — Audit läuft erneut, mit v171-Confirmation. Bei tatsächlich korrekter Identität geht die Szene durch.

## Files

- `supabase/functions/_shared/identity-audit.ts` (Prompt + N=1-Doppelcheck + Multi-Cast-Schwelle)
- `mem/architecture/lipsync/v171-n1-swap-confirmation.md` (neu, Doku)

## Risiken

- **Latenz**: Bei N=1 + Flash-mismatch ein zusätzlicher Gemini-Pro-Call (~3–6 s). Nur im Fehlerfall, nicht im Happy Path.
- **Echte Swaps**: Werden weiterhin gefangen, wenn beide Modelle übereinstimmen. Defense-in-Depth bleibt.
