# v431 G3.0b — Entscheidungsschluss vor dem Schnitt in G3.1 / G3.2

Kein Implementierungs-GO. Dieser Bericht ist der **autoritative G3.0b-Endvertrag** und ersetzt den vorherigen G3-Analyse-/Scope-Bericht vollständig — einschließlich aller dortigen Handler-Zielverträge, Provenienz-Optionen (A/B/C), Caller- und Risiko-Tabellen. Wo eine ältere Formulierung diesem Dokument widerspricht, gilt ausschließlich dieses Dokument. Keine Migration, keine Codeänderung.

Die vier Feststellungen unten sind an Code/Schema verifiziert, nicht angenommen:

- `composer_scene_state` enthält `lipsync_muxing`. Es gibt **keinen** Enumwert `audio_muxing`.
- `composer_state_from_legacy()` bildet `lip_sync_status='stitching' → lipsync_muxing` ab; `twoshot_stage='audio_mux_failed'` fällt auf `failed`. `audio_muxing` als Wert kommt ausschließlich in `lip_sync_status` / `twoshot_stage` / `dialog_shots.status` vor — also Legacy-Spiegel.
- `update_dialog_pass_slot()` besitzt bereits `FOR UPDATE`, einen Rückwärts-Guard für terminale Slots und Immutabilität für `run_id`, `plate_generation`, `job_id` (G2.1/G2.2).
- `try_claim_mux_dispatch()` setzt `dialog_shots.audio_mux.dispatched_at` genau einmal, **ohne** `render_id` und ohne Run-Bindung.

---

## D1 — Claim und Scene-Apply: eine Transaktion, kein zweistufiger Verbrauch

**Entscheidung: angenommen, in der strengeren Variante.** `claimPipelineCallback()` bleibt bestehen, verliert aber im G3-Pfad die Rolle des terminalen Verbrauchers. Der terminale Verbrauch des Job-Events geschieht ausschließlich innerhalb des Domain-Apply-RPC.

Verbindliches Muster für jeden G3-Callback:

```text
composer_apply_callback_<domain>(
  _pipeline_job_id  uuid,          -- primäre Callback-Identität
  _external_job_id  text,          -- Bestätigung, nie Bestimmung
  _write_id         text,          -- geschlossene Allowlist
  <domain payload>
) RETURNS jsonb
```

Innerhalb des RPC, in exakt dieser Lock-Reihenfolge (deterministisch, deadlock-frei):

1. `SELECT ... FROM composer_pipeline_jobs WHERE id = _pipeline_job_id FOR UPDATE`
2. `SELECT ... FROM composer_scenes WHERE id = job.scene_id FOR UPDATE`
3. Provenienz-Prüfung (D2), Write-ID-/From-State-Matrix (D4/D6)
4. Scene-Mutation + Legacy-Spiegel + Transition-Log
5. Job terminalisieren (`status`, `callback_delivery_status='succeeded'`, `completed_at`, Claim-Felder leeren)

Alles in einem Commit. Bricht Schritt 4 ab, ist auch Schritt 5 nicht passiert — der Provider-Retry findet den Job non-terminal und darf erneut anwenden.

Ergänzend, damit kein Lease-Zombie in der Vorstufe entsteht: Wo `claimPipelineCallback()` im G3-Pfad noch vorgeschaltet läuft (Kurzschluss für offensichtlich falsche Zustellungen), ist sein Claim ausdrücklich ein **recoverable lease** — `CLAIM_LEASE_MS` läuft ab, `callback_delivery_status='processing'` ist kein Duplikat-Kriterium mehr. Duplikat ist nur, was der Apply-RPC selbst terminalisiert hat.

Idempotenz-Kontrakt des Apply-RPC: Ist der Job bereits `succeeded` **und** trägt die Szene das Ergebnis dieses Write-IDs, ist die Antwort `{applied:false, reason:'duplicate_callback'}` — ein sauberes No-op, kein Fehler.

## D2 — `composer_pipeline_jobs` ist die alleinige Quelle der Run-Provenienz

**Entscheidung: angenommen, Empfehlung des G3-Berichts wird umgedreht.**

Bindungsrichtung ist ab G3 ausschließlich:

```text
job_id (Callback)  →  composer_pipeline_jobs  →  scene_id + run_id + stage + segment_id + attempt_no
```

Regeln:

- `scene_id`, `run_id`, `stage`, `attempt_no` sind nach dem Insert **immutable** (DB-Trigger, analog zu `update_dialog_pass_slot`).
- `plate_generation` wird beim Job-Insert aus dem Szenen-Snapshot eingefroren (neue Spalte `plate_generation` in `composer_pipeline_jobs`, Teil von G3.1) und danach nie überschrieben.
- Callback-Payload, `dialog_shots.run_id` und `syncso_dispatch_log` dürfen die Werte nur **bestätigen**. Weicht ein bestätigender Wert ab → `wrong_job`, fail-closed.
- Kein Handler liest `active_run_id` aus der Szene, um daraus die Callback-Identität abzuleiten. Der Vergleich läuft immer andersherum: Job liefert den erwarteten Run, die gelockte Szene muss ihn tragen.

`dialog_shots.run_id` wird trotzdem beim Dispatch geschrieben — aber ausdrücklich nur als Diagnose-/Anzeigefeld, nicht als Entscheidungsgrundlage.

## D3 — Kanonischer State: `lipsync_muxing`. `audio_muxing` ist reiner Legacy-Spiegel

**Entscheidung: `lipsync_muxing` ist der einzige kanonische `pipeline_state`.**

| Ebene | Wert im Mux-Zustand |
| --- | --- |
| `pipeline_state` | `lipsync_muxing` |
| `pipeline_substate` | `audio_mux` |
| `lip_sync_status` (Legacy) | `audio_muxing` |
| `twoshot_stage` (Legacy) | `audio_muxing` |
| `dialog_shots.status` (Legacy) | `audio_muxing` |

Der Ist-Befund im G3-Bericht beschrieb Legacy-Feldwerte, nicht Zielzustände — das war der Widerspruch. Keine neue Alias-Semantik: die Legacy-Werte werden vom Primitive geschrieben, nicht vom Handler, und existieren nur bis G6.

## D4 — `composer_finalize_lipsync_scene`: geschlossene Write-ID-Matrix, Base-URL nicht als Input

**Entscheidung: angenommen.** Der Finalizer bekommt eine geschlossene Matrix und verliert `_source_clip_url`.

| write_id | erlaubter From-State | Bedeutung |
| --- | --- | --- |
| `sso:applied` | ausschließlich `lipsync_running` | Single-Pass, non-tight: Sync.so-Output ist direkt final |
| `stitch:done` | ausschließlich `lipsync_muxing` | Mux/Stitch-Ergebnis von Remotion |

Ein `stitch:done` aus `lipsync_running` und ein `sso:applied` aus `lipsync_muxing` sind beide `unexpected_state` und werden abgewiesen (mit Audit-Zeile).

Base-Quelle: Der Finalizer setzt `base_video_url` **nicht** aus Callback-Input. Unter dem Lock gilt

```text
base_video_url := COALESCE(base_video_url, lip_sync_source_clip_url)
```

also ausschließlich aus dem bereits gebundenen Szenen-Snapshot. Einziger Callback-Input für Output ist `_processed_video_url`; daraus folgen `processed_video_url` und `clip_url`.

## D5 — Kein Whole-JSON-Overwrite von `dialog_shots`

**Entscheidung: angenommen.** Der Parameter `_dialog_shots jsonb` entfällt ersatzlos.

- Slot-Ebene (`passes[i]`) bleibt exklusiv bei `update_dialog_pass_slot()` — das RPC hat bereits Lock, Rückwärts-Guard und Immutabilität.
- Der Finalizer patcht ausschließlich schmale Top-Level-Schlüssel per `jsonb_set` unter demselben Lock: `status`, `final_url`, `finished_at`. Nichts anderes.
- Fehlerpfade patchen entsprechend nur `status`, `error`, `finished_at`, `refunded`.
- Kein Handler übergibt je einen selbst gelesenen `dialog_shots`-Blob an ein G3-Primitive. Das wird im Guard-Test festgeschrieben.

## D6 — Mux-Transition hat genau einen Owner: `render-sync-segments-audio-mux`

**Entscheidung: angenommen, wie vorgeschlagen.**

```text
sync-so-webhook (Fan-in vollständig)
   └─ try_claim_mux_dispatch(scene)      -- gewinnt genau einer
        └─ POST render-sync-segments-audio-mux
             └─ video_renders INSERT  → render_id existiert
                  └─ composer_enter_lipsync_mux(job, render_id)   ← EINZIGER Owner
```

- `sync-so-webhook` schreibt im Multi-Pfad **keinen** Zustand mehr Richtung Mux. Es markiert den Pass fertig (Slot-RPC) und stößt den Dispatcher an.
- `composer_enter_lipsync_mux` läuft erst, wenn eine `render_id` real existiert. Damit kann es keinen `lipsync_muxing`-Zustand ohne Render geben.
- Identisch für Single-tight und Multi — der Single-tight-Pfad geht denselben Weg über den Dispatcher.
- `try_claim_mux_dispatch` bleibt unverändert (nur Dispatch-Sperre, kein State-Writer). Es wird in G3.2 zusätzlich run-gebunden, indem der Aufrufer vorher den Job prüft.

## D7 — Keine Erweiterung von `composer_fail_scene_with_mirrors`. Neue Callback-Failure-Facade

**Entscheidung: angenommen — das frozen Primitive bleibt unangetastet.**

Neu entsteht `composer_fail_callback_scene(...)` mit fest verdrahteter Matrix; From-States sind **nicht** übergebbar:

| write_id | erlaubte From-States | Legacy-Spiegel-Policy |
| --- | --- | --- |
| `sso:failed` | `lipsync_dispatched`, `lipsync_running` | `lip_sync_status='failed'`, `twoshot_stage='failed'`, `clip_status` unverändert |
| `sso:partial_mux_refused` | `lipsync_running` | wie oben, zusätzlich `dialog_shots.partial_*` |
| `stitch:failed` | `lipsync_muxing` | `lip_sync_status='failed'`, `twoshot_stage='failed'` |
| `mux:preflight_failed` | `lipsync_running`, `lipsync_muxing` | `twoshot_stage='failed'` |
| `mux:invoke_failed` | `lipsync_muxing` | `twoshot_stage='audio_mux_failed'` |
| `ccw:failed` | `plate_queued`, `plate_rendering` | `clip_status='failed'`; `lip_sync_*`-Reset nur bei `engine_override='cinematic-sync'` |

Damit kann ein verspätetes `stitch:failed` eine bereits auf `complete` gelaufene Szene nicht mehr zurückwerfen — `complete` ist in keiner Zeile ein erlaubter From-State. Ergänzend gilt Job-Terminalität aus D1: ein zweiter Callback zu einem terminalen Job kommt gar nicht erst bis zur Matrix.

Kein Freitext-`_clear_lip_sync_fields`-Flag: Was gelöscht wird, hängt allein an der write_id-Zeile.

## D8 — `compose-clip-webhook`: eigenes `composer_finalize_plate_scene`

**Entscheidung: eigenes Primitive. `composer_finalize_upload_scene` wird nicht semantisch verbreitert.**

```text
composer_finalize_plate_scene(
  _pipeline_job_id uuid,
  _external_job_id text,      -- Replicate prediction id
  _write_id text,             -- 'ccw:plate-complete'
  _plate_url text
)
```

- From-State: ausschließlich `plate_rendering`. (`plate_queued → plate_rendering` bleibt Sache des Dispatchers; ein Callback in `plate_queued` ist `unexpected_state`.)
- To-State: `plate_ready`.
- Legacy-Spiegel im selben UPDATE: `base_video_url = _plate_url`, `clip_url = _plate_url`, `clip_status='ready'`, `clip_error=NULL`, `processed_video_url` bleibt unangetastet.
- **Auto-Lip-Sync-Handoff startet erst nach dem Commit des Apply-RPC** und nur, wenn dieser `applied:true` zurückgibt. Der Handoff selbst (`compose-twoshot-audio` → `compose-dialog-segments`) bleibt unverändert; sein heutiger Fehlerpfad (`lip_sync_status='failed'` bei `clip_status='ready'`) wandert auf `ccw:handoff_failed` und wird — weil er den Plate-Zustand bewusst nicht antastet — in G3.2 als eigene, sehr enge Zeile der Failure-Facade geführt.

## D9 — Auto-Retry: gleicher Scene-Run, neuer Job-Attempt

**Entscheidung: angenommen, klare Trennung.**

| Ebene | Bei transientem Auto-Retry |
| --- | --- |
| `composer_scenes.active_run_id` | **unverändert** |
| `composer_scenes.plate_generation` | **unverändert** |
| `composer_pipeline_jobs.attempt_no` | +1, neue Zeile (neuer `idempotency_key`) |
| `external_job_id` | neu (neue Replicate-Prediction) |
| Alter Job | wird `stale` terminalisiert, im selben RPC wie die Attempt-Anlage |

Nur ein bewusster User-/Orchestrator-Render („Neu rendern", Reset, Hybrid-Extend) wechselt Run-ID und/oder Generation. Der Risikotext des G3-Berichts („neue Run-Identität") war an dieser Stelle falsch und ist hiermit ersetzt.

Gilt gleichermaßen für die Sync.so-Retry-Matrix (`prepareRetryFromWebhook`, `V5_RETRY_VARIANTS`) und die Watchdog-Auto-Retries: neue Attempts, nie neue Runs.

## D10 — In-flight-Kompatibilität und Cutover

**Entscheidung: angenommen, G3 wird geteilt.**

- **G3.1 — Provenienz/Ledger (schreibt Daten, migriert keinen Writer).** Alle Dispatcher legen `composer_pipeline_jobs`-Zeilen mit eingefrorener `plate_generation` an und transportieren `pipeline_job_id` bis in den Callback (Sync.so-URL-Parameter, Remotion-`customData`, Replicate-Webhook-URL). Callback-Handler **lesen** die Ledger-Bindung, loggen Abweichungen — und schreiben weiter genau wie heute. Reiner Observe-Modus.
- **Drain-Fenster.** Zwischen G3.1 und G3.2 liegt ein Fenster von mindestens der längsten realistischen Job-Laufzeit (Lambda-Timeout 300 s + Sync.so-Retry-Matrix; angesetzt: 60 Minuten ohne Ledger-lose Callbacks in der Telemetrie). Erst wenn die Observe-Telemetrie über dieses Fenster **null** Callbacks ohne Ledger-Bindung meldet, ist G3.2 freigabefähig. Diese Zahl ist Abnahmekriterium, keine Schätzung.
- **G3.2 — Callback-Apply-Migration.** Handler rufen die Apply-RPCs; fehlende Ledger-Bindung ist fail-closed.
- **Befristete Kompatibilität.** `syncso_dispatch_log` / `dialog_shots.run_id` dürfen in G3.2 nur als *bestätigende* Fallback-Quelle für Jobs dienen, die nachweislich vor dem G3.1-Deployment gestartet sind (`created_at < deployment_ts`). Diese Klausel bekommt ein hartes Ablaufdatum im Code und wird in G3.3 entfernt. Sie ist ausdrücklich keine zweite Source of Truth.

## Sicherheitsvertrag aller neuen G3-Primitive

Identisch zu G2.4, ohne Ausnahme:

- `SECURITY DEFINER`, `SET search_path TO 'pg_catalog', 'public'`, alle Objekte schema-qualifiziert.
- `REVOKE ALL ... FROM PUBLIC, anon, authenticated`; `GRANT EXECUTE ... TO service_role`.
- Geschlossene Write-ID-Allowlist, keine übergebbaren From-States.
- Jeder Versuch — `applied=true` wie `applied=false` — erzeugt eine Zeile in `composer_scene_transition_log` mit `source_signature='v2'`.

---

## Schnitt

```text
G3.1  Provenienz / Ledger (Observe)
      • composer_pipeline_jobs.plate_generation + Immutabilitäts-Trigger
      • Job-Anlage in allen vier Dispatch-Pfaden
      • pipeline_job_id-Transport: Sync.so-URL, Remotion customData,
        Replicate-Webhook-URL, Mux-Request-Body
      • Handler lesen + loggen, schreiben unverändert
      Abbruchkriterium: 0 Callbacks ohne Ledger-Bindung über das Drain-Fenster

G3.2  Callback-Apply-Migration
      • composer_apply_callback_* (D1-Muster)
      • composer_finalize_lipsync_scene (D4)
      • composer_enter_lipsync_mux (D6)
      • composer_finalize_plate_scene (D8)
      • composer_fail_callback_scene (D7)
      • Handler-Umstellung, fail-closed
      Abbruchkriterium: out-of-order / duplicate / wrong-job Callback
      verändert nachweislich nichts

G3.3  Entfernung der befristeten In-flight-Kompatibilität
```

## Erwartete Testmatrix für G3.2 (zur Vorabstimmung)

| Fall | Erwartung |
| --- | --- |
| Callback Run A, Szene auf Run B | kein Write, Audit-Zeile `stale_run` |
| Zweiter `COMPLETED` für terminalen Job | `duplicate_callback`, kein Write |
| Apply-RPC bricht nach Scene-Write ab | Rollback: Job bleibt non-terminal, Retry wirkt |
| `stitch:done` aus `lipsync_running` | `unexpected_state` |
| `stitch:failed` auf `complete` | `unexpected_state` |
| Zwei parallele Fan-in-Webhooks | genau ein `try_claim_mux_dispatch`-Gewinner, genau ein `lipsync_muxing` |
| Finalizer mit übergebenem `dialog_shots`-Blob | existiert nicht mehr (Guard-Test) |
| Auto-Retry | `attempt_no+1`, `active_run_id`/`plate_generation` unverändert |

## STOP

Keine Migration, keine Codeänderung. Nächster Schritt nach Freigabe dieses Entscheidungsstands: G3.1-Implementierungsvertrag (Ledger + Transport, Observe-Modus).
