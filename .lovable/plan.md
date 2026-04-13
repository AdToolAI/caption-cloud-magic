
## Plan: Untertitel-Problem an der echten Ursache beheben

### Was jetzt sicher ist
- Die Preview rendert Untertitel korrekt.
- Der Export-Request enthält die Untertitel korrekt.
- `render-directors-cut` loggt die Untertitel korrekt (`clips: 3`, `visible: true`).
- Der aktuelle Template-Code rendert Untertitel bereits in beiden Export-Pfaden.
- In den Logs taucht aber **nicht** der aktuelle Canary `v2026-04-13c-fallback-fix` auf.
- `REMOTION_SERVE_URL` zeigt auf ein festes Bundle:
  `.../sites/adtool-remotion-bundle/index.html`

Damit ist der wahrscheinlichste Fehler jetzt klar:
**Der Renderer nutzt ein veraltetes Remotion-Bundle statt des aktuellen Repo-Codes.**

### Umsetzung
1. **Aktives Render-Bundle ersetzen**
   - Das Remotion-Site-Bundle aus der aktuellen Codebasis neu veröffentlichen.
   - `REMOTION_SERVE_URL` auf das frische Bundle umstellen oder das bestehende Bundle gezielt überschreiben.

2. **Bundle-Version hart absichern**
   - In den Render-Pfad eine erwartete Bundle-Version aufnehmen.
   - Wenn das aktive Bundle nicht zur erwarteten Version passt, soll der Render **klar fehlschlagen** statt still mit altem Code weiterzulaufen.

3. **Deploy-Prozess für Remotion stabilisieren**
   - Einen reproduzierbaren Bundle-Deploy-Workflow ergänzen, damit Template-Änderungen nicht mehr lokal im Repo landen, aber im Render veralten.
   - Ziel: Kein manueller Drift mehr zwischen Studio-Code und Lambda-Bundle.

4. **End-to-end verifizieren**
   - Neuen Render starten.
   - In den Logs prüfen, dass der aktuelle Canary erscheint.
   - Finales MP4 prüfen, ob die Untertitel sichtbar eingebrannt sind.

### Betroffene Bereiche
- `supabase/functions/render-directors-cut/index.ts`
- optional `supabase/functions/invoke-remotion-render/index.ts`
- Remotion-Bundle-Deployment / `REMOTION_SERVE_URL`
- optional neues Deploy-Script oder Doku für Bundle-Sync

### Technische Details
- Das ist sehr wahrscheinlich **kein weiterer Subtitle-Layoutfehler** mehr.
- Der Datenpfad und das aktuelle Template sind stimmig.
- Der entscheidende Fix ist jetzt die **Synchronisation des tatsächlich gerenderten Bundles**.
- Ohne diesen Schritt bringen weitere Subtitle-Codeänderungen im Repo voraussichtlich nichts.

### Ergebnis
- Der Export rendert wieder mit dem aktuellen Director’s-Cut-Template.
- Preview und finaler Render sind wieder konsistent.
- Untertitel werden im finalen Video sichtbar.
- Künftige Template-Fixes greifen zuverlässig auch im echten Renderpfad.
