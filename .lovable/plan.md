# v430 Schritt 5 — Writer-/Reader-Audit vor dem Abschalten der Rückwärts-Bridge

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

## Empfehlung: Schritt 5 anders zuschneiden

Die vorgeschlagene Reihenfolge ist richtig, aber der letzte Schritt („Legacy→State-Bridge abschalten") ist mit der heutigen Lip-Sync-Kette nicht erreichbar, ohne genau die Semantik zu ändern, die geschützt ist. Vorschlag:

1. **5A — Inventar festnageln:** Contract-Test, der die obige Writer-Tabelle einfriert. Neue Legacy-only Writer außerhalb einer expliziten Allowlist lassen den Test rot werden.
2. **5B — Nicht-Lip-Sync-Writer auf dual umstellen:** `qa-watchdog`, `recover-stuck-composer-clip`, `remotion-webhook`, `generate-talking-head`, `compose-scene-anchor`, `auto-director-compose`, `motion-studio-superuser`, `autopilotComposerBridge`. Lip-Sync-Kette bleibt unangetastet.
3. **5C — Sub-Zustände retten:** Spalte `pipeline_substate text` (reiner Anzeige-/Filterwert, kein Gate) für `awaiting_manual_face_map`, `awaiting_confirmation`, `circuit_open`, `deferred`, `needs_clip_rerender`, `anchor*`, `syncso_*`. Von der Vorwärts-Bridge mitgeschrieben. Erst danach ist der Informationsverlust bei Frage 2 gelöst.
4. **5D — Backend-Leser umstellen** (Tabelle Frage 4), Watchdog explizit als Compatibility-Leser dokumentiert und getestet.
5. **5E — Client-Leser** auf `sceneStateOf()` + `pipeline_substate` migrieren; Legacy-Zugriffe im Client per Lint-/Contract-Test sperren.
6. **5F — Bridge-Abschaltung nur szenengebunden:** Legacy → State wird per Flag deaktiviert, aber **nur für Szenen ohne Lip-Sync-Intent** (`scene_lipsync_intentional() = false`). Lip-Sync-Szenen behalten die Rückwärtsrichtung, bis die Lip-Sync-Kette selbst auf Transitions umgestellt wird — das ist ein eigener Schritt (v431) mit eigenem Vertrag.
7. **5G — Regressionstests + STOP.** Keine Spalte wird gelöscht; Vorwärtsrichtung State → Legacy bleibt dauerhaft.

## Offene Entscheidung

Punkt 6 ist die einzige echte Abweichung von deinem Entwurf. Alternative wäre, die Rückwärts-Bridge in Schritt 5 gar nicht anzufassen und die Abschaltung komplett nach v431 zu verschieben.
