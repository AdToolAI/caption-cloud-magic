
## Befund
Der User möchte, dass die KI-generierten Video-Prompts (in den Storyboard-Szenen) **niemals** Untertitel, Captions oder Text-Overlays im Video selbst erzeugen. Sonst kollidieren später die separat hinzugefügten Untertitel mit eingebrannten Texten in den Clips.

Im Screenshot sieht man bereits einen guten Prompt:
> "...no on-screen text, no captions, no subtitles, no watermarks, no logos..."

Aber das ist offenbar nicht überall konsistent — manche Szenen-Prompts enthalten diese Schutzklauseln nicht, oder die Prompt-Generierung in den Edge Functions fügt sie nicht zuverlässig hinzu.

## Analyse-Schritte (was ich prüfen muss)
1. **Prompt-Generierungs-Logik finden**: Wo werden die Storyboard-Szenen-Prompts erzeugt?
   - Vermutlich in einer Edge Function wie `generate-storyboard` oder `compose-video-storyboard`
2. **Clip-Generierung prüfen**: Wo werden die Prompts an Hailuo/Kling/Seedance/etc. weitergegeben?
   - Edge Functions wie `generate-scene-clip` o.ä.
3. **Prompt-Editor im Frontend**: Wo kann der User den Prompt manuell editieren? (Dort ggf. Hinweis einblenden.)

## Plan

### 1. Negative-Prompt-Suffix zentralisieren
Eine konstante Negative-Suffix-Klausel in einer geteilten Datei (z.B. `supabase/functions/_shared/videoPromptGuards.ts`):
```ts
export const NO_TEXT_NEGATIVE_SUFFIX = 
  ", no on-screen text, no captions, no subtitles, no watermarks, " +
  "no logos, no written words, no typography, no signs with text, " +
  "no UI overlays, clean visuals only";
```

### 2. Anwendung in 3 Phasen
- **Storyboard-Generierung** (Edge Function, die initial die Prompts erstellt): System-Prompt für die KI um eine harte Regel ergänzen → "NEVER include text, captions, subtitles, signs with readable words, or written language in the visual description."
- **Suffix-Append vor Clip-Render**: Bevor der Prompt an Hailuo/Kling/Seedance/etc. geschickt wird, automatisch `NO_TEXT_NEGATIVE_SUFFIX` anhängen (falls nicht schon enthalten — Idempotenz-Check via `includes('no subtitles')`).
- **Frontend-Sanitizer (optional)**: Wenn User manuell Prompt editiert, beim Speichern Suffix sicherstellen.

### 3. Bestehende Storyboard-Szenen migrieren (optional)
Bei Klick auf "Clips generieren" werden alle Szenen-Prompts vor dem Render durch den Suffix-Guard geschickt → keine DB-Migration nötig, läuft transparent.

### 4. UI-Hinweis im Prompt-Editor
Unter dem Prompt-Textfeld einen kleinen Hinweis: 
> "ℹ️ Untertitel und Texte werden automatisch ausgeschlossen — füge sie später im 'Voiceover & Untertitel'-Tab hinzu."

## Was ich noch prüfen muss (vor Implementierung)
- Welche Edge Functions die Storyboard-Prompts erzeugen und welche die Clips rendern (`compose-video-*` und `generate-scene-clip*`)
- Wo im Frontend der Prompt-Editor liegt (`StoryboardTab.tsx` oder Sub-Komponente)

## Geänderte Dateien (geschätzt)
- `supabase/functions/_shared/videoPromptGuards.ts` (neu) — Suffix + Helfer `ensureNoTextSuffix(prompt)`
- `supabase/functions/compose-video-storyboard/index.ts` (oder äquivalent) — System-Prompt-Ergänzung
- `supabase/functions/generate-scene-clip/index.ts` (oder äquivalent) — `ensureNoTextSuffix()` vor Provider-Call
- `src/components/video-composer/StoryboardTab.tsx` (oder Prompt-Editor-Sub-Komponente) — kleiner Hinweis-Text
- `src/lib/translations.ts` — Hinweis-Text (DE/EN/ES)

## Verify
- Neue Storyboard-Generierung: alle Szenen-Prompts enden mit Negative-Klausel
- Bestehende Storyboards: beim "Clips generieren" wird Suffix automatisch angehängt
- Manuelles Editieren: Suffix wird beim Render trotzdem garantiert
- Generierte Clips zeigen kein eingebranntes Text/Captions
- UI-Hinweis erscheint unter dem Prompt-Editor

## Was unverändert bleibt
- Voiceover- & Untertitel-Logik (Tab 4)
- Clip-Render-Pipeline, Pricing, DB-Schema
- Provider-Auswahl (Hailuo/Kling/Seedance/Stock/Custom)
