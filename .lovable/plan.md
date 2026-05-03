Wir bauen die Artlist/CapCut-Pipeline 1:1 nach. Beides sind im Kern PySceneDetect-Wrapper — der Trick ist Dual-Detector, niedrigere Schwellen und ehrliche Diagnose.

## 1. Dual-Detector im Backend

Wir tauschen den aktuellen Single-Adaptive-Run gegen ein neues Replicate-Modell-Setup, das beide Klassiker laufen lässt:

```text
ContentDetector(threshold=22, min_scene_len=8)   ← harte Cuts (Standard 27, wir gehen empfindlicher)
AdaptiveDetector(adaptive_threshold=1.5, min_scene_len=8)  ← weiche Übergänge / Drohnen-/Kamerafahrten
```

Konkret: `supabase/functions/detect-scenes-pyscenedetect/index.ts` wird so umgebaut, dass es das öffentliche Replicate-Modell `magpai-app/cog-scenedetect` zweimal aufruft (einmal mit `adaptive_threshold=1.5`, einmal mit höherem `adaptive_threshold` und `luma_only=true` als Cross-Check) ODER wir wechseln auf ein deterministisches FFmpeg-`scdet`-Modell, das pure Timecodes liefert. Bevorzugt: zwei Replicate-Calls parallel.

Fallback bleibt der zuverlässige Pfad: wenn beide Detectoren versagen, läuft die clientseitige Pixel-/Histogramm-/Edge-Analyse (die wir schon haben).

## 2. Boundary-Fusion statt Entweder-Oder

Im Frontend (`DirectorsCut.tsx`) sammeln wir alle gefundenen Cuts:

```text
boundaries = unique(merge(
  pyscenedetect_content_cuts,
  pyscenedetect_adaptive_cuts,
  client_pixel_cuts
), tolerance = 0.6s)
```

Dedup-Fenster: 0.6s (nahe Cuts werden zu einem). Mindestabstand zwischen zwei finalen Szenen: 0.6s. Damit fallen Mikro-Doubles raus, aber echte 1-2-Sekunden-Shots bleiben erhalten — genau das ist der Bereich, in dem wir aktuell scheitern.

## 3. Konservative Endlogik nicht mehr als Erfolg werten

Aktuell gilt PySceneDetect als „erfolgreich", sobald `scene_urls.length > 0`. Wir ändern das:

- Wenn nur 1 Cut zurückkommt UND er liegt im letzten 10% des Videos → als „insufficient" markieren, Client-Pixel-Detection wird zwingend zusätzlich ausgeführt.
- Wenn die Differenz Backend-Cuts vs. Client-Cuts > 2 ist → Client-Cuts dazufusionieren statt verwerfen.

## 4. Mindestlängen senken (wie Artlist)

| Stelle                                      | Alt   | Neu  |
| ------------------------------------------- | ----- | ---- |
| Backend `min_scene_len` (frames)            | 15    | 8    |
| Backend `adaptive_threshold`                | 3.0   | 1.5  |
| Backend `MIN_SCENE_DURATION` (trusted)      | 0.5s  | 0.3s |
| Frontend Final-Merge `MIN_SCENE_DURATION`   | 0.5s  | 0.3s |
| Client-Pixel-Mindestabstand zwischen Cuts   | 2.0s  | 0.6s |
| Client-Pixel-Sampling-Rate                  | 3 fps | 6 fps|

## 5. Diagnostischer Toast wie in Artlist

Statt nur „Szenen erkannt" zeigen wir die Quelle an:

```text
✓ 5 Szenen erkannt
   Content-Detector: 4 Cuts
   Adaptive-Detector: 3 Cuts
   Pixel-Analyse: 5 Cuts
   → Fusion: 5 finale Szenen
```

Damit ist sofort sichtbar, welcher Pfad funktioniert hat — kein blindes Vertrauen mehr in einen einzelnen Detector.

## Betroffene Dateien

```text
supabase/functions/detect-scenes-pyscenedetect/index.ts   (Dual-Detector + Diagnose)
supabase/functions/analyze-video-scenes/index.ts          (minDur 0.3s für trusted)
src/pages/DirectorsCut/DirectorsCut.tsx                   (Boundary-Fusion + Diagnose-Toast)
src/lib/directors-cut-scene-detection.ts                  (6 fps, 0.6s Mindestabstand)
```

## Erwartetes Ergebnis

- Dein 25.77s-Drohnenvideo wird in mindestens die tatsächlich vorhandenen 5 Shots zerlegt.
- Schnelle Übergänge (Drohnenfahrt, Kameraschwenk) werden vom Adaptive-Detector erkannt.
- Harte Cuts vom Content-Detector. Soft-Fades vom Pixel-Pass.
- Wenn mal nichts klappt, sieht man im Toast genau warum — kein „1 Szene"-Mysterium mehr.

Soll ich diesen Artlist-1:1-Plan jetzt umsetzen?

<lov-actions>
<lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>