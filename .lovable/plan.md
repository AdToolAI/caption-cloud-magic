
## Plan: Exportierte Untertitel wirklich sichtbar machen

### Was ich bereits verifiziert habe
- Der Editor sendet inzwischen korrekt `subtitle_track` mit den Untertiteln.
- Der Render-Job speichert diese Untertitel auch korrekt in der Datenbank.
- Die aktuelle `DirectorsCutVideo`-Composition im Code rendert Untertitel bereits im Export-Pfad.
- Damit liegt der verbleibende Fehler sehr wahrscheinlich nicht mehr im Editor-Payload, sondern im serverseitigen Render-Bundle, das aktuell fürs finale Video verwendet wird.
- Zusätzlich gibt es eine sichtbare Abweichung zwischen Studio und Export: Im Studio sitzen Untertitel deutlich höher, im Export aktuell zu nah am unteren Rand. Dadurch können sie in der Video-Vorschau hinter den nativen Player-Controls verschwinden.

### Umsetzung
1. **Render-Bundle synchronisieren**
   - Sicherstellen, dass der Backend-Renderer wirklich die aktuelle `DirectorsCutVideo`-Version nutzt.
   - Falls nötig das verwendete Remotion-/Render-Bundle neu veröffentlichen bzw. auf die aktuelle Version zeigen lassen.
   - Optional einen kleinen Versionsmarker/Debug-Log einbauen, damit sofort klar ist, ob der neue Bundle aktiv ist.

2. **Export-Renderer für Untertitel an die Studio-Vorschau angleichen**
   - Datei: `src/remotion/templates/DirectorsCutVideo.tsx`
   - Untertitel im Export genauso positionieren wie im Studio-Preview.
   - Fehlende Stil-Details übernehmen: konsistente Bottom-Offset-Logik, `maxLines`, `textStroke`, gleiche Font-/Size-Mappings und Umbruch-Verhalten.

3. **Preview und Export gegen erneute Abweichungen härten**
   - Gemeinsame Subtitle-Konstanten oder Helper verwenden, damit Layout und Styling nicht in zwei Pfaden auseinanderlaufen.

4. **End-to-end verifizieren**
   - Neues Director’s-Cut-Video exportieren.
   - Prüfen in:
     - Studio-Preview
     - Export-Vorschau/Modal
     - heruntergeladener MP4
   - Speziell kontrollieren, dass alle Untertitel-Segmente sichtbar eingebrannt sind.

### Technische Details
- Bestätigte Datenkette:
  `CapCutEditor -> render-directors-cut -> director_cut_renders.render_config.subtitleTrack`
- Der letzte Render-Job enthält bereits valide Untertitelclips mit `visible: true`.
- Das spricht dafür, dass der offene Fehler **nach** dem Request entsteht.
- Wahrscheinlich betroffene Dateien:
  - `src/remotion/templates/DirectorsCutVideo.tsx`
  - `supabase/functions/render-directors-cut/index.ts` (falls ich Versionsmarker/zusätzliche Logs ergänze)
  - optional eine kleine gemeinsame Subtitle-Utility
- Keine Datenbank- oder Auth-Änderungen nötig.

### Ergebnis
- Untertitel sind im final exportierten Video wieder sichtbar.
- Export und Studio-Vorschau sehen gleich aus.
- Künftige Subtitle-Fixes greifen nicht mehr nur in einem der beiden Render-Pfade.
