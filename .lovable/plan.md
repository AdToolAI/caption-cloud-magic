
## Plan v262 — Min-Face-Size Guarantee (die saubere, smarte Lösung)

### Warum das die richtige Ebene ist

Nach fünf Iterationen (v242 Row-Major, v246 Face-Gate, v249 AWS-Only, v260 SPF, v261 Segments) ist klar: die Pipeline **stromabwärts vom Anchor** ist stabil und korrekt. Sync.so animiert, AWS erkennt, Gemini matcht, Compositing landet Pixel richtig. Es kaputt-macht **eine einzige Zahl**: die Face-Pixel-Breite im Master-Plate. Unter ~60 px wird jede Lippenanimation vom 720→small Downsample zerdrückt.

Statt weiter am Compositing herumzudrehen (Focus-Plate Overlays, Face-in-Face, dynamisches Nicht-Skalieren — alles wären Regressions-Risiken für die Szenen, die heute funktionieren), fixen wir es **einmal** an der Quelle:

> **Invariante:** Jedes Gesicht im finalen Anchor-Plate ist mindestens 80 px breit. Sonst wird der Anchor verworfen.

### Konkrete Umsetzung

**Datei 1** — `supabase/functions/_shared/anchor-min-face-size.ts` *(neu, ~40 Zeilen)*

Kleine Pure-Function `enforceMinFaceSize(faces, plateW, plateH, minPx=80)`:
- Nimmt die AWS-Rekognition Face-Boxes (die im Anchor-Audit sowieso schon berechnet werden).
- Returnt `{ ok: true }` wenn alle Gesichter ≥ `minPx` breit sind.
- Sonst `{ ok: false, tooSmall: [{name, widthPx, ratio}], suggestion: 'medium_shot' | 'tight_grid' }`.

Regel für `suggestion`:
- N ≤ 2 → `medium_shot` (chest-up)
- N = 3 → `medium_shot` mit Kamera-Note „subjects tightly grouped"
- N = 4 → `tight_grid` (2×2 Grid-Komposition, jedes Face-Cell ≥ plateW*0.35)

**Datei 2** — `supabase/functions/compose-scene-anchor/index.ts` *(1 neuer Retry-Gate)*

Nach dem existierenden `anchor_face_audit`:
```ts
const sizeCheck = enforceMinFaceSize(auditFaces, plateW, plateH, 80);
if (!sizeCheck.ok && anchorAttempt < 3) {
  // Prompt-Suffix hinzufügen und Nano Banana neu triggern
  const framingSuffix = sizeCheck.suggestion === 'tight_grid'
    ? '\n[FRAMING] Composition: 2×2 grid layout. Each subject occupies ≥35% of frame width, chest-up medium shot per cell.'
    : '\n[FRAMING] Composition: medium shot, chest-up. All subjects tightly grouped, each face fills ≥15% of frame width.';
  return retryWithFraming(framingSuffix);
}
```

- Max 3 Retry-Attempts (0 = neutral, 1 = medium_shot, 2 = tight_grid).
- Jeder Retry ist ein normaler Nano Banana Call (bereits kostenverbucht via `plate_generation`).
- Bei Attempt 3 Fail: **Fallback auf Composite-Plate** (siehe Datei 3).

**Datei 3** — `supabase/functions/_shared/composite-anchor-from-focus-plates.ts` *(neu, ~120 Zeilen)*

Der Fallback nutzt die **v260 SPF Focus-Plates** (die schon existieren!) und stitcht sie serverseitig zu einem einzigen Composite-Master-Plate:
- Pro Sprecher wird die vorhandene Focus-Plate (720×720, Face groß & mittig) verwendet.
- Für N=2: horizontale Seite-an-Seite-Komposition → 1440×720 → resized auf Ziel-Format.
- Für N=3: Trilogie-Komposition (1 groß + 2 klein oder 3 gleich).
- Für N=4: 2×2 Grid → jedes Cell 720×720, jedes Face garantiert >200 px im finalen Plate.
- Composite läuft via Remotion Lambda (`AnchorGridComposite.tsx` — muss ich schreiben).

Downstream: das Composite-Plate wird als **reguläres Master-Plate** ausgegeben. `compose-dialog-segments`, `syncso-face-gate`, `render-sync-segments-audio-mux` sehen keinen Unterschied — sie kriegen einfach ein Plate mit großen Gesichtern.

**Datei 4** — `src/remotion/templates/AnchorGridComposite.tsx` *(neu)*

- Nimmt N Focus-Plate URLs + Layout (`2x2` | `1+2` | `side-by-side`).
- Rendert als statisches Standbild (1 Frame → Nano-Banana-Ersatz).
- Wird via `invoke-remotion-render` als `image=true` gerendert.

**Datei 5** — `supabase/functions/compose-video-clips/index.ts` *(bestehende Hailuo-Wiring)*

- Wenn Master-Plate ein Composite ist (`anchor_meta.origin === 'focus_composite'`), zusätzlicher Prompt-Suffix für Hailuo:
  ```
  [MOTION] Preserve the 2×2 grid framing throughout. Do not zoom out.
  Each subject stays in their assigned quadrant; talking motions and small
  gestures only within their cell.
  ```
- CastActions bleiben erhalten, aber cell-gebunden.

### Was NICHT gebaut wird

- **Nicht** v260 SPF Phase 2 (Focus-Plate direkt als Sync.so-Input Video). Grund: Focus-Plate ist Standbild; Sync.so braucht Video. Focus-Plates werden hier stattdessen ins Master-Plate integriert, nicht als Parallel-Track.
- **Nicht** Segments-Aggregation Fix aus v261. Grund: verifiziert dass das nicht das Problem war (Stitcher iteriert per-Pass).
- **Nicht** Never-Fail/SOFT_DEGRADE, kein neuer Provider, keine Face-Gate-Änderung.
- **Nicht** Face-in-Face-Overlay (UX-Regression).

### Backfill für die 4-Sprecher-Büro-Szene

Nach Deploy:
1. Szene `7469bca3-cb52-4b48-9202-e3941d43f18d` resetten (existierender Reset-Pfad, siehe Cinematic-Sync memory).
2. Neu generieren — v262 greift automatisch, erzeugt ein 2×2 Tight-Grid Master.
3. Alle 4 Sprecher sollten sichtbar synchronisierte Lippen zeigen.

### Rollout

- Kein Feature-Flag — es ist eine strikte Qualitäts-Invariante mit Retry-Ladder.
- Bestehende funktionierende Szenen (N=1, N=2 mit großen Gesichtern) sind sofort `ok` beim ersten Attempt → keine Regression, keine Extra-Kosten.
- Kosten-Impact: nur bei Szenen die vorher schon klein-face-broken waren → 1-2 zusätzliche Nano-Banana-Calls (~€0.02) oder ein Composite-Render (~€0.01).

### Restrisiko

Wenn Nano Banana das 2×2-Tight-Grid für 4 Personen konsistent nicht liefert (Charaktere driften trotz Suffix), springt Datei 3 (Composite from Focus-Plates) als deterministischer Fallback ein. Der Composite ist keine KI-Generierung sondern reine Bild-Komposition → 100 % kontrollierbare Face-Size.

### Erwartetes Ergebnis

- 4-Sprecher-Szenen: alle 4 Lippen sichtbar animiert.
- Kein Bit-Change in Sync.so-Dispatch, Face-Gate, Identity-Auflösung oder Compositing-Mathematik — die sind alle korrekt.
- Eine harte Invariante die zukünftige Regressionen dieses Typs komplett verhindert.
