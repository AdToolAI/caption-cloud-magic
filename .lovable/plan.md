## Warum die Sprachauswahl fehlt

Der Screenshot zeigt Route `/music-studio` → gerendert von `src/pages/MusicStudio.tsx`.
Die letzte Sprachauswahl-Integration landete aber nur in `src/components/audio-studio/MusicGeneratorPanel.tsx` (die im Audio Studio genutzt wird). `MusicStudio.tsx` bestimmt die Sprache aktuell nur aus `navigator.language` — es gibt kein UI-Element.

## Fix — Sprachauswahl in MusicStudio.tsx nachrüsten

1. **State ergänzen** in `src/pages/MusicStudio.tsx`
   - `const [language, setLanguage] = useState<string>('en')` (statt `useMemo`)
   - Beim Mount initial aus `navigator.language` vorbelegen, sofern vom aktuellen Tier unterstützt (`isLanguageSupported`); sonst `'en'`.

2. **Tier-Wechsel absichern**
   - `useEffect([tier])`: Wenn aktuelle `language` in `MUSIC_LANGUAGE_SUPPORT[tier]` nicht vorkommt → auf ersten unterstützten Wert zurückfallen (bzw. leer wenn Tier keinen Gesang hat).

3. **UI-Dropdown einbauen** (zwischen „Instrumental"-Switch und Lyrics-Editor)
   - Sichtbar nur wenn `tierHasVocals(tier, instrumental) === true` (also `standard`/`pro` mit Instrumental=off oder `vocal`).
   - Label: „Gesangssprache".
   - Optionen: `MUSIC_LANGUAGE_SUPPORT[tier]` mit `flag + label`.
   - Für `quick`/`adaptive` oder Instrumental=on: Dropdown ausblenden und Hinweis „Instrumental — keine Sprache nötig".

4. **Prompt-Härtung im Submit**
   - In `handleGenerate` bei vokalen Tiers `[LANGUAGE: <name>]` an den Prompt anhängen (via `getLanguageMeta(tier, language).name`), analog zum bestehenden Audio-Studio-Panel.
   - `generateLyrics`-Aufruf: `language` als 2-Letter-Code weiterreichen (bereits vorhanden, aber jetzt aus dem State).

5. **Kein Backend-/Business-Logic-Change**
   - `useMusicGeneration.ts`, Edge Functions, Preise bleiben unangetastet.
   - Reine Presentation-Layer-Ergänzung in einer Datei.

## Ergebnis

Im Music Studio erscheint für `MiniMax Music 1.5` (vocal) sowie ElevenLabs standard/pro (wenn Instrumental aus) eine „Gesangssprache"-Dropdown mit exakt den Sprachen, die der jeweilige Provider sauber singt (DE ✓ für alle drei). Die Auswahl wird per `[LANGUAGE: …]`-Direktive in Prompt und Lyrics-Generator erzwungen.