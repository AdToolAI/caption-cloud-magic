# Pre-Flight Gate Tuning: plate-slot-fallback erlauben

## Was passiert ist

Edge-Log zeigt: Pass 0 Samuel — `coords_source=plate-slot-fallback` `coords=[158,226]` → Gate blockiert sofort mit `coords_not_verified`, voller Refund, Szene `failed`.

**Das war zu streng.** `plate-slot-fallback` ist NICHT dasselbe wie `heuristic`:

| Source | Bedeutung | Coords zeigen auf… |
|---|---|---|
| `plate-identity` | Gemini hat Face → Character matched | ✅ richtiges Gesicht |
| `plate-slot-fallback` | Faces auf Plate detected, aber per Slot-Order zugeordnet | ✅ echtes Gesicht (evtl. falscher Sprecher) |
| `anchor-rescale` / `identity` | Anchor-Faces auf Plate skaliert | ⚠️ kann driften |
| `heuristic` / `none` | Reines Center-Grid | ❌ kein Gesicht |

Bei `plate-slot-fallback` zeigt der Koordinatenpunkt auf ein **echtes Gesicht im Plate** — Sync.so hat eine reelle Chance zu animieren. Im schlimmsten Fall bewegt sich der falsche Mund (Sprecher-Mismatch), aber kein leerer Sync.so-Call.

## Ursache der Verwirrung

Der Sarah-Bug (`[610,291]` mit Face bei `[595,251]`) sah aus wie "Slot-Fallback kaputt", war aber etwas anderes: die **Advance-Refresh-Stage** hat eine bereits Face-Gate-reparierte Pass-Coord mit frischen Slot-Fallback-Coords überschrieben. Diesen Bug haben wir bereits mit der **Coord-Order-Fix** behoben (Face-Gate-Lock-In). Der zusätzliche v99-Pre-Flight-Gate für `plate-slot-fallback` war Overkill.

## Plan

### 1. Block-Liste in v99 Pre-Flight verengen (`compose-dialog-segments` ~L1981)

Nur noch hart blocken bei wirklich gesichtslosen Coords:
- **Block:** `null`, `"none"`, `"heuristic"`, `"anchor-rescale"` (ohne Face-Gate-Verifikation), `"identity"` (ohne Face-Gate)
- **Erlaubt:** `"plate-identity"`, `"plate-slot-fallback"`, `"face_gate_repair_*"`, `"face_repair"`, `"plate_identity_verified"`, `"bbox-url-pro"`

Begründung: alles aus der Plate-Identity-Pipeline (auch Slot-Fallback) hat reale Face-Koordinaten — Sync.so darf das verarbeiten.

### 2. Reaktiver Fail-Fast bei Provider-Error mit Slot-Fallback

In der Sync.so-Error-Handler-Stage (`sync-so-webhook` FAILED-Branch + retry-Ladder):
- Wenn `error_class === "provider_unknown_error"` **UND** `pass.coords_source === "plate-slot-fallback"` → **0 Retries**, sofort Pass-Fail mit klarem Error: `slot_fallback_rejected_by_provider` (Hinweis: "Plate-Identity konnte Sprecher nicht eindeutig zuordnen, Sync.so hat die Position abgelehnt — bitte Plate neu rendern").
- Alle anderen `provider_unknown_error` mit verifizierten Coords → normaler Retry (1×) wie bisher.

Damit fangen wir den echten Failure-Case (Sarah-artig) reaktiv ab, statt präventiv alle Slot-Fallbacks zu killen.

### 3. UI-Toast verfeinern (`DialogScenePill` / Composer)

- Bei `coords_not_verified` (jetzt seltener): "Gesichts­erkennung konnte keine Sprecher-Positionen verifizieren — bitte Szene neu rendern."
- Bei `slot_fallback_rejected_by_provider`: "Sync.so hat die Sprecher-Position abgelehnt (Slot-Fallback) — bitte Plate neu generieren für saubere Identity-Map."

### 4. Telemetrie

- `coord_gate_blocked` Event behalten, aber zusätzlich `reactive_slot_fallback_fail` Event mit `pass_idx`, `coords`, `coords_source`.

## Out of Scope

- Coord-Order Fix (Face-Gate Lock-In) bleibt unverändert — der war korrekt.
- v87 Heuristic-Retry-3× bleibt unverändert.
- Sync.so-Pass-Reihenfolge (seriell) bleibt FROZEN.

## Erwarteter Effekt

- Aktuelle Szene mit `plate-slot-fallback` würde wieder dispatchen → Sync.so-Lipsync läuft.
- Wenn Sync.so tatsächlich rejectet → 1 Pass à ~60s Fail-Fast (kein 11-Min-Hänger).
- Nur reine Grid-Fallbacks ohne jegliche Face-Detection werden noch präventiv blockiert.

## Technische Notizen

- Keine DB-Migration nötig.
- Backward-kompatibel: bestehende `failed`-Szenen mit `coords_not_verified` bleiben, neue Runs gehen durch.
- Risiko: wenn Plate-Identity systematisch falsche Slots liefert, könnten Sprecher-Münder vertauscht sein. Mitigation = der reaktive Fail-Fast in (2) plus klare UI-Message in (3).
