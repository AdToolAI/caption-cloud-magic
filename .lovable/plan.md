# FA-4 v407 — Final Wire-Parity Pre-Deploy Correction (Code + Tests only)

Bestätigte Befunde (read-only verifiziert):
- Der v406-Call in `compose-dialog-segments/index.ts` (~Z. 6974–6978) nutzt `p_scene_id/p_pass_idx/p_patch`, die installierte Funktion ist jedoch `public.update_dialog_pass_slot(_scene_id uuid, _pass_idx integer, _patch jsonb)` (letzte Definition: Migration `20260815164941_...`). Der Persist-Write schlägt also fehl bzw. trifft keine Funktion.
- Der Fresh-Pfad degradiert bei bbox-Upload-Fehler still auf inline (`asdTransport: v406BoundingBoxesUrl ? "url" : "inline"`, ~Z. 7011–7021).
- Snapshot-Build/-Persist läuft unbedingt für jeden nicht-frozen Fresh-Pfad, also auch Single-Speaker/Nicht-BBox-Pfade.

Kein Deploy, kein Render, keine Migration, kein DB-Schema-Diff. Scope-Freeze für P1-A/B/C, deltaMean/N=6/Thresholds, Geometrie/Contract E, G3.2.2-RPC, Mux, RS3, Remotion bleibt bestehen.

## P1-1 — RPC-Parameter-Signatur

Persist-Call exakt auf die installierte Signatur umstellen:

```ts
await supabase.rpc("update_dialog_pass_slot", {
  _scene_id: sceneId,
  _pass_idx: currentPassIdx,
  _patch: { provider_input_frozen: v406Snapshot },
});
```

Verhalten unverändert: Erfolg ⇒ genau ein Provider-Dispatch; Fehler ⇒ `failBeforeProviderDispatch("v406_snapshot_persist_failed")`, `provider_call_made=false`, null Sync.so-Calls.

Damit dies testbar ist (kein Source-String-Test), wandert die Persist-Logik in einen kleinen genutzten Production-Helper, z. B. `persistFrozenProviderInput(rpc, { sceneId, passIdx, snapshot })` in `_shared/provider-wire-snapshot.ts`, den `compose-dialog-segments` aufruft. Der Test injiziert einen RPC-Mock und prüft Funktionsname und exakt die Keys `_scene_id`, `_pass_idx`, `_patch`; ein Call mit `p_*`-Keys failt den Test.

## P1-2 — Fresh bleibt URL-Transport

Ein neuer Helper `resolveAsdTransport({ frozen, wantsUrlTransport, uploadedUrl })` entscheidet deterministisch:
- frozen NOOP-Retry ⇒ `inline` mit frozen `bounding_boxes`.
- Fresh mit v406-Wire-Contract ⇒ `url`; fehlt die URL oder schlägt der Upload/Throw fehl ⇒ kein Wire, sondern Rückgabe `fail` ⇒ `failBeforeProviderDispatch("v406_bbox_url_transport_failed")`, `provider_call_made=false`, null Sync.so-Calls. Kein inline graceful-degrade.

Der bestehende `try/catch`-Warn-Pfad um `uploadBoundingBoxesJson` wird durch dieses Ergebnis-Objekt ersetzt.

## P1-3 — v407 nur auf dem contracted Multi-Speaker-BBox-Pfad (Fresh und NOOP getrennt)

Zwei getrennte Bedingungen, da der NOOP-Retry keine neu berechnete Geometrie besitzen darf:

```ts
const v407FreshWireContract =
  isMultiSpeaker &&
  payloadModel === "sync-3" &&
  retryVariant === "bbox-url-pro" &&
  !!dispatchBox &&
  canonicalBoxesAvailable;

const v407NoopRetryWireContract =
  isMultiSpeaker &&
  payloadModel === "sync-3" &&
  body?.noop_auto_escalation === true &&
  retryVariant === "coords-pro-box";

const v407WireContractActive = v407FreshWireContract || v407NoopRetryWireContract;
```

Begriffstrennung verbindlich: `sync-3` ist das Provider-MODEL (`payloadModel` / finale Model-Authority), nicht `sync_mode`. `sync_mode` (z. B. `cut_off`/`loop`) bleibt ein separates Feld und wird ausschließlich aus dem Snapshot eingefroren. Keine Vermischung im Gate.

- Fresh aktiv ⇒ Snapshot bauen + persistieren, canonical boxes genau einmal, URL-Transport (P1-2).
- NOOP-Retry aktiv ⇒ `resolveFrozenProviderInput(pass)` ist die EINZIGE Quelle für `video_url`, `audio_url`, `bbox`, `bounding_boxes`, `frame_count`, `dispatch_fps`, `voiced_windows`, `sync_mode`, `model`, `speaker_idx`, `segment_id`, `run_id`, `plate_generation`. Keine Abhängigkeit von `dispatchBox` oder einer neu berechneten Box-Sequenz. Fehlender/unvollständiger Snapshot ⇒ `noop_retry_frozen_input_missing`, fail closed, ZERO Provider-Calls.
- Nicht aktiv ⇒ vollständig der pre-v406-Payload-Pfad; kein `provider_input_frozen`, kein `v406_snapshot_build_failed`, kein `v406_bbox_url_transport_failed`, kein Frozen-Gate auf Retries. Single-Speaker (N=1) bleibt bitgleich zum heutigen Verhalten. Keine Verhaltenserweiterung für andere Retry-Varianten.


Das NOOP-Retry-Fail-Closed (`noop_retry_frozen_input_missing`) gilt weiterhin nur, wenn `v406WireContractActive`.

## Tests (echte Failure-Injection, ausführbar)

Erweiterung von `supabase/functions/_shared/fa4-v405-matrix.test.ts` (bzw. neue `fa4-v407-wire.test.ts`) gegen die injizierbaren Helper:

- A Snapshot-Persist-Erfolg ⇒ exakte RPC-Keys `_scene_id/_pass_idx/_patch`, genau 1 Provider-Call.
- B Persist-Fehler ⇒ 0 Provider-Calls, `provider_call_made=false`.
- C Fresh-BBox-Upload-Fehler (Throw und `url=null`) ⇒ 0 Provider-Calls, kein inline-Fallback.
- D Fresh-Erfolg ⇒ ASD-Keys exakt `auto_detect`, `bounding_boxes_url`.
- E NOOP-Retry-Erfolg ⇒ identische frozen `audio_url`/`video_url`/`bounding_boxes`, ASD-Keys exakt `auto_detect`, `bounding_boxes`.
- F Snapshot fehlend/unvollständig auf NOOP-Retry ⇒ 0 Provider-Calls.
- G Single-Speaker fresh ⇒ `v406WireContractActive === false`, kein Snapshot nötig, alter Payload-Pfad läuft.
- H Nicht-BBox-Pfad außerhalb des Contracts ⇒ keine v406-Snapshot-Failure-Regression.
- Matrix-H Deep-Equality (fresh vs. retry core nach Entfernen von ASD) bleibt unverändert bestehen.

Re-Run: bestehende Matrix B–M, Deadline-Tests, Classifier, Plate-Face-Tests.

## Deno-Baseline (auditierbarer Report)

Baseline und v407 werden mit identischem Command und identischem Datei-Scope gemessen; der Report nennt: command, geprüfte Dateien/Scope, Base-Commit, Baseline-Fehleranzahl, v407-Fehleranzahl, neue Fehler. Frühere Zahlen (5 vs. 32) werden nicht mehr als vergleichbar behauptet, sondern durch den neuen, gleich parametrisierten Lauf ersetzt.

## Version

`COMPOSE_DIALOG_SEGMENTS_VERSION` → `v407-fa4-wire-parity-predeploy-final`. Kein Deploy, kein Render.

## Gate

Alle drei P1 geschlossen und Failure-Injection-Tests PASS ⇒ `FA-4 v407 FINAL WIRE-PARITY CORRECTION = PASS — READY FOR PRE-DEPLOY REVIEW → STOP`, sonst `BLOCKED — <exakter P0/P1> → STOP`.
