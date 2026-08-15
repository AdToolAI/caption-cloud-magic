# v431 RS2 — Reset-/Run-Lifecycle Contract (Analyse & Entscheidungsvorlage)

Status: **CONTRACT DRAFT — DECISION PENDING**
Vorgänger: `docs/v431-g3-2-2-report.md` §10 (RS1 Pre-Apply Stall Analysis)
Scope dieses Dokuments: **nur Analyse und Vertragsentwurf.** Keine Code-Änderung,
keine Migration, kein Deploy, kein Cleanup, kein Resmoke, kein G3.2.3.
Übergeordneter Status bleibt: **G3.2.2 DEPLOYED — RESMOKE IN PROGRESS / NOT YET ACCEPTED**.

Alle Aussagen unten sind aus dem Repo-Code bzw. den Migrationen belegt; die
Quellenangabe steht jeweils dabei. Unbelegte Punkte sind in §9 explizit als offen geführt.

---

## 1. Ist-Vertrag des Lip-Sync-Clean-Restarts

### 1.1 `reset-lipsync-scene` (Quelle: `supabase/functions/reset-lipsync-scene/index.ts`)

Aufrufkette: `src/hooks/useResetLipSync.ts` → Edge `reset-lipsync-scene`.
Zweiter Aufrufer: `src/lib/lipsyncReset.ts::resetSceneLipSync()` — nutzt die Funktion
nur dann, wenn `hasActiveSyncPasses(dialogShots)` true ist, sonst direkter
`dialog_shots: null`-Write.

Was die Funktion tut (in dieser Reihenfolge):

1. Auth über JWT, Ownership `composer_scenes → composer_projects.user_id`.
2. Guard: `lip_sync_applied_at` gesetzt und `force !== true` ⇒ `status: already_applied`, kein Write.
3. `failLipSync({ reason: "user_reset", refundCredits: dialog_shots.cost_credits, syncApiKey })`
   — Provider-Cancel bei Sync.so, Freigabe der Inflight-Slots, einmaliger Credit-Refund.
4. Ein `UPDATE composer_scenes` mit:
   `lip_sync_status='pending'`, `twoshot_stage=null`, `replicate_prediction_id=null`,
   `dialog_shots=null`, `clip_error=null`,
   `materializeCompatibilityOutput("base", { baseUrl: restoredSourceClip })`,
   `clip_status='ready'` (wenn Plate vorhanden), `lip_sync_source_clip_url=null`,
   `lip_sync_applied_at=null`, bereinigtes `audio_plan.twoshot`
   (entfernt: `faceMap`, `anchor_face_audit`, `sync_job_id`, `segments_payload`,
   `last_segments`, `audio_input_mode`), `updated_at`.

Was die Funktion **nicht** anfasst — und das ist der Kern des Befunds:

| Feld / Tabelle | Verhalten |
|---|---|
| `composer_scenes.active_run_id` | unverändert |
| `composer_scenes.active_run_started_at` | unverändert |
| `composer_scenes.plate_generation` | unverändert |
| `composer_pipeline_jobs` (Ledger) | **kein einziger Write** |
| `dialog_dispatch_locks` | nicht angefasst (nur TTL-Ablauf) |

### 1.2 Abgrenzung zu den anderen Reset-/Restart-Verträgen

| Pfad | Ledger-Wirkung | Run-Identität |
|---|---|---|
| `reset-lipsync-scene` | keine | **bleibt** (Defektquelle) |
| `cancel-dialog-lipsync` mit `reset:true` → RPC `composer_reset_lipsync_full` | keine Ledger-Writes; liefert nur Provider-Job-IDs zum Cancel zurück | `plate_generation +1`, `active_run_id` **bleibt** |
| `composer-start-scene-generation` → `beginSceneRun` (`_shared/scene-run-begin.ts`) | keine Ledger-Writes | **neue** `run_id`, `plate_generation +1`, Provider-Cancel, Dispatch-Locks gelöscht |
| `composer-hard-reset-scene` (`_shared/scene-hard-reset.ts`) | keine Ledger-Writes | Generation-Bump; kein Run-Start |

Belegt per `rg`: weder `scene-run-begin.ts` noch `scene-hard-reset.ts` referenzieren
`composer_pipeline_jobs`. Der Ledger wird ausschließlich von den v431-Primitiven
geschrieben (`_shared/v431-ledger.ts` + Apply-RPCs).

---

## 2. Blockade-Klasse — warum der Lauf hängt

### 2.1 Dedupe-Identität des Ledgers

Quelle: `composer_acquire_pipeline_attempt`
(`supabase/migrations/20260815005459_…sql`, aktuelle Fassung).

Ein Attempt gilt als aktiv-kollidierend, wenn eine Zeile existiert mit:

```text
scene_id = p_scene_id
AND run_id = p_run_id
AND stage  = p_stage
AND plate_generation = p_plate_generation
AND segment_id IS NOT DISTINCT FROM p_segment_id
AND replaced_by IS NULL
AND status IN ('pending','dispatching','dispatched','dispatch_uncertain')
```

Dann liefert die RPC `already_in_flight` mit der bestehenden `job_id`.
Der Identitätsschlüssel ist also **(scene, run, stage, generation, segment)** —
er enthält weder Zeit noch Reset-Marker. Solange `run_id` **und** `plate_generation`
konstant bleiben, kollidiert jeder neue Dispatch mit dem alten Attempt.

### 2.2 Guard-Kaskade im realen Stall (Scene `b34d1eae`)

1. `PASS_DEDUPE_SKIPPED (v193_pass_already_active)` — clientseitige/Preflight-Dedupe.
2. Die durchgelassene Invocation läuft den kompletten Preflight fehlerfrei
   (`v168_per_pass_lock` → `v400_anchor_divergence` → `plate-face-detect` →
   `v163_preclip_render` → `v163_BBOX_URL_PRIMARY`).
3. Stopp am Ledger: `ledger dispatch skipped reason=already_in_flight
   pipeline_job_id=d12b2704` / `g31_observe ledger_already_in_flight
   existing_status=dispatched`. Kein Provider-Dispatch, kein neuer Attempt.
4. Der Pass-Slot bleibt als `rendering_preflight` in `dialog_shots` stehen —
   ein reiner DB-Rest, kein laufender Prozess (Claim-TTL 10 min).

### 2.3 Dauerhaft blockierende Stage-Kombinationen

Blockierend ist jede Stage-Zeile in `('pending','dispatching','dispatched','dispatch_uncertain')`
mit `replaced_by IS NULL` und unveränderter Identität. Praktisch relevant:

| Stage | Blockiert | Selbstheilung heute |
|---|---|---|
| `sync_segment` | jeden neuen Sync-Dispatch dieses Runs/Generation | nur über Callback-Apply oder Watchdog/Poller-Bindung |
| `audio_mux` | jeden neuen Mux-Dispatch (`dispatchAudioMux` prüft `already_in_flight`/`predecessor_exists`) | nur über Mux-Callback |
| `base_video` | Plate-Redispatch | terminalisiert heute sauber (`succeeded`) |

Der Reaper (`composer_reap_orphaned_dispatches`) hilft hier **nicht**: er setzt nur
`pending`/`dispatching`-Zeilen **ohne** `external_job_id` auf `dispatch_uncertain` —
und `dispatch_uncertain` bleibt selbst ein aktiver, blockierender Status. Zeilen mit
`external_job_id` (genau unser Fall, 50b402be) fasst er nie an.

`composer_replace_pipeline_attempt` wäre der Ausweg, ist aber Retry-gebunden und
verlangt einen nicht-terminalen Vorgänger; er wird von keinem Reset-Pfad aufgerufen.

---

## 3. Betroffene Aufrufer — wer macht Szenen non-terminal, ohne Ledger-Identität zu erneuern?

| Aufrufer | Macht Szene non-terminal | Erneuert Run/Generation | Terminalisiert Ledger | Blockade-Klasse möglich |
|---|---|---|---|---|
| `reset-lipsync-scene` (UI: „Lip-Sync zurücksetzen") | ja (`lip_sync_status='pending'`) | **nein** | nein | **ja — belegt** |
| `resetSceneLipSync()` Fallback-Zweig (`dialog_shots=null` direkt) | ja | nein | nein | **ja** |
| `cancel-dialog-lipsync` `reset:true` → `composer_reset_lipsync_full` | Szene wird `canceled` (terminal), aber Generation-Bump macht sie neu startbar | Generation ja, `run_id` nein | nein | **nein** für gleiche Stage (Generation Teil des Schlüssels), aber Alt-Zeilen bleiben ewig `dispatched` (Ledger-Müll) |
| `composer-start-scene-generation` / `beginSceneRun` | ja | **ja** (neue `run_id` + Generation) | nein | nein |
| `composer-hard-reset-scene` | ja | Generation ja | nein | nein |
| Watchdog / `recover-stuck-composer-clip` / `modelark-poll` (G3.1f) | nein — binden nur bestehende Attempts | nein | terminalisieren über Apply-RPCs | nein |

Ergebnis: Genau **zwei** Pfade erzeugen die Blockade-Klasse, und beide gehören zum
Lip-Sync-Clean-Restart. Alle anderen Pfade bumpen mindestens die Generation und
verschieben damit die Ledger-Identität.

Nebenbefund (nicht Teil des Fixes, nur dokumentiert): Auch die generation-bumpenden
Pfade hinterlassen dauerhaft nicht-terminale Ledger-Zeilen. Das ist keine Blockade,
aber es verfälscht jede Ledger-Auswertung (`dispatched`-Zähler, Fan-in-Telemetrie).

---

## 4. Option A — Ledger-Terminalisierung im Reset

### 4.1 Idee

`reset-lipsync-scene` (und der `resetSceneLipSync`-Fallback) bekommen eine explizite
Ledger-Verantwortung für genau die Stages, die sie logisch verwerfen. Run-Identität
und Generation bleiben unverändert.

### 4.2 Neues atomares Primitive (Entwurf)

```sql
composer_cancel_open_lipsync_attempts(
  _scene_id uuid,
  _expected_run_id uuid,
  _expected_plate_generation integer,
  _reason text DEFAULT 'user_reset'
) RETURNS jsonb
```

Verhalten:

- Row-Lock auf `composer_scenes` (id), dann `FOR UPDATE` auf die Kandidatenzeilen.
- Guard: `_expected_run_id = scene.active_run_id` und
  `_expected_plate_generation = scene.plate_generation`, sonst `stale_reset` (kein Write).
- Kandidaten: `stage IN ('sync_segment','audio_mux')`, `run_id = _expected_run_id`,
  `plate_generation = _expected_plate_generation`, `replaced_by IS NULL`,
  `status IN ('pending','dispatching','dispatched','dispatch_uncertain','running','callback_processing')`.
- Write: `status='cancelled'` (der Check-Constraint-Wert ist `cancelled`, **nicht** `canceled`),
  `completed_at=now()`, `error_code=COALESCE(error_code,'user_reset')`.
- Return: `{ ok, canceled_job_ids[], external_job_ids[] }` — die External-IDs dienen dem
  Post-Commit-Provider-Cancel, der bereits in `failLipSync()` existiert.

Verträglichkeit mit den eingefrorenen Verträgen:

- **Identitäts-Trigger** (`composer_pipeline_job_identity_guard`): unberührt — es ändern
  sich nur `status`, `completed_at`, `error_code`; `scene_id`/`run_id`/`stage`/`attempt_no`/
  `segment_id`/`created_at`/`plate_generation` bleiben gleich.
- **`composer_replace_pipeline_attempt`**: unverändert. `cancelled` ist dort bereits als
  nicht-ersetzbar geführt (`status IN ('stale','succeeded','cancelled')`), d. h. ein
  gecancelter Attempt kann nicht mehr per Retry wiederbelebt werden. Das ist gewollt.
- **Reaper**: unberührt (greift nur auf `pending`/`dispatching` ohne External-ID).

### 4.3 Late-Callback gegen einen gecancelten Attempt

Der kritische Pfad. `composer_apply_sync_segment_result` ist Sole Owner und prüft
Provenienz gegen `run_id`, `plate_generation` und `external_job_id`. Ein Callback, der
nach dem Cancel eintrifft, darf **nicht** die zurückgesetzte Szene wiederbeleben.

Vertragliche Festlegung für Option A:

1. Apply muss einen zusätzlichen frühen Guard bekommen:
   Ledger-Status `cancelled` ⇒ Verdict `noop`, `segment_result='discarded_after_reset'`,
   kein Slot-Patch, kein Aggregat, kein Mux-Dispatch, kein Refund.
2. Dieser Guard ist eine **Erweiterung** des G3.2.2-Contracts (§8 Duplicate-Matrix) und
   muss dort als Zeile „late callback vs. cancelled attempt" ergänzt werden.
3. Refund-Idempotenz: `failLipSync()` hat den Refund im Reset bereits vergeben;
   `composer_mark_sync_refund_applied` verhindert eine zweite Gutschrift. Der Cancel-Guard
   in Apply muss trotzdem vor dem Refund-Zweig greifen, damit kein zweiter Claim-Versuch
   protokolliert wird.

### 4.4 Idempotenz

Zweimaliger Reset ⇒ zweiter Lauf findet keine offenen Kandidaten ⇒ `canceled_job_ids=[]`,
`ok:true`. Keine Statusrückschritte, weil terminal→terminal nicht geschrieben wird.

---

## 5. Option B — kanonische neue Run-Identität

### 5.1 Idee

Der Clean-Restart hört auf, ein Teil-Reset zu sein: Er delegiert an den kanonischen
Run-Start (`composer-start-scene-generation` ohne `use_existing_run` → `beginSceneRun`),
der eine neue `run_id` vergibt, `plate_generation` bumpt, In-flight-Provider-Jobs cancelt
und Dispatch-Locks löscht (Quelle: `_shared/scene-run-begin.ts`).

### 5.2 Wirkung

- Die Ledger-Identität verschiebt sich vollständig; `already_in_flight` ist strukturell
  unmöglich. Kein neues DB-Primitive nötig.
- Generation-Fencing greift automatisch: Late-Callbacks der alten Generation fallen in
  Apply bereits heute auf `stale_generation`. Kein Eingriff in den G3.2.2-Contract.
- Alte Ledger-Zeilen bleiben trotzdem für immer `dispatched` — Ledger-Hygiene wird
  **nicht** besser, nur folgenlos.

### 5.3 Kosten und Semantik — der Preis

- `plate_generation`-Bump entwertet `plate_ready_generation`. Ob die Plate danach neu
  gerendert wird, hängt am Plate-Reuse-Check; im Zweifel entsteht ein zusätzlicher
  Plate-Render (Provider-Kosten + Wartezeit) für eine Aktion, die der Nutzer als
  „nur Lip-Sync neu" versteht.
- Die UX-Semantik ändert sich: Der Button „Lip-Sync zurücksetzen" wird faktisch zu
  „Szene komplett neu starten". Das ist eine Produktentscheidung, keine reine Technik.
- `beginSceneRun` cancelt In-flight-Provider-Jobs szenenweit, nicht nur Lip-Sync-Stages.

---

## 6. Entscheidungsmatrix

| Kriterium | Option A (Ledger-Cancel im Reset) | Option B (neue Run-Identität) |
|---|---|---|
| Eingriffstiefe DB | neues Primitive + Guard-Erweiterung in Apply | keine |
| Eingriffstiefe Edge/UI | `reset-lipsync-scene` + `resetSceneLipSync`-Fallback | `useResetLipSync` ruft anderen Endpunkt; Button-Semantik ändert sich |
| Berührt G3.2.2-Contract | **ja** (§8 Duplicate-Matrix, neuer `cancelled`-Guard) | nein |
| Regressionsrisiko Lip-Sync-Kette (v425/v430/v431) | mittel — Apply-Pfad wird angefasst | niedrig technisch, mittel funktional (Plate/Kosten) |
| Kostenwirkung für den Nutzer | keine (Plate bleibt erhalten) | möglicher Plate-Neurender pro Reset |
| Wirkung auf Alt-Szenen mit Ledger-Historie | löst sie beim nächsten Reset auf | umgeht sie, Altlasten bleiben liegen |
| Ledger-Hygiene / Auswertbarkeit | verbessert (Stages werden terminal) | unverändert schlecht |
| Testaufwand | höher: Cancel-RPC, Late-Callback-Matrix, Refund-Doppelklick | niedriger: Run-Identitäts-Smoke |
| Rückbaubarkeit | gut (Primitive abschaltbar, Guard ist additiv) | gut (Endpunkt-Umschaltung) |
| Blockade-Klasse dauerhaft geschlossen | **ja**, an der Wurzel | ja, aber durch Umgehung |

Beide Optionen schließen den Produktivdefekt. A behebt die Ursache und verbessert die
Ledger-Wahrheit, kostet aber einen additiven Eingriff im frisch eingefrorenen
Apply-Pfad. B ist billiger und risikoärmer im Code, verschiebt aber Produktsemantik und
mögliche Renderkosten auf den Nutzer und lässt den Ledger unsauber.

Eine Kombination ist zulässig und explizit erlaubt: A als Fix, B unverändert als
kanonischer Weg für „komplett neu". Die Wahl bleibt diesem Dokument bewusst offen.

---

## 7. Invarianten, die in beiden Optionen unverletzt bleiben

1. `composer_replace_pipeline_attempt` bleibt im eingefrorenen G3.1b-Vertrag und wird
   **nicht** zur Erzeugung neuer `run_id` benutzt.
2. Neue Ledger-Zeilen entstehen ausschließlich über `composer_acquire_pipeline_attempt`
   bzw. den Replace-Pfad — kein Reset erzeugt Ledger-Identität.
3. `composer_apply_sync_segment_result` bleibt Sole Owner von Slot-Patch,
   Ledger-Terminalisierung des Sync-Segments, Pass-Aggregat und Scene-Verdict.
   Ein Reset darf keinen Pass-Slot-Inhalt „reparieren".
4. Provenienz bleibt Pflicht: kein Apply ohne `pipeline_job_id` (fail-closed,
   `g322_missing_binding`).
5. Der Immutabilitäts-Trigger auf `composer_pipeline_jobs` bleibt unverändert;
   kein Fix darf Identitätsspalten schreiben.
6. Credit-Refunds bleiben idempotent (ein Claim pro Szene/Anlass).
7. Lip-Sync-Intent-Gates (v430.1) und der Provider-Vertrag (v425) werden nicht berührt.

---

## 8. Verifikationsplan (nur beschrieben, nicht ausgeführt)

DB-Smokes:

- **RS2-S1** Reset bei offenem `sync_segment` ⇒ Attempt `cancelled`, `error_code='user_reset'`,
  Szene non-terminal.
- **RS2-S2** Direkt anschließender Dispatch ⇒ `acquired` (nicht `already_in_flight`).
- **RS2-S3** Reset zweimal hintereinander ⇒ zweiter Lauf `canceled_job_ids=[]`, keine Fehler.
- **RS2-S4** Late Sync.so-Callback gegen gecancelten Attempt ⇒ Verdict `noop`,
  kein Slot-Patch, kein Mux-Dispatch, kein zweiter Refund.
- **RS2-S5** Reset mit falscher `run_id`/Generation ⇒ `stale_reset`, kein Write.
- **RS2-S6** Identitäts-Trigger-Probe: Cancel schreibt keine Identitätsspalte.
- **RS2-S7** (Option B) Restart ⇒ neue `run_id` **und** `plate_generation+1`,
  Dispatch-Locks leer.

UI-Resmoke (Vorgabe, unverändert aus RS1): ausschließlich auf einer **frischen Testszene
ohne jede Ledger-Historie**, damit der G3.2.2-Apply-Pfad garantiert erreicht wird.
Akzeptanzsignal bleibt: `bound`-Telemetrie vorhanden, `binding_pending` am Fensterende = 0.

---

## 9. Offene, unbelegte Punkte

- Externer Providerstatus von Sync.so-Job `50b402be-31d0-4f94-bc2f-9ae4f850fe42` ist hier
  nicht read-only prüfbar (API-Key nur als Edge-Secret). Ein Provider-Read ist ein eigener,
  freizugebender Schritt.
- Edge-Logs der Fenster 17:24–17:30 und 20:08–20:12 UTC sind aus der Retention gefallen;
  die Rekonstruktion in RS1 stützt sich dort auf persistierte Ledger- und
  `syncso_dispatch_log`-Zeilen.
- Ob der Plate-Reuse-Check nach einem Generation-Bump im Alltag tatsächlich einen
  Neurender auslöst (Kostenfrage in Option B), ist hier nicht gemessen, sondern nur als
  Risiko benannt.

---

## 10. Nicht Teil dieses Schritts

Keine Wahl zwischen A und B, keine Implementierung, keine Migration, kein Deploy.
Keine Mutation an `d12b2704` / `7f983939`, kein Cleanup, kein neuer Run.

**RS2 CONTRACT DRAFT — STOP für Review.**
