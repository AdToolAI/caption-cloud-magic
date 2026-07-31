## Was ich in der Datenbank gefunden habe (Szene 69d56a49, heute 23:08–23:18)

Das ist kein Geometrie-Problem mehr. Der Hänger hat eine ganz banale Ursache:

| Slot in `dialog_shots.passes` | Inhalt |
|---|---|
| **[0]** | **`{}` — komplett leer.** Kein `idx`, kein `speaker_idx`, kein `status`, keine `input_url` |
| [1] | `done`, job `7d34de71…`, output vorhanden |
| [2] | `done`, job `6baa9534…`, output vorhanden |
| [3] | `done`, job `a4a420f9…`, output vorhanden |

`total_passes = 4`, `current_pass = 3`. Drei von vier Passes sind sauber fertig — Pass 0 wurde um **23:09:05 erfolgreich dispatcht** (`DISPATCHED`, face_share 0.307, Variante `bbox-url-pro`), und **danach wurde sein Slot überschrieben und geleert**.

Ab diesem Moment passiert Folgendes bei jedem Wiederanlauf (belegbar um 23:10:58 und 23:12:14 im `syncso_dispatch_log`):

```
HEURISTIC_BLOCKED  coords_heuristic_unverified
pass=0 speaker_idx=undefined source=none
```

Das ist der v87-Sanity-Block in `compose-dialog-segments/index.ts` (~Z. 4396). Er liest `passes[0].speaker_idx` → `undefined` → `coordSources[-1]` → `"none"` → **Abbruch mit HTTP 202 `awaiting_face_detection`**. 202 ist "alles ok, später nochmal" — also:

- kein Terminal-Status auf dem Pass
- keine Zeile in `syncso_inflight_jobs` (Tabelle für die Szene ist leer)
- der Watchdog hat nichts zu rekonzilieren
- die UI bleibt ewig auf „Lip-Sync läuft… Pass 4/4"

Die Szene kann in diesem Zustand **nie** fertig werden und auch nie fehlschlagen. Genau das siehst du.

## Fix — drei Schritte, keine neue Geometrie

**1. Ursache des Slot-Wipes finden und schließen (zuerst)**
Es gibt zwei Stellen, die den Slot komplett ersetzen (`passes[currentPassIdx] = pass`, Z. 5984 und 7133) plus die Webhook-Schreibpfade. Der in der v169-Doku beschriebene atomare Per-Slot-RPC **`update_dialog_shot_pass` existiert in dieser Datenbank nicht** (`pg_proc` liefert null Zeilen) — geschrieben wird stattdessen per Read-Modify-Write auf dem ganzen `passes`-Array. Bei parallelen Webhooks (23:12:04 kamen Pass 1 und 2 innerhalb von 84 ms zurück) überschreibt der langsamere Writer das Array mit seinem älteren Stand — Lost Update. Ich instrumentiere die drei Writer, reproduziere das an der vorhandenen Szene und mache den Schreibpfad dann konfliktfrei: entweder der RPC aus der v169-Spec (`update_dialog_shot_pass(scene_id, pass_idx, patch)` mit `jsonb_set` in einer einzigen Anweisung) oder ein `FOR UPDATE`-Read direkt vor dem Write.

**2. Slot-Integritäts-Guard (schützt sofort, unabhängig von 1)**
Vor jedem Schreiben eines Pass-Slots: hat das Objekt kein `idx`/`speaker_idx`, wird nicht geschrieben, sondern der Slot aus den `dialog_turns` neu aufgebaut. Beim Einlesen genauso: ein leerer Slot wird aus dem Turn rekonstruiert statt als „speaker_idx undefined" weiterzureichen. Damit läuft eine Szene wie diese von selbst weiter, statt zu blockieren.

**3. Der v87-Block darf nicht mehr endlos 202 zurückgeben**
Der Block bekommt denselben Zähler wie sein großer Bruder weiter oben (`face_detect_retry_count`, 3 Versuche): danach `lip_sync_status='failed'`, klare Meldung, idempotenter Credit-Refund. Ein Pass, der nicht dispatcht werden kann, endet damit **immer** terminal — die UI hängt nie wieder unbegrenzt, und der Watchdog sieht einen Zustand, den er beenden kann.

## Abgleich mit deinem v169-Guide

| v169-Invariante | Ist-Zustand |
|---|---|
| Parallel-Fanout, eigener Preclip pro Pass | ✅ erfüllt (3 Passes parallel um 23:09:06) |
| Deterministisches ASD, nie `auto_detect` bei N≥2 | ✅ erfüllt (`bbox-url-pro`) |
| Per-Pass-Lock | ✅ vorhanden |
| **Per-Slot-RPC `update_dialog_shot_pass` statt Array-Rewrite** | ❌ **fehlt — genau das ist der Bug** |
| Watchdog beendet hängende Passes | ⚠️ greift nicht, weil kein Inflight-Row und kein Status existiert |

Dein Guide hat den Fehler also bereits benannt: „Per-slot RPC write — never full-row rewrite." Der Punkt ist beim Umbau verloren gegangen. Schritt 1 stellt ihn wieder her.

## Was ich nicht anfasse

Preclip-Geometrie, Face-Share-Schwellen, Retry-Ladder, Provider-Payload, Mux, Motion Studio UI. Die Werte von 23:09 (face_share 0.29–0.32, alle vier Dispatches angenommen) zeigen, dass dieser Teil funktioniert.

## Verifikation

- Die hängende Szene 69d56a49 wird repariert (Slot 0 rekonstruiert) und läuft durch — oder scheitert terminal mit Refund.
- Neue 4-Sprecher-Szene: alle vier Slots behalten nach dem letzten Webhook `idx`/`speaker_idx`/`status`; keine `HEURISTIC_BLOCKED`-Zeile mit `speaker_idx=undefined` mehr im Log.
- Kein Pass bleibt länger als der Watchdog-Timeout ohne Terminalzustand.
