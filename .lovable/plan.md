## Diagnose

Die Konsolen-Logs zeigen zwei zusammenhängende Symptome:

1. `WebSocket connection … failed` / `WebSocket is closed before the connection is established` — die Supabase-Realtime-Verbindung kommt hinter der Custom-Domain `useadtool.ai` nicht sauber zustande.
2. `[Preview] standby budget exceeded — hard advancing` — der Sequence-Player wartet auf einen Clip, der lokal noch nicht existiert, obwohl er in der DB längst fertig ist.

Das Zusammenspiel ist der eigentliche Bug:

- `VideoComposerDashboard.tsx` refetcht Szenen **ausschließlich** über die Realtime-Subscription `useComposerScenesRealtime` (`src/hooks/useComposerCollaboration.ts:100`).
- Fällt die WS-Verbindung aus, feuert `postgres_changes` **nie** → `refetchScenesFromDb` wird nach „Neu generieren" nicht aufgerufen → `scene.clipUrl` bleibt lokal `undefined` → Preview zeigt Schwarz, obwohl `composer_scenes.clip_url` in der DB gesetzt ist.

Der `applyCastToPrompt`-UUID-Warn-Log ist ein separater, unschädlicher Repair-Pfad (Cast-Slot ohne UUID-Treffer wird per Namen aufgelöst) und **nicht** die Ursache des schwarzen Bildes — den fassen wir in diesem Fix nicht an.

## Warum das die sauberste Lösung ist

- **Ein einziger Ort:** Der Refetch-Trigger liegt heute schon zentral in `useComposerScenesRealtime`. Ergänzen wir dort das Fallback, profitiert jeder Consumer (Dashboard, Clips, Preview, Co-Editor) automatisch.
- **Kein neuer State, keine neuen Verträge:** Wir nutzen den bereits vorhandenen, idempotenten `refetchScenesFromDb` — kein Duplizieren von Merge-Logik.
- **Realtime bleibt Primary:** WS wird nicht ersetzt, sondern durch ein defensives Poll-Netz abgesichert. Sobald WS wieder sauber läuft (z. B. anderer Origin), fällt die Frequenz automatisch auf 15 s.
- **Kosten sind vernachlässigbar:** Ein indexed `SELECT * FROM composer_scenes WHERE project_id = $1` pro Poll-Tick, nur solange das Dashboard offen ist.

## Fix (v247 — Realtime-Polling-Fallback)

**Datei:** `src/hooks/useComposerCollaboration.ts`, Funktion `useComposerScenesRealtime`

- Realtime-Subscription auf `composer_scenes` bleibt bestehen (schneller Pfad, wenn WS funktioniert).
- Zusätzlich wird ein **leichtgewichtiges Polling** aktiviert, das `onScenesChange()` in festem Intervall aufruft:
  - `8_000 ms`, solange die Subscription nicht `SUBSCRIBED` gemeldet hat (WS defekt / im Aufbau).
  - `15_000 ms`, sobald `SUBSCRIBED` aktiv ist (nur als Safety-Net gegen verlorene Events).
- `clearInterval` + `removeChannel` beim Unmount, damit kein Leak beim Tab-Wechsel entsteht.

## Erwartetes Verhalten nach Fix

- „Neu generieren" beendet Rendering → spätestens ~8 s nach DB-Update wird `clip_url` in den lokalen State gemergt → Preview zeigt das Video statt Schwarz, auch wenn WS auf `useadtool.ai` weiterhin scheitert.
- Der `standby budget exceeded`-Log verschwindet als Folge, sobald der Player die korrekte URL sieht.

## Nicht Teil dieses Fixes

- `applyCastToPrompt` no-UUID-Warnungen (kosmetisch, kein Rendering-Impact).
- `check-subscription` 400 (separater Auth/Billing-Endpoint, kein Zusammenhang mit dem Preview-Blackout).

Beides tracke ich separat, sobald du grünes Licht gibst.
