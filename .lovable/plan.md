Ich habe den Fehler jetzt eingegrenzt: Die Erkennung selbst findet tatsächlich die richtigen 6 Segmente. In den Backend-Logs steht für dein aktuelles Video:

- PySceneDetect: Adaptive = 6 Clips, Content = 9 Clips
- Final im Analyse-Service: 6 Szenen mit Grenzen `0-13`, `13-15`, `15-16.17`, `16.17-17.33`, `17.33-18.17`, `18.17-29.67`

Der Wurm hängt danach: Die Timeline bekommt zwar 6 Zeitsegmente, aber die Beschreibungen kommen aus einem zweiten AI-Beschreibungs-Schritt ohne Frames bzw. aus altem Composer-Label-Mapping. Dadurch wirken die Szenen „falsch“, obwohl die Schnittpunkte erkannt wurden. Zusätzlich ist die Composer-Handoff-Geometrie aus dem Render (`0-4`, `3.5-8.5`, `8-13`, `12.5-20.5`, `20-25`, `24.5-29.5`) überlappend wegen Crossfades; diese Werte dürfen im Editor nicht direkt als normale Schnittliste angezeigt werden, sonst passen sie nicht wie echte Szenenblöcke.

Plan zur finalen Behebung:

1. Auto-Cut darf keine halluzinierten Szenenbeschreibungen mehr anzeigen
- In `analyze-video-scenes` wird der AI-Beschreibungs-Schritt nur noch genutzt, wenn echte Frames mitgeschickt wurden.
- Wenn keine Frames vorhanden sind, gibt der Service neutrale, ehrliche Labels zurück, z.B. `Erkannte Szene 1`, statt „Drohnenflug über Stadt bei Sonnenuntergang“ zu erfinden.
- Die exakten Zeitgrenzen bleiben unverändert aus dem Detektor.

2. Frontend baut die Szene-Liste direkt aus den erkannten Boundaries
- In `DirectorsCut.tsx` wird nach PySceneDetect-Fusion zuerst lokal eine deterministische Szene-Liste aus den Cut-Zeiten gebaut.
- Diese Liste ist die Source of Truth für `setScenes`.
- Der Analyse-Service darf dann nur noch Mood/Effekte/Beschreibungen ergänzen, aber niemals Anzahl, Start oder Endzeit verändern.
- Wenn AI-Beschreibungen fehlen oder unplausibel sind, bleiben stabile Labels wie `Szene 1 · 0:00-0:13` erhalten.

3. Diagnose-Toast und Sidebar werden konsistent gemacht
- Der Toast „6 Szenen erkannt“ zeigt exakt dieselben Grenzen wie die Szene-Liste.
- Optional füge ich im Cut-Panel einen kleinen Debug-/Statushinweis ein: `Quelle: PySceneDetect/Fusion`, damit klar ist, ob die Szenen aus Detektion oder Composer-Metadaten stammen.

4. Composer-Handoff reparieren: Render-Geometrie in echte Editor-Segmente normalisieren
- Die gespeicherte `sceneGeometry` enthält aktuell Crossfade-Overlaps. Für die Editor-Schnittliste müssen daraus nicht-überlappende Timeline-Segmente werden.
- Ich normalisiere Composer-Geometrie nach dem Artlist/NLE-Prinzip:
  - Szene 1 startet bei 0
  - jeder nächste Start ist der vorige Endpunkt auf der sichtbaren Timeline
  - Crossfade-Overlaps werden als Transition-Metadaten behandelt, nicht als überlappende Szenenlänge
- Ergebnis: DC zeigt 6 aufeinanderfolgende Composer-Szenen, statt die Crossfade-Overlaps als falsche Grenzen zu interpretieren.

5. Alte Einstiegswege absichern
- Alle Links, die noch `/directors-cut?...` oder reine `source_video`-Übergaben nutzen, werden auf den aktiven `/universal-directors-cut?...` Handoff vereinheitlicht.
- Falls ein Composer-Video ohne `render_id` geöffnet wird, wird die letzte passende Render-Zeile per `project_id + video_url` gesucht, nicht einfach irgendein letzter Render.

6. UI-Scrolling im Szenenbereich final lösen
- Der Szenenbereich bekommt unten mehr Padding und keine versteckten Max-Höhen.
- Dadurch sind Szene 5/6 und Übergänge sicher sichtbar.

Betroffene Dateien:
- `src/pages/DirectorsCut/DirectorsCut.tsx`
- `supabase/functions/analyze-video-scenes/index.ts`
- `src/components/directors-cut/studio/sidebar/CutPanel.tsx`
- `src/components/video-composer/AssemblyTab.tsx` bzw. Handoff-Buttons, falls dort noch ein DC-Link fehlt
- ggf. `src/components/video-composer/RenderPipelinePanel.tsx` für die strengere `render_id`-Übergabe

Wichtig: Ich ändere nicht die Datenbankstruktur. Es geht um die Reihenfolge/Quelle der Daten: Detektor-Grenzen bleiben hart, AI darf nur beschreiben, und Composer-Crossfades werden als Transition behandelt statt als überlappende Szenen.