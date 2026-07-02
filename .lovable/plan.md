## Ziel
Den kurzen Flash nach Crossfade-/Media-zu-Media-Übergängen endgültig entfernen, ohne die bestehende Timeline-, Audio- oder Export-Logik umzubauen.

## Diagnose
Der bisherige Fix pre-armt zwar das Media-Overlay, aber drei Dinge bleiben problematisch:

1. Die Media-Branch blendet direkt nach dem Übergang beide A/B-Video-Slots aus, bevor sicher ist, dass das Media-Overlay wirklich denselben Frame dekodiert hat.
2. Das JSX-Style des `mediaVideoRef` schaltet bei `!activeVisualTransition` sofort auf Opacity 1. Dieser React-Style kann gegen die imperativ gesteuerte Handoff-Logik arbeiten.
3. Nach dem Handoff gibt es keinen echten „sealed handoff“-Zustand: A/B und Overlay werden nicht für 1–2 Frames kontrolliert überlappt.

## Plan

### 1. Handoff nicht über React-Opacity steuern
- Das Media-Overlay bekommt im JSX eine neutrale Start-Opacity (`0`).
- Sichtbarkeit wird in der Playback-/Transition-RAF-Logik imperativ gesetzt.
- Dadurch kann React nicht mehr genau im kritischen Frame das Overlay sichtbar machen, bevor `src/currentTime/readyState` stimmen.

### 2. Media-Branch bekommt eine Ready-Gate-Logik
Beim Eintritt in eine Media-Video-Szene:
- Overlay-URL prüfen.
- Overlay-Zeit auf erwarteten Timeline-Frame prüfen.
- `readyState >= 2` verlangen.
- Erst dann `mediaVideoRef.opacity = 1` setzen.
- Bis dahin bleibt der aktuelle A/B-Slot sichtbar (`opacity = 1`) und der Standby wird nicht blind ausgeblendet.

### 3. Nach dem Transition-Handoff 2 Frames Schutzfenster setzen
- Neuer `postTransitionHoldFramesRef` im Player.
- `useTransitionRenderer` setzt ihn nach Handoff auf 2 Frames.
- Während dieses Fensters:
  - A/B-Slot bleibt sichtbar.
  - Media-Overlay darf nur übernehmen, wenn es ready ist.
  - `activeVisualTransition` wird logisch als noch aktiv betrachtet, damit Image/Blackscreen/Media-Overlays nicht zu früh durch React auftauchen.

### 4. Handoff-Frame exakt korrigieren
- Der Overlay-Handoff-Timecode wird nicht pauschal `sourceStart + duration`, sondern aus Timeline-Zeit berechnet:
  - `sourceStart + (handoffTimelineTime - scene.start_time) * playbackRate`
- Das verhindert, dass das Overlay nach dem Crossfade minimal an einer anderen Frame-Position steht.

### 5. A/B-Slots nicht mehr in der Media-Branch hart ausblenden
- `video.style.opacity = '0'` und `standby.style.opacity = '0'` werden nur noch ausgeführt, wenn das Overlay ready und sichtbar ist.
- Bei nicht-ready Overlay bleibt der aktive Slot als visuelle Fallback-Schicht stehen.

### 6. Validierung
- TypeScript-Check nur für betroffene Dateien/Projektcheck.
- Übergang Media → Media prüfen:
  - Kein schwarzer Frame.
  - Kein alter Frame aus Szene 1.
  - Kein kurzer React-Opacity-Sprung.
- Regression: Original-Video → Original-Video und Video → Media bleiben unverändert.

## Erwartetes Ergebnis
Der Übergang verhält sich wie in einem NLE: Crossfade läuft auf A/B-Slots, danach übernimmt das Media-Overlay erst, wenn es dekodiert und exakt auf dem richtigen Frame steht. Kein Flash, kein schwarzer Frame, kein sichtbarer Rebind.