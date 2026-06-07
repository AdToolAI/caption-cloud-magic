
## Was wirklich der Bug ist

Du hattest Recht — **Matthew existiert in der Library**. Die `Featuring Sarah, Samuel, Kailee, Matthew:` Zeile ist der korrekt aus `matchedAssets.characterIds` gebaute @-Mention-Header, damit der Renderer alle 4 Portraits als Multi-Reference bekommt.

Der echte Fehler liegt im **Action-Body**: Der `scene-director` LLM listet 4 Charaktere als „matched" auf, **schreibt die Szene aber nur um Matthew** („A focused male social media manager, Matthew, staring at laptop…"). Sarah, Samuel und Kailee kommen im sichtbaren Geschehen nicht vor.

Folge:
- Multi-Portrait Nano Banana 2 / Vidu Q2 bekommen 4 Reference-Bilder, das Modell rendert aber nur 1 sichtbaren Kopf (weil der Prompt nur 1 Person beschreibt).
- `compose-dialog-scene` baut einen Audio-Plan mit 4 Sprechern.
- `_shared/twoshot-face-map.ts` läuft Gemini-Vision auf dem Plate und findet **1 Gesicht**, nicht 4.
- Per-Segment `coordinates` fallen auf den Heuristik-Fallback zurück → alle Audio-Segmente landen auf demselben Mund → klassischer „nur ein Charakter redet alles"-Bug.

Der Bug ist also **nicht** im Sync.so-Stack, sondern im **Director-Prompt**, der die Cast-Liste und den Action-Body nicht koppelt.

## Plan

### 1. Cast-Coverage-Regel im scene-director System-Prompt

`supabase/functions/scene-director/index.ts` — der System-Prompt bekommt einen zusätzlichen, harten Block:

```
CAST COVERAGE (critical):
- Every character listed in matchedAssets.characterIds MUST appear visibly
  in the aiPrompt action body, by name, doing something concrete.
- If you cannot fit them all into the duration budget, then either:
    (a) drop them from matchedAssets.characterIds (do NOT keep them as "ghost"
        cast that is referenced but never seen), OR
    (b) split the overflow into followupSceneSuggestions.
- For ensemble scenes with 2+ characters: describe the spatial arrangement
  (side by side, facing each other, sitting around a table, walking together,
  intercut between desks). Never write a solo scene while listing extra
  characters as matched.
- For 3-4 character scenes: prefer a wide group composition or fast
  intercuts, not a single close-up on one face.
```

Plus eine zwei-Beispiel-Demo direkt im System-Prompt („3 Charaktere, alle handeln" vs. „3 Charaktere, nur einer handelt — verboten"), weil Gemini auf solche Negativ-Beispiele besser anspringt als auf reine Regeln.

### 2. Post-Call-Validator im scene-director Edge Function

Nach dem `emitScene`-Tool-Call: prüfe, ob **jeder Name** der Charaktere in `matchedAssets.characterIds` als Substring (case-insensitive, erstes-Wort-fallback wie in `syncCastFromPrompt.ts`) im `aiPrompt` vorkommt.

- Fehlt ein Name → entferne die ID aus `matchedAssets.characterIds`, bevor das Ergebnis zurück geht.
- Begründung: lieber 1 ehrlicher sichtbarer Charakter im Plate als 4 als „Cast" markierte Geister, die `compose-dialog-scene` dann fälschlich als Sprecher behandelt.
- Logge die entfernten IDs in der Edge-Function-Response (`droppedGhostCast: string[]`), damit das UI sie als Warn-Chip anzeigen kann.

### 3. Required-Cast aus dem aktuellen Slot durchreichen

`SceneDirectorBox` schickt bei Re-Roll die bereits ausgewählten `scene.characterShots`-IDs als `requiredCharacterIds` mit. Der System-Prompt fügt sie als „MUST appear" vor die Library-Liste:

```
PRESELECTED CAST (the user already picked these slots — all MUST appear
visibly in this scene's action):
- Sarah Dusatko (id: …)
- Samuel Dusatko (id: …)
- Kailee (id: …)
- Matthew Dusatko (id: …)
```

Damit wird Re-Roll deterministisch — das Modell darf den preselected Cast nicht mehr stillschweigend auf 1 Person eindampfen.

### 4. Cast-Coverage-Chip in `SceneCard`

Unter der Prompt-Box ein kleines Statussignal, das nach jedem `onApply` neu berechnet wird (rein clientseitig, pure Helper):

- ✅ grün: alle `characterShots`-Namen kommen im Action-Body (Prompt nach dem `:` der Cast-Zeile) vor.
- ⚠ gelb: 1+ Cast-Mitglied fehlt im Action-Body. Tooltip listet die fehlenden Namen. Button **„Cast in Action erzwingen"** ruft `scene-director` neu auf mit den fehlenden Namen als `requiredCharacterIds`.

Die Heuristik wiederverwendet die Match-Logik aus `syncCastFromPrompt.ts` (Single-Source-of-Truth für Cast-Namen-Matching im Composer).

### 5. UI-Sichtbarkeit: Prompt-Textarea

In `SceneCard.tsx` (KI-Prompt EN — bearbeitbar Box):
- Nach jedem erfolgreichen Director-Apply: `textareaRef.current.scrollTop = 0`, damit der „Featuring …:"-Header direkt sichtbar ist (deshalb sah dein erster Screenshot aus, als wäre der Prompt leer).
- Min-Höhe von 6 auf ~9 Zeilen, damit bei 4-Cast-Header + Action-Body kein Scrollen nötig ist.

## Geänderte Dateien

- `supabase/functions/scene-director/index.ts` — Cast-Coverage-Block im System-Prompt, `requiredCharacterIds` Input, Post-Call-Validator + `droppedGhostCast` im Response
- `src/components/video-composer/SceneDirectorBox.tsx` — `requiredCharacterIds` aus `scene.characterShots` mitsenden, Cast-Merge statt Overwrite beim Apply
- `src/components/video-composer/SceneCard.tsx` — Cast-Coverage-Chip, „Cast in Action erzwingen"-Button, Textarea-Scroll-to-Top, Min-Höhe hoch
- `src/lib/motion-studio/castCoverage.ts` (neu) — pure Helper: `missingCastInAction(aiPrompt, characterShots, libraryCharacters)` + Tests

## Was NICHT geändert wird

- `compose-dialog-scene`, `poll-dialog-shots`, Sync.so-Webhook, Face-Map-Helper, Lipsync-Pro-Policy — alles unverändert. Der Multi-Speaker-Bug verschwindet automatisch, sobald der Plate echte 4 Köpfe zeigt statt 1.
- Render-Engine-Routing, Action-Beat-Composer, Realism-Presets, Credit-Refund — unverändert.
- Keine DB-Migration, keine neuen Tabellen, keine neuen Secrets.
