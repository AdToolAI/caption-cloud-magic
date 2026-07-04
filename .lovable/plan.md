## Korrektur: Es ist eine N=1-Szene

Du hast recht: Für **einen Sprecher** ist mein vorheriger Multi-Speaker-Tail-Freeze-Plan falsch. Der aktuelle Code zeigt bereits den N=1-Pfad:

- `compose-dialog-segments`: `allowTightSlice = passes.length >= 1` → auch N=1 wird tight gesliced.
- `render-sync-segments-audio-mux`: `useOverlay = ... donePasses.length >= 1 && anyTight` → N=1 nutzt wieder Overlay.
- `compose-video-clips`: N=1 Plate-Prompt ist seit v175 auf **closed mouth** gestellt, damit außerhalb des Sprachfensters kein Tail-Talk sichtbar sein soll.

Wenn trotzdem gelegentlich nach dem Dialog Lippenbewegung sichtbar bleibt, ist der wahrscheinlichste Fehler nicht Multi-Speaker-Ghosting, sondern **N=1 Overlay-Ende/Plate-Fallback**: Nach `turnEnd + 0.02s` zeigt der Mux wieder die originale Kling-Plate. Falls Kling trotz closed-mouth Prompt Idle-Mouth erzeugt, sieht man danach wieder Lippenbewegung.

## Plan

### 1. N=1 Tail-Talk hart absichern

**Datei:** `supabase/functions/render-sync-segments-audio-mux/index.ts`

Für N=1 + Tight-Audio wird nach dem letzten Sprachfenster nicht mehr auf die rohe Kling/Hailuo-Plate zurückgefallen.

Implementierung:

- `isSingleSpeakerTight = donePasses.length === 1 && anyTight`
- `lastShotEndSec = max(fanoutShots[].endSec)`
- Wenn `isSingleSpeakerTight` und `lastShotEndSec < totalSec - 0.05`:
  - ab `lastShotEndSec` bis `totalSec` die letzte Frame-Position der Szene als **Full-Frame-Freeze/Hold** rendern
  - Ziel: kein Rückfall auf eine Plate, in der der Mund noch idle wackelt

Falls der vorhandene Remotion-Stitcher dafür keinen Prop hat, ergänze ich minimal einen `freezeTailFromSec`-Prop in der Dialog-Stitch-Komposition. Kein per-face freeze, kein v164-Reaktivieren.

### 2. N=1 Prompt-Konflikt bereinigen

**Datei:** `supabase/functions/compose-video-clips/index.ts`

Der N=1 Prompt hat aktuell einen internen Widerspruch:

- `neutralTwoShotPrompt(n=1)` sagt noch: `subtle, continuous idle mouth and jaw motion`
- danach überschreibt v175 zwar mit `mouth softly closed`, aber beide Aussagen landen im finalen Prompt.

Fix:

- `neutralTwoShotPrompt(n=1)` wird auf v175 angepasst:
  - lip-ready, clearly visible, unobstructed
  - softly closed resting mouth
  - **no idle jaw/mouth motion**
- Der finale v175 Closing Clause bleibt bestehen.

Damit bekommt Kling nicht mehr gleichzeitig “idle mouth motion” und “closed mouth”.

### 3. Kling N=1 Clone verhindern

**Datei:** `supabase/functions/compose-video-clips/index.ts`

Bei Kling wird vor `replicate.predictions.create` ein Anti-Clone-Suffix in den Prompt geschrieben, weil Kling kein separates `negative_prompt` nutzt:

```text
Exactly one instance of the selected character in one continuous frame. No clones, no duplicate person, no triptych, no split-screen, no side-by-side variations, no mirror duplicate, no poster/photo/screen showing the same face as a second person.
```

Zusätzlich:

- Für `clipSource === 'ai-kling'` und N=1 Cinematic-Sync bleibt der vorhandene Anchor-Audit-Pfad maßgeblich.
- Falls ein auditierter Anchor schon existiert und ok ist, wird er weiterverwendet.
- Falls kein geprüfter Anchor existiert, wird der bestehende Anchor-Compose+Audit-Pfad genutzt, bevor Kling `start_image` bekommt.

### 4. Logs/Forensik

Neue eindeutige Logs:

- `v182_n1_tail_hold scene=... from=... to=...`
- `v182_n1_closed_mouth_prompt scene=...`
- `v182_kling_n1_anticlone scene=...`

### 5. Nicht anfassen

- Kein Multi-Speaker-Freeze.
- Kein Reaktivieren von v164 Silent-Faces.
- Kein Deaktivieren von N=1 Tight-Slice.
- Kein Wechsel weg von Kling/Sync.so.

## Erwartetes Ergebnis

Bei einer N=1 Kling-Cinematic-Sync-Szene:

- während des Dialogs bewegt Sync.so den Mund
- direkt nach dem letzten Sprachfenster bleibt der Mund sichtbar ruhig
- Kling bekommt keinen widersprüchlichen “idle mouth” Prompt mehr
- die Chance auf einen zweiten/gekloonten gleichen Charakter wird stark reduziert