## Root Cause

Im Screenshot ist der Szenen-Prompt im **strukturierten Modus** (`promptMode === 'structured'`, Badge „Strukturiert" oben rechts). In diesem Modus wird `scene.aiPrompt` bei jedem Re-Render aus `promptSlots` via `stitchSlots(...)` neu zusammengebaut.

`SceneDialogStudio` schreibt den `[Dialog: …]`-Marker aber **ausschließlich** in `scene.aiPrompt` — niemals in `promptSlots.subject`. Folge: Sobald irgendein Slot-Re-Stitch passiert (z. B. nach `onUpdate`), überschreibt der Stitcher den frisch eingefügten Dialog-Marker → der Prompt sieht aus wie vorher, das Skript wirkt sich weder visuell auf den AI-Clip noch akustisch aus.

`applyCastToPrompt` macht es bereits korrekt vor: bei structured → in `promptSlots.subject` schreiben **und** `aiPrompt` neu stitchen; bei free → nur `aiPrompt`.

Zweiter Aspekt: Selbst mit korrektem Marker ist `[Dialog: …]` nur eine Notiz im Prompt. Damit der Clip tatsächlich „den Dialog spricht/zeigt", muss im Free-Mode-Prompt explizit eine Sprech-Anweisung im englischen, kameralesbaren Stil stehen (z. B. `Matthew says: "…". Sarah replies: "…".`) — so wie HeyGen / i2v-Modelle es als Mund-/Mimik-Hinweis interpretieren können. Der reine Marker reicht nicht.

## Plan

**1. `applyDialogToPrompt.ts` — zwei Ausgaben statt einer**
- Bestehende Marker-Funktion bleibt für Anzeige im Free-Prompt.
- Neue Hilfsfunktion `buildSpokenLinesBlock(blocks, lang)` rendert einen englischen Sprech-Block:
  ```
  Spoken dialog (visible lip-sync): Matthew says: "Welcome to DroneOcular." Sarah replies: "Tired of wasting hours…".
  ```
- Idempotenter Wrapper-Marker `[Dialog: …][/Dialog]` der diesen Block umschließt — so kann ein Re-Run ihn sauber ersetzen, ohne fremden Prompt-Text zu zerstören.

**2. `SceneDialogStudio.tsx` — Sync in `promptSlots.subject` UND `aiPrompt` (analog `applyCastToPrompt`)**
- Neue Props vom Parent (`SceneCard`) erhalten/durchschleifen: `promptMode`, `promptSlots`, `promptSlotOrder`, oder einfacher: in `SceneCard` die Sync-Logik zentral durchführen, nicht im Studio.
- Bevorzugte Variante (geringere Prop-Drilling-Kosten): **Sync-Effekt von `SceneDialogStudio` nach `SceneCard` ziehen.**
  - `SceneDialogStudio` ruft nur noch `onUpdate({ dialogScript })` auf.
  - `SceneCard` bekommt einen neuen `useEffect`, der bei Änderung von `scene.dialogScript` (+ `characters`):
    - `parseDialogScript(...)` ausführt
    - bei `promptMode === 'structured'`: `promptSlots.subject` mit `applyDialogToPrompt(currentSubject, blocks, lang)` updaten und `aiPrompt = stitchSlots(nextSlots, order)` neu setzen
    - bei `promptMode === 'free'`: `aiPrompt = applyDialogToPrompt(scene.aiPrompt, blocks, lang)` setzen
- Checkbox „Dialog in Szenen-Prompt übernehmen" wandert zu `scene.syncDialogToPrompt` (oder bleibt lokal mit Default true) — Effekt respektiert das Flag.

**3. Sichtbares Feedback**
- Toast nach AI-Skript bestätigt jetzt zusätzlich: „Prompt aktualisiert ✓" (sonst denkt der User wieder, nichts sei passiert).
- Im `DialogPreviewList` ein kleines „⟳ in Prompt synchronisiert"-Badge wenn `syncToPrompt === true` und `blocks.length > 0`.

**4. Out of scope**
- Keine Edge-Function-Änderung, keine DB-Migration, kein neues HeyGen-Verhalten.
- `parseDialogScript` und Cast-Filter (Sarah-Fix) bleiben wie zuletzt korrigiert.

## Files
- `src/lib/motion-studio/applyDialogToPrompt.ts` — `buildSpokenLinesBlock`, neuer Wrapper-Marker.
- `src/components/video-composer/SceneCard.tsx` — neuer Sync-Effekt für `dialogScript` (analog Cast-Backfill).
- `src/components/video-composer/SceneDialogStudio.tsx` — Effekt entfernen, nur noch `dialogScript` persistieren; Toast-Text ergänzen; „synchronisiert"-Badge.

## Resultat
Nach „Skript via AI" erscheint im KI-Prompt sofort:
```
[Besetzung: Matthew Dusatko (Voll), Sarah (Voll)] [Dialog] Spoken dialog: Matthew says: "Welcome to DroneOcular." Sarah replies: "Tired of wasting hours fighting weeds…". [/Dialog] Low angle, wide shot of a vast Texan farmland …
```
…und bleibt auch nach Re-Stitches erhalten, weil der Marker jetzt in `promptSlots.subject` lebt.