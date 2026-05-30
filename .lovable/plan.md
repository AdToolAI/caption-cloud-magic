## Problem

Der Screenshot zeigt nicht den separaten `Talking-Head & Lip-Sync`-Switch, sondern den `Dialog & Lip-Sync`-Schalter in der Modell-Auswahl. Für diesen Schalter wurde bisher nur lokaler React-State geändert. Wenn danach Realtime/Hydration oder ein debounced Scene-Save läuft, kommt der alte DB-Wert zurück und der Switch springt wieder aus.

## Plan

1. **Richtigen Toggle persistent machen**
   - In `SceneCard.tsx` den `Dialog & Lip-Sync`-Switch so ändern, dass er `dialog_mode`, `clip_source` und `clip_quality` sofort in `composer_scenes` speichert.
   - Optimistisch in der UI aktivieren, aber bei Datenbankfehler sauber zurückrollen.

2. **Race-Condition für Dialog-Modus absichern**
   - Eine kleine Pending-Registry analog zu `lipSyncPending.ts` ergänzen oder erweitern.
   - Hydration in `VideoComposerDashboard.tsx` nutzt während des kurzen Pending-Fensters den gerade geklickten `dialogMode`-Wert statt eines alten DB-Snapshots.

3. **Debounced Save gegen stale Werte härten**
   - `persistScenesToDb` soll bei `dialog_mode`, `clip_source` und `clip_quality` Pending-Werte respektieren, damit kein alter Snapshot den Klick wieder überschreibt.

4. **Bestehende Lip-Sync-Fixes unberührt lassen**
   - Keine Änderungen an Render, Sync.so, Audio-Mux oder Voice-Pipeline.
   - Der bisherige `Talking-Head & Lip-Sync`-Switch bleibt wie er ist.

## Technische Details

- Hauptdateien: `src/components/video-composer/SceneCard.tsx`, `src/components/video-composer/VideoComposerDashboard.tsx`
- Neue/erweiterte Pending-Hilfe unter `src/lib/video-composer/`
- Ziel: Der sichtbare `Dialog & Lip-Sync`-Toggle bleibt nach dem Aktivieren an, auch wenn direkt danach Realtime-Refetch oder Auto-Save läuft.