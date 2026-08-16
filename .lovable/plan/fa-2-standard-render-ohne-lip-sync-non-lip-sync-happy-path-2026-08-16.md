# FA-2 — Standard-Render ohne Lip-Sync (Non-Lip-Sync Happy Path)

Ziel: Nachweis, dass eine frische Szene ohne intentionalen Lip-Sync über die
normale UI sauber bis `complete` läuft, genau ein Attempt je Stage erzeugt und
über `resolveSceneOutput()` einen finalen Output liefert.

Frozen bleibt frozen: G3.2.2, G3.2.2-F1, RS3, Gate-/Pipeline-Semantik. Es gibt
in diesem Block keine Migration und keine Vertragsänderung. Findings werden auf
der Ebene behandelt, auf der sie auftreten — und nur dieser Block.

## Ablauf

1. **Frische Szene anlegen**
   Im bestehenden Resmoke-Projekt `035273d7-…` eine neue Szene über die normale
   UI erzeugen (kein SQL-Insert), Provider-/Engine-Konfiguration auf normalem
   Standard-Render (kein Avatar-/Dialog-Pfad, kein Cinematic-Sync-Override).

2. **Pre-Start-Snapshot (read-only, vor jedem kostenpflichtigen Klick)**
   Erhoben per Datenbank-Read und im Report festgehalten:
   - `lip_sync_with_voiceover = false`
   - `dialog_mode = false` bzw. kein intentionaler Dialog-Lip-Sync
     (`isLipSyncIntentional()` = false als SSoT-Beleg)
   - `active_run_id IS NULL`
   - Ledger `composer_pipeline_jobs` für die Szene = 0 Zeilen
   - keine alten Pass-/Job-Pointer (Plate-/Sync-/Mux-Pointer leer)
   - keine RS3-Marker (`audio_plan.twoshot.rs3_reset`, `rs3_reset_id` leer)
   - UI-Intent nach Reload = DB-Wahrheit (C1-Konsistenz, tri-state resolved)

3. **STOP-Punkt: Renderfreigabe**
   Snapshot wird berichtet. Erst nach ausdrücklichem GO wird genau ein
   normaler UI-Render gestartet (ein Klick, kein Retry).

4. **Read-only Verfolgung bis `complete`**
   Polling auf Szene + Ledger, ohne jede Mutation. `T_run_start` und `run_id`
   werden festgehalten.

## Abnahmekriterien

- `resolveSceneOutput()` liefert einen finalen Output; ohne intentionalen
  Lip-Sync darf `base_video_url` dieser finale Output sein
- `clip_url`-Compatibility korrekt (Legacy-Leser sehen denselben Output)
- genau ein Attempt je tatsächlich durchlaufener Stage
- keine Doppel-Dispatches (Ledger-Kardinalität je Stage = 1)
- kein Legacy-Wrapper als Completion-Owner (Write-ID-Provenienz belegt)
- Szene bleibt nach Reload korrekt (Output und Intent stabil)

## Ergebnis

- Alles grün → Eintrag „FA-2 — PASS" in `docs/v433-motion-studio-final-acceptance.md`,
  danach STOP und Warten auf FA-3-Freigabe.
- Abweichung → als FA-2 P0/P1 melden, STOP, ausschließlich diesen Block behandeln.

## Technische Notizen

- Output-Wahrheit ausschließlich über `src/lib/composer/output/resolveSceneOutput.ts`;
  `processed_video_url` ist hier nicht erforderlich.
- Intent-Wahrheit ausschließlich über `isLipSyncIntentional()`
  (`lipSyncIntentMatrix.ts`), nicht über Einzelflags im UI-Draft.
- Ledger-Auswertung über `composer_pipeline_jobs` (Stage, Attempt, Write-ID,
  `pipeline_job_id`-Provenienz).
- Szenenanlage und Renderstart über Playwright gegen die laufende Preview,
  damit exakt der produktive UI-Pfad geprüft wird.
