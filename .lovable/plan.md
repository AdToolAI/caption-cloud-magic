## Warum sieht das Gesicht trotzdem nicht ok aus für die Pipeline

Du hast Recht — im Vorschau-Thumbnail ist ein Gesicht erkennbar. Trotzdem schlägt der Preflight korrekt fehl. Drei Gründe, die hier zusammenkommen:

1. **`plate-face-detect` sampelt nicht den Thumbnail-Frame**, sondern den **Mittel-Frame** (`midDurationSec * 0.5`, also ~5s in einer 10s-Szene — `plate-face-detect.ts:539`). Das Thumbnail das du siehst ist meist Frame 0 oder ein Cover-Frame. In der Szene "tired founder, **hand on forehead, looking down at laptop**" hat der Sprecher genau in der Mitte der Bewegung die Hand am Kopf → Gesicht teilweise verdeckt.
2. **Geometry-Gate** (`plate-face-detect.ts:160-200`) lehnt Gesichts-Boxen ab, deren Mittelpunkt unterhalb von 45 % der Plate-Höhe liegt (`cluster_below_upper_third`). "Looking down at laptop" kippt den Kopf so weit, dass das Gesicht **unter** dieser Linie landet → Box wird als torso-artig verworfen.
3. **N=1-Pfad ist nicht abgesichert**: `buildCinematicSyncMasterPrompt` in `compose-video-clips/index.ts:680-681` returned bei Single-Speaker-Szenen den **rohen Briefing-Prompt ungefiltert** an Hailuo. Der "Lip-ready, frontal, mouth/jaw unobstructed"-Wrapper, den N≥2-Szenen kriegen, wird für N=1 übersprungen.

Die Pipeline (v169 / v153 Preflight) ist also **richtig** und tut genau ihren Job — nur der Plate-Render davor produziert für Single-Speaker-Szenen genau das was die User-Beschreibung sagt: ein nach unten schauender Founder mit Hand am Kopf.

## Fix (3 chirurgische Stellen, Pipeline bleibt unangetastet)

### 1. Server: Single-Speaker-Plate frontal erzwingen (Kernfix)

`supabase/functions/compose-video-clips/index.ts` → `buildCinematicSyncMasterPrompt`
- Den `speakerSlugs.length < 2`-Early-Return **nur** noch bei `length === 0` greifen lassen.
- Für `length === 1` denselben Weg wie für N≥2 nehmen: `neutralTwoShotPrompt(speakerNames, 1)` hat bereits einen N=1-Pfad ("Exactly 1 person … framed in a clean front, three-quarter or natural profile angle … mouth and jaw remain clearly visible and unobstructed by hands, microphones or props").
- Setting/Lighting aus dem Briefing geht **nicht verloren** — landet im `Visual setting: …`-Teil; nur face-blockierende Pose-Anweisungen werden vom Frontal-Wrapper überschrieben.

### 2. Server: Face-Occlusion-Sanitizer für Dialog-Plates

Neue Helferfunktion `stripFaceOcclusionForPlate(text)` in derselben Datei. Läuft **nur** für Cinematic-Sync-Plates und ersetzt harte Occlusion-Trigger lautlos durch neutrale Equivalente:
- `hand on forehead` / `hands over face` / `face in hands` → entfernt
- `looking down at laptop/phone/desk/screen/keyboard` → `at a cluttered desk`
- `head down` / `looking away` / `back to camera` / `facing away` / `from behind` → entfernt
- `eyes closed` → `eyes open, looking at the camera`

Der originale `scene.aiPrompt` in der DB bleibt unangetastet — die UI zeigt weiterhin den Briefing-Text. Nur was an Hailuo geschickt wird, ist gesäubert.

### 3. Studio Director: Anti-Occlusion-Regel im Pass A

`supabase/functions/briefing-deep-parse/index.ts` → `SYSTEM_PASS_A`
- Harte Regel ergänzen: *"For any scene that contains spoken dialog, the visible speaker MUST stay frontal or three-quarter with mouth and jaw unobstructed. Never write 'hand on forehead', 'looking down at laptop/phone', 'head in hands', 'eyes closed', 'facing away' or similar face-occluding actions into dialog scenes. Save those gestures for B-Roll / non-dialog scenes."*

Damit zukünftige Plan-Generierungen das Problem gar nicht erst erzeugen.

## Was NICHT angefasst wird

- `compose-dialog-segments` (v169 / v153.x Preflight) — bleibt 1:1.
- `_shared/plate-face-detect.ts` (Geometry-Gate, Gemini-Prompts) — bleibt 1:1.
- Sync.so-Call, ASD, Bbox-Pipeline, Refund-Logik — bleibt 1:1.
- Bestehender N≥2-Pfad in `buildCinematicSyncMasterPrompt` — bleibt 1:1.

## Verifikation

1. S01 → **"Neu rendern"** klicken.
2. Edge-Log zeigt für S01 jetzt `Lip-ready neutral master plate: Exactly 1 person … framed in a clean front, three-quarter or natural profile angle …` als gesendeten Hailuo-Prompt.
3. Mid-Frame-Sample zeigt Gesicht frontal/three-quarter, oberhalb der 45-%-Linie.
4. `plate-face-detect` findet exakt 1 Box → v153.1-Preflight passiert → Sync.so dispatcht → kein "Sauber neu starten"-Banner mehr.
