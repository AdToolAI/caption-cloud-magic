## Ursache (nicht durch die letzten Änderungen, älterer Bug — wird aber jetzt sichtbar weil 4 Speaker)

**Es liegt NICHT an unseren Dialog-Pipeline-Änderungen vom letzten Loop** (v85 Gate / cancel-project / SceneDirector-Lock). Der Bug sitzt eine Schicht tiefer in `compose-twoshot-audio` und erklärt exakt das Symptom „funktioniert manchmal, manchmal nicht":

In `supabase/functions/compose-twoshot-audio/index.ts` (Zeile ~671) werden die einzelnen Skript-Zeilen pro Speaker so gruppiert:

```ts
const key = String(seg.character_id || seg.speaker_slug || seg.speaker).toLowerCase();
```

Bedeutet: wenn zwei Cast-Member in derselben Szene **keine character_id im Skript-Block tragen** (z.B. weil das Dialog-Skript nur per Namen taggt) und sie **denselben Namen-Slug** haben — oder wenn beim Skript-Parsing ein Charakter ohne character_id durchrutscht und auf den Slug eines anderen Charakters mappt — werden ihre Turns in **einer Gruppe** zusammengefasst.

Folge in deinem 4er-Cast:
- `speakerTracks.length` wird nur 3 statt 4 → es entstehen nur 3 Sync.so-Passes.
- Die Turns von Char 4 landen physisch auf der Audio-Spur von Char 1 → Char 1 bekommt zwei Lipsync-Pässe (eigene Zeile + Char 4s Zeile) → **„Char 1 spricht zweimal"**.
- Für Char 4 wird nie ein Pass dispatched → **„Char 4 hat die Lippen zu"**.

Warum manchmal ok, manchmal kaputt:
- Sobald jeder Block sauber `character_id` mitliefert (Scene Director / Cast-Auswahl korrekt verdrahtet), greift die `character_id`-Branch des Keys → 4 Gruppen, 4 Pässe, alles richtig.
- Wenn die character_id für eine Zeile fehlt (Free-Text-Edit im Aktionsfeld, manuelle Skript-Bearbeitung, Storyboard-Import ohne IDs), fällt der Key auf `speaker_slug` zurück → Kollision.

`validateCast()` in `compose-dialog-segments` läuft **vor** dieser Gruppierung gegen `twoshot.speakers`, sieht also nur 3 Gruppen und akzeptiert sie als gültigen 3er-Cast — daher kein Fehler, sondern stiller Speaker-Drop.

## Plan

### 1. `compose-twoshot-audio` — Speaker-Identität härten
**Datei:** `supabase/functions/compose-twoshot-audio/index.ts`

- Beim Block-Parsing (~L218) für jeden Block **zuerst** versuchen, die `character_id` aus `mentioned_character_ids` / `cast` / `dialog_voices` per Namens-Match aufzulösen, BEVOR der Block in `segments` geschoben wird. Resultat: jeder `seg.character_id` ist gesetzt, wenn ein Cast-Member existiert.
- Group-Key (~L671) hart auf `character_id` stellen, wenn vorhanden. Fallback auf `speaker_slug + index` (nicht nur slug) — so kollidieren zwei namenlose Charaktere nicht mehr.
- **Hard-Guard:** nach `groups`-Aufbau prüfen `speakerTracks.length === cast.length` (bzw. Anzahl distinct Cast-Member im Skript). Bei Mismatch: 400-Response mit `error: 'speaker_dedup_collision'` und Liste der kollidierenden Speaker — kein stiller Drop, kein Wallet-Debit.

### 2. `compose-dialog-segments` — defensive Pass-Validation
**Datei:** `supabase/functions/compose-dialog-segments/index.ts` (~L1016 `passSpeakers`)

- Vor Pass-Build: prüfen `passSpeakers.length === speakers.length` UND `passSpeakers.length === distinct(speakers.character_id).length`. Bei Mismatch → Refund + Scene auf `failed` mit `clip_error: 'speaker_count_mismatch'` statt teilweise zu rendern.
- Telemetry: speaker_count, pass_count, character_ids als JSON in `composer_scenes.meta.dialog_diagnostics` schreiben (für künftige Debug-Sessions).

### 3. UI — fehlende character_id sichtbar machen
**Datei:** `src/components/video-composer/SceneDirectorBox.tsx` + DialogScript-Editor

- Wenn `dialogScript` Zeilen enthält, deren Speaker-Name in keinem zugewiesenen Cast-Member auflöst, gelber Warn-Toast: „Speaker ‚X' ist keinem Cast zugeordnet — bitte Charakter wählen". Verhindert, dass der User einen Render mit defektem Cast startet.

### 4. Memory
- Neue Memory-Datei `mem://architecture/lipsync/v86-speaker-dedup-collision-fix.md` mit der Root-Cause + Group-Key-Regel.
- Index-Eintrag.

## Out of scope
- Keine Sync.so-Pipeline-Änderungen (v85 Gate bleibt, Pro-Modell bleibt).
- Kein Refactor von Plate-Face-Detection — die funktioniert, das Problem ist davor.
- Keine UI-Änderung am Aktionsfeld / Lock-Logik (die ist fertig).

## Test-Matrix
1. 4er-Cast mit eindeutigen Namen + character_id → 4 Pässe, alle Lippen bewegen sich. ✅ (das ist der bisherige glückliche Fall)
2. 4er-Cast, zwei mit identischem Vornamen, beide haben character_id → 4 Pässe (Group-Key = character_id). ✅
3. 4er-Cast, eine Zeile ohne character_id im Skript → **alter Pfad:** 3 Pässe + Char-Drop. **neuer Pfad:** 400 `speaker_dedup_collision`, kein Spend, klare Fehlermeldung im Toast.
4. 2er-Cast einfacher Dialog → unverändert, 2 Pässe.
