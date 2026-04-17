

## Befund

Im Storytelling-Prompt (`supabase/functions/compose-video-storyboard/index.ts`, Zeile 38) steht aktuell:

> "Text overlays should be poetic/cinematic (a single line of dialogue, a date, a place, a feiling) — never marketing copy."

Damit **fordert** der Prompt das Modell aktiv auf, Text-Overlays (z. B. „Sleepy Hollow, 1790" wie im Screenshot) zu erzeugen. Die generelle "NO BURNED-IN TEXT"-Regel (Z. 105–106) verbietet zwar Text **innerhalb** des AI-generierten Videoclips, regelt aber **nicht** die Overlay-Felder (`textOverlayText`, `textPosition`, `textAnimation`) im Storyboard-Schema (Z. 213–224).

Zusätzlich: Auch im Screenshot ist „Sleepy Hollow, 1790" im Video-Clip **eingebrannt** — das ist ein zusätzliches Problem (das AI-Modell ignoriert die negative Klausel manchmal), aber dafür bräuchte es separate Maßnahmen am Clip-Generator-Level.

Für diese Anfrage konzentrieren wir uns sauber auf den **Storytelling-Prompt** und stellen sicher, dass der Storyboard-Generator für Storytelling **keinerlei Text-Overlays** mehr produziert.

## Plan

### Fix 1 — Storytelling-Strukturprompt: Text-Overlays komplett verbieten
In `compose-video-storyboard/index.ts` Z. 38 die Zeile

> "Text overlays should be poetic/cinematic..."

ersetzen durch eine harte Regel:

> "🚨 NO TEXT OVERLAYS AT ALL — `textOverlayText` MUST be an empty string `""` for every scene. Storytelling lebt rein von Bildsprache, Atmosphäre, Schauspiel und Schnitt — keine Schrift, keine Untertitel, keine Datums-/Ort-Inserts. Der Zuschauer soll den Film sehen, nicht lesen."

### Fix 2 — System-Prompt-Hinweis am `textOverlayText`-Schema
Im Schema (Z. 213–215) die `description` von `textOverlayText` ergänzen:

> `Short overlay text in ${langLabel} (max 8 words). Empty string if no text needed. **For category="storytelling": MUST always be empty string "".**`

### Fix 3 — Conditional Hard-Rule im System-Prompt
Direkt nach den „Hard rules" (Z. 100–103) einen kategorie-bedingten Block einfügen:

```
${category === 'storytelling' ? '🚨 STORYTELLING MODE — TEXT OVERLAY BAN: textOverlayText MUST be "" for every scene. textAnimation MUST be "none". textPosition can stay default but is irrelevant.' : ''}
```

So sieht das LLM die Regel zweimal (Struktur + System), was bei Gemini Flash die Compliance deutlich erhöht.

### Optional (nicht in diesem Plan, aber Nebenbefund)
Der Screenshot zeigt eingebrannten Text **im AI-Clip selbst** („Sleepy Hollow, 1790"). Das ist ein separates Problem im `compose-video-clips`-Negativ-Suffix bzw. am Modell. Wenn gewünscht, kann ich das als Folgeschritt verschärfen (z. B. „no movie title cards, no date stamps, no location cards" zur Negativ-Liste hinzufügen).

## Geänderte Dateien

- `supabase/functions/compose-video-storyboard/index.ts` — drei kleine Edits in der Storytelling-Struktur, im Schema und im System-Prompt

## Verify

1. Neues Storytelling-Projekt anlegen → Storyboard generieren → in der DB hat **jede** Szene `textOverlayText = ""`
2. Im Voiceover & Untertitel-Tab erscheinen keine Text-Overlays mehr aus dem Storyboard
3. Sprachen DE/EN/ES alle gleiches Verhalten
4. Andere Kategorien (corporate-ad, product-ad, custom) generieren weiterhin normal Text-Overlays

