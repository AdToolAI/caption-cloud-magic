# FA-4 RETEST — Identity Gate (Beleg vor Render)

Kein Render gestartet. Szene S09 `ece6a71c-118e-436a-ac1a-15182cc88ddb`.

## Ergebnis: FA-4 RETEST IDENTITY READY

Die Auflösung der 6 geplanten Turns auf Character-IDs wurde gegen die reale Scene-/Cast-Daten und den tatsächlichen Backend-Resolver nachvollzogen (`supabase/functions/_shared/scene-dialog-turns.ts`, Funktion `ensureDialogTurnsForScene` + `orderedSpeakerIdsFromTurns`).

| Turn | Script-Label | aufgelöste characterId | speaker_idx |
| --- | --- | --- | --- |
| 1 | Sarah Dusatko | `5c81f9bf-a5f1-4608-849f-e2a4adc84bcb` | 0 |
| 2 | Samuel Dusatko | `483f9cdc-eb31-4486-bf67-9c5e7d955016` | 1 |
| 3 | Matthew Dusatko | `54d90504-7253-482f-9c6f-1902e8a6749b` | 2 |
| 4 | Kay Mark | `c65de5c6-75e1-47aa-956c-cd0cc424e736` | 3 |
| 5 | Sarah Dusatko | `5c81f9bf-a5f1-4608-849f-e2a4adc84bcb` | 0 |
| 6 | Samuel Dusatko | `483f9cdc-eb31-4486-bf67-9c5e7d955016` | 1 |

Verbindliche Kriterien:

- `count(distinct characterId) = 4` — erfüllt
- Turn 1 = Turn 5 (identische Sarah-ID) — erfüllt
- Turn 2 = Turn 6 (identische Samuel-ID) — erfüllt
- Keine Duplizierung von Sprecheridentitäten über Display-Namen — erfüllt (Dedupe passiert über ID-Set, nicht über Namen)
- `dialog_voices` ausschließlich über diese vier Character-IDs verschlüsselt — erfüllt:
  - `5c81f9bf…` → `EXAVITQu4vr4xnSDxMaL` (Julia)
  - `483f9cdc…` → `u86DavlmJKwP4sPOSkw7` (Brand voice)
  - `54d90504…` → `pqHfZKP75CvOlQylNhV4` (Stefan)
  - `c65de5c6…` → `onwK4e9ZLuTAKqWW03F9` (Markus)
  - 4 distinct Voice-IDs, keine Namens-Keys
- `speaker_idx` = Position der characterId in der deduplizierten ID-Liste (`speakerIdxForTurn`), Namen sind kein Geometrie-/Speaker-Key — erfüllt
- Flag `composer.feature.id_only_cast_resolution` = `true` in `system_config` (ID-first erzwungen, kein Fuzzy-Name-Fallback)

## Technische Belege

- Cast der Szene (`character_shots`) enthält exakt die vier erwarteten IDs.
- `brand_characters`-Namen: Sarah Dusatko, Samuel Dusatko, Matthew Dusatko, Kay Mark — Slugs eindeutig, keine `ambiguous_speaker`-Kollision (Nachname geteilt, Vornamen distinct).
- Backfill-Simulation mit der 1:1 aus `scene-dialog-turns.ts` übernommenen Slug-/Regex-Logik über das persistierte `dialog_script` liefert genau die Tabelle oben (distinct=4, t1==t5, t2==t6).
- Frontend-Parser (`src/lib/talking-head/parseDialogScript.ts`) setzt `speakerId = cast.id`; nicht auflösbare Zeilen werden als Fortsetzungstext angehängt, es entstehen keine neuen Sprecherobjekte aus Namen.
- `dialog_turns` ist in der DB noch leer — die kanonische Liste wird beim Render-Start per JIT-Backfill erzeugt und persistiert; der Backfill ist fail-closed (`unmatched_speaker` / `ambiguous_speaker` blocken statt Fuzzy-Fallback).

## Nächster Schritt

STOP. Kein Render, bis du explizit das GO für genau einen kostenpflichtigen 4-Speaker-Retest-Render gibst. Beim Start werden `dialog_turns` (6 Turns, 4 IDs), `run_id`, `T_run_start` und die Plate-Generierung gesichert.
