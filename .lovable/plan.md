

## Saubere Übergänge: Das eigentliche Problem und die Lösung

### Warum es bisher nicht klappt

Das Grundproblem ist **nicht** die Timing-Berechnung — die stimmt inzwischen. Das Problem ist der **HTML5 Video-Decoder**:

1. **Beide Video-Elemente laden dieselbe Datei** (`src={videoUrl}`), aber der Browser muss für das Incoming-Video an eine andere Stelle seekn
2. **`video.currentTime = X` ist nicht framegenau** — der Decoder braucht 50-200ms um den nächsten Keyframe zu finden und zu dekodieren
3. Bei **Slide/Push/Wipe** sieht man diesen Sync-Fehler sofort (weil beide Frames nebeneinander sichtbar sind)
4. Bei **Crossfade/Dissolve** ist derselbe Fehler unsichtbar (weil die Frames übereinander geblendet werden)

Das ist eine Browser-Limitation, kein Code-Bug. Professionelle Video-Editoren umgehen das mit Frame-Buffering in WebGL — das wäre ein kompletter Architektur-Umbau.

### Pragmatische Lösung: 3 Ebenen

#### 1) Preview: Crossfade als Standard, Motion-Transitions "best effort"
- AI-Vorschläge in Schritt 2 setzen **immer `crossfade`** als Standard
- Der User kann manuell auf Slide/Push/Wipe wechseln — mit dem Wissen, dass die Preview nicht pixelgenau sein kann
- **Tooltip/Hinweis** bei Slide/Push/Wipe: "Hinweis: Dieser Übergangstyp kann in der Vorschau leicht versetzt wirken. Der finale Export ist framegenau."

#### 2) Besseres Pre-Buffering für Motion-Transitions
- Pre-Sync von 200ms auf **500ms** erhöhen — speziell für Slide/Push/Wipe
- `requestVideoFrameCallback` nutzen (wo verfügbar) für präziseres Timing
- Incoming-Video erst sichtbar machen wenn der Decoder den richtigen Frame hat (`readyState >= 3`)

#### 3) Export bleibt framegenau
- Der Remotion-Export nutzt bereits `TransitionSeries` mit framegenauen Transitions — dort funktionieren alle Typen perfekt. Keine Änderung nötig.

### Technische Details

**Datei: `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`**
- Pre-Sync-Fenster von 200ms auf 500ms für Slide/Push/Wipe
- `readyState`-Check vor dem Abspielen des Incoming-Videos
- Optional: `requestVideoFrameCallback` für frame-genaue Sync

**Datei: `src/components/directors-cut/preview/useTransitionRenderer.ts`**
- Motion-Transitions (slide/push/wipe) erst visuell starten wenn `incoming.readyState >= 3`
- Fallback: automatisch auf Crossfade wechseln wenn Incoming-Video nicht bereit ist

**Datei: `src/components/directors-cut/steps/SceneEditingStep.tsx`**
- AI-Default auf `crossfade` mit 1.2s setzen

**Datei: UI (TransitionPicker oder Tooltip)**
- Kleiner Hinweis bei Motion-Transitions: "Vorschau-Qualität — Export ist framegenau"

### Ergebnis
- Crossfade funktioniert immer sauber (90% der Fälle)
- Slide/Push/Wipe werden durch Pre-Buffering deutlich besser
- Falls Incoming nicht rechtzeitig dekodiert: automatischer Fallback auf Crossfade in der Preview
- Der finale Export bleibt von all dem unberührt — Remotion rendert immer framegenau

