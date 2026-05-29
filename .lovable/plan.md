## Ziel

Das Reden in der Dialog-Pipeline natürlicher und smoother machen, **ohne** die jetzt stabile Preclip → Sync.so → Stitch Pipeline anzufassen.

## Was sich ändert (klein & isoliert)

Nur zwei Stellschrauben in `poll-dialog-shots/index.ts` rund um den Sync.so-Dispatch:

### 1. Sync.so Qualitäts-Parameter

Beim Sync.so-Call pro Turn die offiziellen Smoothing-Optionen mitschicken:

- `model: sync-2-pro` (bleibt)
- `options.sync_mode: "cut_off"` (bleibt, wegen VO-länger-als-Plate)
- **neu** `options.temperature: 0.4` → konservativer, weniger zappelig
- **neu** `options.active_speaker: true` bei Multi-Sprecher-Plates → verhindert Mund-Artefakte bei Nicht-Sprechern
- **neu** `options.occlusion_detection_enabled: true` → ruhigere Übergänge wenn Hand/Objekt vor dem Mund ist

Das sind reine Provider-Hints, kein Eingriff in Preclip-Materialisierung oder Stitch.

### 2. Render-Window Lead-In/Tail leicht erhöhen

Aktuell `lead-in 0.18s / tail 0.12s`. Wir erhöhen auf `lead-in 0.25s / tail 0.20s` (weiterhin geclamped auf die halbe Gap zum Nachbarn).

Effekt: Sync.so hat etwas mehr Anlauf- und Auslaufframes pro Turn → Mundöffnung startet/endet weicher, kein hartes In/Out. Da das Fenster sowohl Preclip- als auch Stitch-Overlay-Range definiert, bleibt die Geometrie konsistent.

### 3. Stitch-Crossfade an Turn-Grenzen (rein visuell)

In `DialogStitchVideo.tsx` an jedem Overlay-Sequence-Übergang ein 3-Frame Opacity-Crossfade auf den Overlay-Layer legen (Master darunter läuft weiter). Kein Recut, kein neuer Render-Pfad — nur ein `interpolate` auf `opacity` in den ersten/letzten 3 Frames jedes Shots.

Effekt: Mikro-Sprung beim Wechsel zwischen Master-Plate und lipsynced Overlay wird unsichtbar.

## Was bewusst NICHT angefasst wird

- Preclip-Renderer (`DialogTurnClipVideo`, `render-dialog-turn`)
- Webhook-Routing (`remotion-webhook`, `sync-so-webhook`)
- Compose / Audio-Trimming / Refund-Logik
- Lambda-Bundle muss nur neu deployed werden wegen Punkt 3 (Stitch-Composition geändert)

## Deployment

1. Edge Function `poll-dialog-shots` redeployen
2. Remotion-Bundle neu deployen (`scripts/deploy-remotion-bundle.sh`) wegen Stitch-Crossfade
3. Kein DB-Reset nötig — wirkt ab nächstem Dialog-Render

## Risiko

Sehr niedrig. Sync.so-Options sind dokumentiert und additiv. Lead-In/Tail-Erhöhung ist 70ms / 80ms — unkritisch, weil Clamp auf halbe Nachbar-Gap bleibt. Crossfade ist rein visuell auf der Stitch-Seite.
