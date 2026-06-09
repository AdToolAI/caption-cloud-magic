## Bug: Action-Feld leer nach Storyboard + Überschreiben beim "Szene generieren"

### Was passiert (Reproduktion)
1. Storyboard läuft durch → `SceneActionField` ist leer, obwohl die Edge Function `sceneActionEn` / `sceneActionLocalized` für jede Szene zurückgibt.
2. User tippt manuell etwas ins Action-Feld.
3. User öffnet "Szene aus Beschreibung" (`SceneDirectorBox`), beschreibt die Szene und klickt **Szene generieren**.
4. `scene-director` antwortet, `onApply` schreibt `sceneActionUser` / `sceneActionEn` aus der KI-Antwort **bedingungslos** zurück → User-Eingabe ist weg, stattdessen steht da der Text, der eigentlich seit Storyboard-Ende dort hätte stehen sollen.

### Root Cause
Zwei unabhängige Defekte verstärken sich:

**A) `persistScenesToDb` (Debounced Flush) lässt `scene_action_user` / `scene_action_en` aus**
- `useComposerPersistence` schreibt die beiden Spalten beim **initialen Insert** korrekt (`scene_action_user: scene.sceneActionUser ?? null`, L227/286).
- Der debounced Flush in `VideoComposerDashboard.persistScenesToDb` (L847-889) listet aber `scene_action_user` / `scene_action_en` **nicht** mit auf. Sobald irgendein Storyboard-Edit triggert (cast-merge in `BriefingTab`, `setScenes`-Wrapper, propagateDialogLock) bevor der Insert fertig ist, oder sobald die Realtime-Subscription die Rows neu hydratisiert, kann die Spalte als leer durchschimmern. Außerdem: viele weitere wichtige Felder (`audio_plan`, `dialog_locked_at`, `realism_preset`, `action_beat`, `first_frame_url`, `lip_sync_*`) fehlen ebenfalls — Scope hier nur das Action-Feld, der Rest wird notiert.

**B) `SceneDirectorBox.onApply` überschreibt User-Locked Werte**
- L186-187 setzt immer `sceneActionUser: data.sceneActionLocalized || data.sceneActionEn || undefined`.
- `SceneCard.tsx` L2364-2370 schreibt das ungefiltert ins Scene-Objekt → User-Override geht verloren.
- Konsistent mit dem bestehenden "Locked Override"-Pattern in `SceneActionField` (zeigt ein 🔒-Badge wenn das Feld nicht leer ist) erwartet der User, dass manuelle Eingaben den Director überstimmen.

### Fix

**1. `src/components/video-composer/VideoComposerDashboard.tsx` (`persistScenesToDb`, ~L847-889)**
- `scene_action_user: s.sceneActionUser ?? null` ergänzen.
- `scene_action_en: s.sceneActionEn ?? null` ergänzen.
- (Nur diese zwei Felder im Scope — andere fehlende Felder als Folgeticket; sind nicht für diesen Bug verantwortlich.)

**2. `src/components/video-composer/SceneDirectorBox.tsx` (`handleGenerate` → `onApply`, ~L175-189)**
- Vor dem Bauen von `onApply`-Payload prüfen, ob der User bereits etwas im Action-Feld hat:
  ```ts
  const userLockedScene = Boolean((scene.sceneActionUser ?? '').trim());
  ```
- `sceneActionUser` / `sceneActionEn` nur dann mitschicken, wenn `!userLockedScene`. Bei gelocktem Feld den Director-Output verwerfen — `aiPrompt` und übrige Felder (matched assets, characterShots, dialogScript) werden weiterhin appliziert.
- Analog `characterActions` pro Slot: wenn ein bestehender Slot bereits `actionUser` hat, den Director-Vorschlag für diesen Slot verwerfen (alle anderen Slots normal überschreiben). Hält die schon dokumentierte Lock-Semantik konsistent.
- Falls Locks erkannt wurden → ein dezenter Toast-Hinweis ("Manuelle Aktionstexte beibehalten — Director hat nur Prompt & Assets aktualisiert"), damit der User versteht, was passiert ist.

### Test-Plan (manuell)
1. Neue Briefing-Generierung → Storyboard öffnen → Action-Feld muss den AI-Text zeigen (Reload-Test: Page-Refresh → Feld bleibt befüllt, beweist dass Flush stimmt).
2. Action-Feld leeren → SceneDirectorBox → Generate → Action-Feld zeigt Director-Output (Lock-Semantik korrekt: leer = unlocked).
3. Action-Feld mit eigenem Text füllen → SceneDirectorBox → Generate → Action-Feld bleibt unverändert, Prompt + Cast werden aber aktualisiert; Toast erscheint.

### Out of Scope (Folgetickets)
- Restliche im Flush fehlende Felder (`audio_plan`, `realism_preset`, `action_beat`, ...). Separates Audit empfohlen.
- Verhalten des `actionUser` pro Cast-Slot ist analog gelocked, aber lohnt eine eigene Review der Lock-UI im `CharacterCastPicker`.
