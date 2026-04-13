<final-text>## Plan: Fehlende Untertitel im Exportpfad wirklich beheben

### Was ich jetzt sicher gefunden habe
- Der Export-Request enthält Untertitel korrekt:
  - `render-directors-cut` loggt `clips: 3, visible: true`
  - also ist der Editor-/Payload-Pfad nicht mehr das Problem
- Ich habe in `DirectorsCutVideo.tsx` einen echten Logikfehler gefunden:
  - Wenn `scenes.length === 0`, geht der Export in den Fallback-Branch
  - genau dieser Branch rendert aktuell **weder Untertitel noch Text-Overlays**
- Das erklärt das Verhalten sehr gut:
  - Studio-Preview zeigt Untertitel
  - finaler Export nicht
  - besonders bei Projekten ohne aktive Szenensegmentierung

### Umsetzung
1. **Fallback-Renderpfad in `DirectorsCutVideo.tsx` korrigieren**
   - Im `sortedScenes.length === 0`-Branch dieselbe Subtitle- und Text-Overlay-Logik rendern wie im normalen Exportpfad
   - gleiche Positionierung, Font-Größen, Farben und z-index verwenden

2. **Branch-Diagnostik ergänzen**
   - Klar loggen, ob der Render im `no-scenes`-Fallback oder im normalen Szenenpfad läuft
   - Subtitle-Clip-Anzahl direkt dort mitloggen

3. **Export gegen stille Fehlkonfiguration härten**
   - Falls `showSubtitles` nur als Preview-Toggle gedacht ist, Export davon entkoppeln bzw. klarer absichern
   - so verhindern wir, dass ein “nur Vorschau ausblenden” versehentlich auch den Export killt

4. **Bundle nur noch als sekundären Check behandeln**
   - Falls Untertitel nach dem Fallback-Fix immer noch fehlen, prüfe ich anschließend gezielt das aktive Render-Bundle
   - aber der erste konkrete Codefehler sitzt jetzt im Template selbst

### Betroffene Dateien
- **Edit:** `src/remotion/templates/DirectorsCutVideo.tsx`
- **Optional Edit:** `src/components/directors-cut/studio/CapCutEditor.tsx`
- **Optional Edit:** `supabase/functions/render-directors-cut/index.ts`

### Ergebnis
- Untertitel erscheinen auch dann im finalen Video, wenn keine Szenen im Export aktiv sind
- Preview und Export verhalten sich wieder konsistent
- Der Fehler wird an der tatsächlich fehlenden Render-Stelle behoben statt weiter nur am Payload zu suchen</final-text>