# Fail-Fast Coord-Gate für Sync.so-Dispatch

## Antwort vorab: Werden Lipsyncs parallel gerendert?

**Nein — die Sync.so-Lipsync-Passes laufen seriell (chained):** Pass N nimmt den Output von Pass N-1 als Input. Das ist FROZEN (siehe `mem/architecture/lipsync/FROZEN-INVARIANTS.md` I.9) und korrekt so, weil parallel-Dispatch auf demselben Plate zu Character-Swap geführt hat.

**Parallel sind nur die Vorbereitungs-Schritte:**
- Preclip-Renderings (1 pro Pass) → seit v60 parallel
- Audio-Probes
- Frame-Probes

→ Sync.so-Calls selbst bleiben seriell, das ist nicht das Problem.

## Das eigentliche Problem

Pass 4 (Sarah) hat 4× Sync.so gerufen mit deterministisch falschen Koordinaten (`[610,291]` = Plate-Slot-Fallback, untere Hälfte ohne Gesicht), obwohl Face-Gate `[595,251]` repariert hatte. Jeder Retry hat denselben Müll geschickt → 11 Min verloren, dann Honesty-Fail mit Refund.

**Retries sind dafür nicht gemacht.** Sie sollen transiente Provider-Outages abfangen (5xx, Timeouts), nicht Logik-Bugs in der Koordinaten-Pipeline.

## Ziel

Wenn der Input deterministisch falsch ist → **sofort fail**, kein Sync.so-Call, voller Credit-Refund, klarer Error.
Echte transiente Errors → Retry wie bisher (max 1-2).

## Plan

### 1. Pre-Flight Coord-Gate (`compose-dialog-segments`)

Direkt vor jedem Sync.so-Dispatch-Aufruf (in der Pass-Schleife ~line 1474, vor `dispatchPass`):

- Hole `coords_source` für diesen Pass aus `builtPasses[i]`.
- **Block-Liste:** `null`, `"none"`, `"heuristic"`, `"plate-slot-fallback"`, `"identity"` ohne Face-Gate-Verifikation.
- **Allow-Liste:** `"face_gate_repair_v96"`, `"face_gate_repair_strict"`, `"plate_identity_verified"`, `"face_repair"`.
- Bei Block: Pass wird **nicht dispatched**, sondern direkt als `failed` markiert mit `failure_reason: "coords_not_verified"`, Pass-Credits werden sofort refundiert, Loop bricht ab (Honesty-Policy: ganze Szene `failed`).

### 2. Coord-Order Fix (Advance-Refresh respektiert Face-Gate)

In der "ADVANCE COORDS REFRESH"-Stage:
- Vor dem Überschreiben prüfen: ist `pass.coords_source` bereits `face_gate_repair_*` oder `plate_identity_verified`?
- Wenn ja → Refresh **skippen** (Face-Gate-Repair ist autoritativ).
- Wenn nein → Refresh wie bisher.

Das verhindert exakt den Sarah-Bug.

### 3. Retry-Klassifizierung in `sync-so-webhook` + Retry-Ladder

- **Transient** (HTTP 5xx, `network_error`, `timeout`, Sync.so-internal `service_unavailable`) → Retry wie bisher.
- **Deterministic** (`provider_unknown_error`, `invalid_input`, `face_not_found`, identische coords 2× → identische Fehler) → **0 Retries**, sofortiger Pass-Fail mit Refund.
- Neue Hilfsfunktion `isTransientSyncError(errorCode, prevErrorCode, prevCoords, currentCoords)` in `_shared/sync-classify.ts`.

### 4. UI Error Surfacing

In `DialogScenePill` / Composer-Toast:
- Bei `coords_not_verified`: "Speaker X — face position could not be verified, scene failed safely (credits refunded)".
- Bei `deterministic_provider_error`: "Speaker X rejected by Sync.so (coordinates: [...]), retry skipped".
- Klare User-Message statt opakem "provider_unknown_error".

### 5. Telemetrie

- Log-Event `coord_gate_blocked` mit `scene_id`, `pass_idx`, `speaker_name`, `coords_source`, `coords`.
- Cockpit-Sichtbarkeit über bestehenden Bond QA / Watchdog-Tab (kein neues UI nötig).

## Out of Scope (bewusst nicht in diesem Plan)

- Sync.so-Calls parallelisieren (bleibt FROZEN seriell — verursacht sonst Character-Swap).
- Face-Gate-Algorithmus selbst verbessern (separater Plan).
- Plate-Identity-Detection neu implementieren.

## Erwarteter Effekt

- 11-Minuten-Hänger verschwinden bei deterministischen Fehlern → max ~60s bis fail.
- Echte Provider-Outages haben weiterhin 1-2 Retries.
- Credits werden früher refundiert (nicht erst nach 4 fehlgeschlagenen Passes).
- Klare User-Feedback statt "irgendwas ist schiefgelaufen".

## Technische Notizen

- Keine DB-Migration nötig (`coords_source` existiert seit v98).
- Keine FROZEN-Invariants verletzt (serial chain bleibt).
- Backward-kompatibel: alte In-Flight-Rows ohne `coords_source` werden wie "heuristic" behandelt → fail-fast, kein Endlos-Loop.
- Risiko: bestehende Szenen mit `coords_source = null` würden beim ersten Advance failen statt zu retryen. Mitigation: Gate nur auf **neuen** Scenes aktivieren (`created_at > deployment_ts`) für 24h Übergangszeit.
