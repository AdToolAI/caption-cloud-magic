

## Plan: Complete Director's Cut Localization (Phases 4-5)

There are still ~35 files with hardcoded German strings. Here's the remaining work broken into manageable batches.

### Batch 1 — Studio Core (6 files)
- `CapCutEditor.tsx` — toasts (Projekt wird gespeichert, Szene am Playhead geteilt, etc.), blackscreen labels
- `CapCutTimeline.tsx` — scene labels, context menu items, "Klicken zum Bearbeiten"
- `CapCutPreviewPlayer.tsx` — "Blackscreen", "Szene X"
- `CapCutPropertiesPanel.tsx` — property labels
- `FloatingAIPanel.tsx` — AI panel labels
- `AudioStudioPro.tsx` — audio labels

### Batch 2 — Steps + UI Dialogs (8 files)
- `StyleLookStep.tsx` — "Wähle Filter und Stile für dein Video"
- `ColorCorrectionStep.tsx` — "Szene zurücksetzen", "Alle zurücksetzen"
- `SceneEditingStep.tsx` — ~30 strings: toast messages, keyboard shortcuts, scene actions
- `SceneSelector.tsx` — "Szene X", "Änderungen gelten nur für diese Szene"
- `SmartTemplates.tsx` — template descriptions, "Klicke auf ein Template..."
- `AISceneRemix.tsx` — remix strategy descriptions
- `AddMediaDialog.tsx` — "Medien hinzufügen"
- `ContextualActionBar.tsx` — action labels, tooltips
- `StepLayoutWrapper.tsx`, `VisualTimeline.tsx` — scene labels

### Batch 3 — AI Features (14 files)
- `AITransitions.tsx` — transition descriptions, toast messages, "Analysiere Szenen..."
- `AIStyleTransfer.tsx` — "Filter auf ausgewählte Szene angewendet"
- `AISoraEnhance.tsx` — style descriptions, "KI-Überarbeitung mit Sora 2"
- `AIColorGrading.tsx` — "Szenen-Grading entfernen"
- `BeatSyncEditor.tsx` — "Schnitte auf Beat"
- `SpeedRamping.tsx` — keyframe labels
- `AIAutoCut.tsx`, `AISoundDesign.tsx`, `AIVoiceOver.tsx`, `AIVideoRestoration.tsx`, `AIVideoUpscaling.tsx`, `AIFrameInterpolation.tsx`, `GreenScreenChromaKey.tsx`, `KenBurnsEffect.tsx`
- `TextOverlayEditor.tsx`, `TextOverlayEditor2028.tsx`

### Batch 4 — Timeline (8 files)
- `EditableVideoTrack.tsx` — "Szene splitten", "Mit vorheriger verbinden", "KI-Effekte"
- `MultiTrackTimeline.tsx`, `MultiTrackTimelinePro.tsx` — track labels
- `TimelineStudio.tsx`, `TimelineStudioPro.tsx` — scene labels
- `AIToolsSidebar.tsx`, `AIToolsSidebarExpanded.tsx` — all AI tool labels
- `NeonMultiTrackTimeline.tsx`, `FuturisticPreviewPlayer.tsx`

### Approach
- Add ~150 new `dc.*` keys to `translations.ts` (EN/DE/ES) across batches
- DE values = existing hardcoded strings (zero visual change for German users)
- Each file gets `useTranslation` hook, all strings wrapped with `t()`
- Static arrays use `useMemo` for language reactivity
- Will implement in 4 messages (1 batch per message)

### Estimated effort
4 implementation messages, each handling one batch.

