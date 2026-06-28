## Du hast Recht — Root Cause korrigiert

Ich habe es jetzt sauber durchverfolgt. Die echte Lücke liegt **nicht** in v172, sondern im **Mapping vom Plan in den finalen Render-Prompt**:

### Was heute passiert

1. `briefing-deep-parse/index.ts` (Z. 100–107, 660–671) füllt pro Szene korrekt:
   - `performance.mimik` (Gesicht)
   - `performance.gestik` (Gestik)
   - `performance.blick` (Blickrichtung)
   - `performance.energy` (1–5)
   - `anchorPromptEN` (Action/Setting)
   - inkl. AI-Auto-Fill mit ✨-Badge.

2. `ProductionPlanSheet` zeigt die Felder → sieht für dich korrekt aus.

3. `useApplyProductionPlan.ts` (Z. 256–318) schreibt sie in die Szene:
   - `scene.performance[characterId] = { expression, gesture, gaze, energy }`
   - `scene.actionBeat = { characterAction, environmentMotion, motionIntensity }`
   - `scene.sceneActionEn = anchorPromptEN`

4. **Bruchstelle**: `compose-video-clips/index.ts` (Cinematic-Sync-Plate-Builder) verwendet **keines** dieser Felder. Es greift nur auf `scene.aiPrompt` zu, läuft `stripFaceOcclusionForPlate` darüber und packt am Ende einen generischen „Lip-ready neutral master plate"-Wrapper drum.
   - `performance.*` → ignoriert.
   - `actionBeat.characterAction` / `environmentMotion` / `motionIntensity` → ignoriert.
   - `sceneActionEn` → ignoriert (es zählt nur `aiPrompt`).
   - Zusätzlich entfernt `stripFaceOcclusionForPlate` Aktionen wie „looking down at laptop / rubbing forehead / head down" — also genau die im Briefing autorisierten Handlungen.

Ergebnis: Hailuo sieht nur noch das Setting + den neutralen Wrapper. Gestik/Mimik/Action aus dem Plan landen nie im Modell. Daher der starre Sprecher.

## Plan

### 1. Performance & Action in den Cinematic-Sync-Prompt injizieren
In `buildCinematicSyncMasterPrompt` (compose-video-clips/index.ts):
- Pro Sprecher die zugehörige `scene.performance[characterId]` in eine kompakte Englisch-Klausel rendern, z.B.:
  `"{Name}: warm-smile expression, open-palms gesture, gaze to camera, energy 4/5."`
- `scene.actionBeat.characterAction` + `environmentMotion` als eigene Klausel anhängen:
  `"Action: he is bearbeitet ein Reel at a cluttered desk; ambient: dim warm desk lamp glow."`
- `motionIntensity` (low/medium/high) auf eine kurze Bewegungsanweisung mappen (subtle body motion → noticeable body motion → energetic body motion). Ersetzt das pauschale „subtle idle body motion".

### 2. `stripFaceOcclusionForPlate` entschärfen
- Nicht mehr alles wegwerfen, was „looking down at laptop" oder „head down" enthält.
- Stattdessen nur **echte plate-face-detect-Blocker** neutralisieren:
  - Hand vor Gesicht / Augen geschlossen / Rücken zur Kamera / Gesicht in Händen.
- „Looking at laptop / typing at desk / sitting at desk" bleibt erhalten — sind sync-3 kompatibel (sync-3 kann Profile und partial occlusion).

### 3. N=1 Wrapper schlanker
Für Single-Speaker bleibt der Wrapper bestehen, aber:
- Kameraführung/Licht/Setting aus `aiPrompt` + `anchorPromptEN` werden **vor** den lip-ready Sicherheitsregeln injiziert, nicht ersetzt.
- „LOCKED static camera"/„no other humans"-Block bleibt nur für N≥2 (Geometry-/ASD-kritisch), für N=1 reicht „mouth & jaw clearly visible, hands away from face".

### 4. Drift-Detector erweitern
- `driftDetector.ts`: zusätzlich prüfen, ob `performance.*` und `actionBeat.*` aus dem Plan tatsächlich im finalen `ai_prompt` der Szene wiederzufinden sind (Keyword-Match). Sonst rote Chip „Performance not applied".

### 5. Verifikation
- Eine Single-Speaker-Szene mit klar gesetztem `gestik=open-palms, mimik=tired, action=sitting at laptop at night` rendern.
- In den Edge-Logs prüfen, dass der Final-Prompt diese Tokens enthält.
- Visuell prüfen: Szene + natürliche Körperbewegung statt starres Talking-Head.

## Betroffene Dateien

- `supabase/functions/compose-video-clips/index.ts` — `buildCinematicSyncMasterPrompt`, `stripFaceOcclusionForPlate`, `neutralTwoShotPrompt` (nur N=1-Pfad).
- `src/lib/video-composer/driftDetector.ts` — neue Verification-Chips für performance/actionBeat.

## Bewusst NICHT angefasst

- Multi-Speaker Wrapper (N≥2) — ASD-/Geometry-kritisch.
- Sync.so-Pipeline, sync-3 Optionen, Webhook, Watchdog.
- Briefing-Deep-Parse-Schema — emittiert alles bereits korrekt.

## Erwartetes Ergebnis

Gestik/Mimik/Blick/Energy aus dem Briefing-Plan landen tatsächlich im Hailuo-Prompt. Der Sprecher agiert wieder szenisch (am Laptop, mit natürlicher Bewegung), Sync.so läuft weiterhin sauber, und der Drift-Detector zeigt sofort an, wenn ein Feld doch nicht angekommen ist.