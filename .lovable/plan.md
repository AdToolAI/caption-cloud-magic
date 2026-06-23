## Problem

Aktuell akzeptiert der Composer-Briefing-Flow nur einen kurzen Textprompt → Ad/Auto-Director erzeugt daraus ein generisches Default-Storyboard (Hailuo, 4 Szenen, kein VO, kein Shot-Director, kein Cast-Override). Lange strukturierte Briefings (6–7 Seiten mit Skript-Tabelle, ElevenLabs-Settings, Caption-Style, Negative-Prompt) werden **inhaltlich nicht ausgewertet** — der Director sieht nur „erzeuge ein Werbevideo" und füllt die Felder selbst.

Ziel: Ein Briefing in Briefing-Tiefe (mehrere tausend Tokens, Markdown/Tabellen) soll **deterministisch** in Projekt-Settings + alle Szenen-Felder übersetzt werden, inkl. VO, Cast/Location-Mentions, Shot-Director, Captions, Negative Prompt.

---

## Smarteste Lösung: 3-stufige Briefing-Pipeline

Statt einen Mega-LLM-Call zu hoffen, wird das Briefing in **strukturierte Layer** zerlegt — jeder Layer schreibt deterministisch in genau die UI-Felder, die er befüllen darf. Das ist robust, debugbar, und skaliert auf 7+ Seiten ohne Halluzination.

### Stufe 1 — Briefing-Parser (Edge Function `parse-briefing`)

**Input:** Rohtext (Markdown, Tabellen, beliebige Länge bis ~30k Tokens) + optional Datei-Upload (PDF/DOCX → via `document--parse_document`-Äquivalent serverseitig).

**Verarbeitung:**
- Lovable AI Gateway, Modell `google/gemini-2.5-flash` (lang-Kontext, billig)
- **Tool-Calling mit striktem Zod-Schema** statt freiem JSON — Gemini *muss* die Felder ausfüllen, kann nichts erfinden
- Bei sehr langen Briefings: chunked-summarize-then-extract (erst Sektionen erkennen, dann pro Sektion extrahieren)

**Output:** Ein normalisiertes `BriefingManifest`:

```ts
{
  project: { name, aspectRatio, fps, totalDurationSec, platforms[] },
  scenes: [{
    index, label, durationSec, engine,
    vo: { text, timecodeStart, timecodeEnd, delivery, speedMultiplier },
    cast: [{ mentionKey, outfit? }],
    location: { mentionKey },
    shotDirector: { framing, angle, movement, lighting, stylePreset },
    anchorPromptHintEN: string,
    performance: { mimik?, gestik?, blick?, energy? },
  }],
  voice: { provider:'elevenlabs', voiceId, model, stability, similarityBoost, style, speakerBoost, requestStitching },
  captions: { source, font, sizePx, color, strokeColor, strokePx, highlightColor, maxWordsPerCue, position, safeZonePct, burnIn, highlightWords[] },
  negativePrompt: string,
  unresolved: [{ field, reason, suggestion }] // alles was der Parser nicht 1:1 mappen konnte
}
```

### Stufe 2 — Resolver (clientseitig + Edge `resolve-briefing-mentions`)

Übersetzt **Briefing-Aliase → echte DB-IDs**:

- `@founder-avatar` → sucht in `brand_characters` (own + purchased via `useAccessibleCharacters`); wenn nicht gefunden → schlägt vor, einen anzulegen oder einen ähnlichen zu mappen
- `@home-office` → analog `brand_locations`
- `JBFqnCBsd6RMkjVDRZzb` (ElevenLabs Voice-ID) → validiert gegen `elevenlabs-voices.ts`
- Style-Presets („Founder Authentic") → mappt auf `cinematicRealismPresets` / `composerVisualStyles`
- Shot-Director-Werte → validiert gegen `shotDirector/` Enums (Framing/Angle/Movement/Lighting)

Unresolved Items → werden im UI als **Briefing-Diff** angezeigt (siehe Stufe 3).

### Stufe 3 — Briefing Apply Sheet (UI)

Nach Parse + Resolve öffnet sich ein **Review-Sheet** mit:

- Linke Spalte: extrahierte Werte aus Briefing
- Rechte Spalte: aktuelle Projekt-Werte
- Pro Feld: Checkbox „übernehmen" (default ON)
- Unresolved-Section mit Inline-Action („Avatar anlegen", „Voice mappen", …)
- Footer: „Alles übernehmen" → schreibt deterministisch in Composer-State (Zustand-Store / DB)

→ Damit ist die **Übernahme nachvollziehbar**, nicht magisch, und der User sieht sofort was wirklich gemappt wurde.

---

## Wo das im Code andockt

| Komponente | Verantwortlich |
|---|---|
| `supabase/functions/parse-briefing/index.ts` (neu) | Stufe 1, Tool-Calling, Zod-Schema |
| `supabase/functions/resolve-briefing-mentions/index.ts` (neu) | Stufe 2, DB-Lookup |
| `src/lib/video-composer/briefing/manifestSchema.ts` (neu) | Shared Zod-Schema (client + edge) |
| `src/components/video-composer/briefing/BriefingApplySheet.tsx` (neu) | Stufe 3, Review-UI |
| `src/components/video-composer/briefing/BriefingInput.tsx` (neu/erweitert) | Textarea + File-Upload (PDF/MD/TXT) → ruft `parse-briefing` |
| `src/pages/VideoComposer/index.tsx` | Integriert „📋 Briefing importieren"-Button neben „Ad Director" / „Auto-Director" |
| `src/hooks/useApplyBriefingManifest.ts` (neu) | Schreibt akzeptierte Felder in Composer-State (Szenen-CRUD, VO-Track, Captions-Config) |

---

## Warum diese Lösung „smart" ist

1. **Deterministisch statt magisch** — Tool-Calling mit Zod erzwingt Struktur; Gemini kann keine Felder erfinden oder vergessen.
2. **Skaliert auf 7+ Seiten** — Gemini 2.5 Flash hat 1M-Token-Context; chunked-extract als Fallback.
3. **Robust gegen Halluzination** — Resolver-Stufe validiert gegen echte DB/Enums; Unresolved bleibt sichtbar statt still-falsch.
4. **Wiederverwendbar** — gleicher `BriefingManifest` kann später auch im Ad Director / Email Director / Universal Creator angewendet werden.
5. **User-Transparenz** — Review-Sheet zeigt was übernommen wird, bevor irgendwas geschrieben wird → kein „warum hat er das nicht gemacht?"-Moment mehr.
6. **Refund-safe** — kein Credit-Verbrauch beim Parsen (nur Lovable-AI-Token, billig); Render läuft erst nach User-Bestätigung.

---

## Offene Frage vor Build

Soll der Briefing-Importer (a) **nur in Motion Studio / Video Composer** verfügbar sein, oder (b) als **globales Tool** (Ad Director, Email Director, Universal Creator auch)? 

Empfehlung: (a) zuerst, weil dort der höchste Mehrwert ist und das Manifest-Schema sich am Composer-Feldset orientiert. Andere Studios in einer späteren Iteration anbinden, sobald das Schema stabil ist.
