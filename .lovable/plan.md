## Was wirklich passiert

**1. Character-Swap (Sprecher 1 spricht Text von Sprecher 2 und umgekehrt)**

Ursache eindeutig identifiziert in `supabase/functions/compose-dialog-segments/index.ts` (Zeilen 491–514):
Beim letzten Fix gegen `provider_unknown_error` haben wir `options.active_speaker_detection` komplett aus dem Sync.so-Payload entfernt. Im Segments-Modus von `lipsync-2-pro` heißt das: **Sync.so kennt keine Face-Zuordnung mehr und ratet, welche Audio-Spur auf welches Gesicht geht.** Die FaceMap wird zwar weiterhin korrekt berechnet (DB-Beleg: Scene `4f229ba4` → `characterId: "matthew-dusatko"` links, `samuel-dusatko` rechts mit `matchConfidence 0.8`), aber der Payload trägt sie nicht mehr — also wird sie ignoriert.

Das ist KEIN Sync.so-Bug, sondern unser Trade-off von gestern, der die Lipsync-Qualität zerstört. Wir müssen ASD zurückbringen — aber so, dass `lipsync-2-pro` nicht crasht.

**2. Progress-Bar läuft nach „fertig"-Signal weiter**

Im UI ist Lipsync = 20 % Gewicht. Wenn Lipsync nach ~5 min `applied` ist, springt der Hook korrekt auf `progress=1` für die Phase (Zeile 363) — aber der Gesamt-Bar interpoliert weiter Richtung „nominal 480 s". Heißt: der Balken läuft sichtbar weiter, obwohl Lipsync fertig ist, weil keine spätere Phase (Export) ihn ablöst. Wenn anschließend kein Composer-Master-Render automatisch getriggert wird, hängt der Bar gefühlt für immer.

## Fix-Plan

### Schritt 1 — Sync.so Segments + Face-Targeting korrekt verbinden

Statt blind ASD wegzulassen, eine **dokumentations-konforme Repro-Matrix** gegen `lipsync-2-pro` fahren — diesmal mit den richtigen Variablen:

| Variant | segments | options.active_speaker_detection | Erwartung |
|---------|----------|---------------------------------|-----------|
| A | ja | `{ auto_detect: false, coordinates, frame_number }` (1 Sprecher-Form, aber 2 Audios) | klärt ob `coordinates` mit segments lebt |
| B | ja | `{ auto_detect: false, bounding_boxes: [...]}` mit Länge = `videoFrames` bei **echter** FPS (probe via ffprobe-HEAD) | unsere alte Annahme war 24 fps fix — möglicherweise war ASS-Boxen-Length falsch |
| C | ja | jeweils `segments[i].options.bounding_box` (Sync.so segments-API erlaubt per-segment options laut Doku-Section „Segments Reference") | sauberste Variante |
| D | ja | `auto_detect: true, speaker_labels` mit Speaker-Mapping pro `audioInput.refId` | falls Sync.so segments einen eigenen Speaker-Label-Path hat |

Diese Matrix wird als einmaliges Diagnose-Skript ausgeführt (kein Code-Patch), Ergebnisse landen in einer neuen `syncso_dispatch_log.meta.repro_matrix` Spalte.

**Sobald die Matrix zeigt welche Form akzeptiert wird:**
- Den `compose-dialog-segments`-Dispatcher anpassen, die ermittelte FaceMap + Bboxes wieder in der richtigen Form mitsenden.
- `_diagnosticAsd` umbenennen zu echtem `asdOptions` und in den Payload reinhängen.
- Den Kommentar (Zeile 491–498) auf die tatsächliche Erkenntnis aktualisieren.

### Schritt 2 — Audio-Cross-Routing absichern

Selbst mit korrekter ASD: Wenn `audio_1` versehentlich Samuels Stimme enthält, der Index aber Matthew zugeordnet ist, swappen wir trotzdem. Deshalb:
- In `compose-dialog-segments` vor Dispatch ein assertion-log: `audioRefMap[audio_N] ↔ speakers[N].character_id ↔ faceMap.faces[*].characterId` als Triple ausgeben, damit Cross-Wires sofort sichtbar sind.
- Sanity-Check: wenn FaceMap-Identity-Match `confidence < 0.6` → Fallback-Heuristik (left=spk0, right=spk1) verwenden statt unzuverlässige Identität.

### Schritt 3 — Progress-Bar nach Lipsync-Done korrigieren

In `usePipelineProgress.ts`:
- Wenn `lipsyncReal.done === true` UND kein Composer-Master-Render läuft (`renderRunning=false` & `renderPercent=0`), den Gesamt-Bar **auf den Summenanteil aller fertigen Phasen klemmen** statt weiter Richtung `RUN_NOMINAL_SECONDS` zu interpolieren.
- Konkret: floor + ceiling-Logik so dass der Bar nach Lipsync-Done max bei `sum(weights of done phases)` steht und auf einen User-Trigger („Render Final") wartet, bevor er weiterläuft.
- Optional aber empfohlen: nach Lipsync-Done eine UI-Card „Alle Szenen fertig — jetzt zusammenfügen?" anzeigen, damit klar ist warum der Bar pausiert.

### Schritt 4 — Hängende laufende Szenen aufräumen

Aktuell in der DB:
- `7755034f-…` und `5b0ff130-…` stehen `failed` mit `provider_unknown_error` (alter Run, schon refunded — kein Action nötig)
- Sollte beim Re-Test ein neuer Run hängen bleiben: Migration mit gleichem Pattern wie 2026-05-29.

## Technische Details

**Betroffene Dateien:**
- `supabase/functions/compose-dialog-segments/index.ts` (Payload Z. 500–514, ASD-Logik Z. 447–499)
- `supabase/functions/sync-so-webhook/index.ts` (Telemetrie der Matrix-Ergebnisse)
- `supabase/functions/_shared/twoshot-face-map.ts` (Sanity-Threshold)
- `src/hooks/usePipelineProgress.ts` (Gesamt-Bar Cap nach Lipsync-Done)
- Neue Migration für `syncso_dispatch_log.meta.repro_matrix` Sichtbarkeit (rein optional — Spalte ist bereits jsonb)

**Was NICHT in den Scope gehört:**
- Kein Wechsel weg von Sync.so
- Kein neues Modell (lipsync-2-pro bleibt)
- Kein Refactor der gesamten v5-Pipeline
- Keine DB-Schemaänderungen außer evtl. einem `last_asd_form` Telemetriefeld

## Rückfragen vor Build

Eine wichtige Entscheidung steht offen: Soll die Repro-Matrix
**(a)** vor jedem Code-Patch einmalig manuell als Diagnose-Skript laufen (ich führe sie aus, melde Resultate, dann patch ich gezielt) — sicherer aber 1 Loop mehr, oder
**(b)** direkt der wahrscheinlichste Pfad (Variant C — per-segment `bounding_box`) implementieren und live testen — schneller aber risikoreicher wenn C ebenfalls scheitert?

Mein Vorschlag: **(a)**. Wir haben gestern schon einmal „dachten wir abgedeckt" erlebt — diesmal lieber erst messen.
