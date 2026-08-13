# v430 — Schritt 5D: Backend-Reader auf `pipeline_state` migrieren

Vorab: die drei geforderten Klärungen, gemessen am aktuellen Codestand. Danach der eigentliche 5D-Plan.

## Klärung 1 — Writer-Status `remotion-webhook` und `generate-talking-head`

**Antwort: Beide wurden in 5B NICHT dualisiert. Sie sind auch nicht bewusst allowlistet — sie sind durch eine Lücke im Scanner gefallen.**

Aktueller Codestand:

- `generate-talking-head/index.ts` schreibt an vier Stellen ausschließlich Legacy: Zeile 466 `clip_status: 'ready'`, 509 `clip_status: 'failed'`, 645 `clip_status: 'generating'`, 692 `clip_status: 'failed'`. Kein `pipeline_state`, kein `composer_scene_transition()`.
- `remotion-webhook/index.ts` Zeile 288 schreibt `clip_status: 'ready'`, `lip_sync_status: 'done'`, `twoshot_stage: 'done'` — ebenfalls ohne `pipeline_state`.
- Beide stehen **weder** in `LIP_SYNC_LEGACY_ONLY` **noch** in `KNOWN_NON_LIP_SYNC_LEGACY_ONLY`. Im Kommentar über der zweiten Liste sind sie noch als 5B-Ziele genannt, die Listeneinträge wurden aber beim Abschluss von 5B entfernt.
- Der Test schlägt trotzdem nicht fehl, weil der Scanner `materializeCompatibilityOutput(...)` als legitimen Dual-Write akzeptiert. Beide Dateien rufen diesen Helper auf — er schreibt jedoch nachweislich nur `base_video_url` / `processed_video_url` / `clip_url` und **kein** `pipeline_state`. Damit gilt: Scanner-Fehlalarm-Freiheit ist falsch positiv.

Konsequenz für die Umsetzung (Teil 0 unten):
- Scanner-Regel korrigieren: `materializeCompatibilityOutput()` zählt als Output-Writer, nicht als State-Dual-Write.
- `generate-talking-head` wird nachträglich dualisiert (`plate_rendering` / `plate_ready` / `failed`) — reiner Nicht-Lip-Sync-Pfad.
- `remotion-webhook` Zeile 288 ist Lip-Sync-Fan-in-Finalisierung und gehört damit unter den v400-Freeze: **keine Dualisierung**, sondern expliziter Eintrag in `LIP_SYNC_LEGACY_ONLY` mit Begründung. Die Reverse-Bridge leitet dort korrekt `complete` ab.

## Klärung 2 — `modelark-poll`: kein Legacy-OR-Fallback

**Antwort: Ein Runtime-Fallback ist nicht nötig; der Reader liest nur `pipeline_state`.**

Belegt an der Datenbank:
- `composer_scenes.pipeline_state` ist `NOT NULL` mit Default `'idle'`.
- Der Bridge-Trigger `trg_composer_scene_state_bridge` läuft `BEFORE INSERT OR UPDATE`. Beim Insert wird `pipeline_state` aus den Legacy-Spalten abgeleitet, sobald es auf dem Default steht. Ein Insert-/Importpfad, der eine Szene ohne gültiges `pipeline_state` erzeugen könnte, existiert damit nicht.

Also: `modelark-poll` filtert künftig `.eq('pipeline_state','plate_rendering')`, ohne OR-Zweig. Der frühere Formulierungsvorschlag mit Legacy-OR entfällt ersatzlos.

## Klärung 3 — Legacy-Parität von `clip_status = 'ready'`

Aus der Vorwärtsrichtung der Bridge ergibt sich exakt diese Zustandsmenge, die `clip_status = 'ready'` erzeugt:

```text
plate_ready, audio_prep, audio_ready,
lipsync_dispatched, lipsync_running, lipsync_muxing,
complete
```

Zusätzlich bleibt bei `failed` mit vorhandener `clip_url` der alte `clip_status` stehen — eine gescheiterte Szene mit gültiger Platte kann daher weiterhin `ready` tragen.

`isRealizedState()` bildet diese Menge **nicht** identisch ab. Deshalb gilt für 5D verbindlich:

- Es wird ein Prädikat `legacyClipReadyEquivalent(scene)` eingeführt, das **Hauptzustand und effektive Output-Existenz** auswertet (Signatur: `legacyClipReadyEquivalent({ state, hasEffectiveOutput })`, abgeleitet über `sceneState(row)` und `resolveSceneOutput(row).effectiveUrl`). Vertrag: die sieben Zustände oben → ready; zusätzlich `failed` **mit** vorhandenem gültigem Output → ebenfalls Legacy-ready. Ein reiner Zustands-Lookup wäre unvollständig und ist untersagt.
- `isRealizedState()` wird nur dort eingesetzt, wo ein Paritätstest über eine Fixture-Matrix aller 12 Zustände × `clip_url` vorhanden/leer beweist, dass beide Ausdrücke dieselbe Menge liefern.
- Betroffen und einzeln nachzuweisen: `compose-video-assemble` (Z. 150/164), `compose-stitch-and-handoff` (Z. 87-88), `compose-clip-webhook` Projektfortschritt (Z. 495, 712-722).
- Der `failed`-Sonderfall mit vorhandener `clip_url` wird als eigener Testfall geführt.

---

## Teil 0 — Vorarbeiten (aus 5B nachgezogen)

1. Scanner-Fix: `materializeCompatibilityOutput()` gilt nicht mehr als State-Dual-Write.
2. `generate-talking-head` dualisieren (4 Schreibstellen).
3. `remotion-webhook` mit Begründung in `LIP_SYNC_LEGACY_ONLY` aufnehmen.
4. Auto-Director-Regressionstest: Insert trägt `pipeline_state = 'plate_queued'` **und** `clip_status = 'queued'`.
5. `deno test` für `_shared/scene-state-write-contract.test.ts` einmal ausführen und als Script `test:deno-functions` hinterlegen.

## Teil 1 — Zu migrierende Reader

| Datei | Heutiger Legacy-Read | Ziel |
|---|---|---|
| `compose-video-assemble:150,164` | `clip_status === 'ready'` | `legacyClipReadyEquivalent(s)` (Zustand + Output) |
| `compose-stitch-and-handoff:87-88` | zählt `ready` / `failed` | `legacyClipReadyEquivalent(s)` / `sceneState(s) === 'failed'` |
| `compose-clip-webhook:495,712-722` | Projektfortschritt | dito, SQL-Filter auf `pipeline_state` |
| `compose-video-clips:1804-1810` | `clip_status`-Guard | `sceneState()` |
| `modelark-poll:114` | `.eq('clip_status','generating')` | `.eq('pipeline_state','plate_rendering')` |
| `composer-cancel-scene:86` | `LIVE_CLIP.has(clip_status)` | `sceneState()`; Lip-Sync-Zweig bleibt Legacy |
| `composer-cancel-project:128-135` | `clip_status` / `lip_sync_status` | Clip-Zweig auf `sceneState()`; Lip-Sync-Zweig bleibt Legacy |

Explizite Legacy-Ausnahmen (unverändert, nur kommentiert): `lipsync-watchdog`, `compose-dialog-segments`, `compose-twoshot-audio`, `cancel-dialog-lipsync`, `sync-so-webhook`, `remotion-webhook`, `reset-lipsync-scene`, `report-lipsync-motion-probe`, `lipsync-selftest`, `composer-reset-selftest`, `_shared/scene-hard-reset.ts`, `_shared/scene-run-begin.ts`, `_shared/lipsync-fail.ts`, `_shared/autopilotComposerBridge.ts:356`, `compose-clip-webhook:406-431`, `compose-video-clips:5212`.

## Teil 2 — Regeln

- Nur Lesepfade; keine Zustandssemantik, keine Lip-Sync-Logik ändern.
- Verhalten 1:1 identisch; jede Abweichung ist ein Bug, keine Verbesserung.
- Reader lesen ausschließlich über `sceneState()` / `sceneSubstate()`.

## Teil 3 — Tests

- Paritätstests je migriertem Reader über die volle Zustandsmatrix.
- Reader-Allowlist im Scanner: neue direkte Legacy-Reads außerhalb der Ausnahmen lassen den Test fehlschlagen.
- `bunx vitest run src/lib/composer/__tests__`, `bunx tsgo`, `deno test`.

## Teil 4 — Deploy und Stopp

Deploy: `compose-video-assemble`, `compose-stitch-and-handoff`, `compose-clip-webhook`, `compose-video-clips`, `modelark-poll`, `composer-cancel-scene`, `composer-cancel-project`, `generate-talking-head`. Danach Abschlussbericht mit Vorher/Nachher-Reader-Inventar und **STOP**. 5E folgt separat.
