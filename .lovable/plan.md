# V446 — Split-Screen entsteht bereits im Anker, nicht erst im Clip

## Befund (belegt, nicht vermutet)

Szene S11 `e658509d-cdeb-40f7-bd33-98e74144fdc5`, Lauf `e0e54c76…`, `plate_generation = 11`,
17:40:30 UTC:

- `clip_error` = Plate-Quality-Gate (v9): Split-Screen-/Panel-Layout erkannt, 4 Panels,
  Credits erstattet (`refunded_credits: 960`, `plate_dims 832×1108`, 4 Gesichter).
- Der v445-Klassifikator hat also **korrekt** gegriffen — das ist kein Fehlalarm.
- Der Video-Prompt ist sauber ("all four standing in a single horizontal line … one
  continuous cinematic frame").
- Entscheidend: Das **Ankerbild selbst** (`reference_image_url`,
  `…scene-anchors/e658509d…-06c3f3753ee1.png`, 896×1195) ist bereits eine
  4-Spalten-Collage — vier vertikale Streifen mit sichtbaren Nähten, versetztem
  Hintergrund und unterschiedlichen Maßstäben.

Damit ist die Kausalkette geschlossen: Der Bildgenerator (Nano Banana 2 / Gemini) baut
aus vier Einzelporträts in einem Hochformat-Rahmen einen Streifen-Kollage-Anker. Das
Videomodell reproduziert den Anker pflichtgemäß. Der Split-Screen-Gate schlägt erst nach
dem teuren Renderlauf zu — der Fehler wird also spät und mit vollem Zeitverlust bemerkt,
obwohl er schon beim Standbild sichtbar war.

Der bestehende Anker-Audit prüft Identität (Swap/Dupe/Missing) und Mindest-Gesichtsgröße,
aber **nicht** die Panel-Topologie.

## Ziel

Panel-Anker werden beim Standbild erkannt und behoben, bevor irgendein Videoclip
gerendert wird. Kein Lauf mehr, der 6/6 Clips produziert und dann verworfen wird.

## Umfang (bounded)

1. **Anker-Panel-Gate**
   Der vorhandene, reine Klassifikator `_shared/split-screen-layout.ts` wird zusätzlich
   auf die bereits vorhandenen Anker-Gesichts-Bboxen (`anchor_face_layout`) im
   Audit-Block von `compose-video-clips` angewandt. Ergebnis wird als
   `anchor_face_audit.panel_layout` mit Metriken persistiert.

2. **Anti-Panel-Recompose (gebunden)**
   Ein Panel-Verdikt zählt wie ein Audit-Fehlschlag und löst genau die bereits
   existierende Retry-Stufe aus (kein neuer Retry-Mechanismus, kein zusätzlicher
   Versuch). Der Recompose bekommt eine Anti-Panel-Direktive auch für N ≥ 2 — bisher
   existiert diese Formulierung nur im Einzelcharakter-Zweig von
   `compose-scene-anchor`: eine gemeinsame Raumtiefe, ein Kamerastandpunkt, ein
   durchgehender Hintergrund, keine Streifen/Panels/Collagen/Nähte.

3. **Fail-fast statt teurer Fehlschlag**
   Bleibt der Anker nach dem vorhandenen Versuchsbudget ein Panel, bricht die Szene
   **vor** der Provider-Dispatch ab (null Ausgaben), mit dem bestehenden
   idempotenten Refund-Pfad und einer lokalisierten Meldung (EN/DE/ES), die den Anker
   als Ursache benennt — nicht den gerenderten Clip.

4. **Telemetrie**
   `v446_anchor_panel_verdict`, Metriken (`ySpreadPct`, `gapSpreadPct`, `hSpreadPct`),
   Versuchsindex und Endzustand ins bestehende Audit-/Dispatch-Log.

## Ausdrücklich nicht im Umfang

- Keine Änderung an der eingefrorenen Lip-Sync-Kette (Preclip → Plate → Sync → Maske → Mux).
- Keine neuen Schwellenwerte im v445-Klassifikator, keine neue Retry-Politik.
- Kein Wechsel des Anker-Seitenverhältnisses und kein Provider-Wechsel.
- Kein Owner-/S11-Render, kein Frontend-Publish, keine DB-Migration.

## Technische Details

- `supabase/functions/compose-video-clips/index.ts` — Panel-Prüfung im Audit-Block
  (dort, wo `anchor_face_layout` und `enforceMinFaceSize` bereits laufen),
  Verdikt-Persistenz in `audioPlan.twoshot.anchor_face_audit`, Hard-Fail vor Dispatch.
- `supabase/functions/compose-scene-anchor/index.ts` — Anti-Panel-Klausel für N ≥ 2 im
  Strict-Retry-Zweig.
- `supabase/functions/_shared/split-screen-layout.ts` — unverändert, nur wiederverwendet.
- Tests: Deno-Test mit den echten S11-Ankerboxen (Panel → block) und einer echten
  Gruppenszene (kein Block); vorhandene v445-Tests müssen grün bleiben.
- Deploy nach grüner Verifikation: nur `compose-video-clips` und `compose-scene-anchor`.

## Verifikation

Deno-Tests + Vitest grün, Build grün, Diff auf die drei genannten Dateien plus Test
begrenzt. Abschluss mit einem festen PASS/BLOCKED-Verdikt; der eine Owner-Rerender bleibt
einem separaten Gate vorbehalten.
