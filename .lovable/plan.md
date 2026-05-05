## Problem

Beim Composer-Handoff zum Director's Cut werden Szenen aktuell aus dem schwächsten Fallback gebaut (`composer_scenes.duration_seconds` einfach kontiguierlich aneinandergereiht). Das ergibt Schnitte, die bis zu ~1 Sekunde gegenüber dem tatsächlich gerenderten MP4 driften:

- Crossfade-Overlap (15 Frames ≈ 0,5s pro Übergang) wird ignoriert
- Tatsächlich gerenderte AI-Clip-Dauern (Replicate liefert oft ±0,1–0,3s) werden ignoriert
- Die EDL/sceneGeometry aus `content_config` wird gar nicht erst gefunden (alter Render oder falsche `render_id`-Auswahl)

Außerdem zeigt der Badge nur "Composer Fallback" — der User weiß nicht, *welcher* Fallback aktiv ist und warum die Szenen schon da sind, bevor er Auto-Cut drückt.

## Lösung

### 1. Render-Row-Lookup robuster machen
`src/pages/DirectorsCut/DirectorsCut.tsx` (Composer-Import-Effect):

- Wenn `composerRenderId` gesetzt ist und die Row gefunden wird, aber **kein** `editDecisionList`/`sceneGeometry` enthält → zusätzlich nach der **neuesten** Render-Row für die `project_id` suchen (mit `source='composer'` UND `content_config->editDecisionList IS NOT NULL`) und diese bevorzugen.
- Logging erweitern: welcher Render wurde geladen, hat er EDL, hat er Geometry.

### 2. Deterministischer EDL-Rebuild im Client (neuer Fallback)
In `src/lib/directors-cut/composer-edl.ts` neue Funktion `rebuildEDLFromComposerScenes()`:

- Nimmt `composer_scenes` (mit `duration_seconds`), `fps` (default 30), `crossfadeFrames` (default 15) und optional die **echte MP4-Dauer** (vom Client per `probeMp4Duration` ermittelt).
- Berechnet `outputStart/outputEnd` pro Szene mit derselben Overlap-Math wie `compose-video-assemble` (`start = max(0, cursor - i * crossfadeFrames)`).
- Wenn `realMp4Duration` bekannt und Abweichung >0,2s vs. nominal → linearer Skalierungsfaktor auf alle Frames anwenden, damit der letzte Endframe exakt auf MP4-Ende liegt.
- Liefert eine vollständige `ComposerEDLEntry[]`-Liste, die dann durch die bereits frame-genaue `importComposerRenderEDL()` läuft → Cut-Punkte sitzen am Crossfade-Midpoint mit ms-Genauigkeit.

Neue Source-ID: `'edl-rebuilt'`.

### 3. MP4-Dauer-Probe im Browser
Bestehender `src/lib/probeMp4Duration.ts` wird im Composer-Import-Effect aufgerufen, sobald `selectedVideo.url` bekannt ist. Ergebnis fließt in den Rebuild aus Punkt 2.

### 4. Badge-UX klarer
`src/components/directors-cut/studio/sidebar/CutPanel.tsx`:

- Badge-Text differenzieren: "EDL" / "Rebuilt EDL" / "Geometrie" / "Nur Dauern".
- Subtitle erweitern um Hinweis: *"Diese Szenen kommen aus deinem Composer-Render. Du musst Auto-Cut nicht drücken — nutze ihn nur, wenn du die Schnittpunkte verwerfen und neu erkennen lassen willst."*
- Bei Drift-Skalierung (Punkt 2): kleiner Hinweis "Auf 32,1s Render-Dauer kalibriert".

### 5. Toast-Texte präzisieren
- `'edl'` → "X Composer-Szenen frame-genau importiert"
- `'edl-rebuilt'` → "X Szenen rekonstruiert (Render hatte keine EDL, auf MP4 kalibriert)"
- `'sceneGeometry-fallback'` → bleibt
- `composer-scenes-fallback` wird **nur noch** als Last-Resort verwendet, wenn die MP4-Probe fehlschlägt.

## Geänderte Dateien

- `src/lib/directors-cut/composer-edl.ts` — neue `rebuildEDLFromComposerScenes()`, neue Source `'edl-rebuilt'`
- `src/pages/DirectorsCut/DirectorsCut.tsx` — robusterer Render-Lookup, MP4-Probe, Rebuild-Aufruf, erweiterte Logs
- `src/components/directors-cut/studio/sidebar/CutPanel.tsx` — differenzierter Badge + besserer Hilfetext
- `src/components/directors-cut/studio/CapCutSidebar.tsx` & `CapCutEditor.tsx` — Type-Erweiterung um `'edl-rebuilt'`

## Erwartetes Ergebnis

- **Frame-genaue Schnitte** auch für ältere Composer-Renders ohne EDL (über Rebuild + MP4-Kalibrierung)
- **±1-Frame-Toleranz** statt bisher ±1 Sekunde
- Klarere UI: User versteht, *warum* die Szenen schon da sind und *wie genau* sie sind

Soll ich das umsetzen?