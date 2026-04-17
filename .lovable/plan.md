

## Befund

Die Übergänge in Motion Studio sind nicht smooth, weil:

1. **Im Preview-Player** (`ComposerSequencePreview.tsx`): Es gibt **gar keine echte Transition** — beim Szenenwechsel wird einfach `videoRef.currentTime = 0` gesetzt und die nächste Szene hart eingeblendet. Das wirkt wie ein Stottern/Wiederholung, besonders wenn die neue Szene erst noch puffert.

2. **Im finalen Render** (`ComposedAdVideo.tsx` Zeilen 33–64): Jede Szene bekommt eine "Transition-IN" (Fade/Slide/Zoom/Wipe) über die ersten 0,5s — die **vorherige Szene verschwindet aber abrupt**. Es gibt keinen echten Crossfade zwischen zwei Szenen-Sequences. Das erzeugt sichtbare Sprünge oder das Gefühl, dass eine Szene "wiederholt" wird.

3. **Storyboard-Default** (`StoryboardTab.tsx` Z. 28): Jede neue Szene wird automatisch mit `transitionType: 'fade'`, `transitionDuration: 0.5` angelegt — der Nutzer hat also zwangsläufig schlechte Transitions.

Da der Universal Director's Cut bereits ein professionelles Transitions-System hat (`transitionResolver.ts`, `useTransitionRenderer.ts`, dual-slot ping-pong, native transition layer), ist es sauberer, **Transitions in Motion Studio komplett zu entfernen**. Wer feinere Übergänge will, exportiert nach Director's Cut.

## Plan

### 1. Default in Storyboard auf `none` setzen
`StoryboardTab.tsx` Zeile 28–29: `transitionType: 'none'`, `transitionDuration: 0`. Neue Szenen haben damit keinen unsauberen Fade-In mehr.

### 2. UI: Transition-Style-Card entfernen
`AssemblyTab.tsx` Zeilen 314–338 (die ganze "Transition Style"-Card mit den 6 Buttons fade/crossfade/wipe/slide/zoom/none) entfernen. Stattdessen optional ein dezenter Hinweis: *"Für feine Übergänge nutze den Director's Cut nach dem Export."* (lokalisierter Key).

Den `Film`-Import dort prüfen — wird er sonst noch benutzt? Wenn nicht, raus.

### 3. Render-Pipeline: Transitions ignorieren
`supabase/functions/compose-video-assemble/index.ts` Z. 94–95: `transitionType: 'none'`, `transitionDuration: 0` hartcodiert übergeben (egal was in DB/Config steht — Backwards-Safe).

`src/remotion/templates/ComposedAdVideo.tsx`:
- `SceneTransition`-Komponente und ihren Aufruf entfernen → Szenen werden als einfache `<Sequence>`-Cuts gerendert (Hard-Cuts wie bei einem klassischen Schnitt).
- Schema-Felder `transitionType` und `transitionDuration` als optional belassen (Backwards-Compat für alte Renders), aber nicht mehr benutzen.

### 4. Preview: kein Sub-Frame-Stottern mehr
`ComposerSequencePreview.tsx`: 
- Das `videoRef.currentTime = 0`-Setzen beim Scene-Change behalten, aber zusätzlich beim Quellwechsel **kurz auf `canplay` warten** bevor `play()` aufgerufen wird (verhindert kurzes "Standbild der vorigen Szene"-Flackern).
- Das ist eine kleine Robustheit­s­korrektur, kein neuer Übergang.

### 5. Datenmodell: `TransitionStyle`-Typ behalten (Soft-Deprecation)
- `src/types/video-composer.ts`: Typ unverändert lassen für Backwards-Compat. Nur in der UI nicht mehr nutzbar.
- `assemblyConfig.transitionStyle` und `scene.transitionType` werden ignoriert — keine DB-Migration nötig.

### 6. Lokalisierung
Neuer Key z.B. `videoComposer.transitionsRemovedHint` in DE/EN/ES:
- DE: *"Für feine Szenen-Übergänge nutze den Director's Cut nach dem Export."*
- EN: *"For refined scene transitions, use Director's Cut after exporting."*
- ES: *"Para transiciones refinadas, usa Director's Cut después de exportar."*

Alte Keys `videoComposer.transitionStyle` etc. können bleiben (verwaist) oder entfernt werden — egal.

## Geänderte Dateien
- `src/components/video-composer/StoryboardTab.tsx` — Default auf `none/0`
- `src/components/video-composer/AssemblyTab.tsx` — Transition-Card entfernen + Hinweis
- `src/components/video-composer/ComposerSequencePreview.tsx` — kleine `canplay`-Robustheit
- `src/remotion/templates/ComposedAdVideo.tsx` — `SceneTransition` raus, reine Cuts
- `supabase/functions/compose-video-assemble/index.ts` — `transitionType: 'none'` hartcodiert
- `src/lib/translations.ts` — neuer Hinweis-Key (DE/EN/ES)

## Verify
- Tab "Storyboard": neue Szene wird mit `transition: none` angelegt
- Tab "Assembly": **keine** Transition-Style-Auswahl mehr sichtbar, stattdessen dezenter Hinweis auf Director's Cut
- Preview-Player: Szenenwechsel als saubere Hard-Cuts ohne Stottern oder Frame-Wiederholung
- Final-Render (Lambda): Szenen werden hart geschnitten, keine Fade-/Slide-/Zoom-Artefakte mehr
- Bestehende Drafts mit gespeicherten Transitions werden ignoriert (kein Crash, einfach Hard-Cut)
- Kein Layout-Bug durch entfernte Card

