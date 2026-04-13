
## Plan: Echten No-Scenes-Subtitle-Layoutfehler beheben

### Was ich im Code konkret gefunden habe
- In `src/remotion/templates/DirectorsCutVideo.tsx` gibt es aktuell drei Subtitle-Renderpfade.
- Der normale Exportpfad (`~1195`) und der interne Preview-Mode (`~969`) nutzen den neueren absoluten Container.
- Der **No-Scenes-Fallback** (`~724`) nutzt aber immer noch das alte `AbsoluteFill`-Layout.
- Das erklärt sehr gut, warum sich im Render “nichts geändert” hat: Wenn dein Projekt ohne aktive Szenensegmentierung exportiert, läuft es weiter durch den alten Subtitle-Pfad.

### Umsetzung
1. **No-Scenes-Fallback wirklich auf den neuen Subtitle-Container umstellen**
   - altes `AbsoluteFill`-Subtitle-Layout im Fallback entfernen
   - denselben robusten Container wie im funktionierenden Exportpfad verwenden
   - horizontale Positionierung zusätzlich deterministisch absichern:
     - `position: 'absolute'`
     - `left: '50%'`
     - `transform: 'translateX(-50%)'`
     - feste `maxWidth`
     - klare `bottom`-/`top`-Offsets statt nur Flex-Verteilung

2. **Doppelte Subtitle-Logik in `DirectorsCutVideo.tsx` zusammenziehen**
   - gemeinsame Render-Helferfunktion/Komponente für Subtitle-Clips anlegen
   - alle drei Pfade daraus rendern
   - so kann nicht wieder nur ein Branch gefixt sein und der andere alt bleiben

3. **Export-Geometrie auf Preview-Parität bringen**
   - Bottom-Offset, Seitenabstand und Max-Breite an den Preview-Player angleichen
   - Ziel ist nicht nur “sichtbar”, sondern identische Position wie in der Vorschau

4. **Version erneut bumpen und Render-Version mitziehen**
   - `SUBTITLE_RENDER_VERSION` auf eine neue Canary-Version erhöhen
   - `render-directors-cut` auf diese neue erwartete Version aktualisieren
   - Bundle danach erneut synchronisieren

5. **Gezielt verifizieren**
   - Testfall mit `scenes.length === 0`
   - Logs prüfen, dass wirklich der No-Scenes-Branch und die neue Canary laufen
   - neuen Export direkt gegen Preview vergleichen

### Betroffene Dateien
- `src/remotion/templates/DirectorsCutVideo.tsx`
- `src/remotion/utils/subtitleConstants.ts`
- `supabase/functions/render-directors-cut/index.ts`

### Technische Details
- Das Problem ist sehr wahrscheinlich nicht mehr Payload oder Untertitel-Datenfluss.
- Im aktuellen Code ist noch ein echter Restfehler sichtbar: Der Zentrierungs-Fix wurde **nicht konsistent in allen Export-Branches umgesetzt**.
- Solange der No-Scenes-Fallback den alten Subtitle-Container behält, kann der Export weiter rechts erscheinen, obwohl andere Pfade schon korrigiert sind.

### Ergebnis
- Untertitel werden auch ohne Szenensegmentierung sauber mittig unten gerendert
- Preview und Export nutzen wieder dieselbe Subtitle-Logik
- künftige Subtitle-Fixes müssen nur noch an einer Stelle gemacht werden
