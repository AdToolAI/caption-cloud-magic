
Ziel: Die Effektkette im Director’s Cut wieder wirklich wirksam machen. Nach Code-Analyse ist das kein einzelner Slider-Bug, sondern eine unterbrochene Propagation zwischen Step-UI, Preview-Player und Render-Template.

1. Root Cause, die ich beheben würde
- `MotionEffectsStep.tsx` verwaltet `kenBurnsKeyframes` und `speedKeyframes` lokal und startet immer mit leeren Arrays.
- `DirectorsCutPreviewPlayer.tsx` akzeptiert `kenBurns`, `speedKeyframes`, `styleTransfer` und `chromaKey` zwar als Props, nutzt sie aber im Preview praktisch nicht.
- In `DirectorsCut.tsx` wird bei `onSpeedKeyframesChange` sogar Information abgeschnitten (`sceneId`, `easing` gehen verloren).
- Ergebnis: Die UI zeigt aktive Effekte an, aber der Preview-Player hat keine vollständige/aktive Effektlogik. Das erklärt genau, warum z. B. Pan/Zoom oder Speed-Ramping “nicht funktionieren”.

2. Geplanter Fix
- `MotionEffectsStep` auf kontrollierten State umstellen:
  - vorhandene `speedKeyframes`/`kenBurnsKeyframes` aus dem Parent übernehmen
  - keine internen leeren Shadow-States mehr
- in `DirectorsCut.tsx` die Motion-Daten vollständig speichern:
  - Speed-Keyframes nicht mehr auf `{time, speed}` kürzen
  - `sceneId` und `easing` erhalten
- `DirectorsCutPreviewPlayer` funktional erweitern:
  - Ken-Burns/Pan im Preview sichtbar machen
  - Speed-Ramping auf die tatsächliche Preview-Wiedergabe anwenden
  - fehlende visuelle Effektteile konsistent zusammensetzen
- Transform-Konflikt sauber lösen:
  - Transition-Transform und Ken-Burns-Transform dürfen nicht auf demselben DOM-Level gegeneinander überschrieben werden
  - dafür würde ich Transition-Layer und Scene-Motion-Layer trennen
- `NativePreviewEffects` ergänzen/vereinheitlichen:
  - szenenspezifische Werte robust anwenden
  - keine zweite, abweichende Effektlogik neben dem Hauptplayer mehr
- Remotion-Render angleichen:
  - dieselbe Motion-/Speed-Logik auch im finalen Render verwenden, damit Preview und Export übereinstimmen

3. Betroffene Dateien
- `src/components/directors-cut/steps/MotionEffectsStep.tsx`
- `src/pages/DirectorsCut/DirectorsCut.tsx`
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
- `src/components/directors-cut/preview/useTransitionRenderer.ts`
- `src/components/directors-cut/preview/NativePreviewEffects.tsx`
- `src/remotion/templates/DirectorsCutVideo.tsx`

4. Erwartetes Ergebnis
- Ken Burns / Pan Rechts / Zoom sind im Motion-Step sofort im Preview sichtbar.
- Speed Ramping verändert die Wiedergabe tatsächlich statt nur die UI.
- Szene-spezifische Motion-Daten bleiben erhalten.
- Step-Preview und finaler Export zeigen dieselben Effekte.
- Keine “aktiv im UI, aber ohne Wirkung im Player”-Effekte mehr.

5. Technische Kurznotiz
```text
Bisher:
Step-State -> teilweise Parent -> Preview-Props -> keine echte Anwendung

Nach Fix:
Step-State -> Parent-State -> Preview-Resolver -> sichtbare Wirkung
                           -> Render-Resolver  -> gleicher Export
```
