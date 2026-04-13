

## Plan: Untertitel zentriert positionieren statt links gequetscht

### Ursache
Das S3-Bundle enthält eine Zwischenversion des Subtitle-Codes, bei der die Zentrierung fehlt oder nicht korrekt greift. Die `AbsoluteFill`-Flexbox-Logik muss robuster gemacht werden.

### Umsetzung

1. **Subtitle-Styling härten in `DirectorsCutVideo.tsx`**
   - Explizit `width: '100%'` und `height: '100%'` auf den Subtitle-Container setzen (nicht auf `AbsoluteFill` vertrauen)
   - `position: 'absolute'`, `left: 0`, `right: 0`, `bottom: 0` direkt setzen statt nur Flexbox
   - `textAlign: 'center'` + `display: 'flex'` + `justifyContent: 'center'` doppelt absichern
   - Änderung in **beiden** Render-Pfaden (no-scenes-Fallback UND TransitionSeries-Pfad)

2. **Version bumpen** auf `v2026-04-13d-centered-fix`
   - Damit nach Bundle-Sync verifizierbar ist, dass die neue Version aktiv ist

3. **Bundle neu deployen**
   - Das Deploy-Script erneut ausführen, um das S3-Bundle mit der korrigierten Positionierung zu synchronisieren

### Betroffene Dateien
- `src/remotion/templates/DirectorsCutVideo.tsx` — robusteres Subtitle-Layout
- `src/remotion/utils/subtitleConstants.ts` — Version bump

### Ergebnis
- Untertitel erscheinen zentriert am unteren Bildrand, wie in der Studio-Vorschau

