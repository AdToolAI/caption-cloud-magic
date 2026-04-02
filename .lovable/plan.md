

## Fix: Speed Ramping funktioniert nicht für einzelne Szenen

### Ursache

Szenen-spezifische Keyframes speichern `time` relativ zur Szene (0 bis Szenendauer), weil der Slider in `SpeedRamping.tsx` `max={effectiveDuration}` nutzt (= Szenendauer wenn Szene ausgewählt).

Aber im Preview-Player (Zeile 663) wird `timelineTime >= kf.time` verglichen — `timelineTime` ist die **absolute** Position auf der Timeline (z.B. 15.3s), während `kf.time` relativ zur Szene ist (z.B. 0.5s). Dadurch matcht ein Szenen-Keyframe bei 0.5s sofort ab Sekunde 0.5 der Timeline, unabhängig davon wo die Szene tatsächlich liegt.

### Fix

In `DirectorsCutPreviewPlayer.tsx` Zeile 656-667: Für szenen-spezifische Keyframes die relative Zeit innerhalb der Szene berechnen und gegen diese vergleichen.

```
const sceneStart = sceneInfo.scene.start_time ?? 0;
const relativeTime = timelineTime - sceneStart;

for (const kf of sorted) {
  if (relativeTime >= kf.time) {
    activeSpeed = kf.speed;
  }
}
```

Für globale Keyframes bleibt der Vergleich gegen `timelineTime`.

### Betroffene Datei

- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx` (Zeilen 656-667)

