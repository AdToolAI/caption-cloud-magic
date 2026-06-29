# v170 — Artlist-Parity: Extras & Bystander allowed, Cast Lock unverändert

## Was du willst (und was Artlist macht)
- **N=1 spricht, andere laufen vorbei** → OK
- **4 Charaktere im Cast, nur einer spricht** → OK
- **Laptop-Bildschirm / Foto an der Wand / Spiegelung** → OK (gehört zur Welt)

Was NICHT OK ist (das muss Audit weiter blocken):
- Cast-Person wird **dupliziert** (Samuel zweimal im Frame)
- Cast-Person **fehlt** (Sprecher ist gar nicht da)
- Cast-Person bekommt **falsches Gesicht** (Swap)

Heute scheitert die Pipeline an „Audit zählt jeden Menschen / jedes dargestellte Gesicht und vergleicht mit Cast-Count". Das ist falsch.

## Neue Invariante
> Anchor-Audit prüft **Cast-Integrität**, nicht Total-Headcount.
> Extras (Bystanders, Crowd, vorbeilaufende Personen, depicted persons auf Screens/Fotos/Spiegeln) sind erlaubt, solange:
> 1. Jedes Cast-Mitglied ist genau einmal als reale Person im Frame.
> 2. Kein Cast-Gesicht erscheint zweimal (Clone).
> 3. Kein Cast-Slot zeigt ein falsches Gesicht (Swap).

## Eingriffe

### 1. `supabase/functions/_shared/identity-audit.ts` — Cast-only Audit, jetzt auch für N=1
- `auditAnchorIdentity` läuft **auch für N=1** (heute: `portraitUrls.length < 2 → return null`). Bei N=1 prüft sie nur „erscheint Samuel genau einmal, nicht zweimal, nicht swap, nicht missing".
- Prompt erweitert: *„Bystanders, background pedestrians, crowd, people walking by, people on screens/posters/photos/mirrors/statues are EXTRAS and do NOT count toward `perReference`. Only count REAL physically present humans that visually match each reference portrait."* Felder `perReference[].appearances` + `faceMatch` bleiben, `extraPeople` wird kein Fail-Grund mehr.
- Failure-Priorität bleibt: `swap > clone > missing`. `extra` wird komplett gestrichen.

### 2. `supabase/functions/compose-video-clips/index.ts` — `evaluate()` & Hard-Aborts
- `evaluate()`: `countHumansInImage` / `countFacesInImage` Aufrufe entfernt für die **Fail-Entscheidung**. Wir loggen sie weiter zu Telemetriezwecken, aber sie blocken nichts mehr.
- Hard-Abort-Block (Zeilen 1908–1984):
  - `extra` Reason wird gestrichen → nur noch `swap | clone | missing | ambiguous` blocken.
  - `humanCount > expectedFaces` und `faceCount > expectedFaces` Checks entfernt.
  - `faceCount < expectedFaces && humanCount < expectedFaces` bleibt als „missing"-Signal — Wert kommt jetzt aus Audit, nicht aus countHumans.
- N=1 läuft jetzt durch den Audit-Pfad (mind. 1 Portrait → Audit wird aufgerufen).
- `ANCHOR_AUDIT_VERSION` 10 → 11 invalidiert kaputten Cache.

### 3. `supabase/functions/compose-scene-anchor/index.ts` — Prompt-Liberalisierung
- `EXACT_COUNT_SUFFIX` (beide Zweige) wird umformuliert von „EXACTLY N people total" zu **„EXACTLY N CAST people (each reference appears once); background extras / bystanders / pedestrians / crowd are allowed if natural for the scene"**.
- `TWO_SHOT_NEGATIVE` behält Clone-/Triptych-/Mirror-Verbote, streicht „background bystander / coworker / crowd / extra unreferenced human" aus der AVOID-Liste.
- `STRICT_RETRY_SUFFIX` adressiert weiterhin Clone/Triptych/Swap, nicht Extras.
- Cast-Bindung („each reference appears exactly once, no duplicates, no swap") bleibt 1:1 erhalten.

### 4. Memory
`mem/architecture/lipsync/v170-cast-integrity-not-headcount.md`:
> Anchor-Audit prüft Cast-Integrität (no clone, no swap, no missing per reference). Extras/Bystanders/depicted persons sind erlaubt — Artlist-Parität. Headcount-Vergleich wurde entfernt. v168 Anti-Triptych bleibt (Clone-Schutz). v131.6 Face-Lock bleibt (Swap-Schutz).

## Was bleibt UNVERÄNDERT
- v167 Plate-Prompt (camera-lock + subtle mouth motion N=1)
- v168 Anti-Triptych / Anti-Clone für N=1 (Samuel-3x-nebeneinander wird weiter geblockt — das ist Clone, nicht Extra)
- v169 N=1 Tail-Talk-Fix (Overlay-Mode bypass)
- v131.6 Face-Lock Attempt-3
- Plate-Face-Targeting v77/v78 (Lipsync trifft trotz Bystanders das richtige Cast-Gesicht, weil Targeting per Portrait-Match läuft)
- Refund/Watchdog/ASD

## Verifikation
1. **N=1 mit Laptop-Reflektion** → Audit `ok`, Szene rendert.
2. **N=1 in Coworking-Space mit 3 vorbeilaufenden Personen** → Audit `ok`.
3. **N=4 Cast, 1 spricht** (Cinematic-Sync 4-Personen, eine Lipsync-Pass) → Audit prüft alle 4 Cast vorhanden + keiner dupliziert; Lipsync läuft nur auf dem aktiven Sprecher (bestehender v90-Pfad).
4. **Regression Samuel-Triptychon (N=1, 3× Samuel)** → Audit `clone` → blockt korrekt mit v168-Verhalten.
5. **Regression Swap (N=2, falsches Gesicht in Slot)** → Audit `swap` → Face-Lock-Retry feuert wie gehabt.

## Deploy
`compose-video-clips`, `compose-scene-anchor` neu deployen; Frontend unverändert.
