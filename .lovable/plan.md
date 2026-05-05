## Problem

Auf dem Dashboard läuft das Hintergrund-Karussell-Video (`DashboardVideoCarousel`) weiter, wenn man es **unmuted** und dann auf die Karte / Expand-Button klickt. Das öffnet den `VideoPreviewPlayer`-Dialog, der dasselbe Video erneut mit `autoPlay` startet — Ergebnis: zwei parallele Audio-Spuren.

Der Demo-Video-Pfad (Zeilen 386–393, 428–433) pausiert die Demo bereits korrekt vor dem Öffnen und spielt sie nach dem Schließen weiter. Für die echten User-Videos (Pfad ab Zeile 444 / `handleCardClick`) fehlt diese Logik komplett.

## Lösung

In `src/components/dashboard/DashboardVideoCarousel.tsx`:

1. **`handleCardClick`** so erweitern, dass beim Öffnen des Dialogs **alle** `videoRefs` pausiert werden (nicht nur die aktive — defensiv) und das aktive Video stumm gestellt wird, bevor `setSelectedVideo(...)` gefeuert wird.
2. **Dialog-Close-Handler** für den nicht-Demo-Pfad ergänzen (analog zum Demo-Pfad): nach dem Schließen das Karussell-Video an `selectedIndex` mit dem aktuellen `isMuted`-Zustand wieder anwerfen.
3. **`toggleMute`** absichern: wenn der Dialog offen ist, soll das Mute-Toggle des Karussells den im Hintergrund laufenden Audio-Stream nicht „aufdecken“ — wir lassen das Karussell-Video während eines offenen Dialogs immer pausiert/muted.

Optional als kleine Härtung: ein einziger `useEffect`, der auf `selectedVideo !== null` reagiert und in dem Fall **alle** Refs pausiert — dann brauchen wir keine Inline-Pause-Calls mehr verstreut.

## Geänderte Datei

- `src/components/dashboard/DashboardVideoCarousel.tsx`

Keine Backend-Änderungen, keine neuen Dependencies.

## Akzeptanzkriterien

- Karussell-Video unmuten → auf die Karte oder den Expand-Button klicken → der Dialog öffnet sich, das Karussell-Video pausiert sofort, **nur** der Dialog-Player ist hörbar.
- Dialog schließen → Karussell-Video läuft an der ursprünglichen Position weiter, Mute-Zustand bleibt erhalten.
- Demo-Pfad funktioniert weiterhin wie bisher.