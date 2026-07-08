---
name: Motion Studio Transitions
description: Übergänge zwischen KI-generierten Szenen im Motion Studio — Datenfluss, Wiederverwendung Director's-Cut-Bausteine, Preview/Export-Parität, Lipsync-Orthogonalität.
type: feature
---

# Motion Studio Transitions (v210)

## Datenfluss

```
TransitionHandle (Storyboard)
   │        SceneTransitionInlineEditor (Editor-Pane)
   │        TransitionPopover ─┐
   └──────────────────────────►│
                               ▼
           updateScene(id, { transitionType, transitionDuration })
                               │
                               ▼
           useComposerPersistence → composer_scenes DB
             transitionType     → transition_type
             transitionDuration → transition_duration
                               │
              ┌────────────────┴────────────────┐
              ▼                                 ▼
   ComposerSequencePreview            compose-video-assemble
   (Live: resolveTransitionMs)        (liest transition_type/duration
    dynamische Crossfade-Dauer         aus DB, Remotion-Composition
    pro leaving-scene)                 wählt src/remotion/components/
                                       transitions/*)
```

## Wiederverwendete Bausteine (Director's Cut)

- `TransitionSelector` (`src/components/video/TransitionSelector.tsx`) — UI-Palette-Grid.
- `TransitionPreviewTile` (`src/components/studio-visual/`) — Mini-Vorschau.
- Remotion-Transitions (`src/remotion/components/transitions/*`) — Export-Rendering.
- DB-Schema: `composer_scenes.transition_type` / `transition_duration` bestand bereits, keine Migration.

## Neue Bausteine

- `TransitionHandle.tsx` — Knoten zwischen Storyboard-Tiles.
- `TransitionPopover.tsx` — Popover mit Selector + Slider.
- `SceneTransitionInlineEditor.tsx` — flache Editor-Sektion unter dem SceneCard.

## Preview-Parität

`ComposerSequencePreview.resolveTransitionMs(scene)` liest die selben Felder wie der Exporter. `type === 'none'` → 60 ms harter Cut; alle anderen → geclampte `transitionDuration * 1000` (0.2–1.5 s). Die dual-slot Ping-Pong-Architektur bleibt unangetastet — nur die CSS-Opacity-Dauer pro Cut wird dynamisch gesetzt.

Erweiterte Motive (slide/zoom/wipe/blur/push) laufen in der Preview als Crossfade-Fallback; der finale MP4-Render zeigt sie über die Remotion-Transition-Komponenten korrekt. Grund: die Ping-Pong-Slot-Architektur macht kein DOM-Layer-Compositing über zwei aktive Videos hinaus.

## Lipsync-Orthogonalität

Übergänge liegen außerhalb des Sync-Fensters (Ein-/Ausblenden ins/aus dem Speaker-Clip). Kein Eingriff in Lipsync v190–v209. Der v209-Consent-Dialog für Nicht-Safe-Provider ist unabhängig und bleibt aktiv.

## i18n

`TransitionHandle`, `TransitionPopover`, `SceneTransitionInlineEditor` und die neuen „Noch nicht gerendert"-Placeholder verwenden lokale L10N-Maps (DE/EN/ES) statt Erweiterung der 19k-Zeilen `src/lib/translations.ts` — bewusst, um die zentrale Datei nicht anzufassen.

## Bug-Fix (gleicher Ship)

`SceneInlinePlayer` und `SceneStripTile` benutzen nicht mehr `referenceImageUrl` / `lockReferenceUrl` als Kachel-Preview — das Anker-/Frontbild wird nicht mehr in ungerenderte Szenen gespiegelt.
