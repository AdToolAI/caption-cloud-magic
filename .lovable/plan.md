## Analyse — was wirklich passiert (Szene 827ed500, Matthew Dusatko)

Logs von 20:33–20:38:

| Zeit | Step | Variante | Output | NOOP-Reason | sizeRatio |
|---|---|---|---|---|---|
| ~20:33 | 0 (fresh) | `auto_detect: true` (preclip-Pfad) | done | `reencoded_passthrough_suspect` | **0.82** |
| 20:35 | 1 | `bbox-url-pro` | done | `reencoded_passthrough_suspect` | **0.84** |
| 20:36 | 2 | `coords-pro-box` | done | `reencoded_passthrough_suspect` | **0.84** |
| 20:37 | — | — | HARD FAIL | ladder exhausted | — |

Matthews Pass: 9s Video, voiced-Window = **[2.446, 3.428]** → nur **0.98s gesprochen von 9s** (≈11% voiced).

**Das ist kein NOOP. Das ist ein erfolgreicher Lipsync.** Sync.so verändert ~25–30 von 270 Frames (nur die voiced-Sekunde), Output-Bytes sind dadurch ~82–84% des Inputs. Das fällt genau in den v128-Verdachts-Korridor `0.65 ≤ sizeRatio ≤ 1.35` und wird fälschlich als `sync_output_reencoded_passthrough_suspect` markiert. Ladder eskaliert, jeder Retry produziert wieder denselben "verdächtigen" 0.84 Output, und nach Step 2 ist Matthews komplett verloren — obwohl alle drei Outputs vermutlich korrekt lipsynced waren.

Beweise:
- Samuel & Kailee (gleiche Szene, gleiche Plate, mehr voiced-Zeit) → `done` ohne Suspect.
- `syncOutputUnchanged` (etag/bytes identisch) und `syncOutputResolutionRegression` (downscale <720) waren **nie** true für Matthew — nur die bytes-Heuristik.

Zweitbefund: Fresh-Dispatch für Matthew lief mit `auto_detect: true` **trotz** v147. Grund: Pass hatte `preclip_url` → v131.2 Rule 0 erzwingt `auto_detect` auf dem Single-Face-Preclip. v148 bypasst das nur bei `noop_auto_escalation`, nicht auf Fresh-Dispatch.

## Fix v150 (zwei Teile)

### A) NOOP-Detector kalibrieren (sync-so-webhook, kritisch)

In `supabase/functions/sync-so-webhook/index.ts` um Zeile 587–604:

1. **Voiced-Ratio berechnen**: aus `passBeforeDone.windows` (oder `speakerWindowsSecs` falls vorhanden) `voicedSec = Σ(end-start)` und `voicedRatio = voicedSec / totalSec`.
2. **`reencodedPassthroughSuspect` gaten**: nur noch true, wenn `voicedRatio >= 0.50`. Bei niedrigem voiced-Anteil ist sizeRatio ~0.7–0.9 **erwartetes Verhalten** für korrektes Lipsync und darf keinen Suspect auslösen.
3. **`syncOutputUnchanged`** (etag/bytes identisch) bleibt als hartes Signal — das ist deterministisch kein Lipsync.
4. **`syncOutputResolutionRegression`** (min-axis <720 bei erwarteten 720) bleibt unverändert.
5. **Logging erweitern**: `voiced_sec`, `voiced_ratio`, `suspect_gated_by_voiced_ratio` ins `logSyncDispatch` meta + Konsolen-Log.

Effekt: Matthews 11%-voiced-Pass wird beim ersten Output als `done` ohne Suspect markiert — kein Ladder-Run, kein Hard-Fail.

### B) v147 bbox-url-pro auch auf Fresh-Dispatch durchsetzen (Multi-Speaker mit Preclip)

In `supabase/functions/compose-dialog-segments/index.ts`:

Aktuell (v148, Zeile ~2775): `noop_auto_escalation=true` + variant∈{bbox-url-pro, coords-pro-box} → Preclip wird gedroppt.

Erweitern: **Auch auf Fresh-Dispatch** Preclip droppen, wenn:
- `!isRetry` UND
- `speakers.length >= 2` UND
- `plateDims` vorhanden UND
- `freshDefaultVariant === "bbox-url-pro"`

→ Full-Plate-Dispatch mit `bounding_boxes_url`, kein Single-Face-Preclip-Detour.

Logname: `v150_fresh_bypass_preclip_for_bbox_url_pro`.

Effekt: Multi-Speaker-Pässe bekommen sofort die deterministische ASD statt `auto_detect`-auf-Crop. Bei korrekter A) ist das eigentlich nice-to-have, aber es macht v147 endlich konsistent (Memo `v147-bbox-url-pro-only.md` sagt genau das).

### C) Ladder-Step 0 entfernen (Aufräumen)

In `sync-so-webhook` `NOOP_LADDER` (Zeile 659–662): Step 0 `bbox-url-pro` raus. Nach v150-B ist Fresh-Dispatch bereits bbox-url-pro, ein Retry mit gleicher Variante bringt nichts. Neuer Ladder:

```text
Step 0 → coords-pro-box (bounding-box ASD)
Step 1 → HARD FAIL + idempotent refund
```

UI-Label "max. 2 Stufen" → "max. 1 Stufe" in `dialog_shots` Status-Text (separat im Frontend, falls hardcoded).

### D) Recovery der bereits hart-failed'ten Matthew-Szene

Einmalig per `supabase--read_query` / Migration: für Szene `827ed500` Pass 2 (Matthew) `status` von `failed` zurück auf `pending` + `noop_escalation_step=null`, damit User "Retry" drücken kann und neuer Lauf das v150-Verhalten bekommt. **Nicht** automatisch in Code — manueller One-Shot.

## Files

| Datei | Änderung |
|---|---|
| `supabase/functions/sync-so-webhook/index.ts` | A) voiced-ratio gate für reencoded_passthrough_suspect; C) NOOP_LADDER auf 1 Step kürzen |
| `supabase/functions/compose-dialog-segments/index.ts` | B) Fresh-Dispatch Preclip-Bypass für bbox-url-pro |
| `mem/architecture/lipsync/v150-voiced-ratio-noop-gate.md` | Neu — dokumentiert false-positive Analyse + Fix |
| `mem/index.md` | Eintrag für v150 |
| `.lovable/plan.md` | Plan-Eintrag |

## Validierung

1. Nach Deploy: User triggert Retry für Matthew (Pass 2) in Szene 827ed500.
2. Erwartet im sync-so-webhook Log: `voiced_ratio=0.11 suspect_gated_by_voiced_ratio=true → PASS_DONE (no escalation)`.
3. Erwartet im compose-dialog-segments Log: `v150_fresh_bypass_preclip_for_bbox_url_pro` + `v147_BBOX_URL_PRIMARY`.
4. Pass-Status → `done`, scene fortschreitet auf `compose_lipsync_segments`.

## Was bewusst NICHT geändert wird

- v147 bbox-url-pro selbst (bleibt PRIMARY für Multi-Speaker).
- v148 NOOP-Bypass-Preclip (bleibt für echte NOOPs).
- v134 Ladder-Mechanik (nur die Stufenanzahl).
- `syncOutputUnchanged` (etag/bytes-identisch) als harter NOOP-Indikator.
- Credit-Refund-Logik bei Hard-Fail.
