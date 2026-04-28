## Problem

Im Video Composer (Schritt 04 — Voiceover & Untertitel) wird das KI-generierte Skript für ein 60-Sekunden-Video oft viel zu kurz (z. B. nur ~8 Sekunden Sprechzeit / 20 Wörter). Der `defaultDuration` (totalSceneDuration) wird zwar bereits aus dem Storyboard übergeben, aber:

1. Der Prompt in `generate-voiceover-script` formuliert die Vorgabe weich ("approximately X seconds") und das Modell unterschreitet die Vorgabe massiv.
2. Es gibt keine Pufferlogik — der Wunsch ist, dass der VO **2–3 Sekunden vor Ende** des Videos endet.
3. Das Modell `gemini-2.5-flash` ohne strukturierten Tool-Call neigt zu freien JSON-Antworten und ignoriert numerische Constraints.

## Lösung

### 1. Pufferlogik im Frontend (`VoiceoverScriptGenerator.tsx`)

Beim Öffnen aus dem Composer wird `defaultDuration` = totale Szenendauer übergeben. Wir berechnen daraus eine **effektive Sprechdauer**:

```
speakingTarget = max(8, defaultDuration - 2.5)
```

Dieser Wert wird als initialer Slider-Wert gesetzt UND als `targetDuration` an die Edge Function geschickt. Der UI-Slider zeigt weiterhin den effektiven VO-Wert; ein kleiner Hinweistext erklärt: „Endet ca. 2–3s vor Videoende (Gesamt: 60s)".

### 2. Edge Function `generate-voiceover-script` härten

- **Tool-Calling statt freies JSON**: Auf strukturierte Ausgabe via `tools` umstellen (analog zur `extract structured output` Best Practice). Das erzwingt exakt `{ script, tips }`.
- **Harte Längen-Constraints im System-Prompt** (DE/EN/ES):
  - Definiere `minWords = round(targetDuration * 2.3)`  
  - Definiere `maxWords = round(targetDuration * 2.7)` (Sprechrate ~150 WPM = 2.5 Wörter/s, ±10% Toleranz)
  - Prompt enthält explizit: „Das Skript MUSS zwischen `minWords` und `maxWords` Wörter haben. Kürzere oder längere Antworten sind nicht erlaubt."
- **Validierung & Auto-Retry (max 1×)**: Nach der ersten Antwort Wortanzahl prüfen. Liegt sie unter `minWords * 0.85`, einmal nachfassen mit korrigierender User-Message: „Dein Skript war nur N Wörter, benötigt werden mindestens M. Schreibe es länger."
- Modell auf `google/gemini-2.5-pro` heben für die Skript-Generierung (deutlich bessere Constraint-Treue als Flash bei längeren Texten); Flash bleibt nur Fallback.

### 3. UI-Klarheit (`VoiceoverScriptGenerator.tsx`)

- Label-Anpassung: „Ziel-Sprechdauer: 57s _(Video: 60s, Puffer 3s)_" wenn ein `defaultDuration` aus dem Composer kommt.
- Nach Generierung prüft das Frontend zusätzlich: liegt `estimatedDuration` deutlich unter Target, zeige eine Warnung mit „Erneut generieren"-Button (statt stilles Akzeptieren).

## Geänderte Dateien

- `supabase/functions/generate-voiceover-script/index.ts` — Tool-Calling, harte min/max Word-Range, Retry-Logic, Modell-Upgrade.
- `src/components/universal-creator/VoiceoverScriptGenerator.tsx` — Puffer-Berechnung (T-2.5s), Label mit Video-Gesamtlänge, Warnung bei Untermaß.
- `src/components/video-composer/VoiceSubtitlesTab.tsx` — keine strukturelle Änderung; `defaultDuration` wird bereits korrekt übergeben.

## Erwartetes Ergebnis

- 60s-Video → Slider zeigt 57s, AI generiert ~131–154 Wörter (statt 20).
- 30s-Video → 27s Target, ~62–73 Wörter.
- 15s-Video → 12.5s Target, ~29–34 Wörter.
- Skript endet zuverlässig 2–3s vor Videoende, lässt Raum für Logo-Endcard / Outro.
