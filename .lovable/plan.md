
## Ursache (verifiziert in den Edge-Logs der gerade fehlgeschlagenen Szene)

Pass 1 lief in `compose-dialog-segments`, BEVOR der Gemini-Anchor-Faces-Probe gecached war:

```
faceMap=none faces=0 ... coords=[[154,514],[307,514],[461,514],[614,514]] sources=[heuristic]
```

Das sind nicht echte Face-Coords, sondern der „Final safety fallback" (Z. 950–960):

```ts
speakerCoords[i] = [ width * t, height * 0.5 ];   // y = 514 auf 1028 px Plate
```

Auf einer Portrait-Plate (Köpfe sitzen bei y≈300) zeigt y=514 mitten auf Brust/Bauch — kein Gesicht da → Sync.so animiert nichts → **alle Münder zu**.

Pass 2–4 liefen dann via `isAdvance`-Webhook. Inzwischen war `faceMap=anchor/cache` mit korrekten Coords `[482,308] [295,309] [641,344] [161,325]` vorhanden — aber die Advance-Branch (Z. 1485–1503) klont nur `prevState.passes` und überschreibt `pass.coords` NIE mit den frisch berechneten `speakerCoords`. Die fehlerhaften Heuristik-Coords aus Pass 1 wurden also durch alle 4 Pässe geschleift.

Das ist eine ältere Race-Condition, die durch das Multi-Speaker-Setup jetzt zuverlässig getriggert wird. v86 ist nicht beteiligt — die neuen Guards feuern korrekt nicht.

## Plan (Datei: `supabase/functions/compose-dialog-segments/index.ts`, keine UI-Änderung)

### 1. Heuristik-Fallback ist kein gültiges Dispatch-Ziel mehr
- Nach dem `speakerCoords`-Aufbau ein neues Flag setzen: `coordsAreHeuristicOnly = coordSources.every(s => s === "none" || s === "heuristic")`.
- Wenn `!isAdvance && !isRetry && speakers.length >= 2 && coordsAreHeuristicOnly`: KEIN Dispatch. Stattdessen Wallet-Refund + Scene auf `lip_sync_status='pending'` (NICHT `failed`) + `clip_error='awaiting_face_detection_retry'`. Auto-Trigger bzw. `useTwoShotAutoTrigger` greift im nächsten Tick neu, sobald Gemini-Anchor-Faces gecached sind.
- Erst nach >3 aufeinanderfolgenden „awaiting"-Zyklen (`scene.meta.face_detect_retry_count >= 3`) hart auf `failed` mit `clip_error='no_face_map_after_3_retries'`. Verhindert Endlos-Loop ohne Geld zu verlieren.

### 2. Advance-Branch refreshed Coords statt sie zu zementieren
- In der `isAdvance`-Branch (Z. 1485–1503): nachdem `passes = prevState.passes.map(...)`, für jeden Pass `pass.coords` mit `speakerCoords[pass.speaker_idx]` überschreiben — **außer** `coordSources[pass.speaker_idx]` ist `none`/`heuristic` UND die alten Coords sind „besser" (nicht-heuristisch). Konkret:
  - Wenn frische Coords aus `plate-identity`/`plate-slot-fallback`/`identity` kommen → immer übernehmen.
  - Wenn frische Coords aus `heuristic`/`none` kommen → alte behalten.
- Selbe Refresh-Logik für die `isRetry`-Branch (Z. 1504–1510).
- Logzeile `[compose-dialog-segments] scene=… ADVANCE COORDS REFRESH pass=N old=… new=… source=…` für Sichtbarkeit.

### 3. Sanity-Guard direkt vor jedem `startSyncTurnJob`/Dispatch
Defensive zweite Linie, falls (1) oder (2) jemals umgangen werden:
- Wenn `coordSources[pass.speaker_idx] === 'heuristic'` AND `speakers.length >= 2` → kein Dispatch, sondern `prepareShotRetry('coords_heuristic_unverified')` (Auto-Retry, kein Geld weg).

### 4. Klein-Telemetry
- `composer_scenes.meta.face_detect_retry_count` incrementieren beim awaiting-Refund, auf 0 zurücksetzen bei erfolgreichem Dispatch mit nicht-heuristischen Coords.
- Ein `syncso_dispatch_log`-Row mit `sync_status='HEURISTIC_BLOCKED'` + `error_class='coords_heuristic_unverified'` (über bestehende `logSyncDispatch`-Helper aus `_shared/syncso-preflight.ts`).

### 5. Memory
- Neue Datei `mem://architecture/lipsync/v87-coords-refresh-and-heuristic-block.md` mit Root-Cause + Refresh-Regel.
- Index-Eintrag.

## Out of scope
- Keine Änderungen an v86 Speaker-Dedup-Logik — die ist korrekt und greift hier nicht.
- Keine Sync.so-Ladder/`coords-pro`/`bbox-url-pro`-Änderungen.
- Keine Änderungen an `compose-twoshot-audio`.
- Keine UI-Änderungen.
- Keine Plate-Identity-Refactor (`resolvePlateFaceIdentities`) — die Funktion bleibt wie sie ist; wir tolerieren ihr Fehlen jetzt nur sauber (refund + retry statt blinder Heuristik).

## Test-Matrix
1. Frischer 4-Speaker-Dialog, Anchor-Faces noch nicht gecached → erster Aufruf gibt 200 + `awaiting_face_detection_retry`, Wallet unverändert, Szene bleibt `pending`. Auto-Trigger feuert erneut → dispatched mit echten Coords. ✅
2. 4-Speaker-Dialog, Anchor-Faces vorhanden, aber Plate-Identity off → identity/anchor-rescale-Coords werden verwendet, Dispatch läuft, Lippen bewegen sich (Soft-Pass-Pfad bleibt aktiv). ✅
3. 2-Speaker-Dialog, faceMap none → blockt + retry, kein y=360-Heuristik-Dispatch mehr. ✅
4. Advance-Branch: Pass 1 lief mit identity-Coords [482,308], dann läuft Plate-Identity später erfolgreich → Pass 2 wird mit aktualisierten plate-identity-Coords dispatched. ✅
5. 3+ verzögertes Probing schlägt 3× hintereinander fehl → Szene wird auf `failed` mit klarer Fehlermeldung gesetzt, statt unendlich zu pending. ✅
