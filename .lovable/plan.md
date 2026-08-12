# Seedance 2.5: Sprache/Voiceover freischalten statt unterdrücken

## Befund

In `src/components/ai-video/ToolkitGenerator.tsx` steht Seedance in `PROVIDER_TTS_LANGS` mit leerer Liste (`seedance: []`). Folge: `ttsLangSupported` ist für **jede** Sprache `false` — auch für Englisch. Daraus entstehen drei Fehler:

- Der gelbe Hinweis behauptet fälschlich, die gewählte Sprache werde nicht unterstützt.
- `spokenLanguage` wird nie an die Edge Function übergeben.
- Stattdessen wird `suppressDialogue: true` gesendet, was serverseitig einen No-Speech-Zusatz an den Prompt hängt — das Modell wird also aktiv am Sprechen gehindert.

Seedance 2.5 erzeugt mit `generate_audio` aber sehr wohl Dialog/Voiceover, nicht nur Ambience.

## Umsetzung

1. **Seedance als sprachfähig eintragen** (`ToolkitGenerator.tsx`): `seedance: ['en', 'de', 'es']`. Damit greift der bestehende Pfad: Sprachwahl sichtbar, `spokenLanguage` wird gesendet, kein `suppressDialogue`, kein Warnhinweis.

2. **Prompt-Sprachhinweis**: Der vorhandene `spokenLangSuffix` (Dialog in der gewählten Sprache) wird für Seedance mitgesendet, damit die Sprache deterministisch gesetzt ist und nicht vom Prompt-Inhalt abhängt.

3. **Hinweistext generalisieren**: Der Warnblock unterscheidet künftig „Modell kann gar keine Sprache" (Ambience/Foley/Musik-Text, ohne Sprachbezug) von „diese Sprache wird nicht zuverlässig unterstützt" (bisheriger Text, z. B. Kling/Grok/HappyHorse bei DE/ES). Bei Modellen ohne jede Sprachausgabe wird die Sprachwahl ausgeblendet, da sie folgenlos wäre.

4. **Verifikation**: je ein 4-s-Testclip mit Sprech-Prompt auf EN und DE bei 480p; geprüft wird im Function-Log, dass `generate_audio: true` und der Sprach-Suffix rausgehen, und an der fertigen MP4, dass verständliche Sprache in der gewählten Sprache zu hören ist. Falls DE/ES im Test Fantasie-Sprache liefert, wird die Liste auf die bestätigten Sprachen reduziert — dann greift automatisch wieder der korrekte, sprachbezogene Hinweis.

## Technische Details

Betroffen: `src/components/ai-video/ToolkitGenerator.tsx` (Sprachtabelle, Hinweisblock ~1362, Sprachwahl ~1340). Das in der Edge Function `generate-seedance25-video` bereits vorhandene `suppressDialogue`-Feld bleibt bestehen, wird für Seedance im Normalfall aber nicht mehr gesetzt. Keine Änderungen an Preisen, Wallet-Logik, Composer-Pfad oder Lip-Sync-Kette.
