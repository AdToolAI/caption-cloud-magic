Ich habe mir die echte Datenlage und den Frontend-Pfad angesehen. Die Datenbank enthält für den neuesten Motion-Studio/Composer-Render bereits die korrekte `sceneGeometry` im Render-Datensatz. Das Frontend nutzt diese aber aktuell nicht als harte Quelle: es rekonstruiert Szenen weiterhin aus `composer_scenes`, misst Clip-Dauern im Browser neu und öffnet Director's Cut ohne `render_id`. Dadurch kann es bei Race Conditions, Session-Drafts oder Auto-Cut/CoPilot-Kommandos weiterhin falsche/halluzinierte Szenen wie im Screenshot anzeigen.

Plan zur Behebung:

1. Render-ID als Pflichtteil der Handoff-Pipeline mitgeben
- `useMultiSceneRender` soll neben `videoUrl` auch die finale `renderId` zurückgeben.
- `RenderPipelinePanel` soll Director's Cut mit `source=composer`, `project_id`, `source_video` und `render_id` öffnen.
- Falls `render_id` fehlt, wird nicht still auf Auto-Cut/Browser-Rekonstruktion ausgewichen, sondern ein klarer Hinweis angezeigt.

2. Director's Cut importiert Composer-Szenen render-genau aus `video_renders.content_config.sceneGeometry`
- In `DirectorsCut.tsx` wird bei `source=composer` zuerst der `video_renders`-Datensatz per `render_id` geladen.
- Die Szenen-Zeiten kommen dann ausschließlich aus `content_config.sceneGeometry`.
- Die Beschreibungen/Labels werden nur ergänzend aus `composer_scenes` geholt, geordnet nach `order_index`.
- Keine Browser-Neumessung der Einzelclips mehr als Primärlogik, weil das genau zu Drift führen kann.

3. Stale Drafts endgültig blockieren
- Der Director's-Cut-Draft bekommt Metadaten wie `sourceKind`, `composerProjectId`, `composerRenderId` und `sourceVideoUrl`.
- Beim Öffnen eines neuen Composer-Renders wird ein alter Draft nicht nur bei anderem `project_id`, sondern auch bei anderem `render_id` verworfen.
- Nach erfolgreichem Composer-Import wird sofort der frische Snapshot gespeichert, damit nicht wieder alte Auto-Cut-Szenen zurückkommen.

4. Auto-Cut für Composer-Quellen vollständig sperren
- Der Sidebar-Button ist bereits teilweise entfernt, aber CoPilot-Kommandos können noch `auto_cut` oder `analyze_scenes` auslösen.
- Ich blockiere diese Kommandos in `handleCoPilotCommand`, wenn `composerSourceProjectId` aktiv ist.
- Zusätzlich bekommt die UI einen kleinen Statushinweis: „Composer-Render: Szenen aus Render-Metadaten gesperrt“, damit klar ist, dass keine KI-Neuanalyse über die Szenen gelegt wird.

5. Timeline/Sidebar zeigt die Quelle transparent an
- Szene-Karten bekommen bei Composer-Import eine stabile Beschreibung aus dem jeweiligen Motion-Studio-Scene-Type/Prompt, nicht aus Gemini-Auto-Cut.
- Wenn Render-Geometrie und `composer_scenes` unterschiedlich viele Einträge haben, werden fehlende Labels fallback-sicher als „Composer Szene 1…n“ angezeigt, aber die Zeiten bleiben trotzdem aus `sceneGeometry`.

6. Restliches UI-Scrolling nachziehen
- Die Cut-Tab-Scroll-Struktur wird final vereinfacht: ein Scroll-Container im Sidebar-Body, kein zusätzliches Clipping im CutPanel.
- Unten in der Szenenliste kommt ausreichend Padding, damit die letzten Szenen/Übergänge nicht hinter Timeline oder Bildschirmrand verschwinden.

Technische Details:
- Primäre Quelle für Schnittzeiten: `video_renders.content_config.sceneGeometry`.
- Sekundäre Quelle nur für Labels: `composer_scenes`.
- URL-Vertrag: `/universal-directors-cut?source=composer&project_id=...&render_id=...&source_video=...`.
- Kein neuer Backend-Service nötig; die RLS-Policies erlauben dem eingeloggten User bereits Zugriff auf eigene `video_renders` und `composer_scenes`.
- Ich werde die bestehende Datenbankstruktur nicht ändern.

Warum das den Fehler behebt:
- Das finale MP4 wurde mit genau dieser `sceneGeometry` gerendert. Wenn der Editor dieselbe Geometry liest, gibt es keinen zweiten Interpretationsweg mehr.
- Browser-Dauer-Messung, Gemini-Auto-Cut und alte Session-Drafts können die Szene-Liste dann nicht mehr überschreiben.
- Das entspricht dem Artlist/NLE-Prinzip: die Timeline-Metadaten sind die Source of Truth, nicht eine nachträgliche KI-Erkennung des finalen Videos.