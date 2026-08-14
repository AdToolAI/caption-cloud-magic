# v431 G2.3 — Finaler Scope-Vertrag (nur Analyse, keine Migration)

Die drei Abschlussfragen sind belegt. Zwei davon verengen den Scope, eine
bestätigt Variante C mit vollem G0-Invariantensatz.

## 1. Deferred-Refund — Nachweis: NICHT race-sicher, daher aus dem Scope

Belegter Code-Stand (`compose-dialog-segments/index.ts:4199-4209`):

```
const { data: wDef } = await supabase.from("wallets")
  .select("balance").eq("user_id", userId).single();
await supabase.from("wallets")
  .update({ balance: Number(wDef?.balance ?? 0) + totalCost, ... })
  .eq("user_id", userId);
```

Befund, ohne Beschönigung:

- Es gibt **keine** Debit-/Reservation-/Transaction-ID. Refundiert wird ein
  *neu berechneter* Betrag (`computeCost(totalSec) * speakerCount`) auf den
  **aktuellen** Wallet-Saldo, adressiert nur über `user_id`.
- Es gibt **keinen** Idempotenz-/Unique-Guard: zwei Zustellungen desselben
  Deferred-Zweigs zahlen zweimal aus.
- Ein verspäteter Aufruf aus Run A würde einen Betrag zurückzahlen, der aus
  dem Szenen-Stand zum Lesezeitpunkt stammt — also potenziell der Spend von
  Run B. Es ist zusätzlich ein klassisches Lost-Update (read-modify-write ohne
  Row Lock).
- Die Reservations-Primitive (`composer_reserve_run_credits`,
  `composer_settle_run_reservation`, `composer_release_run_reservation`)
  existieren in der DB, werden von diesem Pfad aber **nicht** benutzt.

Die geforderten drei Akzeptanzkriterien sind damit **nicht** erfüllt, und sie
lassen sich ohne neue Credit-Logik auch nicht erfüllen.

**Konsequenz (kein Credit-Change in G2.3):** der Deferred-Zweig
`!isAdvance && !isRetry` — der einzige, der refundiert — wird in G2.3
**nicht** migriert und bleibt Legacy. Migriert wird nur der
`isAdvance || isRetry`-Zweig, der per Konstruktion **keinen** Refund auslöst
(„advance path keeps the existing charge"). Damit entsteht kein Pfad, in dem
ein run-geguardeter No-op-State auf einen ungeguardeten Geldpfad trifft.

Die Refund-Härtung (Bindung an Transaction-Key + Idempotenz, bevorzugt über
die vorhandenen Reservations-Primitive) wird als eigener Punkt für die
Credit-Gate-Etappe notiert, nicht in G2.3 gelöst.

## 2. compose-dialog-segments — Caller-Vertrag pro tatsächlichem Aufrufer

Verifiziert: **kein** Caller übergibt heute Run-Provenienz; die Funktion leitet
sie aus dem Live-Scene-Read ab (`:785`, `:797-798`). Das ist als Provenienz
verworfen.

| Tatsächlicher Caller | Aufruf | Immutable Run-Snapshot? | G2.3-Behandlung |
| --- | --- | --- | --- |
| `useTwoShotAutoTrigger` (:529) | Poll-getriebener Auto-Trigger über DB-Rows | **nein** — kennt nur den Live-Row-Stand | **bleibt G5**, unveränderter Legacy-Ast |
| `ClipsTab` (:492) | Poll-getriebener Auto-Trigger (`auto: true`) | **nein** | bleibt Legacy |
| `compose-clip-webhook` (:482) | Server-Kette nach Plate-Fertigstellung | nein | bleibt G3-Legacy |
| `_shared/autopilotComposerBridge` (:339) | Self-Heal | nein | bleibt G5-Legacy |
| `lipsync-watchdog` (Advance) | Advance/Retry gegen bestehende Passes | **ja** — der Pass-Slot trägt seit G2.1 `run_id` + `plate_generation` überschreibgeschützt | **G2-Primitive** |
| interner Advance/Retry-Pfad innerhalb `compose-dialog-segments` | Fan-out über bestehende Passes | **ja** — selbe Pass-Slot-Quelle | **G2-Primitive** |

`useTwoShotAutoTrigger` rutscht ausdrücklich **nicht** in G2 — ein nachträglich
angehängter Live-Scene-Run wäre genau die Provenienz-Fiktion, die G1/G2
ausschliesst.

**Damit reduziert sich Punkt 1+2 auf eine gemeinsame Scope-Grenze:**
Circuit-Open und Deferred werden in G2.3 **nur im Advance/Retry-Zweig**
migriert (Pass-Slot-Provenienz, kein Refund). Der Initial-Dispatch-Zweig
beider Pfade bleibt unverändert Legacy bis G4/G5. Keine Payload-Erweiterung
nötig — die Provenienz kommt aus dem bereits immutablen Pass-Slot.

## 3. `composer_finalize_upload_scene` — vollständiger G0-Invariantensatz

Variante C, eng gescoptes Domain-Primitive, `SECURITY DEFINER`. Der Vertrag
hält explizit fest — weil das Primitive bewusst nicht durch
`composer_scene_transition_core` läuft:

| Invariante | Festlegung |
| --- | --- |
| Signatur | `composer_finalize_upload_scene(_scene_id uuid, _run_id uuid, _generation int, _write_id text, _upload_url text)` |
| write_id | akzeptiert **ausschliesslich** `'cvc:upload-complete'`, sonst `invalid_write_id` ohne Write |
| Row Lock | `SELECT ... FROM composer_scenes WHERE id=_scene_id FOR UPDATE` als erste Anweisung |
| Run-Gate | `active_run_id = _run_id` sonst `stale_run`; `plate_generation = _generation` sonst `stale_generation` — beide unter dem Lock |
| From-Set | fest `{idle, plate_queued}`; alles andere → `unexpected_from_state` |
| To-State | fest `complete`, kein Parameter |
| Provenienzspalte | `pipeline_state_run_id = _run_id` (plus Generation-Spiegel wie in den G2.2-Primitiven) |
| Atomarität | Output-Tripel (`clip_url`, `base_video_url`, `processed_video_url` gemäss `materializeCompatibilityOutput('base')`) + `pipeline_state='complete'` + `clip_status='ready'` in **einem** Commit |
| Audit | ein Eintrag in `composer_scene_transition_log` mit `write_id`, Run, Generation, From/To und Ergebnis `applied` \| `stale_run` \| `stale_generation` \| `unexpected_from_state` |
| Kein Write bei Ablehnung | stale oder unzulässiger From-State → **kein** Output-Write, kein Spiegel-Write, nur Audit |
| Härtung | `SECURITY DEFINER`, `SET search_path = public`, `REVOKE ALL FROM PUBLIC/anon/authenticated`, `GRANT EXECUTE TO service_role` — identisch zu `composer_finalize_talking_head` |
| State Machine | **keine** neuen Kanten in `composer_scene_transitions`, keine Änderung am generischen G0-Core |

## 4. Finaler G2.3-Migrationsscope

| # | writeId | Zweig | Primitive | From → To/Substate | Run-Quelle | Spiegel (atomar) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `cds:conditional-running-or-pending` | nur `isAdvance \|\| isRetry` | `composer_park_lipsync_dispatch` (neu, Modi `circuit_open` \| `deferred`, geschlossen) | `lipsync_dispatched\|lipsync_running` → gleicher State + `circuit_open` | Pass-Slot | `lip_sync_status`, `twoshot_stage`, `clip_error` |
| 2 | `cds:pending-3` | nur `isAdvance \|\| isRetry` (refundfrei) | dito, Modus `deferred` | `lipsync_dispatched\|lipsync_running` → gleicher State + `deferred` | Pass-Slot | `lip_sync_status`, `twoshot_stage`, `clip_error` |
| 3 | `compose-twoshot-audio:failed` | nur G2-Caller `compose-video-clips` mit Body-Provenienz | `composer_fail_scene_with_mirrors` (G2.2, unverändert) | `audio_prep` → `failed` + `dialog_turns_required` | Body `run_id`/`plate_generation` (:572) | `lip_sync_status`, `twoshot_stage`, `clip_error` |
| 4 | `cvc:upload-complete` | alle | `composer_finalize_upload_scene` (neu) | `idle\|plate_queued` → `complete` | `sceneRunStamps` | `clip_status='ready'` + Output-Tripel |
| 5 | `cvc:failed/pika` | alle | `composer_fail_scene_with_mirrors` | `idle\|plate_queued\|plate_rendering` → `failed` + `provider_error` | `sceneRunStamps` | `clip_status='failed'`, `clip_error` + nur heute gesetzte weitere Spiegel |

Neu: genau zwei Primitive (`composer_park_lipsync_dispatch`,
`composer_finalize_upload_scene`). Keine neuen Runless-/Grandfather-Ausnahmen,
kein generischer Bypass, keine frei übergebbaren Zielstates.

## 5. Ausserhalb G2.3 (unverändert)

Initial-Dispatch-Zweige von Circuit-Open/Deferred, `useTwoShotAutoTrigger`,
`ClipsTab`-Auto-Trigger, `compose-clip-webhook`, `autopilotComposerBridge`,
Reset-Pfade, `clip_error`-only-Diagnosen, Output-Writes ohne Statuswechsel,
Job-Metadata. Zusätzlich neu notiert: **Refund-Härtung des Deferred-Pfads**
(Transaction-Key + Idempotenz) als eigener Credit-Gate-Punkt.

## 6. Umsetzungsreihenfolge nach GO

1. DB-Migration: `composer_park_lipsync_dispatch`, `composer_finalize_upload_scene`.
2. Writer-Migration der fünf Einträge aus §4, zweig- und caller-spezifisch.
3. Verifikation: `tsgo`, Composer-/Lip-Sync-Suite, Writer-Inventar-Test um beide
   Primitive erweitert, transaktionale DB-Smokes (stale run, stale generation,
   unzulässiger From-State, falsches `write_id`, doppelter Callback,
   Cancel-Race, Audit-Vollständigkeit, „kein Output-Write bei Ablehnung").
4. Bericht `docs/v431-g2-3-report.md`.

Baseline-Vermerk: die vorbestehenden Social-Publishing-Reds in
`src/pages/__tests__/Composer.test.tsx` bleiben unverändert ausserhalb Scope.
