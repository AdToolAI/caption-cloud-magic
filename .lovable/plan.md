Ich würde das Problem nicht weiter mit kleinen Heuristik-Fixes lösen, sondern die Pipeline sauber trennen: Composer-Renders werden wie ein Schnittprojekt/EDL behandelt, normale importierte Videos wie ein echtes Shot-Detection-Problem. Artlist-ähnlich heißt: Frames/Signale bestimmen die Cuts, KI darf maximal beschreiben, aber niemals Szenengrenzen erfinden.

## Zielbild

```text
Motion Studio / Composer
  -> bekannte Clip-Reihenfolge + Clip-Dauern + Crossfades
  -> Edit Decision List (EDL) speichern
  -> Director's Cut liest EDL 1:1
  -> keine Auto-Cut-/PySceneDetect-/Gemini-Schätzung

Beliebiger Video-Upload
  -> framebasierte Shot Detection
  -> Fusion mehrerer Detektoren
  -> KI nur für Labels, nicht für Grenzen
  -> Confidence + manuelle Korrektur
```

## Was aktuell noch schief läuft

1. Der Screenshot zeigt weiterhin den Auto-Cut/Fusion-Pfad: `Fusion: Adaptive 5 + Content 8 -> 5`. Das ist nicht der Composer-Handoff, sondern die Shot-Detection auf dem fertigen MP4.
2. Für Composer-Videos ist das fachlich falsch: Das fertige MP4 wird erneut analysiert und dadurch werden Binnenwechsel innerhalb einzelner AI-Clips als Szenen erkannt.
3. Die aktuelle `sceneGeometry` reicht nicht als professionelle Wahrheit, weil Crossfades in einem flachen MP4 überlappen. Eine Szene kann visuell schon eingeblendet sein, während die vorherige noch ausblendet. Das muss als EDL mit Transition-Zonen modelliert werden, nicht als blind geschätzte flache Liste.

## Plan zur zuverlässigen Lösung

### 1. Composer-EDL als einzige Wahrheit einführen

Beim Rendern im Composer speichert `compose-video-assemble` zusätzlich zu `sceneGeometry` eine echte `editDecisionList` in `video_renders.content_config`:

```text
sceneIndex
composerSceneId/orderIndex
clipUrl
sourceDurationFrames
outputStartFrame
outputEndFrame
bodyStartFrame
bodyEndFrame
transitionInFrameRange
transitionOutFrameRange
crossfadeFrames
fps
```

Damit weiß Director's Cut exakt:
- welche 6 Composer-Szenen existieren,
- welcher Composer-Clip zu welcher Szene gehört,
- wo reine Szenenbereiche liegen,
- wo Crossfade-/Transition-Bereiche liegen,
- und welche Bereiche im finalen MP4 überlappen.

Wichtig: Die alten `sceneGeometry`-Daten bleiben für Kompatibilität erhalten, aber Director's Cut bevorzugt künftig `editDecisionList`.

### 2. Director's Cut bekommt einen harten Composer-Lock

Wenn die URL `source=composer` enthält oder ein Composer-Render geladen wird:

- `handleStartAnalysis` bricht sofort ab.
- laufende Auto-Cut-Analysen dürfen nachträglich nicht mehr `setScenes(...)` ausführen.
- Sidebar, Co-Pilot und alle Auto-Cut-Buttons werden nicht nur versteckt, sondern technisch blockiert.
- vorhandene alte Fusion-/Auto-Cut-Ergebnisse im Draft werden verworfen.
- ein Badge zeigt: `Composer EDL · 6 Szenen · Auto-Cut deaktiviert`.

Damit kann der im Screenshot sichtbare Pfad `Fusion: Adaptive + Content` einen Composer-Render nicht mehr überschreiben.

### 3. Szenen im Editor korrekt darstellen: Szene + Transition statt falscher Flat-Cuts

Für Composer-Renders importiert Director's Cut die EDL in zwei Ebenen:

1. **Composer-Szenen**
   - Szene 1, Szene 2, Szene 3 usw. kommen direkt aus `composer_scenes` und der EDL.
   - Labels kommen aus `scene_type`, `text_overlay`, `ai_prompt`, nicht aus Gemini.

2. **Transition-Zonen**
   - Crossfades werden als Übergangsmarker/Transition-Blöcke angezeigt.
   - Dadurch muss die App nicht mehr so tun, als gäbe es bei einem Crossfade einen einzigen magischen harten Schnittpunkt.

Für den aktuellen Render würde die Logik also nicht mehr sagen `0–13, 13–15...`, sondern die 6 Composer-Clips mit ihren echten Übergängen anzeigen. Crossfade-Zonen werden separat markiert statt als neue/falsche Szenen missverstanden.

### 4. Fallback-Verhalten korrigieren

Falls ein alter Composer-Render keine EDL hat:

- kein stiller Wechsel zu PySceneDetect/Gemini,
- kein `Fusion`-Toast,
- keine Blindschätzung,
- stattdessen:
  - Composer-Szenen aus `composer_scenes.duration_seconds` rekonstruieren,
  - deutlich als `EDL-Fallback` markieren,
  - Hinweis: „Für frame-exakte Übergänge bitte neu rendern.“

Damit sieht der Nutzer nie wieder falsche KI-Szenen, wenn eigentlich Composer-Metadaten erwartet werden.

### 5. Artlist-ähnliche Pipeline für normale Video-Uploads neu strukturieren

Für nicht-Composer-Videos bleibt Auto-Cut erlaubt, aber professioneller:

- keine Gemini-Grenzfindung als primäre Quelle,
- keine gleichmäßige 5-Sekunden-Fallback-Aufteilung,
- keine Browser-Dauer-Schätzung aus PySceneDetect-Split-Clips als alleinige Wahrheit.

Stattdessen:

1. Dense frame sampling, z.B. 6 fps bei kurzen Videos.
2. Mehrere Detektoren:
   - Content / Histogram Difference,
   - Adaptive Threshold,
   - Edge/SSIM-Differenz,
   - Soft-transition/Fade-Erkennung,
   - optional Audio-Onset als Zusatzsignal.
3. Fusion mit Confidence und Mindestabstand.
4. KI beschreibt nur die final fixierten Segmente.
5. UI zeigt Diagnose: `Content`, `Adaptive`, `Pixel`, `Confidence`, aber nur bei echten Upload-Auto-Cuts, nie bei Composer-EDL.

Das entspricht dem Prinzip professioneller Tools: Signalverarbeitung zuerst, KI nur assistierend.

### 6. Konkrete Dateien

Ich würde diese Dateien anfassen:

- `supabase/functions/compose-video-assemble/index.ts`
  - neue `editDecisionList` beim Composer-Render speichern.

- `src/pages/DirectorsCut/DirectorsCut.tsx`
  - Composer-EDL importieren,
  - Auto-Cut bei Composer technisch blockieren,
  - laufende Auto-Cut-Ergebnisse gegen Überschreiben absichern,
  - alte Draft-/Fusion-Daten verwerfen.

- `src/components/directors-cut/studio/sidebar/CutPanel.tsx`
  - Composer-Lock-Badge und Auto-Cut-Deaktivierung sichtbar machen.

- `src/components/directors-cut/studio/CapCutEditor.tsx`
  - Transition-Zonen/Cut-Marker aus EDL übernehmen.

- `src/components/video-composer/AssemblyTab.tsx`
  - Handoff immer mit `render_id` und EDL-fähigem Render öffnen.

- optional `src/lib/directors-cut/composer-edl.ts`
  - zentrale Funktion für EDL -> Director's-Cut-Szenen/Transitions.

### 7. Verifikation nach Umsetzung

Ich würde gezielt gegen den aktuellen Render prüfen:

- Render-ID `5864efb7-c968-4d5d-ab46-d43dd03bb73b` lädt 6 Composer-Szenen.
- Kein Toast `Fusion: Adaptive...` erscheint bei Composer-Handoff.
- Der Auto-Cut-Button ist bei Composer-Renders nicht aktiv.
- Die Szenenbeschreibungen stammen aus Composer-Metadaten, nicht aus Gemini.
- Timeline-Marker entsprechen der EDL und Transition-Zonen.
- Ein alter Render ohne EDL zeigt einen klaren Fallback-Hinweis statt falscher KI-Schätzung.

## Ergebnis

Director's Cut wird bei Composer-Videos nicht mehr versuchen, Szenen zu „erkennen“. Er übernimmt die tatsächliche Schnittliste. Für normale Uploads gibt es weiterhin eine Artlist-ähnliche Auto-Cut-Pipeline, aber ohne blindes LLM-Raten.