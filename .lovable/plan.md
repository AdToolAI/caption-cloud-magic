# Muster-Briefing: Format, das die Briefing-Analyse zu 100 % übernimmt

Ziel: ein verbindliches Musterbeispiel, das exakt die Felder trifft, die die Analyse-Pipeline (`analyze-briefing`) erkennt — und ein Test, der beweist, dass daraus vollständige Szenen im Storyboard entstehen.

## Was die Pipeline heute sicher erkennt

Aus der Analyse der Parser und des Manifest-Schemas:

- **Gesamtlänge** aus `Länge: ca. 30 Sekunden` / `Gesamtdauer: …` oder aus Zeitfenstern (`Zeit: ca. 0–5 Sekunden`).
- **Szenenanzahl** aus `Szenen: 3` bzw. `3 Szenen`; `eine durchgehende Szene` erzwingt genau 1 Szene.
- **Cast und Orte nur über @-Mentions** (`@founder-avatar`, `@home-office`) — Klarnamen ohne @ werden nicht gegen Cast & World aufgelöst.
- **Dialogzeilen** nur, wenn Sprecher als @-Mention vor der Zeile stehen; sonst landen sie als Voiceover.
- **Shot-Direktion** nur aus dem festen Vokabular (Framing, Winkel, Bewegung, Licht) — Freitext wie „schöne Kamerafahrt" wird verworfen.
- **Voice-, Untertitel- und Negative-Prompt-Werte**, wenn sie als Schlüssel-Wert-Zeilen dastehen.
- **Kein On-Screen-Text**: Hooks, CTAs und Untertitel gehören nicht in Szenenbeschreibungen, die KI ignoriert sie dort bewusst.

## Was gebaut wird

1. **Referenzdokument `docs/briefing-musterbeispiel.md`**
   - Ein vollständiges, kopierbares Muster-Briefing (30 s, 3 Szenen, 2 Sprecher mit Dialog, @-Mentions, Shot-Direktion, Voice- und Caption-Block).
   - Eine kurze Feldreferenz: welcher Schlüssel welches Feld im Storyboard füllt.
   - Ein „Anti-Muster"-Abschnitt: die fünf Formulierungen, die die Übernahme regelmäßig verhindern (Namen ohne @, Länge nur im Fließtext, Kameraprosa, On-Screen-Text in Szenen, widersprüchliche Zeitangaben).

2. **Vorlage direkt im Briefing nutzbar**
   - Im Briefing-Tab ein unauffälliger Sekundär-Link „Muster-Briefing einfügen", der die Vorlage (lokalisiert DE/EN/ES) in das Freitextfeld schreibt, wenn es leer ist — sonst mit Bestätigung.
   - Die Vorlage liegt als einzige Quelle in `src/lib/video-composer/briefingTemplate.ts` und wird auch im Dokument referenziert.

3. **Golden-Path-Test**
   - `src/lib/video-composer/__tests__/briefingTemplate.test.ts` prüft gegen die vorhandenen Detektoren, dass das Muster genau 30 s, 3 Szenen und die erwarteten Zeitfenster ergibt und alle @-Mentions eindeutig sind — damit das Muster nicht still veraltet, wenn die Parser sich ändern.

## Technische Details

- Das Muster hält sich an `BriefingManifest` (`supabase/functions/_shared/briefing/manifestSchema.ts`): Szenen mit `index`, `durationSec`, `cast[].mentionKey`, `location.mentionKey`, `shotDirector`-Enums, `voiceover.text` plus Timecodes.
- Dialogzeilen werden so formatiert, dass Pass A `dialogTurns` mit `speakerMentionKey` erzeugt, damit `useApplyProductionPlan` sie auf Charakter-UUIDs mappen kann.
- Es werden keine Edge Functions und keine Prompts geändert — reine Dokumentation, eine Vorlagen-Konstante und ein Test.
