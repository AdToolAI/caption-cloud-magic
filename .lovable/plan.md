## Ziel
Sprachauswahl fürs Lied im Music Studio – nur Sprachen, die vom jeweiligen Provider sauber unterstützt werden. Der Prompt/die Lyrics-Generierung erhalten die Sprache explizit, sodass die KI nicht mehr raten muss (aktuell ergibt „Sad Song about … in English" trotzdem oft deutsche Lyrics).

## Provider-Sprachmatrix (nur verifiziert-saubere Sprachen)
- **quick** (MusicGen, instrumental) → kein Vokal → Sprachwahl ausgeblendet
- **adaptive** (Stable Audio 2.5, instrumental) → kein Vokal → ausgeblendet
- **vocal** (MiniMax Music 1.5) → EN, DE, ES, FR, IT, PT, JA, KO, ZH
- **standard** (ElevenLabs Music) → EN, DE, ES, FR, IT, PT, NL, PL, JA
- **pro** (ElevenLabs Music Pro) → gleiche Liste wie standard

Endgültige Anzeigeliste pro Tier wird aus einer zentralen Map (`MUSIC_LANGUAGE_SUPPORT`) in `src/lib/music/languageSupport.ts` gerendert; nur der Schnitt „Provider unterstützt + wir garantieren Qualität" (EN/DE/ES/FR/IT/PT + JA für standard/pro, + KO/ZH für vocal) ist auswählbar.

## UI-Änderungen (nur Frontend)
`src/components/audio-studio/MusicGeneratorPanel.tsx`
- Neuer `Select`-Block „Sprache" zwischen Mood und BPM, mit Flag-Emoji + Sprachname.
- Wird nur gerendert, wenn Tier ∈ {standard, vocal, pro} **und** `instrumental === false` (bzw. für vocal immer, da Lyrics Pflicht sind).
- Default: aus `useTranslation().language` (fällt auf `en` zurück, falls Provider die aktuelle UI-Sprache nicht kann).
- Wechsel des Tiers, das die gewählte Sprache nicht kann → Auto-Fallback auf `en` + Toast-Hinweis.
- „AI Lyrics generieren" ruft `generateLyrics({ language })` bereits – wir reichen die neue State-Variable durch.

## Prompt-Härtung
- Vor dem Absenden hängt der Client an den `prompt` einen unmissverständlichen Block an: `\n\n[LANGUAGE: <Full name>] All sung vocals MUST be in <Full name>. Do not switch language.`
- `lyrics` werden unverändert übernommen (User-Text hat Vorrang).
- Kein Backend-Change nötig, weil Sprache im Prompt landet; `generate-music-lyrics` bekommt die Sprache bereits über den existierenden `language`-Param.

## Persistenz
- `useToolkitDraft`-analog: Sprache wird im lokalen State gehalten, kein DB-Schema-Change.

## Neue/Editierte Dateien
1. `src/lib/music/languageSupport.ts` *(neu)* — Map `Record<MusicTier, Array<{code, label, flag}>>` + Helper `isLanguageSupported(tier, code)`.
2. `src/components/audio-studio/MusicGeneratorPanel.tsx` — Language-Select, Prompt-Suffix, Fallback-Logik, Weiterreichen an `generateLyrics`.

## Nicht enthalten
- Kein Edge-Function-Deploy (rein clientseitig).
- Keine Änderungen an Pricing, Tier-Struktur oder Voice Studio.
- Backend-Validierung der Sprache wird nicht hinzugefügt – Prompt-Direktive reicht laut Provider-Docs.
