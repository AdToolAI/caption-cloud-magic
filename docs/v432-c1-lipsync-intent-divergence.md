# v432 C1 — Lip-Sync Intent: UI/DB-Divergenz geschlossen

Status: **IMPLEMENTED**
Scope-Grenze: keine Änderung an G3.2.2-, RS3-, Ledger- oder Gate-Semantik. Alle
Render-Gates lesen weiterhin ausschliesslich die DB (`isLipSyncIntentional()`).

## 1. Befund

Der Composer baute seinen State zuerst aus dem localStorage-Draft. Ein veralteter
Draft-Wert für `lipSyncWithVoiceover` / `dialogMode` / `engineOverride` konnte
daher „Lip-Sync AN" anzeigen, während die DB — die einzige Quelle der
Render-Gates — noch `false` hielt. Der Renderstart wurde still blockiert.

## 2. Vertrag

Implementiert in `src/lib/video-composer/lipSyncIntentDraft.ts`.

### 2.1 Tri-State
Ein Intent-Feld ist `resolved` (mit Wert) oder `unresolved`. `unresolved` wird
**nie** als OFF gerendert: Controls sind deaktiviert, Renderstart fail-closed.

### 2.2 Szenen-Provenienz (`scenePersistenceState`)

| Status | Bedeutung | Intent |
| --- | --- | --- |
| `local_new` | client-seitig erzeugt (`scene_…`), nie persistiert | resolved aus lokalem Wert |
| `db_known_unhydrated` | DB-Herkunft, in dieser Session nicht bestätigt | **unresolved** |
| `db_hydrated` | in **dieser** Session aus der DB gelesen/bestätigt | resolved aus DB-Wert |

`db_hydrated` ist session-gebunden: `loadDraft()` stuft beim Mount jeden
gespeicherten `db_hydrated` auf `db_known_unhydrated` zurück
(`downgradeHydratedOnMount`), bevor irgendein Intent aufgelöst wird.

### 2.3 Reconciliation der Dirty-Marker

Marker (`{ sceneId, field, desiredValue, mutationId, setAt }`) sind reine
Write-Recovery-Metadaten, keine zweite Wahrheit. Nach **jeder** erfolgreichen
Hydration (`reconcileIntentMarkers`):

| DB vs. `desiredValue` | Write in-flight | Ergebnis |
| --- | --- | --- |
| gleich | egal | `confirmed` — Marker gelöscht |
| verschieden | ja | `pending` — UI zeigt „ungespeichert" |
| verschieden | nein | `lost` — **DB gewinnt**, Marker gelöscht, Hinweis |

Ein Marker gewinnt nie unbegrenzt; Alter > 5 min zählt nie mehr als in-flight.

### 2.4 Legacy-Draft-Vertrag

`migrateLegacyDraft()` ist idempotent und wird vor jeder Auflösung ausgeführt.
Ein fehlender Herkunftsstatus bedeutet **niemals** `local_new`: Legacy-Szenen
werden konservativ `db_known_unhydrated` und verlieren ihre drei alten
Intent-Felder, bis die DB-Hydration sie liefert. Szenen mit explizitem Status
(auch `local_new`) werden nie reklassifiziert. Draft-Schemaversion: 2.

## 3. Writer-Audit

| Ort | Feld(er) | Klasse | Umsetzung |
| --- | --- | --- | --- |
| `SceneCard` Dialog-Mode-Toggle (~591) | dialogMode, lipSync, engineOverride | U | `beginIntentWrite` / `endIntentWrite` um den Update-Call |
| `SceneCard` Lip-Sync-Toggle (~2824) | lipSync, engineOverride, dialogMode | U | dito + Tri-State-Disable („…") |
| `SceneAvatarMode` Switch (~353) | lipSyncWithVoiceover | U | dito + `disabled` bei unresolved |
| `ClipsTab` `handleStartCinematicSync` | engineOverride | U | Marker um den Server-Start |
| `SceneCard` Reroll/Preview-Gates | — | R | nur Lesen, keine Dirty-Autorität |
| Hydration/Persistence-Hooks | alle | D / P | keine Marker, keine Dirty-Autorität |

`applyOptimisticResetMarkers()` löscht zusätzlich alle persistierten Marker der
Szene (`clearSceneIntentMarkers`) — der Server-Reset ist autoritativ.

## 4. Tests

`src/lib/video-composer/__tests__/lipSyncIntentDraft.test.ts` — 20 Tests, grün:

- DB=false + alter Cache=true → UI false; DB=true + alter Cache=false → UI true
- DB unbekannt → `unresolved` (nicht OFF)
- `engineOverride = null` bleibt legitimer persistierter Wert, kein `UNRESOLVED`
- `local_new` bleibt bedienbar, `db_known_unhydrated` bleibt gesperrt
- Marker: confirmed / pending / verwaist (DB gewinnt)
- Browser-Tod nach Write → Recovery über persistierten Marker
- Legacy-Migration: kein `local_new`, Intent-Felder verworfen, idempotent
- Mount-Downgrade `db_hydrated → db_known_unhydrated`
- `persistIntentWrite`: Rollback und Marker-Löschung bei fehlgeschlagenem Write

Regressions: `src/lib/video-composer` Suite 116/116 grün, inkl.
`lipSyncIntentGateParity`, `lipSyncIntent`, `lipsyncMasterProvider`.
`lipSyncIntentGateScanner` und `clientReaderContract5E` grün. Die übrigen
Fehlschläge der Gesamtsuite sind die bekannte Baseline (Social-Composer-Page,
DB-Schema-Integrationstests, Animations-Tests) und unberührt.
