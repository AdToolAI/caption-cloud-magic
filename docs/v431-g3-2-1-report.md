# v431 G3.2.1 — Callback-Apply-Migration `compose-clip-webhook`

Status: **GATES 1–3 PASS / NOT DEPLOYED**
Stand: 2026-08-15, vor Deploy-Freigabe. Kein G3.2.2.

## 1. Scope

Migrierte Schreibpfade in `supabase/functions/compose-clip-webhook/index.ts`:

| Pfad | Neuer Writer |
| --- | --- |
| Plate-Erfolg | RPC A `composer_finalize_plate_scene` |
| Handoff-Fehler nach erfolgreicher Plate | RPC H `composer_fail_post_plate_handoff` |
| `ccw:failed` | RPC D `composer_fail_callback_scene` |
| `ccw:legacy_route_blocked` | RPC D `composer_fail_callback_scene` |

Alle drei RPCs: `SECURITY DEFINER`, `REVOKE ALL` von PUBLIC/anon/authenticated, `GRANT EXECUTE` nur `service_role`, Guards unter Job- und Scene-Row-Lock, Prüfreihenfolge `binding_pending` vor External-ID-Vergleich, Terminal-Success = `succeeded`.

## 2. Freigegebene Vertragsabweichungen

1. **`_base_video_url` → `_base_url`** (Signatur/Konvention, keine Semantikänderung). Notwendig, weil der eingefrorene Output-Writer-Test direkte `base_video_url:`-Zuweisungen im Function-Code verbietet; die Konvention entspricht `composer_finalize_talking_head`.
2. **H-From-States erweitert** auf eine **geschlossene** Matrix `plate_ready | audio_prep | audio_ready`. Grund: Die aktive Legacy→State-Bridge hebt eine materialisierte Cinematic-Sync-Plate unmittelbar aus `plate_ready` heraus; mit `plate_ready`-only hätte H faktisch nie gegriffen. Kein generelles „spätere States dürfen failen" — Nachweis siehe Gate 1.

## 3. Gate 1 — H-Compatibility-Matrix (Smoke S9)

Sechs frische Szenen-Zyklen in einem Fixture-Projekt, jeweils mit materialisierter Plate (`clip_url`/`base_video_url` gesetzt, `clip_status = ready`, `dialog_shots` befüllt) und `succeeded`-Plate-Ledger-Job. Fixtures danach vollständig gelöscht (verifiziert: 0 Restzeilen).

| From-State | Ergebnis | Verdikt |
| --- | --- | --- |
| `plate_ready` | `applied = true`, State `failed`, Spiegel `lip_sync_status/twoshot_stage = failed` | erlaubt |
| `audio_prep` | `applied = true` | erlaubt |
| `audio_ready` | `applied = true` | erlaubt |
| `lipsync_dispatched` | `applied = false` | `from_state_rejected` |
| `lipsync_running` | `applied = false` | `from_state_rejected` |
| `complete` | `applied = false` | `from_state_rejected` |

Zusätzlich in **allen sechs** Fällen bewiesen:

- **Output-Invarianz:** `base_video_url`, `clip_url`, `processed_video_url`, `clip_status`, `dialog_shots` unverändert. H ändert ausschließlich State/Substate und die Lip-Sync-Spiegel.
- **Audit-Vertrag erlaubt:** genau eine neue Zeile in `composer_scene_transition_log` mit `applied = true`, `write_id = ccw:handoff_failed`, korrektem `run_id` + `generation = 11`, `to_state = failed`, `guard_mode = run_bound`.
- **Audit-Vertrag abgelehnt:** Zeile mit `applied = false` und gesetztem `reason`; der vollständige Scene-Row-Snapshot (ohne `updated_at`) ist vor/nach byte-identisch — `from_state_rejected` erzeugt **keine** Scene-Mutation.
- **Ledger unberührt:** Plate-Job bleibt in allen sechs Fällen `succeeded`.

Damit sind die drei erlaubten From-States abschließend aufgezählt.

Frühere Smokes S1–S8 (Identitäts-Guards, Happy-Path, `duplicate_callback`, `attempt_superseded`, Write-ID-Allowlist) bleiben gültig.

## 4. Gate 2 — Frozen-Suite

Exakt der eingefrorene G3.1d-Command:

```text
vitest run src/lib/composer src/lib/video-composer --testTimeout=60000
```

Ergebnis: **48 Dateien / 540 Tests grün**, 0 rot — identisch zur G3.1d-Baseline 540/540.

Beleg zu den acht Deno-Dateien: `vitest list src/lib/composer src/lib/video-composer --filesOnly` liefert 48 Dateien, davon **0** unter `supabase/functions/`. Die acht `supabase/functions/_shared/*.test.ts` waren daher nie Teil der 527-/536-/540er-Baseline; sie sind reine Deno-Dateien mit `https:`-Importen und unter Vitest generell nicht lauffähig. Der zusätzliche Lauf über `supabase/functions/_shared` aus dem vorherigen Turn ist **nicht** Baseline und wird nicht als solche gewertet.

Der Writer-Inventar-Test `materializeSceneOutput.test.ts` wurde nicht entfernt, sondern inhaltlich umgehängt: `compose-clip-webhook/index.ts` steht jetzt in `ATOMIC_DB_WRITERS` (RPC `composer_finalize_plate_scene`, keine direkten Output-Spalten, kein `materializeCompatibilityOutput`) statt in `FINALIZATION_POINTS`. Testanzahl unverändert.

## 5. Gate 3 — Out-of-Scope-Änderungen

Nach der Typ-Regenerierung blockierten acht Buildfehler den Turn; sie sind nicht durch G3.2.1 verursacht.

1. **`src/pages/TeamWorkspace.tsx` zurückgesetzt.** Die Umstellung `approver_id/approved_at → reviewed_by/reviewed_at` ist rückgenommen; der ursprüngliche Payload ist wiederhergestellt und nur typseitig über `as never` entschärft. Laufzeitverhalten exakt Pre-G3.2.1 (Emit-Vergleich identisch).
2. **Reine Payload-Casts bleiben** in `FaceMapReviewDialog.tsx`, `SceneCard.tsx` (×2), `useAudiobookProject.ts`, `useSceneGenerate.ts`, `useMotionStudioLibrary.ts` (×2). Emit-Vergleich (esbuild, Original ohne Casts vs. geänderte Datei): **alle identisch**; bei `FaceMapReviewDialog.tsx` unterschied sich nur der aus dem Temp-Dateinamen abgeleitete Bezeichner des Default-Exports, nach Normalisierung ebenfalls byte-identisch.
3. **Kein Frontend-Deploy** wegen dieser Dateien. Deployt wird ausschließlich die Edge-Function.

### Offene Schuld (nicht behoben)

- **`content_approvals`-Spaltenfehler:** `src/pages/TeamWorkspace.tsx` schreibt `approver_id` und `approved_at`; die Tabelle hat `reviewed_by` und `reviewed_at`. Der Approval-Entscheid dürfte damit zur Laufzeit fehlschlagen. Bewusst **nicht** in diesem Deploy korrigiert, nur typseitig ruhiggestellt. Separater Vorgang, separate Freigabe.
- **Restschuld A (aus G3.1c):** `watchdog_no_prediction_id` vor erstem Provider-Callback — weiterhin offen.

## 6. Verifikation gesamt

| Prüfung | Ergebnis |
| --- | --- |
| Smokes S1–S8 (Identität/Apply/Fail) | grün |
| Smoke S9 (H-Matrix, 3 erlaubt / 3 verboten) | grün |
| Frozen-Suite (eingefrorener Command) | 540/540 grün |
| `tsgo --noEmit -p tsconfig.app.json` | sauber |
| `deno check compose-clip-webhook` | nur vorbestehender Fehler `_shared/ambient-audio.ts:83` (`Uint8Array`/`BlobPart`), unverändert |
| Emit-Vergleich Out-of-Scope-Casts | identisch |

## 7. Status

- **G3.2.1: GATES PASS / NOT DEPLOYED** — wartet auf Deploy-GO für ausschließlich `compose-clip-webhook`.
- RPCs A/H/D sind live, service-role-only und vom noch nicht deployten Handler ungenutzt → kein Rollback nötig.
- **G3.2.2 gesperrt.**
