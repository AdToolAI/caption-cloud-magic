
Ziel

- Das Problem sauber lösen, statt nur zwischen Ebenen umzuschalten:
  - Wenn Untertitel oder Text in Schritt 10 entfernt werden, müssen sie wirklich aus der Preview verschwinden.
  - Der User soll in Schritt 10 sowohl Step-10-Untertitel als auch frühere Text-Overlays aktiv verwalten und löschen können.

Was ich im Code gefunden habe

- Der Preview-Player selbst rendert korrekt getrennt:
  - `subtitleTrack.clips` = echte Step-10-Untertitel
  - `textOverlays` = Text aus früheren Schritten
- In `CapCutEditor.tsx` wird beim Preview aktuell nur:
  - `subtitleTrack={showSubtitles ? subtitleTrack : ...}`
  - `textOverlays={showTextOverlays ? textOverlays : []}`
  übergeben.
- Das heißt:
  - Die Toggles blenden nur aus.
  - Sie löschen nichts.
- Der eigentliche Text kommt sehr wahrscheinlich aus `textOverlays`, die in `DirectorsCut.tsx` als globaler State aus Schritt 6 weitergereicht werden.
- `CapCutEditor` hat aktuell gar keinen Callback, um diese `textOverlays` wirklich zu verändern oder zu entfernen.

Saubere Lösung

1. Text-Overlays in Schritt 10 wirklich editierbar machen
- `CapCutEditor` um einen echten Callback erweitern:
  - `onTextOverlaysChange?: (overlays: TextOverlay[]) => void`
- Diesen Callback aus `DirectorsCut.tsx` mit `setTextOverlays` durchreichen.
- So kann Schritt 10 nicht nur anzeigen, sondern die Overlays tatsächlich löschen.

2. In Schritt 10 klar zwischen zwei Textquellen unterscheiden
- In der Sidebar zwei getrennte Bereiche anzeigen:
  - „Untertitel“
  - „Text-Overlays aus früheren Schritten“
- Für Text-Overlays:
  - Anzahl anzeigen
  - Liste der Overlays mit Textinhalt / Zeitraum anzeigen
  - Button „Entfernen“
  - optional „Alle Text-Overlays entfernen“

3. Untertitel- und Overlay-Entfernung robust machen
- Beim Entfernen aller Original-Untertitel:
  - `selectedSubtitleId` zurücksetzen
  - leeren State sofort sichtbar machen
- Beim Entfernen eines Text-Overlays:
  - direkt `onTextOverlaysChange(filtered)` aufrufen
- Beim Entfernen aller Overlays:
  - `onTextOverlaysChange([])`

4. Preview-Diagnostik behalten, aber klar als Diagnose
- Die bestehenden Toggle-Schalter bleiben nützlich.
- Aber sie sollten sichtbar als „Nur Vorschau ausblenden“ formuliert werden, damit klar ist:
  - Toggle = nicht löschen
  - Entfernen = wirklich aus Projektzustand entfernen

5. Burned-in Text sauber kommunizieren
- Wenn:
  - `subtitleTrack.clips.length === 0`
  - `textOverlays.length === 0`
  - und trotzdem Text im Video sichtbar bleibt,
  dann Hinweis anzeigen:
  - Der Text ist im Quellvideo eingebrannt und kann hier nicht entfernt werden.
- Das ist die einzige wirklich saubere Restfall-Erklärung.

Betroffene Dateien

- `src/pages/DirectorsCut/DirectorsCut.tsx`
- `src/components/directors-cut/studio/CapCutEditor.tsx`
- `src/components/directors-cut/studio/CapCutSidebar.tsx`

Konkrete Umsetzung

- `DirectorsCut.tsx`
  - `onTextOverlaysChange={setTextOverlays}` an `CapCutEditor` übergeben
- `CapCutEditor.tsx`
  - neues Prop `onTextOverlaysChange`
  - Handler für:
    - einzelnes Overlay löschen
    - alle Overlays löschen
  - diese Handler an `CapCutSidebar` weiterreichen
- `CapCutSidebar.tsx`
  - neuer Bereich „Text-Overlays“
  - Overlay-Liste mit Remove-Actions
  - Button „Alle entfernen“
  - Diagnose-Toggles sprachlich trennen von echten Löschaktionen

Technische Details

```text
Aktuell:
Schritt 10 kann textOverlays nur anzeigen oder temporär ausblenden.

Benötigt:
Schritt 10 muss textOverlays auch in den Parent-State zurückschreiben.
```

```text
subtitleTrack = editierbare Step-10-Untertitel
textOverlays  = separate Textlayer aus früheren Schritten
burned-in     = Teil des Originalvideos, nicht entfernbar
```

Ergebnis nach dem Fix

- Entfernte Untertitel verschwinden wirklich.
- Entfernte Text-Overlays verschwinden wirklich.
- Der User kann neue Musik und neue Untertitel sauber drüberlegen.
- Falls danach immer noch Text sichtbar ist, ist eindeutig klar: er ist eingebrannt.
