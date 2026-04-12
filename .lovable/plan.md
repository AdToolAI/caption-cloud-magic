

## Plan: Localize Video Translator (EN/DE/ES)

### Problem
`src/pages/VideoTranslator.tsx` has ~50 hardcoded German strings. The English UI shows everything in German.

### Scope — 2 files

| File | Changes |
|------|---------|
| `src/lib/translations.ts` | Add ~40 `vidTrans.*` keys (EN/DE/ES). DE = current hardcoded strings. |
| `src/pages/VideoTranslator.tsx` | Add `useTranslation` hook, replace all hardcoded strings with `t()`. Wrap `VOICES` and `STEPS` arrays in `useMemo`. Fix English flag from 🇬🇧 to 🇺🇸 in `LANGUAGES` list. |
| `src/config/hubConfig.ts` | Change `titleKey` from hardcoded "Videoübersetzer" to a translation key. |

### Key strings to localize

- **Hero**: "Videoübersetzer", "Video automatisch übersetzen", description paragraph
- **Input card**: "Video auswählen", "Lade ein Video hoch oder füge eine URL ein", "Video hier ablegen", "ODER", "Video-URL", "Zielsprache", "Stimme (optional)", "Standard-Stimme", "Untertitel generieren", "Übersetzen starten", "Wird hochgeladen..."
- **Voice labels**: "weiblich"/"männlich" → "female"/"male" / "femenina"/"masculina"
- **Progress steps**: "Transkription", "Übersetzung", "Voiceover", "Zusammenführung", "Fertig", status messages, "% abgeschlossen"
- **Error**: "Übersetzung fehlgeschlagen", "Ein unbekannter Fehler...", "Nochmal versuchen"
- **Result**: "Übersetzung fertig", "Originaltext", "Übersetzung", "Nicht verfügbar", "Voiceover herunterladen", "Neues Video übersetzen"

### Approach
- German UI unchanged — DE values are exact copies of current hardcoded strings
- Single batch edit of all files

