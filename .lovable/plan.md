# v430 Schritt 5 — Writer-/Reader-Migration, Rückwärts-Bridge bleibt aktiv

Antworten auf die vier Fragen, jeweils belegt durch Repo-Scan und Live-Abfragen. Am Ende steht ein angepasster Umsetzungsvorschlag, weil der Audit einen harten Blocker gefunden hat.

## Kurzfassung

Die Rückwärtsrichtung (Legacy → `pipeline_state`) kann heute **nicht** global abgeschaltet werden. Die gesamte Lip-Sync-Kette schreibt seit dem v398-Rollback ausschließlich Legacy-Spalten. Der Bridge-Kommentar in der DB sagt das wörtlich: der v387-Block wurde aufgehoben, „sonst bleibt die Szene bei ‚Lip-Sync wird gestartet‘ stehen". Würden wir Legacy → State jetzt abschalten, würden Lip-Sync-Szenen im UI in `plate_ready` einfrieren, obwohl sie im Hintergrund weiterlaufen — und der Lip-Sync-Vertrag (v398/v425) verbietet, diese Kette anzufassen.

## Frage 1 — Legacy-only Writer

Writes auf `clip_status` / `twoshot_stage` / `lip_sync_status` im Backend, nach Pfad gruppiert:

| Pfad | Writes | Schreibt auch State? | Bewertung |
|---|---|---|---|
| `compose-video-clips` | 44 | ja — `composer_scene_transition()` | dual, ok |
| `_shared/scene-run-begin.ts` | 3 | ja | dual, ok |
| `_shared/scene-hard-reset.ts` | 4 | ja | dual, ok |
| `_shared/continuity-chain.ts` | 2 | ja | dual, ok |
| `hybrid-extend-scene` | 1 | ja | dual, ok |
| `compose-clip-webhook` | 10 | ja (v427-Guard + Transition) | dual, ok |
| **`compose-dialog-segments`** | **55** | **nein** | Legacy-only, verlässt sich auf Bridge |
| **`sync-so-webhook`** | **23** | **nein** | Legacy-only |
| **`lipsync-watchdog`** | **8** | **nein** | Legacy-only |
| **`compose-twoshot-audio`** | 3 | nein | Legacy-only |
| **`render-sync-segments-audio-mux`** | 6 | nein | Legacy-only |
| **`_shared/lipsync-fail.ts`** | 2 | nein | Legacy-only |
| **`reset-lipsync-scene`** | 3 | nein | Legacy-only |
| **`cancel-dialog-lipsync`** | 2 | nein | Legacy-only |
| **`report-lipsync-motion-probe`** | 2 | nein | Legacy-only |
| `qa-watchdog`, `recover-stuck-composer-clip`, `remotion-webhook`, `generate-talking-head`, `compose-scene-anchor`, `auto-director-compose`, `motion-studio-superuser`, `qa-weekly-deep-sweep`, `_shared/autopilotComposerBridge.ts` | 1–7 je | nein | Legacy-only |

Ergebnis: **ja, es bleiben Legacy-only Writer übrig** — und die größten davon (≈100 Writes) sind exakt die Lip-Sync-Kette, die laut Projektvertrag semantisch nicht verändert werden darf.

## Frage 2 — Deckt `pipeline_state` alle UI-Entscheidungen ab?

Mapping laut DB-Bridge (Vorwärtsrichtung, bleibt erhalten):

```text
pipeline_state      clip_status              twoshot_stage   lip_sync_status
idle                pending                  NULL            NULL
plate_queued        queued                   NULL            NULL
plate_rendering     generating               NULL            NULL
plate_ready         ready                    NULL            (unverändert)
audio_prep          ready                    audio           (unverändert)
audio_ready         ready                    master_clip     (unverändert)
lipsync_dispatched  ready                    lipsync         running
lipsync_running     ready                    lipsync         running
lipsync_muxing      ready                    lipsync         stitching
complete            ready                    done            done (falls gesetzt)
failed              (ready|failed)           failed          failed (falls gesetzt)
canceled            canceled                 NULL            canceled (falls gesetzt)
```

Das Mapping ist **nicht verlustfrei**. Diese Legacy-Zustände haben keine Entsprechung in `pipeline_state`:

- `clip_status = 'awaiting_manual_face_map'` → Face-Map-Review-Dialog
- `clip_status = 'awaiting_confirmation'` + `twoshot_stage = 'preview'` → Anchor-Preview-Gate
- `twoshot_stage = 'circuit_open' | 'deferred'` → Wartezustand statt Fehler
- `twoshot_stage = 'needs_clip_rerender'` → Rerender-Hinweis
- `twoshot_stage = 'anchor' | 'anchor_soft_pass'` → Anker-Phase
- `twoshot_stage = 'syncso_pass_2_of_3'`, `syncso_fanout_%`, `syncso_retry_%` → Fortschritt pro Pass
- `twoshot_stage = 'audio_mux_failed'` vs. generisches `failed` → Refund-/Recovery-Unterschied
- `lip_sync_status = 'applied'` → historisch; im Client-Derivat auf `complete` abgebildet, aktuell 0 Zeilen in der DB

Client-Leser der drei Felder: 39 Dateien für `clip_status`, 20 für `twoshot_stage`/`lip_sync_status` — u. a. `usePipelineProgress`, `useTwoShotAutoTrigger`, `useGenerateAllClips`, `useSceneGenerate`, `ClipsTab`, `SceneCard`, `SceneClipProgress`, `SceneDialogStudio`, `RenderPipelinePanel`, `AnchorPreviewGate`, `FaceMapReviewDialog`, `ContinuityGuardianStrip`, `StoryboardTab`, `RenderQueue`.

`src/lib/composer/sceneState.ts` liest bereits `pipeline_state` zuerst und fällt nur auf das Legacy-Derivat zurück — das ist die richtige Basis, aber die Sub-Zustände oben liegen darunter.

## Frage 3 — Bestandszeilen

Live-Abfrage über alle 4.246 `composer_scenes`:

- `pipeline_state IS NULL`: **0**
- Widerspruch zwischen `pipeline_state` und `composer_state_from_legacy(...)`: **0**
- `lip_sync_status = 'applied'`: **0**
- Ungültige Zustände: keine (Spalte ist Enum `composer_scene_state`)

Der Insert-Zweig der Bridge leitet `idle` beim Anlegen aus Legacy ab; ein separater Backfill ist deshalb nicht nötig. **Alte Projekte verlieren beim Laden nichts**, weil der Zustand bereits materialisiert in der Spalte steht und nicht bei jedem Read neu abgeleitet wird. Risiko besteht nur für Zeilen, die *nach* der Abschaltung von einem Legacy-only Writer verändert werden — genau das ist Frage 1.

## Frage 4 — Backend-Sicherheitsmechanismen, die Legacy lesen

| Mechanismus | Liest | Umstellbar? |
|---|---|---|
| `lipsync-watchdog` | Scan-Filter auf `lip_sync_status` + `twoshot_stage`-Muster (`syncso_fanout_%`, `circuit_open`, …) | **nein** — die Sub-Stages existieren nur in Legacy; Compatibility-Leser behalten |
| `qa-watchdog` | `clip_status in (pending,queued,generating,…)` + `updated_at` | ja, nach Writer-Umstellung |
| `modelark-poll` | `.eq('clip_status','generating')` | ja |
| `recover-stuck-composer-clip` | `clip_status`, `clip_error` | ja |
| `compose-clip-webhook` Guard | `clip_status, clip_source` (v427-Guard nutzt bereits Run-Ledger) | ja |
| Continuity-Queue (`continuity-chain.ts`) | `clip_status='generating'`, `clip_status='ready'` + `isSceneOutputFinal` | ja — Finalität hängt schon an `resolveSceneOutput` |
| `composer-cancel-scene` / `-project` | `clip_status`, `lip_sync_status` | ja |
| `reset-lipsync-scene`, `scene-hard-reset` | `clip_status` | ja (hard-reset ist bereits dual) |
| Refund/Failure (`lipsync-fail.ts`, v427-Ledger) | Legacy-Fail-Marker; Ledger selbst ist Legacy-frei | teils — Refund-Trigger bleibt vorerst Legacy |
| `composer_pipeline_jobs` | keine Legacy-Spalten | bereits sauber |

## Umsetzung Schritt 5 — rein strukturell, ohne Bridge-Abschaltung

Die Rückwärts-Bridge bleibt in Schritt 5 vollständig und global aktiv. Keine szenengebundene Abschaltung: eine Bridge, die von `scene_lipsync_intentional()` abhängt, würde zwei Orchestrierungsregeln in derselben Tabelle erzeugen, und der Lip-Sync-Intent einer Szene kann sich über ihre Lebenszeit ändern.

1. **5A — Writer-Inventar einfrieren.**

   Contract-Test mit expliziter Allowlist der bekannten Legacy-only Lip-Sync-Writer:
   `compose-dialog-segments`, `sync-so-webhook`, `lipsync-watchdog`, `compose-twoshot-audio`, `render-sync-segments-audio-mux`, `_shared/lipsync-fail.ts`, `reset-lipsync-scene`, `cancel-dialog-lipsync`, `report-lipsync-motion-probe`.
   Jeder neue Legacy-only Writer außerhalb der Liste macht den Test rot. Semantik dieser Pfade wird nicht angefasst.

2. **5B — Alle Nicht-Lip-Sync-Writer dualisieren.**

   Betroffene Pfade: `qa-watchdog`, `recover-stuck-composer-clip`, `remotion-webhook`, `generate-talking-head`, `compose-scene-anchor`, `auto-director-compose`, `motion-studio-superuser`, `qa-weekly-deep-sweep`, `autopilotComposerBridge`.
   Sie schreiben künftig zusätzlich über `composer_scene_transition()`.

   **Operative Regel (verbindlich):** Die Dualisierung folgt exakt dem bereits funktionierenden Dual-Write-Muster. `composer_scene_transition()` ist für den Hauptzustand autoritativ; der bestehende Legacy-Write bleibt unverändert bestehen, darf aber keine zweite, abweichende State-Transition erzeugen.

   Reihenfolge pro Pfad: Transition zuerst, Legacy-Write danach im selben Vorgang mit identischer Zielsemantik. Ein Contract-/Regressionstest muss belegen, dass bei aktiver Vorwärts- **und** Rückwärts-Bridge ein Dual-Write weder eine Transition-Schleife noch eine illegale Doppel-Transition (State A→B→A oder zwei konkurrierende Ziele) auslöst.

3. **5C — `pipeline_substate` einführen.**

   Vertrag: `pipeline_state` = orchestrierungsrelevanter Hauptzustand, `pipeline_substate` = diagnostischer/UI-relevanter Unterzustand und **niemals** Gate für State-Transitions.

   Befüllung ausschließlich in dieser Richtung:

   ```text
   Legacy Lip-Sync Writer → twoshot_stage / Spezialstatus → Compatibility-Mirror → pipeline_substate
   migrierte Writer-Pfade → pipeline_substate direkt
   ```

   Nicht `pipeline_state → pipeline_substate` — das wäre informationsverlustbehaftet.

   Abgedeckte Werte: `awaiting_manual_face_map`, `awaiting_confirmation`, `circuit_open`, `deferred`, `needs_clip_rerender`, `anchor`, `anchor_soft_pass`, `preview`, `syncso_pass_%`, `syncso_fanout_%`, `syncso_retry_%`, `audio_mux_failed`.

4. **5D — Backend-Reader migrieren.**

   Alles, was Hauptzustände braucht, liest `pipeline_state`. Nur Funktionen, die echte Lip-Sync-Unterzustände brauchen, lesen weiter Legacy. `lipsync-watchdog` ist die bewusst dokumentierte Ausnahme (Scan-Filter auf `syncso_%`, `circuit_open`, `deferred`).

5. **5E — Client vollständig auf `sceneStateOf()` + `pipeline_substate`.**

   Danach interpretiert kein normaler UI-Code mehr selbst `clip_status`, `twoshot_stage` oder `lip_sync_status`; ein Contract-Test sperrt neue Direktzugriffe.

6. **5F — Reverse Bridge bleibt unverändert aktiv.**

   Keine teilweise Abschaltung, kein Flag.

7. **5G — Regressionstests, Deployments, STOP.**

   Keine Legacy-Spalte wird gelöscht; die Vorwärtsrichtung State → Legacy bleibt dauerhaft.

## Danach: v431 (eigener Schritt, nicht Teil von Schritt 5)

Lip-Sync-Legacy-Writer auf `composer_scene_transition()` + `pipeline_substate` umstellen → letzten Legacy-only Writer entfernen → Vertragstests → Bridge Legacy → State **global** abschalten.

## Datenlage

Kein Backfill nötig: 4.246 Szenen, 0 mit `pipeline_state IS NULL`, 0 Widersprüche zwischen State und Legacy-Derivat. Schritt 5 bleibt eine rein strukturelle Änderung ohne Datenrettung.

