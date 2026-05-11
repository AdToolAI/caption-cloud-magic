# Stage 5 — Transitions & Scene Animations Studio

Ziel: Alle Übergangs- und Szenen-Animations-Picker im Director's Cut & Composer von emoji-only Tiles auf **bewegte Mini-Loops auf der gleichen locked Base Scene** umstellen — analog zur Look Studio Logik aus Stage 4 (Artlist-Vergleich, der Kunde sieht *was der Effekt tut*, nicht ein anderes Icon).

## Prinzip (folgt der `comparable-thumbnail-rule`)

- **Eine** locked Base Scene (Tokyo-Master `framing/establishing.jpg`) als Scene A.
- Eine zweite locked Scene (Tokyo-Master `framing/wide.jpg`) als Scene B für Transitions die zwei Clips brauchen.
- Animation rein per **CSS Keyframes / transforms** — keine GIFs, keine MP4-Assets, kein Edge Call, kein Replicate, kein Asset-Pipeline. Tile loopt **on hover**, ruht still beim Verlassen → spart CPU.
- Selected Tile loopt automatisch auch ohne Hover (User sieht aktive Wahl in Bewegung).

## Neue Komponenten

```text
src/components/studio-visual/
  TransitionPreviewTile.tsx     // 2-Scene CSS-Transition Loop
  SceneAnimationPreviewTile.tsx // 1-Scene CSS-Transform Loop
```

### `TransitionPreviewTile`
- Props: `transitionId` (`none|fade|crossfade|dissolve|wipe|slide|blur|zoom|push|morph`), `label`, `isActive`, `onClick`, `durationMs?` (default 1200).
- Rendert zwei `<img>` Layer (Scene A unten, Scene B oben) mit CSS-Klasse `tx-${transitionId}` die nur über `:hover` oder `[data-active=true]` läuft.
- Globale Keyframes in einer einzigen scoped Stylesheet (Modul-Datei) — eine `@keyframes` pro Transition.
- Maps 1:1 auf bestehende `transitionType` Strings — keine Resolver-Änderung nötig.

### `SceneAnimationPreviewTile`
- Props: `animationId` (`none|zoomIn|zoomOut|zoomInSlow|zoomOutSlow|panLeft|panRight|panUp|panDown|kenBurnsTL|kenBurnsBR`), `label`, `isActive`, `intensity?` (skaliert `transform`-Range), `onClick`.
- Ein `<img>` Layer mit `transform: scale()/translate()` Loop.
- Maps 1:1 auf existierendes `SceneEffects.animation.type` und KenBurns-Presets.

## Mount-Points (nur UI, keine Logik-Änderung)

| Datei | Was wird ersetzt |
|---|---|
| `src/components/directors-cut/studio/sidebar/CutPanel.tsx` (L99–122) | Transition-Grid pro Szene → `TransitionPreviewTile` |
| `src/components/directors-cut/ui/TransitionPicker.tsx` | Großer Standalone-Picker (genutzt in `SceneEditingStep`) → `TransitionPreviewTile` Grid |
| `src/components/directors-cut/studio/sidebar/FXPanel.tsx` (L112–128) | Scene-Animation-Grid → `SceneAnimationPreviewTile` |
| `src/components/directors-cut/features/KenBurnsEffect.tsx` (PRESETS) | Ken-Burns-Preset-Grid → `SceneAnimationPreviewTile` mit `kenBurns*` IDs |
| `src/components/video-composer/StoryboardTab.tsx` *(falls inline picker)* | Composer-Transition-Tile → gleicher `TransitionPreviewTile` |

Bestehende Slider (Duration, Intensity), Defaults, State-Handler und `transitionResolver` bleiben **unverändert**.

## Out of Scope

- Keine neuen Transition-Typen (nur visuelle Picker für die bereits existierenden 8–10).
- Kein Server-Side Render-Patch — Lambda/Composer rendern die Effekte schon korrekt.
- Keine neuen Tabellen, Edge Functions, Buckets oder API-Keys.
- Subtitle-Looks und Text-Overlay-Animationen kommen in einem späteren Stage.

## Memory

Nach Implementierung: neue Memory-Notiz `mem://design/studio-presets/animated-tile-rule` ergänzt die bestehende `comparable-thumbnail-rule` um den Hinweis, dass alle künftigen Bewegungs-Picker (Transitions, Scene-Anims, Text-Anims, Subtitle-Karaoke…) das gleiche locked-Scene-CSS-Loop-Muster nutzen.

## Deliverables

1. 2 neue Komponenten (`TransitionPreviewTile`, `SceneAnimationPreviewTile`) + ein Stylesheet mit allen Keyframes.
2. 4–5 Picker-Mounts im Director's Cut + Composer auf die neuen Tiles umgestellt.
3. 1 neue Memory-Notiz + Index-Update.

Geschätzt **klein**: rein Frontend, ~300 Zeilen + CSS, keine DB-Migration, keine Edge Function.
