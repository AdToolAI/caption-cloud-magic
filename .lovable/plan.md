# v431 — SceneCard:canceled: Verhaltensmatrix + Entscheidungsvorschlag

Reine Lesearbeit. Kein Code geändert. `compose-video-clips` (G1) bleibt wie abgenommen.

## 1. Die drei Pfade in Kurzform

| Pfad | Zweck laut Code | Guard |
| --- | --- | --- |
| SceneCard „Lipsync komplett zurücksetzen“ | Lip-Sync **abschalten**, Basis-Video behalten | keiner (Client schreibt immer) |
| `cancel-dialog-lipsync` (`reset:true`) | laufenden Lip-Sync **abbrechen + deaktivieren** | `lip_sync_applied_at` → Abbruch |
| `reset-lipsync-scene` | **sauberer Neustart** desselben Lip-Syncs | `lip_sync_applied_at` → Abbruch, `force:true` hebt ihn auf |

## 2. Verhaltensmatrix

Legende: „—“ = wird nicht angefasst.

### A) Lip-Sync läuft / noch nicht angewandt (`lip_sync_applied_at = NULL`)

| Feld | SceneCard (heute) | `cancel-dialog-lipsync` reset:true | `reset-lipsync-scene` |
| --- | --- | --- | --- |
| `pipeline_state` | `canceled` (Reverse-Bridge aus `lip_sync_status='canceled'`) | `canceled` (identisch) | aus Legacy abgeleitet: `plate_ready`, wenn `clip_url` vorhanden, sonst `idle` |
| `processed_video_url` | — | — | `NULL` (über `materializeCompatibilityOutput('base')`) |
| `clip_url` | — | — | = Basis-Plate (`clip_url` bleibt, `processed` fällt weg) |
| `base_video_url` | — | — | = Plate (`clip_url` der Szene) |
| `lip_sync_applied_at` | `NULL` | `NULL` | `NULL` |
| `dialog_shots` | `NULL` | `NULL` (reset:true) | `NULL` |
| Jobs (Sync.so) | **nicht abgebrochen** (nur der parallele Invoke tut das) | DELETE `/v2/generations/{id}` für alle bekannten Jobs + `syncso_inflight_jobs`-Cleanup | dito, über `failLipSync()` |
| Locks | — | `try_acquire_dialog_lock` / `release_dialog_lock` (30 s TTL) | keiner |
| `active_run_id` | — | — | — |
| `plate_generation` | — | — | — |
| `clip_error` | `lipsync_canceled_by_user` | `lipsync_canceled_by_user` | `NULL` (+ vorher `failLipSync` setzt kurz den Fehlergrund) |
| Legacy-Spiegel | `lip_sync_status=canceled`, `twoshot_stage=NULL`, `dialog_mode=false`, `engine_override=auto`, `lip_sync_with_voiceover=false`, `replicate_prediction_id=NULL` | **feldgleich** | `lip_sync_status=pending`, `twoshot_stage=NULL`, `clip_status=ready`, `replicate_prediction_id=NULL`, `audio_plan.twoshot` bereinigt (faceMap, anchor_face_audit, sync_job_id, segments) — `dialog_mode`/`engine_override` bleiben **an** |
| Credits / Reservations | keine | **keine** (kein Refund, keine Reservation-Abrechnung) | Refund über `failLipSync()` (`dialog_shots.cost_credits` → `wallets`, einmalig via `dialog_shots.refunded`); `composer_run_reservations` unberührt |

Folge bei `reset-lipsync-scene`: `lip_sync_status='pending'` ist genau der Zustand, den
`useTwoShotAutoTrigger` als frischen Kandidaten aufgreift → der Lip-Sync **startet neu**.

### B) Lip-Sync bereits angewandt (`lip_sync_applied_at != NULL`)

| Feld | SceneCard (heute) | `cancel-dialog-lipsync` reset:true | `reset-lipsync-scene` ohne `force` | `reset-lipsync-scene` mit `force:true` |
| --- | --- | --- | --- | --- |
| Ausgang | schreibt trotzdem | `{ ok:true, skipped:"already_applied" }`, **kein** Write | `{ ok:true, status:"already_applied" }`, **kein** Write | führt Reset aus |
| `pipeline_state` | `canceled` | — | — | `plate_ready` (Plate wieder sichtbar) |
| `processed_video_url` | **bleibt** (lip-gesynctes Ergebnis) | — | — | `NULL` |
| `clip_url` | **bleibt = processed** | — | — | = wiederhergestellte Plate |
| `base_video_url` | bleibt | — | — | = `lip_sync_source_clip_url` (Original-Plate) |
| `lip_sync_applied_at` | `NULL` | — | — | `NULL` |
| `dialog_shots` | `NULL` | — | — | `NULL` |
| Jobs | keine offen | — | — | `failLipSync()` bricht **früh** ab (`already_applied`) → **kein** Job-Cleanup, **kein** Refund |
| Locks | — | — | — | keiner |
| `active_run_id` / `plate_generation` | — | — | — | — |
| `clip_error` | `lipsync_canceled_by_user` | — | — | `NULL` |
| Legacy-Spiegel | wie oben (Lip-Sync **aus**) | — | — | `lip_sync_status=pending` (Lip-Sync **an**, Auto-Trigger greift) |
| Credits | keine | — | — | keine (Refund-Zweig übersprungen) |

**Wichtiger Widerspruch im heutigen SceneCard-Pfad (Fall B):** Der Client setzt
`lip_sync_applied_at=NULL` und `lip_sync_status=canceled`, lässt aber
`processed_video_url` / `clip_url` auf dem lip-gesyncten Ergebnis stehen. Die Szene zeigt
danach weiterhin das lip-gesyncte Video, behauptet aber „kein Lip-Sync“. Das ist kein
Vollreset, sondern ein inkonsistenter Mischzustand.

### C) Direkte Antwort auf die fünf offenen Punkte

1. **`lip_sync_applied_at != NULL`** — siehe Tabelle B: `cancel-dialog-lipsync(reset:true)` schreibt heute **gar nichts** und meldet `skipped:"already_applied"`. Der Button wäre also für angewandte Szenen wirkungslos, wenn man ohne weitere Änderung umroutet.
2. **Credits / Reservations** — SceneCard: nie. `cancel-dialog-lipsync`: nie (auch im nicht-angewandten Fall kein Refund). `reset-lipsync-scene`: Refund nur im nicht-angewandten Fall über `failLipSync()` (`dialog_shots.cost_credits` → `wallets`, idempotent über `dialog_shots.refunded`); mit `force:true` auf angewandter Szene wird der Refund-Zweig übersprungen. `composer_run_reservations` wird von **keinem** der drei Pfade angefasst — offene Reservierungen bleiben bis zum regulären Settle/Ablauf stehen.
3. **Ursprung von `already_applied`** — siehe Abschnitt 3: Schutz von fertigem Ergebnis **und** Refund, keine Pipeline-Invariante.
4. **Output-Rückstellung bei `reset:true`** — **Nein.** `cancel-dialog-lipsync` kennt `materializeCompatibilityOutput` nicht und fasst `base_video_url` / `processed_video_url` / `clip_url` in keinem Zweig an. Selbst wenn man `already_applied` überspringt, bliebe das lip-gesynctes Ergebnis in `clip_url` stehen. Die Output-Rückstellung muss also **explizit ergänzt** werden (Punkt 5.1) — sie fällt nicht durch das Überspringen des Guards von allein an.
5. **Alte Jobs / Callbacks nach dem Reset** — `reset:true` nullt `dialog_shots`; der Sync.so-Webhook findet seine Szene über die Job-IDs in `dialog_shots.passes[]` und läuft danach in `no_scene_match`, kann also kein Ergebnis zurückschreiben. Das ist aber eine *Nebenwirkung*, keine Run-Absicherung: `active_run_id` und `plate_generation` bleiben unverändert, der v427-Callback-Guard sieht denselben Lauf weiter als gültig. Für echte Run-Sicherheit muss der Reset-Zweig `plate_generation` erhöhen (Punkt 5.1). Job-Cancel und Lock laufen im nicht-angewandten Fall sauber; im angewandten Fall sind ohnehin keine Jobs offen.

**Fazit zur Leitfrage:** `reset:true` räumt nach Überspringen von `already_applied` **noch nicht** vollständig und run-sicher auf — Statusfelder und Locks ja, finaler Output und Generations-Fencing nein. Die Freigabe des Guard-Übersprungs sollte deshalb an die beiden Ergänzungen in 5.1 gekoppelt werden.

## 3. Warum es `already_applied` gibt

Der Guard steht an drei Stellen mit derselben Begründung im Code:
`failLipSync()` — *„Already complete — never overwrite a successful scene“*;
`reset-lipsync-scene` — dort ausdrücklich mit `force`-Ausnahme; `cancel-dialog-lipsync` — ohne
Ausnahme. Er schützt **das fertige Ergebnis und den Refund** (ein Cancel nach Erfolg dürfte
sonst Credits zurückgeben und ein bezahltes Ergebnis verwerfen). Er schützt **keinen**
tieferen Ledger-/Pipeline-Vertrag: weder `composer_run_reservations` noch
`active_run_id`/`plate_generation` noch der v427-Callback-Guard hängen daran; keiner der drei
Pfade fasst diese Felder an. Dass `reset-lipsync-scene` den Guard per `force` bereits legal
umgeht (und SceneCard das über `cleanRestartLipSync({force:true})` heute schon nutzt),
bestätigt: Es ist eine Datenschutz-Regel für das Ergebnis, kein Invariantenschutz.

## 4. Antwort auf die Leitfrage

**Nein — `reset-lipsync-scene` deckt „Lipsync komplett zurücksetzen“ nicht ab.** Es ist der
*Neustart*-Vertrag: Ergebnis verwerfen, Plate wiederherstellen, `lip_sync_status='pending'` →
der Auto-Trigger startet denselben Lip-Sync sofort erneut. Der Button will das Gegenteil:
Lip-Sync **aus** (`dialog_mode=false`, `engine_override='auto'`,
`lip_sync_with_voiceover=false`), Plate behalten, nichts startet nach.

`cancel-dialog-lipsync(reset:true)` ist der einzige Pfad mit genau dieser
Deaktivierungs-Semantik — ihm fehlt nur die Ergebnis-Bereinigung für Fall B.

## 5. Vorschlag (zur Freigabe, noch nicht umgesetzt)

Weder den Guard blind überspringen noch SceneCard auf den Neustart-Vertrag umbiegen, sondern
den Deaktivierungs-Pfad vollständig machen:

1. `cancel-dialog-lipsync` erhält bei `reset === true` einen **expliziten Vollreset-Zweig**
   statt des `already_applied`-Shortcuts. In diesem Zweig zusätzlich zum heutigen Patch:
   - Ergebnis auf die Plate zurücksetzen über `materializeCompatibilityOutput('base', { baseUrl: lip_sync_source_clip_url ?? clip_url })` — damit kann kein lip-gesynctes Video als „ohne Lip-Sync“ weiterleben;
   - `audio_plan.twoshot`-Cache bereinigen (faceMap, anchor_face_audit, sync_job_id, segments) wie im Reset-Pfad;
   - **kein** Refund bei bereits angewandtem Lip-Sync (Guard-Zweck bleibt gewahrt);
   - `plate_generation` erhöhen, damit ein verspäteter Sync.so-Callback aus dem alten Lauf am v427-Callback-Guard scheitert und das Ergebnis nicht wiederherstellen kann.
2. `SceneCard` verliert seinen direkten State-Write und ruft nur noch diese Funktion; Fehler
   werden nicht mehr verschluckt, sondern als Toast gemeldet.
3. Ohne Freigabe von Punkt 1 bleibt SceneCard unverändert — dann lieber ein bewusst
   inkonsistenter Altzustand als ein stiller Funktionsverlust.

Der State-Write von `cancel-dialog-lipsync` bleibt in beiden Varianten **Legacy** (kein
`run_bound` möglich, keine neue Runless-Regel) — die Migration dieses Writers bleibt spätere
Gate-Arbeit.

## 6. Status

- G1 `compose-video-clips`: PASS (unverändert).
- G1 `SceneCard:canceled`: offen — wartet auf Entscheidung zu Punkt 5.1.
- `cancel-dialog-lipsync` als State-Writer: weiterhin nicht migriert.
- `already_applied`-Guard: unverändert bis zur Freigabe.
