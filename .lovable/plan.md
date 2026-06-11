## Vollständige Pipeline-Analyse vs. Sync.so v3 Dokumentation

### Was Sync.so offiziell für sync-3 unterstützt (Quelle: sync.so/docs/developer-guides/speaker-selection + /models/sync-3)

Erlaubte `options` für `model: "sync-3"` laut Doku:
- `sync_mode` (`cut_off`, `loop`, etc.)
- `active_speaker_detection` mit **einer** von drei Formen:
  - **a) Auto-Detect (Video):** `{ auto_detect: true }` — keine weiteren Felder
  - **b) Manuell Koordinaten:** `{ auto_detect: false, frame_number: N, coordinates: [x, y] }`
  - **c) Bounding-Boxes pro Frame:** `{ auto_detect: false, bounding_boxes: [...] }` ODER `{ auto_detect: false, bounding_boxes_url: "..." }`

In den offiziellen Docs für sync-3 **nicht aufgeführt**:
- `temperature`
- `occlusion_detection_enabled` (sync-3 hat „built-in obstruction detection" – kein Toggle)

### Was unsere Pipeline aktuell sendet (DB-belegt, Scene c8fb1fe6)

Payload für jeden der 4 Pässe (v105, `coords-pro` / `sync3-coords`):
```json
{
  "model": "sync-3",
  "input": [{video}, {audio}],
  "options": {
    "sync_mode": "cut_off",
    "temperature": 0.5,                              // NICHT in sync-3 Docs
    "occlusion_detection_enabled": true,             // NICHT in sync-3 Docs
    "active_speaker_detection": {
      "auto_detect": false,
      "coordinates": [153, 193],
      "frame_number": 27
    }
  }
}
```
Sync.so antwortet: HTTP 201 (Job angenommen), Webhook später: `status: FAILED, error: "An unknown error occurred."`

### Root-Cause-Analyse (mehrschichtig)

**Root Cause 1 — Unbekannte Optionen für sync-3 → `provider_unknown_error`:**
- `temperature` und `occlusion_detection_enabled` sind in der offiziellen sync-3 API-Doku nicht aufgeführt.
- Sync.so akzeptiert den Job in der Validierung (HTTP 201) und bricht ihn dann beim Provider-Run mit unspezifischem Fehler ab.
- Das erklärt, warum alle 4 Pässe konsistent mit „An unknown error occurred." enden, obwohl die ASD-Struktur an sich formal richtig aussieht.

**Root Cause 2 — Frage „Wird Auto-Detect korrekt umgesetzt?":**
**Nein.** v105 deaktiviert `auto_detect` für Multi-Speaker explizit:
```
v105_multi_speaker_force_fullplate speakers=4 resolved=0 → 
full-plate sync-3 deterministic ASD (bbox-url-pro or coords-pro)
```
Das ist genau die Stelle, wo zuvor (Closed-Mouth-Bug) `auto_detect: true` pro Pass eingesetzt wurde, was zwar valide Doku-Konformität war, aber bei 4 Pässen je dieselbe Person animiert hätte. Die jetzige Lösung „coords statt auto_detect" ist konzeptionell richtig — sie scheitert nur an Root Cause 1 (unzulässige Options) und Root Cause 3 (falsche Koordinaten).

**Root Cause 3 — Koordinaten sind heuristisch, nicht echt:**
- `plate-face-detect` (Gemini) findet zwar 4 Gesichter, aber `plate-identity` resolved 0/4 (kein Mapping zu Speaker-Namen).
- Fallback `plate-slot-fallback` verteilt 4 Punkte gleichmäßig (x: 153, 314, 465, 617; y: 193–224) auf 768×1028-Plate.
- Selbst wenn Sync.so den Job ausführen würde: Koordinaten zeigen vermutlich nicht exakt auf die Mundregion → Closed-Mouth-Resultat (genau das Symptom der Vorgängerszene ddde37a6).

**Root Cause 4 — Multi-Speaker-Stuck-State im Webhook:**
- Wenn Teilfehler auftreten und keine Inflight-Jobs mehr offen sind, bleibt `lip_sync_status='running'` und `twoshot_stage='syncso_fanout_2_of_4'` stehen.
- Szene ddde37a6 hat sogar `clip_url + lip_sync_applied_at`, aber Status „running" — die UI hängt deshalb dauerhaft auf „Lip-Sync läuft…".

**Root Cause 5 — Beste Praxis für Multi-Speaker (nach Doku):**
Doku empfiehlt für Mehrsprecher-Szenen explizit `bounding_boxes` pro Frame (oder `bounding_boxes_url` für lange Videos). Wir machen pro Sprecher einen separaten Pass mit einer Koordinate — das funktioniert formal, ist aber bei 4 Sprechern fehleranfälliger als die „eine Generation mit per-Frame-Bounding-Boxen, bei der Sync.so pro Frame die aktive Person wählt".

### Plan zur Behebung

**Phase A — Payload streng doku-konform machen (`compose-dialog-segments`):**
1. Für `model: "sync-3"` `temperature` und `occlusion_detection_enabled` **nicht mehr senden**. Diese Optionen nur noch für `lipsync-2` / `lipsync-2-pro` setzen.
2. Telemetrie v106 erweitern: gesamte tatsächliche `options`-Keys ins Log schreiben, damit Doku-Drift sofort sichtbar ist.
3. Acceptance-Kriterium: Erster frischer Multi-Speaker-Pass läuft mit sync-3 ohne `provider_unknown_error` durch.

**Phase B — Koordinaten-Härtung:**
1. Wenn `plate-identity` 0/N löst, **nicht** weiter mit Slot-Spread-Coords dispatchen.
2. Stattdessen: einen zweiten Identity-Versuch (Gemini Vision, deterministischer Prompt) erzwingen; bei erneutem Fehlschlag direkt auf den Bounding-Boxes-Pfad (Phase C) eskalieren.
3. Acceptance-Kriterium: Jeder dispatchete Coord-Pass hat verifizierte Face-Coords (`source != 'plate-slot-fallback'`).

**Phase C — Doku-Best-Practice „bounding_boxes" als Primärweg für Multi-Speaker:**
1. Statt N Pässe à „eine Coord pro Speaker" eine Generation mit `bounding_boxes` pro Frame (oder `bounding_boxes_url`) verwenden, wenn N ≥ 2 und Face-Detection alle N Gesichter geliefert hat.
2. Sync.so wählt dann pro Frame automatisch die aktive Person — das ist die offiziell empfohlene Multi-Speaker-Methode.
3. Fallback bleibt: pro Pass `frame_number + coordinates` mit verifizierten Coords.

**Phase D — Stuck-State-Recovery:**
1. `sync-so-webhook`: bei `done + failed == N` und keinen offenen Jobs → Szene final markieren (`failed` mit klarer Fehlermeldung oder `done` falls Teil-Output verwendbar), nicht weiter „running" lassen.
2. Idempotenter Credit-Refund für nicht ausgelieferte Pässe.
3. Watchdog (pg_cron `poll-dialog-shots-every-minute`): Hard-Reset, wenn `lip_sync_status='running'` ∧ `updated_at` älter als 8 min ∧ keine Inflight-Jobs.

**Phase E — UI-Härtung:**
1. Wenn `lip_sync_status='running'` aber `updated_at` älter als ~3 min, in der UI deutlichen „Hängt"-Hinweis mit „Reset"-Aktion zeigen (Hook `useResetLipSync` ist bereits vorhanden).

**Phase F — Sofort-Reset für die zwei aktuellen Szenen:**
1. `ddde37a6`: hat `clip_url + lip_sync_applied_at` → Status auf `done` ziehen (sauber synchronisieren).
2. `c8fb1fe6`: aktueller Fanout terminal nicht reparierbar (zu viele provider_unknown_error) → über `reset-lipsync-scene` zurücksetzen, Credits refunden, nach Phase A neu dispatchen.

**Phase G — Verifikation:**
1. Frischer 4-Sprecher-Lauf nach Phase A: prüfen, dass Sync.so `COMPLETED` liefert (kein `provider_unknown_error`).
2. Lippen-Bewegung sichtprüfen.
3. Memory `mem://architecture/lipsync/v106-…` mit doku-konformer Options-Liste anlegen.

### Technische Details

Dateien, die voraussichtlich angefasst werden:
- `supabase/functions/compose-dialog-segments/index.ts` (Payload-Builder, Identity-Retry, bounding_boxes-Primärpfad, v106 Telemetrie)
- `supabase/functions/sync-so-webhook/index.ts` (terminale Stuck-State-Behandlung, idempotenter Refund)
- `supabase/functions/poll-dialog-shots/index.ts` (Watchdog Hard-Reset)
- Migration: Status-Korrektur der zwei betroffenen Szenen
- Optional UI-Hinweis in der Composer-Szenenkarte

### Was sich aus den Logs als Beweise zusammenträgt
- Scene c8fb1fe6: 4 Pässe, alle dispatched mit identischer Options-Form, **alle** terminieren als `provider_unknown_error` trotz HTTP 201.
- v105_probe bestätigt: `payload_model=sync-3`, `asd_mode=coordinates`, `auto_detect=false`, `dispatch_video_kind=full_plate`.
- `plate_identity=0/4`, alle Coord-Quellen `plate-slot-fallback` → Coords nicht verifiziert.
- Scene ddde37a6 (vorige): gleiche Struktur, Jobs `COMPLETED`, aber Lippen geschlossen → bestätigt, dass Coords nicht auf Mundregion treffen.
- Beide Szenen sind backend-seitig steckengeblieben (`lip_sync_status='running'` ohne offene Jobs).