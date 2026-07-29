## Diagnose (verifiziert)

Der wahrgenommene Qualitätsunterschied zwischen UCC- und DC-Export ist real, aber **nicht** ein Encoder-Problem (crf 16 / 10 M / jpeg 95 sind seit dem Quality-Floor identisch). Beim Lesen beider Templates habe ich zwei echte Ursachen gefunden:

### 1) Chromiums `<Video>` in Lambda (betrifft UCC **und** DC)
Beide Templates nutzen `<Video>` aus `remotion`. In Lambda dekodiert Chromium den Stream frameweise über das HTML-Video-Element → bekannte Nebeneffekte: leichtes Frame-Blending, yuv↔rgb-Farbdrift, weichere Kanten. Remotions offizielle Empfehlung für vorgerenderte Video-Backgrounds in Lambda ist `<OffthreadVideo>`, das per ffmpeg exakt den benötigten Frame extrahiert. DC ist davon genauso betroffen wie UCC — nur maskiert dort Punkt 2 den Effekt.

### 2) DC hat immer einen Sensor-Baseline-Grade, UCC im `rawMediaMode` gar keinen
`DirectorsCutVideo.tsx` legt auf jeden Frame per Default:
- `SharpnessFilter` (SVG-Unsharp-Mask, Zeile 1307)
- Brightness/Contrast/Saturation/Temperature-Baseline aus `filterString`

UCC's `rawMediaMode: true` (Invariant) schaltet korrekt alle Cinematic-FX ab — hat aber gleichzeitig auch die harmlose Sensor-Baseline entfernt. Der UCC-Frame ist damit "physikalisch näher am Original", wirkt neben DC aber flau, weil DC eine dezente Kontrast-/Schärfe-Kosmetik draufpackt.

---

## Plan — saubere Lösung, kein Rewrite

### Fix A — `<OffthreadVideo>` im Export für Video-Backgrounds
Infrastruktur-Hygiene, betrifft **beide** Templates:

**`src/remotion/templates/UniversalCreatorVideo.tsx` — `SafeVideo`:**
- Export (`previewMode === false`) → `OffthreadVideo` aus `remotion`.
- Preview (`previewMode === true`) → weiter `<Video>` (OffthreadVideo funktioniert im Browser nicht).
- `delayRender`-Timeout / `onError` / Fallback-Logik unverändert.

**`src/remotion/templates/DirectorsCutVideo.tsx` — `SceneVideo`:**
- Gleiche Regel: `previewMode` (bereits als Prop vorhanden, Zeile 1353 auf `false` für Export) entscheidet zwischen `OffthreadVideo` und `<Video>`.
- `startFrom` / `playbackRate` / `pauseWhenBuffering` bleiben — `OffthreadVideo` unterstützt dieselben Props.

Kein Payload-Change, kein Preisimpact, kein Change an `render-with-remotion` / `render-directors-cut`.

### Fix B — geteilte Sensor-Baseline-Grade-Konstante
Neuer Wert an einer Stelle, damit UCC und DC nicht wieder auseinanderlaufen:

**Neu: `src/remotion/utils/sensorBaselineGrade.ts`**
```ts
/**
 * Sensor-Baseline-Grade — dezenter Micro-Contrast/Saturation, der bei ALLEN
 * Export-Renderpfaden auf Video-/Image-Backgrounds liegt.
 * Zählt NICHT als Cinematic-FX (kein Mood/Grain/Vignette/KenBurns/Parallax).
 * Ist Teil des Encode-Floors, siehe mem://architecture/render/global-export-quality-floor.
 */
export const SENSOR_BASELINE_GRADE_FILTER = 'contrast(1.03) saturate(1.05)';
```

**UCC (`renderBackgroundContent`):**
- Auf Video- und Image-Background im Export (`previewMode === false`) den Baseline-Filter aufsetzen — auch im `rawMediaMode`.
- Nicht auf Color/Gradient (kein Sinn).
- Preview bleibt neutral (User sieht in Step 4 den echten Rohframe, wie bisher).

**DC (`SceneVideo`, Zeile ~624 `finalFilter`):**
- Baseline-Filter vor allen weiteren DC-Filtern in den `filter:`-String einreihen, damit DC dieselbe Baseline nutzt statt sie zufällig aus seiner Filterkette zu produzieren.
- Bestehende DC-Grades (brightness/contrast/saturation/temperature-Slider) bleiben additiv unverändert wirksam.

### Fix C — Memory & Invariant aktualisieren
- **`mem/architecture/render/global-export-quality-floor.md`** um Abschnitt "Sensor Baseline Grade" ergänzen: Wert + Begründung + wo referenziert.
- **`mem://architecture/video-composer/raw-media-invariant`** (bzw. der Kommentar in `universalCreatorRenderPayload.ts`) um einen Satz erweitern: *Sensor-Baseline-Grade zählt nicht als Cinematic-FX — sie ist Teil des Encode-Floors und darf im rawMediaMode aktiv sein.*
- Bestehender Regressionstest `universalCreatorRenderPayload.test.ts` (rawMediaMode-Invariante) bleibt grün.

### Nicht angefasst
- `crf`, `jpegQuality`, `x264Preset`, `videoBitrate`, `audioBitrate` — am Floor, kein Change.
- `objectFit: 'contain'` — bleibt (kein ungewollter Crop).
- Cinematic-Post-Layer, KenBurns, Parallax, Mood-Filter, Overlays, SceneFX — bleiben DC-exklusiv, weiter über `rawMediaMode` gesperrt.
- Motion Studio / AI Video Studio / Composer / Lip-Sync-Mux — kein Change (nutzen eigene Pfade und sind bereits am Floor).
- `remotion.config.ts` — unverändert.

### Verifikation
1. `tsgo` — Typcheck grün.
2. `bunx vitest run src/lib/__tests__/universalCreatorRenderPayload.test.ts` — rawMediaMode-Invariant grün.
3. Kurzer Playwright-Smoketest auf `/universal-creator` Step 4, dass die Preview weiter lädt und keine `OffthreadVideo`-Warnung wirft.
4. Optional (empfohlen vor Launch): einen echten Testrender in UCC + DC mit demselben Source-Clip laufen lassen und Frame-Screenshot vergleichen — dann ist der Fix objektiv belegt, nicht nur theoretisch.

## Was der Kunde danach sieht
UCC-Export ist **schärfer** (echte Verbesserung via OffthreadVideo, keine Chromium-Frame-Blends mehr) und liegt **optisch auf DC-Niveau** (geteilte Sensor-Baseline). DC bekommt denselben OffthreadVideo-Vorteil dazu. Der Raw-Media-Charakter von UCC bleibt erhalten (keine Mood/Grain/Vignette/etc.), Kosten und Renderzeit ändern sich nicht messbar.