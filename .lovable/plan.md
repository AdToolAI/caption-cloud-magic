
Ziel

- Sicherstellen, dass entfernte Step-10-Untertitel wirklich aus der Preview verschwinden.
- Gleichzeitig klar trennen, ob sichtbarer Text aus:
  1. editierbaren Untertiteln,
  2. Text-Overlays aus früheren Schritten,
  3. oder bereits eingebranntem Text im Originalvideo stammt.

Befund aus dem Code

- `CapCutEditor.tsx` hält einen lokalen `subtitleTrack` und gibt ihn direkt an `DirectorsCutPreviewPlayer` weiter.
- `DirectorsCutPreviewPlayer.tsx` rendert Untertitel nur aus `subtitleTrack.clips`.
- Wenn `subtitleTrack` leer ist, sollte diese Overlay-Schicht verschwinden.
- Dein Screenshot passt nicht zur aktuellen Subtitle-UI:
  - keine sichtbaren Subtitle-Clips in der Subtitle-Spur,
  - der Text im Video ist sehr klein und ohne typische Subtitle-Box.
- Deshalb ist der verbleibende Text sehr wahrscheinlich nicht der Step-10-Subtitle-Track, sondern:
  - ein `textOverlay` aus einem früheren Schritt, oder
  - bereits ins Quellvideo eingebrannt.

Umsetzung

1. Textquellen im Audio Studio sichtbar machen
- In `CapCutEditor.tsx` zwei getrennte Statuswerte berechnen:
  - `subtitleTrack.clips.length`
  - `textOverlays.length`
- Diese Infos an die Sidebar weiterreichen.

2. Klare Hinweise in Step 10 einbauen
- In `CapCutSidebar.tsx` im Untertitel-Bereich einen Hinweis anzeigen:
  - „Keine editierbaren Untertitel aktiv“
  - falls noch `textOverlays` existieren: „Sichtbarer Text stammt aus Text-Overlays aus einem früheren Schritt“
  - falls weder Untertitel noch Text-Overlays aktiv sind: „Wenn weiterhin Text sichtbar ist, ist er im Originalvideo eingebrannt“

3. Preview-Isolations-Toggles ergänzen
- In `CapCutEditor.tsx` lokale Preview-Toggles hinzufügen:
  - „Untertitel anzeigen“
  - „Text-Overlays anzeigen“
- An den Preview-Player dann abhängig davon entweder echte Daten oder leere Arrays übergeben:
```text
subtitleTrack -> an/aus
textOverlays  -> an/aus
```
- So kann man sofort sehen, welche Textschicht noch sichtbar ist.

4. Kleine State-Bereinigung
- Wenn alle Subtitle-Clips entfernt wurden:
  - `selectedSubtitleId` zurücksetzen
  - klare Empty-State-Meldung anzeigen
- Damit kein falscher Eindruck entsteht, dass noch ein Subtitle aktiv ist.

Betroffene Dateien

- `src/components/directors-cut/studio/CapCutEditor.tsx`
- `src/components/directors-cut/studio/CapCutSidebar.tsx`

Optional nur falls nötig

- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
  - nur wenn eine kleine Prop für Layer-Sichtbarkeit sauberer ist als leere Arrays zu übergeben

Technische Details

- Aktuell ist kein offensichtlicher Render-Bug im Subtitle-Overlay zu sehen:
```ts
const currentSubtitles = subtitleTrack.clips.filter(
  sub => displayTime >= sub.startTime && displayTime < sub.endTime
);
```
- Das eigentliche Problem ist sehr wahrscheinlich eine Vermischung mehrerer Textquellen:
```text
subtitleTrack = editierbare Untertitel aus Step 10
textOverlays  = separate Textlayer aus früheren Schritten
source video  = eingebrannter Text im Originalclip
```
- Der Fix sollte daher nicht nur „mehr löschen“, sondern die Quellen im UI sauber trennen und einzeln ein-/ausblendbar machen.
