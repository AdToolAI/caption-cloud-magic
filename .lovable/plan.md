

## Plan: Einheitlicher Crossfade-Übergang für alle Szenen

Der User will Übergänge zurück — aber **nur einen einzigen Typ**, der historisch am wenigsten Probleme gemacht hat. Aus dem Verlauf und der Memory (`mem://architecture/directors-cut/ping-pong-transition-architecture`) ist das eindeutig **Crossfade/Fade** — die DirectorsCut-Engine nutzt genau das in einer stabilen Dual-Slot-Architektur.

### Was geändert wird

**1. `src/remotion/templates/ComposedAdVideo.tsx`**
- Aktuelle Hard-Cut-Logik (`<TransitionSeries>` ohne Transitions zwischen Sequences) wird ersetzt durch `<TransitionSeries>` **mit** `fade()`-Transitions zwischen jeder Szene
- Transition-Dauer: **15 Frames (0.5s)** — kurz genug, um Audio-Nähte minimal zu halten, lang genug für visuelle Glättung
- `premountFor={60}` bleibt auf jeder Sequence (Decoder-Warmup)
- Audio-Track bleibt unverändert (durchgehend, eine `<Audio>`-Komponente in pre-buffer Sequence)
- Wichtig: Scene-Frame-Berechnung muss Transition-Overlap berücksichtigen

**2. `supabase/functions/compose-video-assemble/index.ts`**
- Komposition-Dauer: `sumSceneFrames - (numScenes - 1) * 15` weil jede Transition die Gesamtdauer um 15 Frames reduziert (Overlap)
- Audio-Geometrie bleibt unabhängig (one-track), VO läuft einfach durch
- `durationInFrames = max(adjustedVideoFrames, audioFrames) + safetyBuffer`

**3. `src/remotion/utils/subtitleConstants.ts`**
- `SUBTITLE_RENDER_VERSION` bumpen → `v2026-04-18b-composer-crossfade-uniform`

**4. `src/components/video-composer/` (UI)**
- Falls Übergangs-Selector aktuell ausgeblendet/deaktiviert ist: Banner einfügen "Alle Szenen nutzen einen einheitlichen 0.5s Crossfade-Übergang"
- Pro-Szene Übergangs-Dropdowns bleiben ausgeblendet (kein User-Wahlrecht → keine Bug-Klasse zurück)

### Warum Crossfade

| Übergang | Risiko | Status |
|---|---|---|
| **Crossfade** | Niedrigster — überlagert nur Opacity, keine Transform/Geometry-Änderung | ✅ Gewählt |
| Slide | Mittel — bewegt komplette Frames, kann Decoder belasten |  |
| Wipe/Push | Hoch — clipPath/Transform pro Frame |  |
| Zoom | Hoch — Scale-Animation auf Video-Element |  |

Crossfade nutzt nur `opacity`-Interpolation auf zwei übereinanderliegenden Sequences. Der Audio-Track läuft komplett unbeeindruckt durch (ist ja außerhalb der `<TransitionSeries>`).

### Audio-Sicherheit

Da der VO-Track in `<Sequence from={-fps}>` außerhalb der `<TransitionSeries>` läuft, sind die Crossfade-Übergänge **akustisch unsichtbar**. Nur die Video-Layer crossfaden. Das ist der entscheidende Punkt — keine Audio-Nähte, weil Audio nicht Teil der Transition ist.

### Required Action nach Code-Änderung

Bundle-Redeploy via `bash scripts/deploy-remotion-bundle.sh` (Renderer-Änderung).

### Dateien

1. `src/remotion/templates/ComposedAdVideo.tsx` — Fade-Transitions zwischen Sequences
2. `supabase/functions/compose-video-assemble/index.ts` — Komposition-Dauer um Transition-Overlap reduzieren
3. `src/remotion/utils/subtitleConstants.ts` — Version-Bump
4. `src/components/video-composer/` — UI-Hinweis auf einheitlichen Übergang (falls relevant)

