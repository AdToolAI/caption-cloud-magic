
# v117 — Plate-Quality-Gate Soft-Fail + Identity-Resolver Repair

## Was du gesehen hast
Toast: `Lip-Sync fehlgeschlagen — v116_plate_quality_gate`.

Die Plate ist objektiv in Ordnung (4 Personen frontal sichtbar, 1376×768). DB-Log zeigt:

```
detected_faces = 4   ← Face-Detector hat alle 4 Köpfe gefunden ✅
resolved_faces = 0   ← Gemini Vision konnte 0 davon einem Charakter zuordnen ❌
→ v116-Gate blockt, refundet 324 Credits, zwingt Plate-Re-Render
```

Die Plate ist also nicht das Problem — der **Identity-Resolver** versagt. Der v116-Gate ist zu strikt: er verweigert Dispatch, obwohl alle 4 Gesichter da sind.

## Root Cause (in `_shared/plate-face-identity.ts`)
1. **Verwirrender Gemini-Prompt**: Text sagt *„FIRST attachment is a video; look at frame at timestamp X.XXs"* — wir schicken aber einen **einzelnen Still-Frame** (kein Video). Gemini fragt sich, wo das Video ist, antwortet leer/unzuverlässig → JSON-Parse failed → `out` bleibt leer → `resolvedCount=0`.
2. **Threshold 0.45 zu strikt** für ähnlich aussehende Hailuo-Plates (gleiche Beleuchtung, gleiche Wardrobe-Family).
3. **Kein Fallback** wenn Gemini 0 zurückgibt — wir haben aber eine extrem robuste Heuristik im Skript: Sprecher-Reihenfolge im Drehbuch ≈ left-to-right Slot-Order in der Plate.
4. **Gate ist binär** — blockt auch wenn `detectedFaces == speakers.length` (Plate ist real OK).

## Fixes (alle innerhalb v116-Architektur, kein Provider-/Schema-Wechsel)

### Fix A — Gemini-Identity-Prompt reparieren
`supabase/functions/_shared/plate-face-identity.ts`:
- Prompt umschreiben: *„The first image is a single frame from a scene. The remaining images are reference portraits."* (kein „video"/„timestamp" mehr).
- `slotDescriptions` mit echten Pixel-Boxen statt der kaputten Normalisierung (`/Math.max(1, center*2)` ergibt fast immer Nonsense).
- Confidence-Threshold von **0.45 → 0.30**. Bei N=4 will man im Zweifel die wahrscheinlichste Zuordnung, nicht „null". Sync.so sync-3 verzeiht 10–15px Drift.
- Bei N≥3 zusätzlich Gemini 2.5 **Pro** statt Flash (besser bei Multi-Face Identity, ~€0.005 statt €0.001 pro Szene — vernachlässigbar).
- Bessere JSON-Extraktion (Greedy-Brace-Match + Fallback bei `assignments: []`).

### Fix B — Deterministischer Slot-Order Fallback
In `resolvePlateFaceIdentities`: wenn Gemini `identityBySlot.size === 0` **und** `plateMap.faces.length === characters.length`:
- Sortiere `characters` nach Sprech-Reihenfolge im Skript (kommt schon sortiert rein) → mappe 1:1 auf left-to-right Slots (`f.slot` ist bereits left-to-right sortiert).
- Markiere mit `matchConfidence: 0.4` und `slot_order_fallback: true` im Diagnostics-Log.
- Damit wird `resolvedCount = N` und Dispatch läuft mit korrekten Plate-Pixel-Coords (statt Anker-Rescale-Drift).

### Fix C — Gate von „hard block" auf „soft warn" umstellen
`compose-dialog-segments/index.ts` Zeile 1051–1150:
- Nur blocken wenn **`detectedFaces < speakers.length`** (echte fehlende Person, Sora-Out-of-Frame-Bug). Das ist der reale „Plate ist kaputt"-Fall.
- Wenn `detectedFaces >= speakers.length` aber `resolvedFaces < speakers.length` (nach Fix B unwahrscheinlich) → **kein Block**, sondern Warnung in `v116_diag` + dispatch mit Slot-Order-Fallback aus Fix B.
- Gate-Reason und Fehlermeldung im Toast / `clip_error` so umschreiben, dass „4 erkannt, 0 zuordenbar" nicht mehr abbricht.

### Fix D — Manueller Override-Button (Notausgang)
In `useResetLipSync` + `reset-lipsync-scene` (oder neuer Param am Composer-UI):
- Neuer Button „Trotzdem dispatchen (Plate ignorieren)" der `FORCE_SKIP_PLATE_GATE=true` per Request-Header (`x-skip-plate-gate`) für genau diesen einen Run setzt.
- Pure Client→Edge-Function Param, kein Env-Toggle nötig.
- Sicher: gilt nur für die nächste Dispatch-Attempt, keine permanente Deaktivierung.

## Was NICHT geändert wird
- Sync.so-Dispatch-Chain (v60 serial + sync-3 + auto_detect bei N=1 + bbox-url-pro bei N≥2) bleibt 1:1.
- v82 bbox-url-pro Ladder, v115 single-face auto_detect, Pricing, Refunds, Locks, Webhook — unverändert.
- v116 Fix A (Live-Identity-Verify) und Fix B (Face-Gate Self-Repair) bleiben — sie kommen erst NACH Fix C zum Tragen.

## Erwartetes Ergebnis
- Szene `b4ad868b…` / `7470be0d…` neu dispatchen → Gemini matcht jetzt 4/4 (Fix A) oder Slot-Order-Fallback greift (Fix B) → `resolvedCount=4` → Gate winkt durch → Sync.so läuft mit korrekten Plate-Pixel-Boxen statt Anker-Drift.
- Falls Gemini *wirklich* mal 0 trifft und Plate echt korrupt ist (Person out of frame): Gate blockt weiterhin, aber mit präziser Message und refundet sauber.
- N=1/2/3 Regression bleibt grün (kein Pfadwechsel bei diesen Counts).

## Verifizierung
1. `psql` resetten (`reset-lipsync-scene`) und neu dispatchen → `syncso_dispatch_log` zeigt `resolved_faces=4`, kein PREFLIGHT_BLOCKED.
2. Künstlich Plate mit nur 3 sichtbaren Personen testen → Gate blockt mit `plate_faces_missing(detected=3, expected=4)` (real-positive).
3. Override-Button drücken → Dispatch läuft trotz Gate-Warn.

## Betroffene Dateien
- `supabase/functions/_shared/plate-face-identity.ts` — Prompt-Repair + Slot-Order-Fallback + Gemini Pro für N≥3.
- `supabase/functions/compose-dialog-segments/index.ts` (Zeilen 1051–1150) — Gate-Logik soft.
- `supabase/functions/compose-dialog-segments/index.ts` (Header-Read) — `x-skip-plate-gate` Override.
- `src/hooks/useResetLipSync.ts` + UI-Button im Lipsync-Tab — „Trotzdem dispatchen".
- `mem/architecture/lipsync/v117-plate-gate-soft-and-identity-repair.md` + `mem/index.md`.

## Rollback
- Fix A/B sind additiv. Falls Gemini Pro Probleme macht → eine Zeile auf Flash zurück.
- Fix C kann via Re-aktivierung der strikten Bedingung in einer Zeile rückgängig gemacht werden.
- Fix D ist ein neuer optionaler Header, default off.
