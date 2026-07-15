
# Root-Cause-Fix: Speaker Voice Swap (v242 — ID-First + Assignment-Lock)

## Ziel
Sprecher-Stimmen-Swaps in Multi-Speaker-Szenen (2×2, 1×4, 3+1) architektonisch ausschließen — sowohl der aktuelle Bug in Szene `53976949-...` als auch die gesamte Fehlerklasse für zukünftige Renders.

## Root Cause Recap
`compose-dialog-segments/index.ts` (L.1515–1577) überschreibt Live-Gemini-Identity mit positional-indexierten Persisted-Snapshots. Bei 2×2-Layouts divergieren Skript-Index (Row-Major) und Face-Slot-Index (X-only sortiert) → Swap wird über Rerenders "eingefroren".

## Änderungen — 4 Ebenen

### Ebene 1 — ID-basierte Rehydration
`supabase/functions/compose-dialog-segments/index.ts`
- Rehydration-Loop refactorn: `persistedFaces[]` per `characterId` in Live-Identity-Map matchen.
- Wenn ID vorhanden → Mouth-Box dem korrekten Character-Slot zuweisen, unabhängig von Positional-Index.
- Wenn ID fehlt → Ebene 3 Fallback.

### Ebene 2 — Consistency Check
- Wenn persistierte BBox >50px (Manhattan-Distance) vom aktuell detektierten Face abweicht → Persisted verwerfen, Live-Detection erzwingen. Loggt `[rehydrate] geometry-drift-detected`.

### Ebene 3 — Row-Major Fallback
`supabase/functions/_shared/plate-face-detect.ts`
- Neue Utility `sortFacesRowMajor(faces, expectedCount)`: gruppiert nach Y-Zentrum in Reihen, sortiert innerhalb der Reihe nach X. Ersetzt X-only-Sortierung für alle Grid-Layouts ≥ 2×2.

### Ebene 4 — Character-Assignment-Lock (neu)
**Zweck**: Nach dem ersten erfolgreichen Render ist die Zuordnung `{slotIndex → characterId}` deterministisch gelockt. Auch bei Low-Confidence-Gemini-Runs (<0.6) oder Detection-Ausfällen bleibt die Zuordnung stabil.

**Schema-Änderung** (Migration):
- Tabelle `dialog_shots`: neue Spalte `assignment_lock` JSONB — Format `{ "0": "<characterId>", "1": "<characterId>", ... }`.
- Wird beim ersten Render mit Confidence ≥0.6 geschrieben; nachfolgende Renders lesen zuerst den Lock.

**Runtime-Logik** in `compose-dialog-segments`:
1. **Read**: Beim Start `assignment_lock` laden → wenn vorhanden, ist es Ground Truth.
2. **Enforce**: Live-Detection + Persisted werden gegen Lock verifiziert. Bei Konflikt → Lock gewinnt, Detection wird rearrangiert.
3. **Write**: Bei erstem Render mit stabiler Gemini-Zuordnung wird der Lock gespeichert.
4. **Invalidate**: Manueller "Recompute Cast"-Button in der Scene-Toolbar (bereits vorhanden) leert den Lock.

## Datenreparatur (einmalig)
- Szene `53976949-407d-46c8-92ed-776a8230476d`: `dialog_shots.plate_identity` UND (neu) `assignment_lock` leeren, damit die nächste Render-Instanz mit sauberem State läuft.

## Verifikation
1. Szene `53976949-...` rerender → Sprecher 2/3 sprechen korrektes Skript.
2. Neuen Rerender starten → Logs zeigen `[assignment-lock] loaded, 4 slots` statt Detection-Path.
3. Regression-Suite: 1-, 2-, 3-, 4-Sprecher-Szenen; sowohl Rerender als auch Erst-Render.
4. Edge Case: Szene mit gelöschtem `assignment_lock` → System schreibt Lock neu.

## Technische Details
- Reihenfolge nach Fix: **Lock → Live Gemini → Persisted (ID-Match) → Row-Major Positional Fallback**.
- Keine Auswirkung auf Kosten oder Credit-Abrechnung (bereits durch `countSceneSpeakers.ts` deduped).
- Migration ist additiv (nullable Spalte); alte Szenen ohne Lock laufen weiter über Ebene 1–3.
- Lock-Confidence-Threshold (0.6) ist als Konstante konfigurierbar in `_shared/faceGate.ts`.

## Was danach architektonisch ausgeschlossen ist
- Positional Drift bei Rerenders (Ebene 1 + 4)
- Layout-Sortier-Bugs bei 2×N Grids (Ebene 3)
- Geometry-Drift nach neuem Plate-Zuschnitt (Ebene 2)
- Low-Confidence-Gemini-Detection-Flips (Ebene 4)
