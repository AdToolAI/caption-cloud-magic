# v430 — Schritt 5D: Backend-Reader auf `pipeline_state` migrieren

Zusätzlich vorab die zwei Regressionspunkte aus dem 5B-Abschluss. Kein 5E in dieser Phase.

## Teil 0 — Regressionen aus 5B schließen

1. **Auto-Director-Regressionstest**: Test, der festnagelt, dass ein neu eingefügter Auto-Director-Scene-Insert `pipeline_state = 'plate_queued'` **und** `clip_status = 'queued'` trägt (nie `pending`). Umgesetzt als Contract-Test über die Bridge-Mapping-Tabelle (`composer_state_from_legacy` / Forward-Mapping) plus ein Quell-Scan-Test auf `auto-director-compose`, der das Insert-Paar prüft.
2. **Deno-Test sichtbar machen**: `supabase/functions/_shared/scene-state-write-contract.test.ts` einmal mit `deno test` ausführen (Vitest kann die https-Imports nicht laden) und das Kommando als npm-Script `test:deno-functions` hinterlegen, damit der blinde Fleck dokumentiert und wiederholbar ist. Ergebnis wird im Abschlussbericht genannt.

## Teil 1 — Reader-Inventar (Ergebnis der Analyse)

Zu migrieren (kein Lip-Sync-Substage-Wissen nötig):

| Datei | Heutiger Legacy-Read | Ziel |
|---|---|---|
| `compose-video-assemble/index.ts:150,164` | `clip_status === 'ready'` als Gate + Fehlertext | `isRealizedState(sceneState(s))`, Text aus `sceneState()` |
| `compose-stitch-and-handoff/index.ts:87-88` | Zählt `ready` / `failed` | `sceneState()` + `isRealizedState` / `isTerminalFailure` |
| `compose-clip-webhook/index.ts:495,712-722` | Projekt-Fortschritt über `clip_status` | `pipeline_state`-Filter bzw. `sceneState()` |
| `compose-video-clips/index.ts:1804-1810` | `clip_status` als Vor-Render-Guard | `sceneState()` |
| `modelark-poll/index.ts:114` | `.eq('clip_status','generating')` | `.in('pipeline_state', ['plate_rendering'])` mit Legacy-OR-Fallback für Altzeilen |
| `composer-cancel-scene/index.ts:86` | `LIVE_CLIP.has(clip_status)` | `sceneState()`-basierte Live-Prüfung; Lip-Sync-Zweig (Z. 87) bleibt Legacy |
| `composer-cancel-project/index.ts:128-135` | `clip_status` / `lip_sync_status` | Clip-Zweig auf `sceneState()`; Lip-Sync-Zweig bleibt Legacy |

Explizite Legacy-Ausnahmen (bleiben unverändert, werden nur kommentiert und in der Allowlist geführt):

`lipsync-watchdog`, `compose-dialog-segments`, `compose-twoshot-audio`, `cancel-dialog-lipsync`, `sync-so-webhook`, `remotion-webhook`, `reset-lipsync-scene`, `report-lipsync-motion-probe`, `lipsync-selftest`, `composer-reset-selftest`, `_shared/scene-hard-reset.ts`, `_shared/scene-run-begin.ts`, `_shared/lipsync-fail.ts`, `_shared/autopilotComposerBridge.ts:356`, `compose-clip-webhook/index.ts:406-431`, `compose-video-clips/index.ts:5212`.

## Teil 2 — Regeln der Migration

- Nur Lesepfade. Keine Writer, keine Zustandssemantik, keine Lip-Sync-Logik ändern.
- Jeder migrierte Reader nutzt ausschließlich `sceneState()` / `sceneSubstate()` aus `_shared/scene-state.ts`.
- Da die Reverse-Bridge global aktiv bleibt, ist `pipeline_state` für Altzeilen bereits befüllt; wo direkt in SQL gefiltert wird (`modelark-poll`), bleibt ein Legacy-OR-Zweig als Sicherheitsnetz.
- Verhalten muss 1:1 identisch bleiben — Abweichungen gelten als Bug, nicht als Verbesserung.

## Teil 3 — Tests

- Neue Reader-Contract-Tests: für jeden migrierten Reader ein Fixture-Paar (Legacy-only-Zeile vs. neue Zeile) mit identischem Resultat.
- Erweiterung des Allowlist-Scanners um eine **Reader**-Liste: neue direkte Legacy-Reads außerhalb der Ausnahmeliste lassen den Test fehlschlagen.
- `bunx vitest run src/lib/composer/__tests__`, `bunx tsgo`, `deno test` für die Funktions-Verträge.

## Teil 4 — Deployment und Stopp

Deploy der berührten Funktionen: `compose-video-assemble`, `compose-stitch-and-handoff`, `compose-clip-webhook`, `compose-video-clips`, `modelark-poll`, `composer-cancel-scene`, `composer-cancel-project`. Danach Abschlussbericht mit Vorher/Nachher-Reader-Inventar und **STOP**. 5E folgt als eigene Phase.
