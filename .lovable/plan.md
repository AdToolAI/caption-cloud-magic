
## Problem

In den gerenderten AI-Clips erscheint wieder Text/Captions/Logos, obwohl wir am Prompt-Ende eine lange Negation-Liste mitsenden („no on-screen text, no captions, no subtitles, no watermarks, no logos, no typography, no signs with readable text...").

## Ursache

Die aktuelle Strategie in `compose-video-clips/index.ts` hängt **alle Verbote als Klartext an den Positiv-Prompt** an:

```
"...kitchen scene..., no on-screen text, no captions, no subtitles, no watermarks, no logos, no typography..."
```

Das ist ein bekanntes Anti-Pattern bei Video-Modellen (Hailuo, Kling, Gemini Image):
- Das Modell sieht **die Wörter** „captions", „subtitles", „typography", „logos", „signs with readable text" — und interpretiert sie als **gewünschtes Konzept**, nicht als Verbot.
- Negationen wie „no" werden von vielen Diffusion-Modellen schwach gewichtet oder ignoriert.
- Je länger die Negativ-Liste im Positiv-Prompt, desto **wahrscheinlicher** rendert das Modell genau diese Elemente.

Hailuo (`minimax/hailuo-2.3`) und Kling (`kwaivgi/kling-v2.1`) auf Replicate akzeptieren einen **separaten `negative_prompt`-Parameter**, den wir aktuell **nicht** nutzen — alles steht im positiven Prompt.

## Plan

### 1. Negative-Wörter aus dem Positiv-Prompt entfernen
**Datei:** `supabase/functions/compose-video-clips/index.ts`
- `enrichPrompt()` säubert den Prompt komplett von der „no on-screen text..."-Endung (Regex existiert bereits) und hängt sie **nicht mehr neu an**.
- Positiv-Prompt enthält danach nur noch: Charakter-Injection + Szenenbeschreibung + Stil-Hint + ein knapper positiver Cue („clean cinematic composition").
- Lange `NEGATIVE_TEXT_SUFFIX`-Konstante wird umgewidmet zu kompakter `NEGATIVE_PROMPT_PARAM`-Konstante (kommagetrennte Stichwörter ohne „no" davor) für die API.

### 2. Native `negative_prompt`-Parameter nutzen
- **Hailuo-Block**: `hailuoInput.negative_prompt = NEGATIVE_PROMPT_PARAM`
- **Kling-Block**: `klingInput.negative_prompt = NEGATIVE_PROMPT_PARAM`

Inhalt von `NEGATIVE_PROMPT_PARAM`:
```
"text, captions, subtitles, watermark, logo, typography, written words, letters, signs with readable text, UI overlay, lower thirds, isolated product, plain white background, floating product, rotating product, blurry, low quality"
```

### 3. Gemini Image (kein Negative-Param)
**Datei:** `supabase/functions/generate-composer-image-scene/index.ts`
- Gemini Nano Banana hat keinen separaten Negative-Prompt-Parameter.
- `NEGATIVE_SUFFIX` ebenfalls drastisch verkürzen → durch eine kurze positive Anweisung ersetzen: „clean photographic composition, natural environment".
- Triggerwörter (text, captions, typography, logo, watermark, subtitles) komplett aus dem Prompt entfernen.

### 4. Wizard-Storyboard unverändert
- `compose-video-storyboard/index.ts` darf weiterhin den Hinweis am Ende generieren — wir filtern ihn beim Senden an das Modell in `enrichPrompt` ohnehin sauber heraus (Regex existiert bereits).

## Erwartetes Ergebnis

- Hailuo- und Kling-Clips liefern saubere Bilder ohne burned-in Text, Captions, Logos oder Schilder.
- Studio-eigene Text-Overlays (Hooks, CTAs aus dem „Voice & Subtitles"-Tab) bleiben unverändert über den `textOverlaysEnabled`-Toggle steuerbar.
- Keine Mehrkosten — gleiche Modelle, gleiche Generationen, nur sauberere Eingabe.

## Technische Details

**Geänderte Dateien (2):**
- `supabase/functions/compose-video-clips/index.ts`
- `supabase/functions/generate-composer-image-scene/index.ts`

Beide Edge Functions werden nach den Änderungen redeployt. Verifikation: Eine Hook-Szene mit Hailuo neu generieren — erwartet: sauberer Clip, kein eingebrannter Text.
