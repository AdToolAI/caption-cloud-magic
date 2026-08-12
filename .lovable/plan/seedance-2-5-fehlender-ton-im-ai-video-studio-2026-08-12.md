# Seedance 2.5: fehlender Ton im AI Video Studio

## Befund (verifiziert im Code)

Die Kette ist bis auf eine Stelle korrekt: `_shared/modelark.ts` sendet `generate_audio` als Body-Feld, `generate-seedance25-video` nimmt `generateAudio` entgegen. Der Ton geht im Client verloren:

- `src/components/ai-video/ToolkitGenerator.tsx` führt eine Tabelle `PROVIDER_TTS_LANGS`. Dort steht `seedance: []`.
- Daraus folgt `ttsLangSupported === false` für jede Sprache.
- Zeile 748: `body.generateAudio = generateAudio && ttsLangSupported && ...` → für Seedance 2.5 **immer `false`**, obwohl der Schalter „Native Audio generieren" an ist.
- Genau deshalb erscheint auch der gelbe Hinweis im Screenshot („kein Voiceover — nur Umgebungssound/Musik") — nur wird eben auch der Umgebungssound nie angefordert.

Zweiter Punkt: der Client setzt in diesem Fall `body.suppressDialogue = true`, aber `generate-seedance25-video` kennt dieses Feld nicht und ignoriert es. Ohne Sprech-Verbot im Prompt kann Seedance sonst Fantasie-Sprache erzeugen.

## Umsetzung

1. **Sprachfähigkeit von Audiofähigkeit trennen** (`ToolkitGenerator.tsx`):
   - `ttsLangSupported` bleibt die Frage „kann das Modell diese Sprache *sprechen*?"
   - Neu: `body.generateAudio = generateAudio` (der reine Audio-Schalter), unabhängig von der Sprachunterstützung. `spokenLanguage` wird weiterhin nur bei unterstützter Sprache gesetzt, sonst `suppressDialogue: true`.
   - Kling Omni behält seine harte DE/ES-Sperre (`omniNonEnglishSilent` → kein Audio), weil dort nachweislich Fantasie-Sprache entsteht.
   - `seedance: []` wird zu einem Eintrag mit Kommentar „ambience/foley only, keine Sprache".

2. **Sprech-Verbot serverseitig** (`generate-seedance25-video/index.ts`):
   - `suppressDialogue?: boolean` in das Request-Interface aufnehmen und bei `true` einen kurzen englischen No-Speech-Zusatz an den Prompt hängen (keine Sprache/keine Lippenbewegung, nur Ambience/Foley/Musik) — dieselbe Formulierung, die der Hybrid-Ambient-Pfad im Composer schon nutzt.

3. **UI-Text korrigieren**: Der Hinweis unter dem Sprachwahl-Feld sagt künftig, dass Seedance 2.5 Umgebungssound und Musik liefert, aber kein Voiceover — statt implizit „gar kein Ton". Text in DE/EN/ES.

4. **Verifikation**: ein 4-s-Testclip bei 480p mit aktivem Audio-Schalter; im Function-Log wird geprüft, dass `generate_audio: true` an ModelArk geht, und die fertige MP4 wird auf eine vorhandene Audiospur geprüft.

## Technische Details

Betroffene Dateien: `src/components/ai-video/ToolkitGenerator.tsx`, `supabase/functions/generate-seedance25-video/index.ts`. Keine Änderung an Preisen, Wallet-Logik, der Lip-Sync-Kette oder dem Composer-Pfad (`resolveSceneAudioSource` bleibt unberührt).
