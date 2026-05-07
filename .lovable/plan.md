## Problem
Wenn im Composer im **Cast-Picker** Charaktere wie *Matthew Dusatko* und *Sarah Dusatko* ausgewählt werden, taucht ihr Name **nicht** im AI-Prompt auf. Damit ignoriert sowohl der Resolver (Namensmatch im Prompt schlägt fehl) als auch das Modell die Cast-Auswahl — die Szene wird ohne die Charaktere generiert.

Die Cast-Auswahl muss den Prompt **automatisch ergänzen**, sobald sich die Auswahl ändert — und sich beim Entfernen wieder sauber zurückziehen, ohne den Rest des Prompts zu zerstören.

## Lösung — Auto-Inject Cast-Namen in Prompt

### 1. Neuer Helper `applyCastToPrompt()`
Datei: `src/lib/motion-studio/applyCastToPrompt.ts` (neu).

Verhalten:
- Input: `prompt: string`, `cast: CharacterShot[]`, `previousCast: CharacterShot[]`.
- Erkennt eine **Cast-Markierung** am Anfang des Prompts in der Form:
  ```
  [Cast: Sarah Dusatko (full), Matthew Dusatko (profile)] <rest of prompt>
  ```
- Ersetzt die bestehende Markierung durch die neue Liste, oder fügt sie vorne ein, oder entfernt sie komplett bei leerem Cast.
- Lokalisiert: DE → `[Besetzung: …]`, EN → `[Cast: …]`, ES → `[Reparto: …]`.
- Shot-Type-Suffix ist optional (default an), z.B. `Sarah Dusatko (Voll)`.
- Wenn der User die Markierung manuell gelöscht hat (Markierung weg, aber Cast vorhanden) → re-injecten.
- Wenn der Name **bereits frei im Prompt** vorkommt (Volltext oder Vorname ≥3 Zeichen) → **keine** Doppel-Erwähnung in der Markierung für diesen Namen.

### 2. SceneCard `onChange` des CharacterCastPickers
Statt nur `characterShots` + `characterShot` zu speichern, zusätzlich:
```ts
const newPrompt = applyCastToPrompt(scene.aiPrompt || '', next, scene.characterShots ?? []);
onUpdate({ characterShots: next, characterShot: next[0], aiPrompt: newPrompt });
```
Wenn `promptMode === 'guided'` (Slot-Modus): Cast-Markierung wird in den **ersten Slot** (`subject` o. ä.) injiziert statt in `aiPrompt`, damit der Stitcher sie nicht überschreibt. Im Free-Modus direkt in `aiPrompt`.

### 3. Resolver bleibt unverändert
`resolveSceneCharacterAnchorsAll()` liest weiterhin `scene.characterShots` als primäre Quelle — durch die zusätzliche Erwähnung im Prompt funktioniert jetzt **auch** der Namensmatch-Pfad (z. B. wenn der User einen Charakter manuell tippt statt zu picken).

### 4. UI-Feedback
Kleiner Hinweis unter dem Cast-Picker (lokalisiert):
> „Charaktere werden automatisch im Prompt erwähnt."

Mit Toggle „Auto-Inject" (default on, in `localStorage` gemerkt), falls Power-User volle Prompt-Kontrolle wollen.

### 5. Edge-Cases
- **Ältere Szenen** ohne Markierung, aber mit `characterShots`: beim ersten Mount einmal `applyCastToPrompt` durchlaufen lassen (idempotent).
- **Slot-Modus**: Cast-Markierung darf nicht doppelt in mehrere Slots wandern → Stitcher prüft.
- **Guided→Free Mode-Switch**: Markierung wird mit umgezogen.

## Geänderte Dateien
- **Neu**: `src/lib/motion-studio/applyCastToPrompt.ts`
- `src/components/video-composer/SceneCard.tsx` — onChange im Cast-Picker, einmaliger Backfill auf Mount, optionaler Auto-Inject-Toggle.
- `mem://features/video-composer/multi-character-composition.md` — um „Cast-Auto-Inject" ergänzen.

## Out of Scope
- Volltext-NLP (z. B. Pronomen-Resolution).
- Auto-Generieren ganzer Sätze um die Charaktere — wir ergänzen nur die Cast-Markierung; das Modell + Shot Director lesen sie deterministisch.

Soll ich loslegen?
