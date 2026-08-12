# Falscher Audio-Hinweis bei Modellen ohne Voiceover

## Befund

In `src/components/ai-video/ToolkitGenerator.tsx` gibt es nur einen einzigen Zustand: `ttsLangSupported`. Für Seedance 2.5 (und LTX, Wan, Hailuo, Luma, Runway, Pika, Vidu) ist die Sprachliste leer — damit ist `ttsLangSupported` **für jede** Sprache `false`, auch für Englisch. Der Hinweistext formuliert das aber als Sprachproblem („unterstützt diese Sprache nicht zuverlässig"), obwohl das Modell überhaupt kein Voiceover kann — unabhängig von der Sprache. Zusätzlich wird der Auswahlblock „Gesprochene Sprache" für diese Modelle angezeigt, obwohl die Wahl dort folgenlos bleibt.

## Umsetzung

1. **Zwei Fälle unterscheiden** statt einem Flag:
   - `modelSpeaks` = das Modell hat überhaupt native Sprachausgabe (Sprachliste nicht leer bzw. Kling Omni).
   - `ttsLangSupported` = die gewählte Sprache ist davon abgedeckt (nur relevant, wenn `modelSpeaks`).

2. **Hinweistexte trennen** (DE/EN/ES):
   - Kein Voiceover möglich: „<Modell> erzeugt Umgebungssound, Foley und Musik, aber keine Sprache. Für gesprochenen Text z. B. Veo 3.1 oder Sora 2 wählen oder die Stimme im Motion Studio ergänzen." — neutral formuliert, ohne Sprachbezug.
   - Sprache nicht unterstützt (z. B. Kling/Grok/HappyHorse mit DE/ES): bisheriger Text bleibt.

3. **Sprachwahl ausblenden**, wenn das Modell keine Sprache erzeugen kann — die Auswahl hätte dort keine Wirkung. Bei Modellen mit eingeschränkter Sprachliste bleibt sie sichtbar.

4. Am Request-Verhalten ändert sich nichts: `generateAudio` geht weiterhin durch, `suppressDialogue` wird weiterhin gesetzt, wenn keine echte Sprache möglich ist.

## Technische Details

Nur `src/components/ai-video/ToolkitGenerator.tsx` (Ableitung um `modelSpeaks` erweitern, Hinweisblock ~Zeile 1362 aufteilen, Sprachwahl-Block ~Zeile 1340 bedingt rendern). Keine Änderungen an Edge Functions, Preisen oder der Lip-Sync-Kette.
