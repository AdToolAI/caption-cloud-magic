# v431 — G1-Abnahmebericht (reduzierter Scope)

Status: **G1 umgesetzt, ein Punkt bewusst STOP** (SceneCard-Cancel, siehe unten).
G0-State-Core unverändert (eingefroren).

## 1. Migrierte Writes

| bisherige semantische ID | neue Branch-IDs | Vertrag |
| --- | --- | --- |
| `compose-video-clips:failed` | `compose-video-clips:failed-unsupported-source`<br>`compose-video-clips:failed-lipsync-uncertified`<br>`compose-video-clips:failed-anchor-input-unsupported` | `transitionSceneV2()`, `guardMode: run_bound`, `runId`/`generation` aus `sceneRunStamps` (Dispatch-Snapshot) |
| `SceneCard:canceled` | `cancel-dialog-lipsync:reset` | `composer_reset_lipsync_full()` SQL-Primitive mit `expected_generation`/`expected_run_id`-Guards; kein direkter Client-Write mehr |

`markSceneContractFailure()` wurde **nicht pauschal** umgestellt, sondern gesplittet:

- `legacyMarkSceneContractFailure()` — unveränderter Legacy-Write, greift ausschließlich,
  wenn zum Fehlerzeitpunkt **kein** Run-Stempel für die Szene existiert (z. B. Lip-Sync-Szene
  mit Nicht-`ai-`-`clipSource`). Diese Zweige bleiben Debt für **G2**.
- `markSceneContractFailure(sceneId, message, writeId)` — run-gestempelter Pfad: Zustand und
  `clip_error` atomar über den G0-Core (`_error_text`), danach ein **run-geguardeter**
  Kompatibilitätsspiegel für `clip_status` (`.eq(active_run_id).eq(plate_generation)`).
  Wird der Übergang abgelehnt (z. B. `stale_run`), erfolgt **kein** Legacy-Fallback —
  der verspätete Lauf darf den aktuellen nicht überschreiben.

`resumeContinuityChain()` läuft in beiden Pfaden unverändert.

## 2. Nicht migriert (bewusst)

- **`cancel-dialog-lipsync:canceled`** (nicht-Reset-Cancel) — nicht angefasst. Kein `run_bound`
  möglich (kennt nur den *jetzt* aktiven Run); Delegation an `composer-cancel-scene` ist
  fachlich **nicht** deckungsgleich (Scene-Cancel ist ein Voll-Cancel, hier bleibt das
  Basis-Video erhalten). Keine neue Runless-Regel angelegt.
- Unverändert außerhalb des Änderungssets: `_shared/lipsync-fail.ts`, `generate-talking-head`,
  `report-lipsync-motion-probe`, alle Webhooks/Watchdogs/Fan-in, `hybrid-extend-scene` (G2),
  Lip-Sync-Frozen-Contracts, Cast & World, Reverse-Bridge.

## 3. Grandfathering / Runless

- `composer_transition_grandfather` enthält ausschließlich Wrapper-Signaturen
  (`legacy_6`, `legacy_7`) — **keine** writer-spezifischen Kanten für
  `compose-video-clips`. Der migrierte Write lief bisher als direkter Tabellen-Update,
  nie über eine Grandfather-Kante. Es gibt daher nichts zu entfernen; entscheidend ist:
  **keine Zeile hinzugefügt** (im Smoke geprüft).
- `composer_runless_transition_rules`: unverändert, keine neue Regel
  (im Smoke geprüft: 0 Regeln mit `write_id LIKE 'compose-video-clips:%'`).

## 4. Nachweise

DB-Smoke (Fixture-Szene, danach rückstandsfrei gelöscht):

| Assertion | Ergebnis |
| --- | --- |
| B1 — run-gestempelter Contract-Failure setzt `failed` + `clip_error` atomar, 1 Audit-Zeile | PASS |
| B2 — verspäteter Fehler aus altem Run wird mit `stale_run` abgewiesen, keine Zustands-/Fehlerschreibung | PASS |
| B3 — Anchor-Branch-`write_id` greift auf gestempeltem Run | PASS |
| B4 — keine neuen Runless-Regeln, keine neuen Grandfather-Zeilen | PASS |

Statische Prüfungen:

- `tsgo` grün.
- `vitest run src/lib/composer/__tests__` — 29 Dateien / 368 Tests grün, inkl.
  `lipsyncFrozenContract`, `legacyWriterAllowlist`, `sceneStateClientContract`,
  `forceCinematicSyncRouting`.
- Inventar `v431LegacyWriteInventory.ts`: Eintrag aufgeteilt, jede Branch-ID trägt
  `migratedIn: "G1"`, `contractWriteId` und den verbliebenen Legacy-Zweig.

## 5. Änderungsset

- `supabase/functions/compose-video-clips/index.ts` (Helper-Split + 3 Call-Sites, deployed)
- `src/lib/composer/__tests__/fixtures/v431LegacyWriteInventory.ts` (Inventar-Diff)
- Smoke-Migration (Fixture, self-cleaning)
- `docs/v431-g1-report.md`

**STOP.** Kein G2 ohne neue Freigabe.
