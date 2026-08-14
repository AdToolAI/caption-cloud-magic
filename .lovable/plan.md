# v431 / G1 — SceneCard „Lip-Sync komplett zurücksetzen" → `cancel-dialog-lipsync(reset:true)`

Richtung wie freigegeben. Zuerst die drei Implementierungsdetails belegt, danach der Umsetzungsvertrag.
Noch kein Code geändert.

## A. Die drei Vorab-Bestätigungen

### A1 — Welches Feld ist zuverlässig die Base-Plate?

Messung über alle Szenen mit `lip_sync_applied_at IS NOT NULL` (236 Zeilen):

| Kennzahl | Wert |
| --- | --- |
| mit `base_video_url` | 235 |
| mit `lip_sync_source_clip_url` | 235 |
| beide gesetzt **und verschieden** | 0 |
| keines von beiden gesetzt | 1 |
| `base_video_url = processed_video_url` (Mischzustand) | 0 |

Ergebnis: `base_video_url` ist die kanonische Base-Plate und deckt den Bestand
vollständig ab; `lip_sync_source_clip_url` ist dort, wo es existiert, **identisch** und
damit ein unschädlicher Legacy-Fallback. Die eine Ausnahmezeile
(`4e771db5-cc40-40ec-b889-58057a3c9855`) hat **überhaupt kein** Video —
`clip_url` und `processed_video_url` sind ebenfalls leer, es gibt also nichts zu
retten und keinen Mischzustand zu erzeugen.

Restore-Regel (ersetzt den kritisierten Fallback):

```text
1. base_video_url gesetzt                    -> Base = base_video_url
2. sonst lip_sync_source_clip_url gesetzt    -> Base = lip_sync_source_clip_url   (Legacy)
3. sonst processed_video_url leer/nicht ges. -> materialize('clear')  (Szene hat gar kein Video)
4. sonst                                     -> FAIL CLOSED, kein Write, Fehler an SceneCard
```

`clip_url` wird **nie** als Base-Quelle gelesen. Fall 4 tritt im heutigen Bestand
0-mal auf und ist reiner Schutz gegen künftige Legacy-Zeilen.

### A2 — Wie wird Generation-Bump + Vollreset race-frei?

Heute gibt es keinen atomaren Reset-Primitiv: `cancel-dialog-lipsync` schreibt über
mehrere PostgREST-Updates, und der Base-Wert müsste zwischen Lesen und Schreiben
gehalten werden — genau das JS-Muster, das ausgeschlossen werden soll.

Vorgeschlagen wird deshalb ein neues SQL-Primitiv
`composer_reset_lipsync_full(_scene_id uuid)` (SECURITY DEFINER, `REVOKE FROM anon`,
nur `service_role`), das in **einer** Transaktion:

```text
SELECT ... FROM composer_scenes WHERE id = _scene_id FOR UPDATE   -- Row-Lock
  -> Base-Plate nach Regel A1 auflösen (nur aus der gelockten Zeile)
  -> Fall 4: RAISE / return { ok:false, reason:'no_base_plate' }, kein Write
  -> EIN UPDATE:
       plate_generation      = plate_generation + 1     -- Fence zuerst, im selben Write
       base_video_url        = <aufgelöste Base>
       processed_video_url   = NULL
       clip_url              = <aufgelöste Base>        -- v430-Tripel bleibt konsistent
       lip_sync_applied_at   = NULL
       lip_sync_status       = 'canceled'
       twoshot_stage         = NULL
       dialog_mode           = false
       engine_override       = 'auto'
       lip_sync_with_voiceover = false
       replicate_prediction_id = NULL
       dialog_shots          = NULL
       audio_plan            = audio_plan - 'twoshot'   -- bzw. twoshot-Cache-Keys entfernt
       clip_error            = 'lipsync_reset_by_user'
  -> gibt die vorher bekannten Job-IDs zurück
COMMIT
```

Damit gilt: Der Bump liegt im **selben** `UPDATE` wie die Bereinigung — es gibt kein
Fenster, in dem Dialogdaten schon weg, die Generation aber noch alt ist. Der Job-Cancel
gegen Sync.so läuft in der Edge-Function **nach** dem Commit auf den zurückgegebenen
IDs; ein Callback, der genau dazwischen eintrifft, ist bereits stale
(`plate-attempt` / v427-Callback-Guard prüfen `plate_generation`).

Der Bump gilt für **jeden** `reset:true`-Vollreset, unabhängig von `lip_sync_applied_at`.
`cancel-dialog-lipsync` bleibt trotz neuem Primitiv ein **Legacy-State-Writer**: die
Zustandsableitung passiert weiter über die Reverse-Bridge aus den Legacy-Spalten, es
wird kein `run_bound`/`runless`-Vertrag vorgetäuscht und keine neue Runless-Regel
eingeführt.

### A3 — Wird `active_run_id` in terminalen Szenen heute beibehalten?

Bestandsmessung: von 4246 Szenen hat **genau 1** ein `active_run_id`
(Zustand `failed`/`clip_status=ready`). Nach Zustand:

| pipeline_state | Zeilen | davon mit `active_run_id` |
| --- | --- | --- |
| canceled | 3544 | 0 |
| plate_ready | 271 | 0 |
| complete | 228 | 0 |
| failed | 201 | 1 |
| idle | 1 | 0 |

Weder `composer_scene_transition_core` noch die Bridge setzen `active_run_id` beim
Terminalwechsel auf `NULL` — der Stempel wird schlicht fast nie gesetzt
(`composer_start_scene_run` / `beginSceneRun` ist der einzige Setzer und wird in der
Lip-Sync-Kette seit dem v398-Rollback praktisch nicht genutzt). Konsumenten:
`decidePlateAttempt` behandelt `active_run_id != NULL` als „Single-Run-Vertrag aktiv"
und lässt unregistrierte Callbacks fail-closed abprallen; `qa-watchdog` sucht Zombies
über `clip_status='generating' AND active_run_id IS NULL`; `usePipelineProgress`
filtert nur auf Gleichheit mit einem erwarteten Run.

Ergebnis: **`active_run_id` bleibt unangetastet.** Kein Konsument liest ein
gesetztes `active_run_id` allein als „Run läuft noch" in einer Weise, die den Reset
stören würde, und das Callback-Fencing hängt ausschließlich an `plate_generation`.

## B. Umsetzungsvertrag (nach Freigabe)

1. **Neue DB-Funktion** `composer_reset_lipsync_full` wie in A2, inklusive
   Grants (`service_role` only) und Fail-Closed-Rückgabe `no_base_plate`.
2. **`cancel-dialog-lipsync`**: bei `reset === true` neuer Vollreset-Zweig, der den
   `already_applied`-Shortcut bewusst überspringt und das Primitiv aufruft.
   - **kein** Refund, wenn `lip_sync_applied_at` gesetzt war (Guard-Zweck bleibt erhalten);
   - Refund im nicht-angewandten Fall unverändert über den bestehenden Pfad;
   - Job-Cancel + `syncso_inflight_jobs`-Cleanup nach dem Commit;
   - Dialog-Lock wie heute;
   - Fehler (`no_base_plate`, Lockkonflikt) als 4xx/5xx mit Grund zurückgeben.
3. **`SceneCard`**: direkter State-Write entfällt, Aufruf nur noch über die
   Edge-Function; Fehler werden als Toast angezeigt statt verschluckt.
4. **`reset-lipsync-scene`** bleibt unverändert der Restart-Vertrag.

## C. Tests / Smokes vor STOP

- DB-Smoke gegen eine Kopie: Vollreset auf (a) laufender, (b) angewandter,
  (c) URL-loser Szene → Felder, `plate_generation+1`, Fail-Closed-Fall.
- Callback-Stale-Nachweis: Callback mit alter Generation nach Reset → abgewiesen.
- Vitest-Suite komplett (aktuell 368 Tests) plus neuer Unit-Test für die
  Base-Plate-Auflösung.
- Inventar-Diff `v431LegacyWriteInventory` aktualisieren
  (`SceneCard:canceled` entfällt, `cancel-dialog-lipsync` bleibt Legacy).
- Danach STOP-Bericht mit PASS/FAIL je Pfad.
