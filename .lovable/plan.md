# v430 Schritt 5E — Client-Reader-Migration

Isolierte Phase: nur Leser im Frontend. Keine Writer, keine Bridge-Änderung,
keine State-Machine-Semantik, keine Backend-Änderung.

## Ziel

Im normalen UI wird der Szenenzustand ausschliesslich über die
Zustandsmaschine gelesen:

- Hauptzustand: `sceneState(scene)` aus `src/lib/composer/sceneState.ts`
- Detailzustand: `sceneSubstate(scene)` (v430 5C)
- Output-Fragen: `resolveSceneOutput(scene)` / `resolveSceneSourcePlate(scene)`
- Legacy-Anzeigewerte nur noch über `clipStatusFromState(sceneState(scene))`
- Ready/Failed-Klassifikation nur über `legacyClipReadyEquivalentRow()` /
  `legacyClipFailedEquivalentRow()` (exklusiv, `failed` + Output = ready)

Direkte Interpretation von `clip_status`, `twoshot_stage`, `lip_sync_status`
im UI ist danach verboten und wird durch einen Scanner-Test blockiert.

## Reader-Inventar (nach Dichte)

| Datei | Vorkommen | Vorgehen |
| --- | --- | --- |
| `hooks/usePipelineProgress.ts` | 64 | Fortschritt/Phase über `sceneState` + `sceneSubstate`, Output über Resolver |
| `components/video-composer/ClipsTab.tsx` | 64 | Filter/Badges/Aktionsgates auf Zustandsmengen |
| `hooks/useTwoShotAutoTrigger.ts` | 38 | Gates nur über `canStartAudioPrep` / `canDispatchLipsync` / `canContinueLipsync` |
| `components/video-composer/SceneCard.tsx` | 31 | Anzeige über `SCENE_STATE_LABEL`, Buttons über Zustandsmengen |
| `VideoComposerDashboard.tsx` | 25 | Projektfortschritt über exklusive Ready/Failed-Helfer |
| `StoryboardTab.tsx`, `SceneDialogStudio.tsx` | je 7 | Zustandslesungen ersetzen |
| `pages/RenderQueue.tsx`, `ComposerSequencePreview.tsx` | je 5 | Live-/Fertig-Mengen über Zustandsmengen |
| `AnchorPreviewGate.tsx` | 4 | Substate `anchor`/`anchor_soft_pass`/`preview` |
| `SceneInlinePlayer.tsx`, `SceneGenerationSkeleton.tsx`, `SceneClipProgress.tsx` | je 3 | Zustand + Output-Resolver |
| `SceneStripTile.tsx`, `RenderPreFlightDialog.tsx`, `FaceMapReviewDialog.tsx`, `ContinuityGuardianStrip.tsx` | je 2 | `awaiting_manual_face_map` u. a. über Substate |
| `SceneCutDriftIndicator.tsx`, `SceneContinuityStatus.tsx`, `RenderPipelinePanel.tsx`, `AssemblyTab.tsx` | je 1 | Restlesungen ersetzen |

Zusätzlich geprüft und mitmigriert, sofern reine Leser:
`useGenerateAllClips`, `useMultiSceneRender`, `useStoryboardTransition`,
`useRenderQueueLive`, `lib/video-composer/sceneSnapshot.ts`,
`lib/video-composer/lipSyncPending.ts`, `pages/MotionStudio/StudioMode.tsx`.

## Allowlist (bewusst geschützte Legacy-Pfade)

Diese Stellen dürfen Legacy-Spalten weiter lesen und werden im Scanner
namentlich freigegeben:

- `src/lib/composer/sceneState.ts` — die Bridge-Ableitung selbst
- `src/lib/composer/output/resolveSceneOutput.ts` — Output-Legacy-Toleranz
- `src/pages/DebugLipsync.tsx` — Diagnose-/Debug-Ansicht
- `src/lib/video-composer/lipSyncPending.ts` — Lip-Sync-Kompatibilitätspfad,
  falls die Semantik nicht 1:1 abbildbar ist
- `src/integrations/supabase/types.ts`, Persistenz-/Mapping-Layer
  (`useComposerPersistence`, `sceneSnapshot`) für reines Feld-Mapping
- Schreibpfade (`useSceneGenerate`, `useApplyProductionPlan`,
  `useApplyBriefingManifest`, `spawnCoverageScenes`, `buildAdScenes`,
  `spawnAdCampaignChildren`) — 5E ändert keine Writer

Jeder Allowlist-Eintrag bekommt im Test eine Begründung.

## Nicht-Ziele

- Keine Änderung an Writern, Dual-Write-Muster oder RPCs
- Keine Abschaltung der Rückwärts-Bridge (bleibt global aktiv, v431)
- Keine Änderung an Lip-Sync-Gates, Schwellenwerten oder Frozen Contract
- Keine Backend-/Edge-Function-Änderung, keine Migration

## Technische Umsetzung

1. **Reader-Migration** Datei für Datei, semantikgleich. Wo eine Komponente
   heute auf `pending | generating | ready | failed` verzweigt, kommt der Wert
   aus `clipStatusFromState(sceneState(scene))` statt aus der Spalte.
2. **Contract-Scanner** `src/lib/composer/__tests__/clientReaderContract5E.test.ts`:
   scannt `src/components/**`, `src/hooks/**`, `src/pages/**` auf
   `clip_status|clipStatus|twoshot_stage|twoshotStage|lip_sync_status|lipSyncStatus`
   und failt bei jedem Treffer ausserhalb der Allowlist.
3. **Verhaltenstests** für die kritischen Projektionen: Fortschritt,
   Ready/Failed-Exklusivität, Substate-Gates (`awaiting_manual_face_map`,
   `circuit_open`, `anchor`), Auto-Trigger-Gates.
4. **UI-Smoke-Test** im Preview über Playwright: Motion Studio öffnen,
   Szenenkarten, Clips-Tab, Render-Queue und Pipeline-Panel prüfen —
   Zustandsanzeigen identisch zu vorher, keine Konsolenfehler.
5. **Validierung**: Vitest (Composer-Suite) + `tsgo`. Danach STOP.

## Ergebnis

Nach 5E ist Schritt 5 abgeschlossen: alle nicht-Lip-Sync-Writer dualisiert,
alle Backend- und Client-Reader auf die Zustandsmaschine migriert. Offen für
v431 bleibt die Migration der Lip-Sync-Legacy-Writer und das globale
Abschalten der Rückwärts-Bridge.
