# v431 G3.2.2-F1 — Mux/Stitch Terminalization Follow-up (Analyse + Contract Lock)

Nur Analyse und Vertragsfestschreibung. Keine Reparatur, keine Migration, kein Deploy, kein UI-Run, keine neue Testszene.

Front-Half bleibt frozen: serialized acquire → sync_segment → bound callback → `composer_apply_sync_segment_result` → dispatch_mux → genau ein `audio_mux` → reale `render_id`. RS3 bleibt DONE/FROZEN.

## Vorbefund aus der Code-Sichtung (wird im Deliverable belegt, nicht angenommen)

- `render-sync-segments-audio-mux/index.ts` schreibt vor dem Lambda-Invoke `dialog_shots` mit
  `audio_mux: { render_id, dispatched_at }` als **Ganzobjekt** — der vom Apply-RPC gesetzte
  `mux_dispatch_requested_at` fällt damit weg (Punkt 1).
- Der Stitch-Erfolg landet im `dialog-stitch`-Zweig von `remotion-webhook/index.ts`. Dieser Zweig
  schreibt ausschließlich Legacy-/Compatibility-Felder (`lip_sync_status='done'`, `twoshot_stage='done'`,
  `clip_status='ready'`, `materializeCompatibilityOutput`) direkt auf `composer_scenes` und fasst den
  Ledger nicht an (Punkte 2 und 3).
- Ein RPC `composer_finalize_lipsync_scene` existiert im Repository derzeit nicht — er stammt bisher
  nur aus dem G3.2-Vertragsdokument. Das ist im F1-Report als Faktum festzuhalten.

## F1.1 — Verlust von `mux_dispatch_requested_at` rekonstruieren

Kette tracen: Apply-RPC-Definition (Setzen des Claims) → tatsächlicher DB-Zustand der Resmoke-Szene →
Writer in `render-sync-segments-audio-mux`. Die konkrete Zeile des Whole-Object-Replace benennen und
zeigen, dass kein weiterer Writer den Claim wiederherstellt.

Zielvertrag festschreiben: `audio_mux` wird nur noch narrow gepatcht; `mux_dispatch_requested_at`
bleibt erhalten, `dispatched_at` und `render_id` kommen additiv dazu; kein Whole-Object-Replace.

## F1.2 — `audio_mux`-Ledger-Lifecycle rekonstruieren

Für Job `ad4da886…` read-only die Stationen belegen: acquire, dispatch, Provider-/Render-Binding,
Remotion-Callback, Stitch-Callback, Scene-Complete — je mit Timestamp und Quelle. Danach bestimmen,
welcher Owner den Attempt hätte terminalisieren müssen und warum das nicht geschah (fehlender
Terminalisierungs-Aufruf im Stitch-Zweig vs. fehlende Provenienz vs. fehlendes Primitive).

Zielinvariante: erfolgreicher Mux/Stitch ⇒ kein dauerhaft `dispatched` gebliebener `audio_mux`-Attempt.
Bestehender Job wird nicht aufgeräumt.

## F1.3 — Tatsächlichen Complete-Writer identifizieren

Für den Übergang der Szene nach `pipeline_state=complete` exakt bestimmen: Call-Site (Datei + Zeile),
Edge-Function, Caller, Timestamp, Eintrag in `composer_scene_transition_log` inkl.
`source_signature`/`caller_class`. Geprüft werden `remotion-webhook` (Dialog-Stitch-Zweig),
`render-sync-segments-audio-mux`, der Legacy-Bridge-/Wrapper-Pfad (`legacy_wrapper_7`) und alle weiteren
Completion-Writer. Ergebnis muss eine konkrete Call-Site sein, keine Vermutung. Zusätzlich belegen,
warum kein Aufruf von `composer_finalize_lipsync_scene(stitch:done)` stattfand.

## F1.4 — Sole Finalization Owner Contract

Zielkette festschreiben:

```text
Remotion/Stitch success
  → provenance/job guard (pipeline_job_id, run_id, plate_generation)
  → audio_mux Ledger terminal success
  → composer_finalize_lipsync_scene(stitch:done)
  → canonical complete
  → compatibility mirrors/output
```

Entscheiden und begründen, ob Ledger-Terminalisierung und Scene-Finalisierung in **einem** DB-Primitive
unter Job→Scene-Lock erfolgen (Präferenz) oder als zwei atomar geschützte Schritte mit explizitem
Recovery-Vertrag. Der Zwischenzustand „scene complete + audio_mux dispatched" muss ausgeschlossen sein.
Recovery-/Reaper-Verhalten und Duplicate-Callback-Verhalten (Idempotenz) mitspezifizieren.

## F1.5 — Legacy Completion Path

Belegen, ob `legacy_wrapper_7` nur Compatibility-Mirror sein soll, ob der aktuelle Stitch-Pfad ihn
direkt benutzt, und welche minimale Writer-Migration nötig wäre, damit der neue Finalizer Sole Owner
wird. G0-Compatibility-Wrapper werden nicht global entfernt oder verändert — nur der konkrete
G3.2.2-Stitch-Writer wird als Migrationsziel benannt.

## F1.6 — Scope-Schutz

Unangetastet: normale Success-Semantik von `composer_apply_sync_segment_result`, RS3 Serialized
Acquire/Reset, G3.1 Ledger acquire/replace, Sync-Provider-Dispatch, Partial-Mux-Semantik, B11-Migration.

## Deliverable

Neu: `docs/v431-g3-2-2-f1-contract.md` mit
Root Cause zu allen drei Abweichungen, aktueller Writer-/Callback-Kette, gewünschter Owner-Kette,
atomarem Ledger-/Scene-Terminalvertrag, minimaler Writer-Migration und Testmatrix
(Erfolg, Duplicate-Stitch-Callback, Stitch-Failure, Cancel/RS3-Reset während Mux, Recovery nach Crash
zwischen Ledger- und Scene-Schritt, stale run/generation).

Ergänzung: `docs/v431-g3-2-2-report.md` erhält ausschließlich einen F1-Verweis.

Danach STOP für Review. Kein Fix in diesem Schritt.

## Technische Hinweise

- Alle DB-Zugriffe read-only (`read_query`), Edge-Function-Logs nur lesend.
- Keine Änderung an Code, Migrationen oder Deployments; die einzigen Schreibvorgänge sind die beiden
  Markdown-Dateien.
