Ich habe den aktuellen Zustand geprüft. Das Problem ist nicht mehr nur die KI-Analyse selbst, sondern zwei konkrete Architekturfehler:

1. Die Route `/universal-directors-cut` lädt zwar inzwischen die Director’s-Cut-Seite, aber es gibt weiterhin Pfade, bei denen ein altes/legacy Composer-Render ohne echte EDL geöffnet wird. Dann greift der `sceneGeometry`/Dauer-Fallback und erzeugt Grenzen wie `0–13`, `13–15`, `15–16` usw. Das sieht wie „6 Szenen“ aus, ist aber nicht zuverlässig deckungsgleich mit den realen Composer-Clips.
2. Für Nicht-Composer-Videos wird weiterhin eine Fusion aus PySceneDetect-Clip-Dauern, Client-Pixel-Pass und optionaler Gemini-Beschreibung verwendet. Das ist besser als reine KI, aber immer noch nicht „Artlist-like“, weil Schnittpunkte indirekt aus gesplitteten Clip-URLs zurückgerechnet werden und nicht als echte Zeitcodes/Frame-Events aus einem Shot-Detector kommen.

Plan zur endgültigen Korrektur:

1. Composer-Handoff wirklich hart machen
   - `/universal-directors-cut?source=composer...` bleibt direkt im Director’s-Cut-Studio.
   - Beim Öffnen eines Composer-Renders wird zuerst exakt der `video_renders`-Datensatz geladen, der zum `render_id` gehört.
   - Wenn `render_id` fehlt, wird er aus `project_id + video_url` eindeutig rekonstruiert, nicht nur „letzter Render des Projekts“.
   - Der Editor zeigt sichtbar an, welche Quelle verwendet wurde: `EDL`, `Legacy Geometry` oder `Composer durations only`.
   - Wenn nur ein ungenauer Fallback verfügbar ist, darf der User nicht glauben, es sei präzise: klare Warnung + Button „Neu rendern für frame-genaue Szenen“.

2. Alte Composer-Renders ohne EDL korrekt behandeln
   - Die bereits vorhandene `sceneGeometry` ist bei dem aktuellen betroffenen Render vorhanden, aber sie beschreibt überlappende Clipbereiche. Die aktuelle Importlogik verwendet daraus den Mittelpunkt der Crossfades und kann dadurch gefühlt falsche Szenenlängen erzeugen.
   - Ich werde die Fallback-Logik ändern:
     - Für Legacy-Geometry werden Composer-Clipgrenzen aus `outputStartFrame/outputEndFrame` bzw. `sceneGeometry` rekonstruiert.
     - In Director’s Cut werden diese Grenzen als NLE-Regionen modelliert: Szene A, Transition-Zone, Szene B. Nicht mehr als willkürlicher „eine harte Grenze mitten im Fade“.
     - Die sichtbare Szene-Liste orientiert sich am Composer-Szenenindex und den realen Clip-Dauern, nicht an internen Detektor-Schätzungen.
   - Ergebnis: Bei deinem aktuellen 6-Szenen-Render sollen die Grenzen aus den echten Composer-Szenen entstehen, nicht aus „blindem“ Video-Shot-Detection.

3. EDL beim Rendern nachrüsten und validieren
   - `compose-video-assemble` schreibt bereits neue EDL-Daten, aber bestehende/alte Render haben sie nicht.
   - Ich ergänze eine robuste EDL-Struktur mit:
     - `composerSceneId`
     - `orderIndex`
     - `clipUrl`
     - `realDurationSec`
     - `outputStartFrame/outputEndFrame`
     - `visibleStartFrame/visibleEndFrame`
     - `transitionIn/transitionOut`
   - Zusätzlich speichere ich eine `edlVersion`, damit Director’s Cut weiß, ob es echte Frame-Daten oder Legacy-Fallback lädt.

4. Auto-Cut für Composer-Renders endgültig sperren
   - Der Auto-Cut-Button ist bei Composer-Lock schon versteckt, aber ich werde auch alle indirekten Pfade sperren:
     - Co-Pilot-Kommandos
     - leere Scene-Initialisierung
     - Draft-Restore mit alten Szenen
     - manuelle Reanalyse nach Navigationswechsel
   - Bei Composer-Quelle darf `handleStartAnalysis` nie laufen, selbst wenn `composerLock.active` noch nicht gesetzt ist.

5. Draft-/SessionStorage-Bug beheben
   - Der aktuelle Screenshot kann noch von einem veralteten Draft oder einem Fallback-Import stammen.
   - Ich werde den Draft-Fingerprint verschärfen:
     - `sourceVideoUrl`
     - `composerProjectId`
     - `composerRenderId`
     - `edlVersion`
   - Wenn sich einer dieser Werte ändert, werden alte Szenen konsequent verworfen.
   - Nach erfolgreichem Composer-Import wird der Draft sofort mit den EDL-Szenen überschrieben.

6. Nicht-Composer Auto-Cut auf professionelle Signal-Pipeline umbauen
   - Für normale Uploads bleibt Auto-Cut verfügbar, aber nicht mehr als Gemini/Schätz-Pipeline.
   - Ich ersetze die schwache Fusion durch eine verifizierbare Pipeline:
     - Frame-Sampling mit dichterer Abtastung.
     - Histogramm-Differenz, Pixel-Differenz, Luma-Differenz, Edge-Differenz.
     - Peak-Prominence statt fixer Schwellen.
     - Mindestabstand abhängig von Videolänge/FPS.
     - Soft-Transition-Erkennung über Veränderungsfenster statt Einzelbildsprung.
   - Gemini darf danach nur noch Beschreibungen liefern, nie Grenzen verändern.

7. Debug-Transparenz im UI
   - Im Schnitt-Panel ergänze ich eine Diagnosezeile:
     - Quelle: `Composer EDL`, `Legacy Composer Geometry`, `Signal Auto-Cut`, `Manual`
     - Anzahl Cuts
     - Zeitpunkte der Cuts
   - Damit sieht man sofort, ob echte Composer-Metadaten oder eine Analyse verwendet wurde.

8. Validierung mit deinem aktuellen Render
   - Ich werde den aktuell betroffenen Render `5864efb7-c968-4d5d-ab46-d43dd03bb73b` als Testfall verwenden.
   - Erwartete Grundlage aus der Datenbank:
     - 6 Composer-Szenen
     - reale Clip-Dauern: ca. 4s, 5s, 5s, 8s, 5s, 5s
     - 15-Frame Crossfade-Overlap
   - Danach muss Director’s Cut nicht mehr `0–13`, `13–15`, `15–16` anzeigen, sondern die tatsächliche Composer-Struktur mit korrekten Segmenten/Transitions.

Technische Änderungen:

- `src/pages/DirectorsCut/DirectorsCut.tsx`
  - Composer-Handoff robuster auflösen.
  - Draft-Fingerprint verschärfen.
  - Auto-Cut bei Composer-Quelle absolut blockieren.
  - Import-Status/Diagnose setzen.

- `src/lib/directors-cut/composer-edl.ts`
  - EDL-v2 Parser.
  - Legacy-Geometry-Parser korrigieren.
  - Transition-Zonen explizit modellieren.
  - Composer-Durations-Fallback sauber begrenzen und als unpräzise markieren.

- `supabase/functions/compose-video-assemble/index.ts`
  - EDL-v2 schreiben.
  - `edlVersion` und sichtbare Timeline-Metadaten speichern.
  - Output-Geometrie framegenau und eindeutig machen.

- `src/components/directors-cut/studio/CapCutEditor.tsx`
  - Composer-Lock dauerhaft respektieren.
  - Timeline-Zonen/Markers aus Composer-Metadaten anzeigen.
  - Keine automatische Migration, die Composer-Szenen überschreibt.

- `src/components/directors-cut/studio/sidebar/CutPanel.tsx`
  - Diagnoseanzeige für Quelle/Cuts.
  - Warnung bei Legacy-Fallback.
  - Auto-Cut wirklich komplett ausblenden bei Composer.

- `src/lib/directors-cut-scene-detection.ts`
  - Signal-basierte Auto-Cut-Pipeline für normale Uploads stabilisieren.
  - Keine KI-Grenzen mehr als primäre Quelle.

- `supabase/functions/analyze-video-scenes/index.ts`
  - KI nur noch für Labels/Beschreibungen nutzen.
  - Grenzen unveränderlich machen.
  - Server-Videoanalyse als Boundary-Generator deaktivieren oder nur als klar gekennzeichneter letzter Fallback.

Nach Umsetzung ist die Logik so:

```text
Composer Render
  -> video_renders EDL v2 vorhanden
    -> 1:1 Szenenimport, Auto-Cut gesperrt
  -> Legacy sceneGeometry vorhanden
    -> Composer-Szenen + Transition-Zonen rekonstruieren, Warnung anzeigen
  -> keine Metadaten
    -> Composer-Szenendauern verwenden, Warnung anzeigen, Re-Render empfehlen

Normaler Upload
  -> Signal-basierte Shot Detection
  -> KI beschreibt nur die bereits festen Segmente
  -> User kann manuell nachkorrigieren
```

Damit bauen wir nicht weiter eine „KI schätzt Szenen“-Lösung, sondern eine echte NLE-Pipeline mit Composer-Metadaten als Source of Truth und Signal-Detection nur für freie Uploads.