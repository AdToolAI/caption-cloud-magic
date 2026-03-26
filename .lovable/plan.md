
Ziel: Die Vorschau in Schritt 2 und 3 so umbauen, dass sie filmisch flüssig läuft, Übergänge wirklich sichtbar sind und das Audio linear unabhängig durchläuft, ohne das Szenenkonzept aufzulösen.

1. Bestätigte Ursachen
- Schritt 3 stockt weiter, weil die Remotion-Vorschau pro Szene ein eigenes `<Video>` decodiert und beim Szenenwechsel keine Vor-Montage aktiv ist:
  - In `src/remotion/templates/DirectorsCutVideo.tsx` werden `TransitionSeries.Sequence` verwendet, aber aktuell ohne `premountFor`.
  - Dadurch muss der nächste Clip erst genau beim Übergang dekodiert werden.
- Schritt 3 wird zusätzlich unnötig belastet:
  - `src/components/directors-cut/steps/SceneEditingStep.tsx` aktualisiert während Playback regelmäßig React-State (`currentVideoTime`), was große UI-Bereiche neu rendert.
  - `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` synchronisiert diese Updates ständig zurück in Parent-Komponenten.
- Schritt 2 zeigt keine echten Übergänge:
  - `src/components/directors-cut/preview/NativeTransitionOverlay.tsx` legt nur eine dunkle/blur/wipe-Schicht über ein einzelnes `<video>`.
  - Ein echter Übergang braucht aber gleichzeitig „aktuelles Bild“ + „nächstes Bild“.

2. Sinnvolle Zielarchitektur
- Audio bleibt linear und unabhängig:
  - natives HTML5-Audio über die volle Originaldauer
  - kein szenenabhängiges Audio-Cutting in der Preview
- Video bleibt szenenbasiert:
  - Szenen dürfen weiter verlängert, gekürzt, gesplittet und per Slow Motion angepasst werden
- Vorschau wird zweigeteilt:
  - Schritt 2: native, leichte Analyse-Vorschau mit Frame-basiertem Übergangs-Layer
  - Schritt 3+: Remotion-Vorschau für echte Szenenlogik, aber mit Decoder-Vorlauf und weniger React-Druck

3. Umsetzungsschritte
- `src/remotion/templates/DirectorsCutVideo.tsx`
  - `premountFor={30}` auf jede `TransitionSeries.Sequence` setzen
  - prüfen, dass Übergangs-Overlap sauber zu den gekürzten Gesamtframes passt
  - `pauseWhenBuffering={!previewMode}` beibehalten
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
  - Playback-Zeit vom UI-State entkoppeln
  - häufige `timeupdate`-Events intern halten und Parent-Updates nur für wirklich nötige UI-Anzeigen drosseln
  - verhindern, dass Seek/Sync-Effekte bei normalem Playback zusätzliche Ruckler auslösen
  - lineares natives Audio als führende Quelle beibehalten
- `src/components/directors-cut/steps/SceneEditingStep.tsx`
  - Preview-Zeit und große UI-Bereiche stärker entkoppeln
  - aktuelle Szene/Overlay nur throttled oder abgeleitet aktualisieren, damit nicht bei jedem Tick die ganze Step-UI neu rendert
- `src/components/directors-cut/steps/SceneAnalysisStep.tsx`
  - natives `<video>` beibehalten
  - zusätzlich einen echten leichten Übergangs-Layer einbauen:
    - nächstes Szenenbild per Thumbnail/frame cache vorbereiten
    - während der Transition das nächste Bild über das laufende Video legen
    - Crossfade/Wipe/Fade dadurch wirklich sichtbar machen
- `src/components/directors-cut/preview/NativeTransitionOverlay.tsx`
  - von „bloßem Effekt-Overlay“ zu „zweitem visuellen Layer“ umbauen
  - statt nur Abdunkeln/Blur: progress-gesteuerte Überblendung zwischen aktuellem Bild und vorbereitetem nächsten Frame

4. Erwartetes Ergebnis
- Schritt 2 zeigt Übergänge sichtbar und logisch nachvollziehbar
- Schritt 3 läuft deutlich flüssiger, weil der nächste Clip vorgeladen wird
- Audio bleibt stabil durchlaufend und unabhängig von Szenengrenzen
- Das Szenenkonzept bleibt vollständig erhalten:
  - per Szene editierbar
  - Time-Remapping bleibt möglich
  - Slow Motion und verlängerte Szenen bleiben bestehen

5. Technische Hinweise
- Das Kernproblem ist nicht nur Buffering, sondern die Kombination aus:
  - fehlendem Premounting
  - zu viel Parent-Re-Rendering während Playback
  - unzureichender nativer Übergangslogik in Schritt 2
- Ein „filmischer“ Ablauf entsteht hier nur, wenn Video-Preview und UI-Update-Frequenz getrennt werden.
