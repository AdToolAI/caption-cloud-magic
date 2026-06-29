# v168 — N=1 Anti-Clone Anchor Lock

## Befund
Die Szene hat **nur Samuel als Cast (N=1)**. Der Audit blockt korrekt mit `anchor_extra_person_detected: faces=3/1, humans=3/1`. Im Screenshot ist klar sichtbar: Nano Banana 2 rendert Samuel **3× nebeneinander als Triptychon** — das ist genau dieselbe Klassenartefakt-Familie wie das alte Split-Screen-Problem für N≥3 (siehe `anti-split-screen-group-plate-v9`), nur für N=1.

## Root Cause
In `supabase/functions/compose-scene-anchor/index.ts` sind **alle Mehrpersonen-Schutzklauseln an `isMulti` (N≥2) gekoppelt**:

- `EXACT_COUNT_SUFFIX` (Z. 283-289) — leer für N=1
- `TWO_SHOT_FRAMING_SUFFIX` (Z. 295-299) — leer für N=1
- `TWO_SHOT_NEGATIVE` (Z. 300-304) — leer für N=1, also kein "no duplicated face / no repeated face" Block
- `STRICT_RETRY_SUFFIX` (Z. 305-307) — `strictMode && isMulti` → auch attempt-2 bekommt für N=1 KEINEN zusätzlichen Hinweis, deshalb produziert der Retry exakt dasselbe Triptychon.

Ergebnis: Für N=1 gibt es keinerlei Prompt-Schutz gegen Klone, Duplikate, Triptychon-Layout oder Split-Screen-Panels. Nano Banana 2 interpretiert "wide shot of Samuel doing X" stylisch frei und bedient sich aus Werbe-Triptychon-Trainingsdaten.

## Fix (3 Layer, analog v9 für N≥3)

### Layer 1 — `compose-scene-anchor/index.ts`: Singleton-Klauseln einführen
- **`EXACT_COUNT_SUFFIX`**: Auch für N=1 gesetzt mit eigener Variante:
  - "EXACTLY 1 human being in the frame — not 2, not 3, no duplicates, no repeated face, no twin, no doppelgänger, no clone, no mirror reflection of the same person, no poster/screen/statue/mannequin showing the same person, no triptych or panel grid of the same person, no side-by-side variations of the same person." 
  - "Empty background humans (out-of-focus crowd) are also FORBIDDEN."
- **`TWO_SHOT_NEGATIVE`** → in `SINGLE_SHOT_NEGATIVE` für N=1 umbenennen:
  - "AVOID: triptych layout, panel grid, multi-panel composition, split-screen, side-by-side panels of the same person, photo collage, contact sheet, before/after grid, mirror duplicates, twins, doppelgängers, repeated face, two of the same person, three of the same person, extra unreferenced human."
- **`STRICT_RETRY_SUFFIX`**: Bedingung `strictMode && isMulti` → `strictMode` (auch N=1). Eigener N=1-Text:
  - "STRICT RETRY MODE — previous attempt produced MULTIPLE instances of the same person (triptych, split-screen, or duplicated body). Render EXACTLY 1 single human being in 1 single continuous frame. No panels, no grid, no side-by-side variations."
- **`TWO_SHOT_FRAMING_SUFFIX`**: bleibt N≥2-only (Single-Shot braucht keine Two-Shot-Framing-Anweisung).

### Layer 2 — Negative-Prompt verstärken
Falls die Edge-Function einen Nano-Banana-2 `negative_prompt` durchreicht: Tokens `triptych, panel grid, split screen, photo collage, side-by-side panels, duplicate person, twin, doppelgänger, repeated face, two of the same person, three of the same person` hinzufügen.  
*(Wenn der Provider keinen negative-prompt unterstützt, fällt dieser Layer weg — Layer 1 trägt die Hauptlast.)*

### Layer 3 — `ANCHOR_AUDIT_VERSION` bump
In `compose-video-clips/index.ts`: `ANCHOR_AUDIT_VERSION` um 1 erhöhen (aktuell letzter Stand prüfen — vermutlich 9 nach v9-Anti-Split-Screen). Bewirkt: bestehende fehlerhafte Triptychon-Anchors werden bei nächster Render-Anforderung automatisch neu komponiert, kein manueller User-Eingriff nötig.

## Nicht angetastet
- N≥2 Pfad (Two-Shot, Multi-Speaker, Asymmetric-Cast) — unverändert.
- `compose-video-clips` Audit-Logik (Z. 1669-1980) — die blockt bereits korrekt, sie braucht nur einen sauberen Anchor als Input.
- Audit-Modelle (Gemini face/human count) — funktionieren wie erwartet.
- Frozen-Invariants des Lipsync-v166/v167 Plate-Prompts.

## Acceptance
- Neue N=1 Samuel-Szene mit "3 AM Moment"-Hook rendert als **eine einzige Person in einem einzigen Frame**, Audit liefert `faces=1/1, humans=1/1, identity=ok`, Hailuo+Sync.so laufen normal durch.
- N≥2 Szenen (Two-Shot, Group-Shot) bleiben qualitativ identisch zu vor dem Patch.
- Bestehende fehlerhafte Anchor-Caches werden durch Version-Bump invalidiert; User klickt einmal "Neu rendern" und sieht eine saubere Single-Person-Komposition.

## Files
- `supabase/functions/compose-scene-anchor/index.ts` (~Z. 283-307: Suffix-Bedingungen + N=1-Texte)
- `supabase/functions/compose-video-clips/index.ts` (ANCHOR_AUDIT_VERSION bump)
- `mem/architecture/video-composer/v168-n1-anti-clone-anchor-lock.md` (neu)
- Edge-Function-Deploy: `compose-scene-anchor`, `compose-video-clips`
