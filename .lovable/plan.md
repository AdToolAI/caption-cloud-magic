# V507 — Warum S02 trotz korrektem Cast abbricht: Gesichts-Größen-Gate

## Nachgewiesener Befund (kein Rätselraten)

Szene S02 `67b392b1` in der Datenbank:

- `clip_status = ready` — die Platte wurde erfolgreich gerendert, der Cast ist diesmal korrekt (1 Frau, 3 Männer).
- `lip_sync_status = failed`, `twoshot_stage = failed`
- Fehlertext: `fa4_fail_closed:count_mismatch:anchor=4/plausible=1/detected=4`

Der Edge-Log derselben Sekunde nennt die exakte Ursache:

```text
fa4_candidate_sanity detected=4 plausible=1 rejected=3
reasons=[{"index":0,"reason":"area_too_small"},
         {"index":1,"reason":"area_too_small"},
         {"index":2,"reason":"area_too_small"}]
```

Die Gesichtserkennung (AWS Rekognition) hat **alle vier** Personen mit hoher Konfidenz gefunden. Danach hat ein reiner Größen-Filter drei davon verworfen, weil ihre Gesichtsfläche unter `minAreaRatio = 0.003` der Plattenfläche liegt (`plate-face-candidates.ts`, Contract A). Mit nur einem übrig gebliebenen Kandidaten gegen vier Anker-Slots fällt die Zuordnung fail-closed auf `count_mismatch` — also Abbruch bei 6/6 statt Lip-Sync.

Das ist kein Identitäts- und kein V506-Problem: V506 hat die Szene passieren lassen, weil der Cast korrekt ist. Es ist ein zu strenges Gate für **Totalen mit vier Personen**: bei 1920x1080 entspricht 0.003 rund 79x79 px Gesicht. In einer Vier-Personen-Weitaufnahme liegen die Gesichter typischerweise bei 50–75 px — direkt unter der Schwelle. Genau deshalb kippt dieselbe Pipeline bei Nahaufnahmen (S01) durch und bei Totalen nicht.

## Was gebaut wird

### A. Größen-Gate wird maßstabsfrei statt prozentual
Der Prozent-Floor stammt aus einem Nahaufnahmen-Kontext und skaliert falsch mit der Auflösung. Ersetzt wird er durch einen absoluten Pixel-Floor, der sich daran orientiert, was für ein verlässliches Mund-Tracking wirklich nötig ist (kürzere Gesichtsseite in Pixeln, nicht Flächenanteil). Der Prozent-Floor bleibt als reine Warn-Telemetrie erhalten, damit die Messwerte vergleichbar bleiben.

### B. Fail-closed bleibt fail-closed — aber mit dem richtigen Grund
Wenn Gesichter tatsächlich zu klein für sauberes Lip-Sync sind, bricht die Szene weiter ab, jedoch:
- vor dem Provider-Dispatch, also kostenfrei,
- mit einer Kundenmeldung, die den echten Grund nennt ("Gesichter in dieser Aufnahme zu klein für Lip-Sync — bitte engere Kadrierung"), nicht mit `count_mismatch`.

### C. Anker-Kadrierung für Vier-Personen-Szenen
Für Casts mit 3–4 Sprechern bekommt der Anker-Prompt eine verbindliche Kadrierungs-Klausel (Halbtotale/Medium Shot, Gesichter deutlich sichtbar, keine Ganzkörper-Totale). Damit entstehen Platten, in denen die Gesichter von vornherein groß genug sind — die Ursache, nicht nur das Symptom.

### D. Telemetrie
Gemessene Gesichtsgrößen (px, Flächenanteil, Plattenmaße, Ablehnungsgrund pro Slot) werden nach `composer_scenes.preview_audit` geschrieben, damit dieselbe Triage künftig nicht von Edge-Logs abhängt.

## Technische Details

- `supabase/functions/_shared/plate-face-candidates.ts`: `plateFaceSanity` erhält einen Pixel-Floor (kürzere Gesichtsseite) als Gate; `minAreaRatio` wird zu einem Warnwert. Neue Reason `face_too_small_for_lipsync`.
- `supabase/functions/_shared/plateFaceSlotRouter.ts`: Router unterscheidet "zu wenige Kandidaten wegen Größe" von echtem `count_mismatch` und gibt den spezifischen Grund samt Messwerten zurück.
- `supabase/functions/compose-dialog-segments/index.ts`: übersetzt den neuen Grund in eine lokalisierte Kundenmeldung (DE/EN/ES), kostenfreier Abbruch vor Dispatch, `preview_audit`-Write.
- `supabase/functions/compose-video-clips/index.ts`: Kadrierungs-Klausel für 3–4-Sprecher-Anker (kein neuer Provider, keine Kostenänderung).
- Tests: `plate-face-candidates.test.ts` erweitert (Totale mit 4 kleinen Gesichtern besteht, Miniatur-Gesichter fallen weiter durch); die bestehenden S11-Nahaufnahmen-Fälle bleiben unverändert grün.
- Kein Eingriff in die Lip-Sync-Kette selbst (v400-Baseline, T8–T13 unangetastet), kein automatischer Rerender.

## Nächster Schritt nach Umsetzung
Ein kontrollierter S02-Rerender — erst auf dein GO.
