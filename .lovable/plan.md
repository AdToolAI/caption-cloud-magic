## Neuer Ansatz — ID-only, kein Namens-Matching

Das Voice-Binding läuft strikt über **Charakter-UUIDs**. Kein Fuzzy-Match, keine Vornamen, keine Slugs. Der Server ist die einzige Instanz, die einem Turn eine Charakter-UUID zuordnet — der Client konsumiert nur noch.

### Root Cause (unverändert)

`dialogTurns` tragen aktuell nur `speakerMentionKey` (Slug wie `@samuel`). Der Client in `useApplyProductionPlan.ts` (Z. 386–414) matcht diesen Slug per String-Vergleich gegen `cast.mentionKey` (`@samuel-dusatko`). Kein Match → keine Voice-ID → Warnung.

## Fix — Server bindet UUID, Client nutzt UUID

### Phase 1 — Server: `speakerCharacterId` in jeden Turn schreiben

`supabase/functions/briefing-deep-parse/index.ts`:

- Nach `enforceStrictCast` (Z. 2528) einen neuen deterministischen Pass **`bindTurnSpeakerIds(plan)`** ergänzen. Er iteriert über jede Szene und ordnet jedem `dialogTurn` eine UUID aus dem Szenen-Cast zu — ausschließlich anhand strukturierter Daten, keine Namens-Heuristik:

  1. **Direkter Cast-Index**: Wenn `dialogTurns` in Reihenfolge zur `cast[]` mit gesetzten `characterId` passt (gleiche Anzahl UUID-Slots wie Turns), positional binden — `turn[i].speakerCharacterId = cast[i].characterId`.
  2. **`speakerLabelIndex`**: Wenn die Turns in `applyContinuousScriptTurns` erzeugt werden, gibt der Skript-Parser bereits eine deterministische Reihenfolge (1., 2., 3., 4. Sprecher-Auftritt). Diese Position → Index im Cast (nach `enforceStrictCast` sortiert stabil in Briefing-Reihenfolge).
  3. **Kein Match möglich** → `speakerCharacterId = null` (Diagnose-Feld, kein Fehler).

- In `applyContinuousScriptTurns` (Z. 1292–1320) den Turn-Emitter erweitern: statt nur `speakerMentionKey` auch `speakerCharacterId` schreiben, sobald der Cast bekannt ist (Cast-Merge läuft in `mergePlanScenesToSingleContinuousScene` **vor** `applyContinuousScriptTurns`, also verfügbar).

- Server-Meta: `plan._meta.debug.turnBinding = { total, byCastIndex, byLabelIndex, unresolved }` für die Debug-Chip-Anzeige.

### Phase 2 — Schema: Feld auf DialogTurn ergänzen

`src/lib/video-composer/briefing/productionPlan.ts`:

- Zod-Schema `DialogTurn` um `speakerCharacterId: z.string().uuid().nullable().optional()` erweitern. Optional, damit Legacy-Pläne kompatibel bleiben.

### Phase 3 — Client: Voice-Binding ausschließlich über UUID

`src/hooks/useApplyProductionPlan.ts`:

- Z. 380–384: `speakingMentionKeys` **ersetzen** durch `speakingCharacterIds: Set<uuid>` — aufgebaut aus `dialogTurns.map(t => t.speakerCharacterId).filter(isUuid)`.
- Z. 386–414 (Voice-Loop): `isSpeaker` bestimmt sich rein aus `speakingCharacterIds.has(cast.characterId)`. Kein `mk`-Vergleich mehr, kein Namens-Fallback.
- Z. 424–437 (`dialogScript`-Bau): Speaker-Name wird via `cast.find(c => c.characterId === turn.speakerCharacterId)?.characterName` geholt. Fallback nur wenn `speakerCharacterId` fehlt → `'NARRATOR'`.
- Z. 936–948 (Verify): `speakingCharIds = new Set(turns.speakerCharacterId)`; Warnung nur wenn ein Sprecher-UUID in `dialog_voices` fehlt. Sichtbar-stumme Slots ignoriert.

### Phase 4 — Legacy-Kompatibilität (isolierter Migrationspfad)

Für Pläne ohne `speakerCharacterId` auf den Turns (alte gespeicherte Drafts):

- Ein **einmaliger** Client-Migrator direkt vor dem Voice-Binding, der positional bindet, falls `turns.length === cast.filter(c => isUuid(c.characterId)).length`. Kein Namens-Fallback. Wenn ambiguous → Turn bleibt ohne UUID, Verify meldet ehrlich „Sprecher unauflösbar" statt falsch stumm zu schalten.

### Phase 5 — Pipeline-Version

`src/config/pipelineVersion.ts` → **217**. Server-Version-Marker im Response-Meta ebenfalls hochziehen.

### Was NICHT angefasst wird

- `finalizePlanCanonical.sanitizeCastIds` — bleibt.
- Ensemble-/Strict-Cast-Passes — bleiben.
- Kein Fuzzy-Match, kein Vorname-Fallback, keine Slug-Präfix-Heuristik. Ausschließlich UUIDs.

## Erwartetes Ergebnis

- Jeder `dialogTurn` trägt eine eindeutige `speakerCharacterId`.
- `composer_scenes.dialog_voices` wird pro UUID sauber befüllt.
- Warnung *"Lip-Sync-Szene ohne Voice-ID"* verschwindet für alle Fälle, in denen der Server einen Sprecher an einen Cast-UUID binden kann.
- Wenn der Server **nicht** binden kann (Cast unvollständig), meldet die UI das ehrlich und deterministisch — kein stiller Datenverlust.
