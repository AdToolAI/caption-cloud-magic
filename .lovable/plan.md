# G1-Abnahme: die drei offenen Nachweise

Ehrlicher Stand vorab, damit nichts abgenommen wird, was nicht belegt ist:

1. **DB-/Edge-Smoke des Vollreset-Pfads: bislang NICHT gefahren.** Der letzte DB-Smoke (B1–B4) betraf `compose-video-clips:failed`, nicht `composer_reset_lipsync_full`. Kein einziges der sieben Kriterien ist heute belegt.
2. **Optimistischer Client-Rollback: es gibt eine echte Lücke** (siehe unten) — genau das von dir befürchtete „DB rollbackt, React hängt in ‚Lip-Sync aus‘".
3. **Testlage: bislang nur isolierte Tests.** Die vollständige Composer-/Lip-Sync-Frozen-Suite lief seit dem SceneCard-Umbau nicht.

---

## 1. Vollreset-Smoke (nachzuholen)

Read-only-Vorbereitung, dann ein Smoke auf einer Wegwerf-Szene eines Testkontos, je Fall Vorher-/Nachher-Snapshot von `composer_scenes` (`pipeline_state`, `pipeline_substate`, `plate_generation`, `base_video_url`, `processed_video_url`, `clip_url`, `lip_sync_applied_at`, `dialog_shots`, `audio_plan`), `credit_reservations` und `credit_transactions`:

| Fall | Erwartung |
|---|---|
| Lip-Sync läuft | Base restauriert, `processed_video_url = NULL`, `plate_generation +1` |
| bereits angewandt | Base restauriert, kein Refund, Generation +1 |
| `expected_generation` veraltet | `stale_reset` (409), **null** DB-Writes (Snapshot byte-identisch) |
| kein `base_video_url` und kein Legacy-Fallback | `no_base_plate` (422), fail closed: **kein einziges Feld mutiert**, `plate_generation` explizit unverändert |
| Callback mit alter Generation nach Reset | vom Callback-Guard abgewiesen, keine Szenenmutation |
| Credits | `credit_reservations` + `credit_transactions` vorher/nachher identisch |
| `audio_plan.twoshot` | genau die 13 Runtime-Keys weg, Planungs-Keys unverändert |

Ergebnis wird als Smoke-Tabelle in `docs/v431-g1-report.md` protokolliert.

## 2. Client-Rollback: Ist-Stand und notwendiger Fix

Optimistisch gesetzt werden in beiden Buttons (`SceneCard.tsx`) genau diese Felder:
`lipSyncStatus="canceled"`, `lipSyncAppliedAt=null`, `lipSyncSourceClipUrl=null`, `clipUrl=baseVideoUrl ?? clipUrl`, `processedVideoUrl=null`, `twoshotStage=null`, `dialogShots=null`, `lipSyncWithVoiceover=false`, `dialogMode=false`, `engineOverride="auto"`, `clipError="lipsync_(reset|canceled)_by_user"`, `replicatePredictionId=null`.

Alle zwölf werden im `catch` aus dem Vorher-Snapshot vollständig zurückgesetzt — Output (`clipUrl`/`processedVideoUrl`), Intent (`lipSyncWithVoiceover`, `dialogMode`) und Status/Badge-Quellen (`lipSyncStatus`, `twoshotStage`, `lipSyncAppliedAt`) inklusive.

**Lücke:** die drei Pending-Marker davor werden nicht mit zurückgerollt:
`markLipSyncPending(id,false)`, `markDialogModePending(id,false)`, `markEngineOverridePending(id,"auto")`.
Diese Marker überschreiben in der Präsentationsschicht den Szenenwert, d.h. nach einem Serverfehler zeigt die Karte weiter „Lip-Sync aus / Engine auto", obwohl DB und Szenen-Objekt korrekt zurückgerollt sind. Genau das von dir beschriebene Hängenbleiben.

Fix: im `catch` beider Handler die Marker auf die Snapshot-Werte zurücksetzen (`markLipSyncPending(id, prevLipSyncWithVoiceover)`, `markDialogModePending(id, prevDialogMode)`, `markEngineOverridePending(id, prevEngineOverride ?? "auto")`), plus ein Regressionstest in `sceneCardPresentation.test.ts`, der nach simuliertem Serverfehler den vollständigen Vorher-Zustand inkl. Pending-Marker einfordert.

Zusätzlich: bei `stale_reset` ist Rollback allein nicht korrekt — der Serverzustand ist neuer als der Client. Dort nach dem Rollback ein Refetch der Szene auslösen statt den alten Snapshot als Wahrheit stehen zu lassen.

## 3. Finale G1-Teststufe

Vollständiger Lauf statt Einzeltests:
- gesamte `src/lib/composer/__tests__/`-Suite, insbesondere `lipsyncFrozenContract`, `sceneStateClientContract`, `clientReaderContract5E`, `legacyWriterAllowlist`, `legacyReadyParity5D`, `sceneCardPresentation`, `sceneActionAvailability`, `forceCinematicSyncRouting`, `v427*`
- `tsgo`
- Ergebnis (Zahlen, keine Behauptung) in `docs/v431-g1-report.md`

## Reihenfolge

1. Rollback-Fix + Regressionstest (Punkt 2)
2. Volle Suite + tsgo (Punkt 3)
3. Vollreset-Smoke gegen die Datenbank (Punkt 1), Protokoll in den G1-Bericht
4. STOP mit PASS/FAIL je Kriterium — G1-Abnahme erst danach
