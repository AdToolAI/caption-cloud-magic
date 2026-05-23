## Befund

Wir haben **nicht** genug Information, um den richtigen Fix zu wählen. In der DB steht nur `sync_FAILED: An unknown error occurred.` — das ist unser eigener String, weil `pollSyncJob` in `poll-dialog-shots/index.ts:184` nur `data.error ?? undefined` ausliest und Sync.so dieses Feld bei FAILED häufig leer lässt. Die echten Diagnose-Felder (`errorMessage`, `error_type`, `failureReason`, evtl. nested `data.input[*].error`) werfen wir weg.

Ohne den echten Sync.so-Body raten wir zwischen mindestens vier Möglichkeiten:
1. **Concurrency-Limit** des Sync.so Creator-Plans ($19/mo).
2. **Window zu kurz** für `lipsync-2-pro` (Turn 1 ≈ 1.3s expandiert).
3. **`active_speaker_detection.coordinates`** außerhalb der Videogrenzen oder im falschen Format (Turn 1 coords=[1004,136] in 1376×768 — knapp am Rand, könnte ein Frame-spezifisches Issue sein).
4. **`segments_secs` + lipsync-2-pro** überhaupt nicht erlaubt (es gibt einen Fallback-Pfad, aber der greift nur bei 400 mit bestimmten Textstrings).

Jede Lösung wäre eine andere Code-Änderung. Erst Diagnose, dann gezielter Fix.

---

## Phase 1 — Reine Diagnose (jetzt, keine Verhaltensänderung)

### Änderung in `supabase/functions/poll-dialog-shots/index.ts`

**`pollSyncJob`** (Zeile 169-186):
- Bei Status FAILED/REJECTED/CANCELED den **kompletten Raw-Response-Body** loggen (`console.error('[poll-dialog-shots] sync.so FAILED body:', JSON.stringify(data).slice(0,1500))`).
- Den Fehler-String robust zusammenbauen aus `data.error ?? data.errorMessage ?? data.error_message ?? data.failureReason ?? data.failure_reason ?? data.message ?? JSON.stringify(data).slice(0,200)`.

**`startSyncTurnJob`** (Zeile 105-167):
- **Vor** dem Fetch den Request-Payload loggen (`console.log('[poll-dialog-shots] dispatch payload turn=…:', JSON.stringify(payload))`) — gekürzt auf 800 chars.
- **Nach** dem Fetch immer den Status loggen, auch bei OK, und bei !ok den Header `x-ratelimit-*` / `retry-after` mit ausgeben — falls Sync.so 429 oder Plan-Limits darüber signalisiert.

**Im Shot-Status** (Zeile 416-419) den jetzt verbesserten String in `shot.error` schreiben — UI bleibt dadurch automatisch aussagekräftiger.

Das ist **eine Datei**, ~25 Zeilen Diff, keine neue Logik, keine Migration, keine UI-Änderung, keine Performance-Auswirkung. Deploy → User triggert eine neue Dialog-Szene → wir lesen `supabase--edge_function_logs poll-dialog-shots`.

## Phase 2 — Gezielter Fix nach Diagnose

Erst wenn wir den echten Sync.so-Fehler kennen, entscheiden wir konkret:
- `concurrency exceeded` / `429` → Serial-Pool mit Limit 2.
- `video too short` / `duration` → Mindest-Windowlänge erzwingen + Pad-Strategie.
- `coordinates out of bounds` → Coords vor Dispatch clampen oder Auto-Detect-Fallback.
- `segments invalid` → Fallback ohne `segments_secs` immer aktiv.

Diesen Schritt **nicht jetzt** umsetzen — sondern nach einem reproduzierten Run mit Phase-1-Logs.

---

## Geänderte Dateien (Phase 1)
- `supabase/functions/poll-dialog-shots/index.ts` (nur Logging + besseres Error-Aggregat)

Keine DB-Migration, keine neue Edge-Function, keine UI-Änderung, kein Credit-Effekt.
