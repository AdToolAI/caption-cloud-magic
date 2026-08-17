# FA-4/P0 — Root Cause Analysis (read-only, kein Fix)

Szene `42bcdda1-3a42-4d2a-b43e-21f1888cd1f2`, Run `56955451-fe9e-4116-8dd2-5734ba8653c9`,
Generation 2. Es wurde nichts verändert: keine Reparatur, kein Retry, kein Reset, kein Cleanup,
kein Render, keine Migration, kein Deploy.

## Ergebnis vorab

**FA-4 P0 — ROOT CAUSE IDENTIFIED / AWAITING FIX GO**

Klassifikation: **C — allgemeiner Preflight-Resilienz-Bug**, nicht sprecherzahl-spezifisch.
Es gibt **keine** versteckte Zweier-Annahme im Pre-Dispatch-Pfad (Klasse B ausgeschlossen)
und **keine** Produktgrenze bei 4 Sprechern (Klasse A ausgeschlossen).
Ein **Watchdog war nicht beteiligt** — Stall und Failure sind dasselbe Ereignis.

## 1. Failure-Owner (belegt, nicht abgeleitet)

| Feld | Wert |
| --- | --- |
| `pipeline_state` / `substate` | `failed` / `lipsync_failed` |
| `lip_sync_status` / `twoshot_stage` | `failed` / `failed` |
| `clip_status` / `clip_url` | `ready` / gesetzt (Plate intakt) |
| `processed_video_url` | NULL |
| `clip_error` | `v187_preclip_required_no_fullplate_fallback: … (invoke_502: 502 Bad Gateway)` |
| Failure-Zeit | 2026-08-17 00:30:38.994Z (`dialog_shots.finished_at`), Scene-Update 00:30:39.642Z |
| `dialog_shots.passes` | genau **1** Eintrag: `idx:0`, `status:rendering_preflight`, `preflight_started_at 00:30:35.250Z` |
| `refunded` | `true` |

Schreiber: `supabase/functions/compose-dialog-segments/index.ts`, Zweig
`v161PreclipEligible → preclipResult !ok → speakers.length >= 2` (Zeilen 5367–5409):
`logSyncDispatch(PREFLIGHT_BLOCKED)` → `failLipSync(...)` → HTTP **422**.
Kein RPC, kein Watchdog, kein Legacy-Completion-Owner.

Transition-Log (`composer_scene_transition_log`, 3 Zeilen, alle Run-bound Gen 2):

```text
00:23:06.341  idle -> plate_queued    caller_class=legacy  sig=legacy_7  write_id=legacy_wrapper_7   applied=true
00:29:40.870  audio_ready -> audio_ready caller_class=v2   sig=v2        write_id=ccw:plate-complete applied=true
00:30:40.050  failed -> failed        caller_class=v2      sig=v2        write_id=ccw:handoff_failed applied=FALSE (unexpected_from_state)
```

Die dritte Zeile ist **kein** Failure-Owner: sie wurde vom Guard abgelehnt (`applied=false`),
1,06 s nachdem `compose-dialog-segments` die Szene bereits terminalisiert hatte.

## 2. Stall vs. späterer Failure — es gibt keinen Stall

Fenster 00:29:40Z–00:39:30Z enthält genau eine Ereigniskette:

```text
00:23:06.912  base_video acquired (ai-happyhorse, attempt 1)
00:29:40.870  base_video succeeded, Plate-Complete -> audio_ready
00:30:11.999  v278 anchor_layout_recovered (facemap_recovery, 4/4 Slots)
00:30:35.250  pass 0 preflight-claim (rendering_preflight)
00:30:38.171  video_renders 8d4596d3… angelegt
00:30:38.287  video_renders -> failed: "invoke 502: <html>502 Bad Gateway</html>"
00:30:38.994  dialog_shots.status=failed, refunded=true
00:30:39.642  Szene failed / lipsync_failed
```

Zwischen 00:30:39 und 00:39:30 passiert nichts mehr. `lipsync-watchdog`,
`recover-stuck-composer-clip` und Timeout-Terminalisierung sind **nicht** involviert.
Letzter erfolgreicher Schritt: Preclip-Dispatch-Insert in `video_renders`.
Erster nicht erreichter Schritt: Lambda-Start des Preclip-Renders.

Edge-Function-Logs für `compose-dialog-segments` und `invoke-remotion-render` sind im
Retentionsfenster nicht mehr abrufbar; die Rekonstruktion stützt sich vollständig auf
`video_renders`, `dialog_shots`, `composer_pipeline_jobs` und `composer_scene_transition_log`.

## 3. `compose-dialog-segments` — Trace dieses Runs

Eine relevante Invocation, Abbruch in Pass 0:

| Aspekt | Befund |
| --- | --- |
| Invocation | ~00:30:3x, Rückgabe **422** `v187_preclip_required_no_fullplate_fallback` |
| Turns | 6 kanonische Turns in `dialog_turns` |
| Pass-Struktur | 6 Passes vorgesehen, **serieller Dispatch (N≥3)** → nur `idx:0` materialisiert |
| Pass 0 Speaker | Sarah Dusatko, `speaker_idx 0`, Character `5c81f9bf…` |
| Face-/BBox-/Identity-Gates | bestanden — `anchor_face_layout` v278 mit 4/4 Slots, Slots 0..3 bijektiv, plate-native Koordinaten |
| Preclip-Ergebnis | `ok:false`, `error=invoke_502:…`, `errorClass=dispatch_failed` |
| Ledger-Acquire erreicht | **nein** |

Warum kein `sync_segment`-Ledger-Job: Der Acquire (`stage:"sync_segment"`, Zeile ~5980)
liegt strikt **hinter** dem Preclip-Block (Zeile 5308). Der 422-Return bei 5402 verlässt
die Funktion vor jeder Ledger-Interaktion. Ledger-Inhalt daher korrekt: genau 1 Job
(`base_video`, succeeded).

## 4. Guard-Matrix — kein Zweier-Rest

Geprüft am aktiven Code, nicht an Annahmen:

- `renderPassFacePreclip` (v69) läuft für **alle** N (1..4) — keine N-Verzweigung.
- `speakers.length >= 2` bei 5369/5417 ist kein Zweier-Cap, sondern das
  Fail-closed-Kriterium „mehr als ein Gesicht auf der Plate ⇒ kein Full-Plate-Fallback".
  Für N=4 ist dieses Verhalten vertraglich korrekt (v187/v331).
- N≥3-Sonderlogik (serieller Dispatch, evenly-spaced Fallback, `expectedFaceCount`)
  hat gegriffen und lieferte 4/4 Face-Mapping.
- `twoshot`/`left|right` existieren nur als abgeleitete Aliasse für N≤2 bzw. in
  Legacy-Pfaden, die dieser Run nicht berührt hat (`slotIndex` 0..3 wurde verwendet).
- Plate-Budget, Voice-/Character-Lookup, Provider-Capability-Guard und Anker-Geometrie
  sind sauber passiert — sie liegen alle vor dem Preclip und haben nicht geblockt.

## 5. Turn-/Pass-Zustand

6 kanonische Turns, 4 stabile `speaker_idx` 0..3, wiederkehrende Sprecher behalten ihren
Index, Slots 0..3 bijektiv zu den vier Characters (`5c81f9bf`, `483f9cdc`, `54d90504`,
`c65de5c6`). Pass 1..5 wurden nie angelegt — das ist unter serieller N≥3-Dispatch-Politik
erwartetes Verhalten, kein Strukturmangel.

## 6. Root Cause

Ein **transienter HTTP 502 des `invoke-remotion-render`-Gateways** beim allerersten
Preclip-Dispatch. `pass-face-preclip.ts` behandelt diesen Infrastrukturfehler
(`errorClass: "dispatch_failed"`) exakt wie einen inhaltlichen Preclip-Fehler:
kein einziger Wiederholversuch, sofortige Rückgabe an den v187-Guard, der die gesamte
Szene fail-closed terminalisiert und refundet. Ein 3-Sekunden-Gateway-Ausfall killt damit
einen kompletten 4-Sprecher-Lauf nach 7 Minuten bereits bezahlter Plate-Arbeit.

Nebenbefund (kein eigener Fehler): Die Nutzermeldung sagt „wurde nicht rechtzeitig fertig",
obwohl es ein Dispatch-502 in 116 ms war — irreführend für Diagnose und Support.

## 7. Minimale Fix-Ebene (nur Beschreibung — nichts geändert)

1. `supabase/functions/_shared/pass-face-preclip.ts` — begrenzter Retry ausschließlich für
   `errorClass === "dispatch_failed"` bei 5xx/Netzwerkfehlern des Invoke-Aufrufs
   (z. B. 2 Wiederholungen, Backoff 1s/3s), innerhalb des bestehenden Poll-Budgets von 300 s.
   Der vorhandene `video_renders`-Row wird dabei pro Versuch sauber terminalisiert bzw. neu
   angelegt. `lambda_failed`, `poll_timeout`, `invalid_input` bleiben unverändert fail-closed.
2. `supabase/functions/compose-dialog-segments/index.ts` — nur Meldungstext: Dispatch-Fehler
   und Timeout unterscheidbar formulieren. Guard-Semantik unverändert.
3. Kein Eingriff in die eingefrorene Kette (Plate → Sync → Maske → Mux), keinen Ledger-,
   RS3-, G3.2.2- oder F1-Contract anfassen.

### Tests

- Unit auf `renderPassFacePreclip`: 502 → Retry → Erfolg beim zweiten Versuch;
  3× 502 → `dispatch_failed`, Guard greift wie heute.
- Unit: `lambda_failed` und `poll_timeout` lösen **keinen** Retry aus (Nicht-Regression v187).
- Contract-Test: N=4 mit fehlgeschlagenem Preclip erzeugt weiterhin 0 `sync_segment`-Ledger-Jobs
  und genau einen Refund.

## Offener Punkt für dein GO

Der Report soll laut Auftrag in `docs/v433-motion-studio-final-acceptance.md` als Abschnitt
FA-4/P0 ergänzt werden. Im Planmodus wird keine Projektdatei geschrieben — mit deiner Freigabe
trage ich exakt diesen Inhalt dort ein (nur Doku, kein Code).
