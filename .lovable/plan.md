# v431 G3.2.1 — Abnahme-Gates vor Deploy

Kein neuer Scope. Drei Gates schließen, dann Deploy-GO nur für `compose-clip-webhook`.
Kein G3.2.2. Die bereits live stehenden RPCs bleiben unverändert (service-role-only, aktuell ungenutzt).

## Gate 1 — H-Compatibility-Matrix hart belegen

Erweiterung von `composer_fail_post_plate_handoff` wird als **geschlossene** Matrix belegt, nicht als offenes „spätere States dürfen failen".

Smoke S9 (transaktional, Fixture-Projekt, danach vollständig gelöscht), je ein frischer Szenen-Zyklus:

| Ausgangs-State | Erwartung |
| --- | --- |
| `plate_ready` | `applied = true`, State `failed`, Spiegel `lip_sync_status/twoshot_stage = failed` |
| `audio_prep` | `applied = true` |
| `audio_ready` | `applied = true` |
| `lipsync_dispatched` | `applied = false`, Verdikt `from_state_rejected` |
| `lipsync_running` | `applied = false`, Verdikt `from_state_rejected` |
| `complete` | `applied = false`, Verdikt `from_state_rejected` |

Zwei verpflichtende Zusatz-Assertions (Review-Runde):

1. **Output-Invarianz gilt in allen sechs Fällen**, also auch bei den drei erlaubten From-States: `base_video_url`, `clip_url`, `processed_video_url`, `clip_status` und `dialog_shots` müssen unverändert bleiben. H darf ausschließlich State/Substate und die vorgesehenen Lip-Sync-Spiegel (`lip_sync_status`, `twoshot_stage`) ändern.
2. **Transition-/Audit-Vertrag wird für erlaubte und abgelehnte Aufrufe nachgewiesen**: erlaubt → genau eine neue Audit-Zeile mit `applied = true`, `write_id = ccw:handoff_failed`, korrektem `run_id`/`generation`, `to_state = failed`, `guard_mode = run_bound`; abgelehnt → Audit-Zeile mit `applied = false` und gesetztem `reason`, und **keinerlei** Scene-Mutation (voller Row-Snapshot vor/nach ist identisch). Der Plate-Ledger-Job bleibt in allen Fällen `succeeded`.

Ergebnis wird als Compatibility-Matrix in `docs/v431-g3-2-1-report.md` festgeschrieben; die drei erlaubten From-States sind damit abschließend aufgezählt.

## Gate 2 — Frozen-Suite mit exakt dem eingefrorenen Command

Eingefrorener Baseline-Command aus G3.1d (`docs/v431-g3-1-drain.md`, Zeile 274):

```text
vitest run src/lib/composer src/lib/video-composer --testTimeout=60000
```

- Genau dieser Command wird erneut ausgeführt, Zahl muss `>= 540` und vollständig grün sein.
- Beleg zu den acht Deno-Dateien: Der Selektor enthält ausschließlich `src/lib/composer` und `src/lib/video-composer`. Die acht `supabase/functions/_shared/*.test.ts`-Dateien liegen außerhalb beider Pfade und waren daher nie Teil der 527-/536-/540er-Baseline. Das wird durch eine Pfad-Auflistung des Selektors (Liste der tatsächlich kollektierten Dateien) belegt, nicht behauptet.
- Der zusätzliche Lauf über `supabase/functions/_shared` aus dem letzten Turn wird im Bericht ausdrücklich als *nicht* Baseline markiert.

## Gate 3 — Out-of-Scope-Änderungen aus dem G3.2.1-Diff trennen

Ausgangslage: Nach der Typ-Regenerierung blockierten acht Buildfehler den Turn. Sie sind nicht durch G3.2.1 verursacht, mussten aber für einen grünen Build angefasst werden.

Behandlung:

1. **`src/pages/TeamWorkspace.tsx` wird zurückgenommen.** Die Umstellung `approver_id/approved_at → reviewed_by/reviewed_at` ist echte Verhaltensänderung und gehört nicht in diesen Deploy. Stattdessen wird der ursprüngliche Payload wiederhergestellt und nur typseitig entschärft, sodass das Laufzeitverhalten exakt dem Stand vor G3.2.1 entspricht. Der fachliche Fix (falsche Spaltennamen gegen `content_approvals`) wird separat als eigener Vorgang dokumentiert und später einzeln freigegeben.
2. **Die reinen Payload-Casts bleiben** (`FaceMapReviewDialog`, `SceneCard` ×2, `useAudiobookProject`, `useSceneGenerate`, `useMotionStudioLibrary` ×2). Nachweis der Runtime-Identität: Es sind ausschließlich TypeScript-`as`-Assertions auf bestehende Argumente; sie werden beim Transpilieren entfernt. Beleg über einen Emit-Vergleich (esbuild/tsc-Emit vor/nach der Änderung → identisches JS) statt bloßer Behauptung.
3. Alle drei Punkte werden im Bericht als „Out-of-Scope, build-blocking" mit Begründung gelistet, damit der G3.2.1-Diff sauber lesbar bleibt.

Falls sich der TeamWorkspace-Rollback nicht ohne Buildfehler darstellen lässt, wird das gemeldet und **kein** Deploy durchgeführt.

## Danach

Wenn Gate 1–3 grün sind:

1. Deploy **nur** `compose-clip-webhook`.
2. Kurzer Post-Deploy-Smoke: ein echter Plate-Callback-Pfad in Produktion beobachten (Ledger-Job `succeeded`, Szene `plate_ready`/gebridged, Observe-Verdikt `bound`, keine 409-Serie im Function-Log).
3. Bericht `docs/v431-g3-2-1-report.md` abschließen → **STOP**.

Kein G3.2.2, keine weitere Architekturanalyse, keine Änderung an den G3.0b/G3.1-Verträgen.

## Technische Details

- Neue Smokes laufen als `DO $$ ... $$`-Block mit Fixture-Projekt und vollständigem Cleanup; keine Produktionsdaten werden angefasst.
- `composer_fail_post_plate_handoff` bleibt inhaltlich unverändert; Gate 1 ist reiner Nachweis, keine Migration — es sei denn, ein Smoke deckt eine Abweichung auf, dann STOP mit Befund statt stiller Korrektur.
- Emit-Vergleich für die Casts über `esbuild --loader=tsx` auf Original- und geänderter Datei, Diff der Ausgabe muss leer sein.
