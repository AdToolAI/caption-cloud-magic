<final-text>## Plan: Fehlenden Director’s-Cut-Untertitel im echten Exportpfad final beheben

### Was jetzt sicher ist
- Der Editor exportiert `subtitle_track` bereits bereinigt.
- Die Render-Funktion reicht den Track korrekt als `subtitleTrack` weiter.
- Die aktuelle `DirectorsCutVideo`-Composition rendert Untertitel bereits im Code.
- Die Studio-Vorschau zeigt Untertitel separat korrekt an.

Damit ist der wahrscheinlichste Restfehler nicht mehr der Payload, sondern das tatsächlich verwendete Render-Bundle hinter `REMOTION_SERVE_URL`.

### Umsetzung
1. **Bundle-Verifikation eindeutig machen**
   - In `src/remotion/utils/subtitleConstants.ts` die Subtitle-Version erhöhen.
   - In `src/remotion/templates/DirectorsCutVideo.tsx` beim ersten Frame einen klaren Canary loggen:
     - Bundle-Version
     - `subtitleTrack.visible`
     - Clip-Anzahl
     - erstes Clip-Zeitfenster / Text-Ausschnitt

2. **Render-Pfad besser nachvollziehbar machen**
   - In `supabase/functions/render-directors-cut/index.ts` zusätzlich das verwendete `REMOTION_SERVE_URL` und die Subtitle-Metadaten mitloggen bzw. am Render-Job mitschreiben.

3. **Aktives Remotion-Bundle synchronisieren**
   - Das Bundle, auf das `REMOTION_SERVE_URL` zeigt, auf die aktuelle Codebasis aktualisieren bzw. auf das frische Bundle umstellen.
   - Das ist sehr wahrscheinlich der eigentliche Fix.

4. **Falls nötig: Sichtbarkeits-Diagnose für genau einen Test-Render**
   - Wenn der neue Canary im Log auftaucht, Untertitel aber weiter fehlen, setze ich die Export-Untertitel testweise extrem auffällig und oben ins Bild.
   - So lässt sich sofort unterscheiden: „nicht gerendert“ vs. „gerendert, aber unsichtbar/verdeckt“.

5. **End-to-end verifizieren**
   - Neuen Export starten.
   - Prüfen, ob der neue Canary in den Render-Logs erscheint.
   - Danach Video im Modal und als MP4 kontrollieren, ob die Untertitel sichtbar eingebrannt sind.

### Betroffene Dateien / Konfiguration
- **Edit:** `src/remotion/utils/subtitleConstants.ts`
- **Edit:** `src/remotion/templates/DirectorsCutVideo.tsx`
- **Edit:** `supabase/functions/render-directors-cut/index.ts`
- **Backend-Konfiguration:** `REMOTION_SERVE_URL`

### Technische Details
- Keine Datenbank- oder Auth-Änderungen nötig.
- Der offene Fehler liegt sehr wahrscheinlich außerhalb des bereits gefixten Editor-Payloads.
- Ziel ist jetzt nicht noch ein weiterer Blind-Fix im Frontend, sondern ein harter Nachweis, welches Bundle wirklich rendert.

### Ergebnis
- Wir sehen eindeutig, welches Bundle tatsächlich verwendet wird.
- Der Export läuft wieder über die aktuelle Subtitle-Logik.
- Untertitel sind im finalen Director’s-Cut-Video wieder sichtbar.</final-text>