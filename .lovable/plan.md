## Ziel

Wenn der Scene-Director eine Szene generiert ("KI Modus"), sollen die manuellen Override-Felder **nicht leer** bleiben, sondern direkt mit dem ausgefüllt werden, was im Prompt steht — sowohl die allgemeine **Szenen-Aktion** als auch die **Aktion pro Charakter**. Damit gilt:

- "Was passiert in der Szene?" stimmt 1:1 mit der Action im Prompt überein.
- "Was tut Sarah / Matthew / Samuel / Kailee?" ist pro Charakter vorausgefüllt.
- Der User kann jedes Feld danach manuell überschreiben (bestehendes Lock-Verhalten bleibt).

Aktuell liefert `scene-director` nur **einen** `actionBeat.characterAction` (für den Hauptcharakter) und **kein** Per-Character-Mapping → daher sind alle Felder leer.

---

## Änderungen

### 1. `supabase/functions/scene-director/index.ts` (Tool-Schema erweitern)

Im `emitScene`-Tool zwei neue Felder ergänzen:

- `sceneActionEn` (string, englisch) — **eine** prägnante Action-Sentence, die genau das beschreibt, was im Action-Body des `aiPrompt` passiert (ohne Cast-Header, ohne Negative-Clause).
- `perCharacterActions` (array) — pro `characterId` in `matchedAssets.characterIds` ein Eintrag `{ characterId, actionEn }`. **Pflicht** für jeden gematchten Charakter (sonst Cast-Coverage-Validator schlägt an).
- `sceneActionLocalized` und `perCharacterActionsLocalized` (`{ characterId, action }`) — gleiche Inhalte in `req.language`, damit das UI-Feld direkt in DE/ES gefüllt wird (kein zusätzlicher Translate-Call nötig).

System-Prompt-Anweisung ergänzen: "Fill `sceneActionEn` with one English sentence summarizing the overall on-screen action. Fill `perCharacterActions` with exactly one entry per `matchedAssets.characterIds` member — same name, concrete verb, ≤ 12 words. The localized versions must be a faithful translation in the user's UI language."

Post-Call-Validator: fehlende Einträge mit Fallback `''` ergänzen; Locale-Versionen fallback = English.

### 2. `src/components/video-composer/SceneDirectorBox.tsx` (Felder durchreichen)

`onApply`-Payload erweitern um:
- `sceneActionUser` (aus `sceneActionLocalized`)
- `sceneActionEn` (aus `sceneActionEn`)
- `characterActions: { characterId, actionUser, actionEn }[]` (aus `perCharacterActionsLocalized` × `perCharacterActions`)

Diese werden zusätzlich zu `aiPrompt / dialogScript / characterShots / actionBeat` übergeben.

### 3. `src/components/video-composer/SceneCard.tsx` (Mapping in den State)

Im bestehenden `onApply`-Handler (Zeile 2335) die neuen Felder auf den Scene-State mappen:

- `updates.sceneActionUser = sceneActionUser` (auch wenn leer-string überschreibt → User-Erwartung: KI-Run synced)
- `updates.sceneActionEn = sceneActionEn`
- `characterShots` werden bereits gemerged → für jeden finalen Shot zusätzlich `actionUser` / `actionEn` aus dem `characterActions`-Mapping setzen (Match per `characterId`). Existierende manuelle Inhalte werden **nicht überschrieben**, wenn der Slot vorher schon `actionUser` hatte (Lock-Respekt) — sonst neu befüllt.

### 4. Keine Änderungen an

- `applyActionsToPrompt.ts` — funktioniert bereits idempotent.
- `useAutoTranslateEn` / `translate-to-english` — wird vom UI weiter genutzt, sobald der User manuell editiert.
- Lipsync / `compose-dialog-scene` / Render-Pipeline.
- Persistence-Layer (Felder sind bereits in `useComposerPersistence` enthalten).

---

## Technische Details

**Cache-Invalidation**: `scene_director_cache` Cache-Key bekommt einen `v4`-Bump (`v3` → `v4` in `cacheKey`), damit alte Einträge ohne die neuen Felder nicht zurückkommen.

**Edge-Cases**:
- Charakter im Prompt aber nicht in `matchedAssets.characterIds` → kein Eintrag, Feld bleibt leer (User kann manuell ausfüllen).
- Charakter durch Ghost-Cast-Validator gedroppt → entsprechender `perCharacterActions`-Eintrag wird ebenfalls gedroppt.
- Re-Roll mit gefüllten User-Override-Feldern → bestehende `sceneActionUser` / Per-Slot `actionUser` werden **überschrieben**, da der User explizit "Neu würfeln" geklickt hat (Erwartung: kompletter Re-Sync). Falls das nicht erwünscht ist, leicht umzustellen.

**Sprache**: Englischer Prompt-Inhalt bleibt unverändert. UI-Felder zeigen DE/ES wenn `lang ≠ en`, sonst EN identisch zu `actionEn`.

---

## Dateien

- `supabase/functions/scene-director/index.ts` (Tool-Schema + System-Prompt + Cache-Key)
- `src/components/video-composer/SceneDirectorBox.tsx` (`onApply`-Signatur + Forward)
- `src/components/video-composer/SceneCard.tsx` (Mapping auf Scene-State)
- *(optional)* `src/types/video-composer.ts` — `onApply`-Payload-Typ erweitern, falls separat exportiert.
