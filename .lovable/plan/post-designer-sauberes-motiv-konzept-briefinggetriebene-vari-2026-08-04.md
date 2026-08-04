# Post Designer: sauberes Motiv-Konzept + briefinggetriebene Varianten

## Was im Screenshot auffällt

1. **Das KI-Motiv enthält selbst Text und Logo** ("AdTool AI", "14 TAGE KOSTENLOS TESTEN" auf einem Tablet). Ursache: Die Bildanfrage startet mit dem rohen deutschen Briefing (`generateImage(brief)`). Das dafür vorgesehene Feld `imagePrompt` — englisch, mit den Regeln "kein Text, keine Buchstaben, kein Logo" und "ruhige Negativfläche" — liefert die Edge Function bereits, es wird nur nie verwendet.
2. **Headline liegt auf dem Bildtext** und in "Split Layout" **überlappen Headline und Subline**. Die Auto-Verkleinerung schrumpft nur, die Ebenen wissen nichts voneinander.
3. **Immer dieselben acht Stile.** `pickVariants(platform, tone)` ist rein deterministisch: gleiche Plattform + gleiche Tonalität = identische Vorlagenliste, unabhängig vom Briefing. Das Briefing beeinflusst nur die Texte, nicht die Layoutauswahl.
4. Alle acht Karten zeigen dasselbe Motiv im selben Ausschnitt; das Raster ist rechts angeschnitten.

## Die professionellste und sauberste Lösung

Das Prinzip, mit dem professionelle Design-Tools arbeiten: **Das Bild liefert niemals Typografie, das Layout liefert niemals Bildinhalt — und das Layout bestimmt, wie das Bild aussehen muss, nicht umgekehrt.**

Konkret als **Layout-First-Bildvertrag**:

1. Zuerst steht das Layout fest (welche Familie, wo sitzt Headline, wo Subline, wo CTA).
2. Aus dem Layout wird die **Negativraum-Zone** abgeleitet (z. B. "unteres Drittel ruhig", "linke Hälfte frei", "Mitte frei").
3. Erst dann wird der Bild-Prompt gebaut: englisch, motivbeschreibend, mit dieser Zone als Kompositionsvorgabe und einem festen Negativ-Block (kein Text, keine Buchstaben, keine UI-Screens, kein Logo, kein Wasserzeichen). Der Prompt entsteht zentral an einer Stelle, nicht verstreut im Seiten-Code.
4. Der Renderer sichert die Lesbarkeit unabhängig vom Motiv ab: abgestimmter Verlauf hinter Textblöcken und eine echte Kollisionsprüfung zwischen Textebenen (Subline rückt nach, statt sich zu überlagern) — identisch in Vorschau und Export.

Damit ist das Ergebnis nicht mehr vom Zufall des Motivs abhängig, sondern garantiert lesbar. Kein nachträgliches Reparieren, sondern ein Vertrag, den Layout und Bild gemeinsam erfüllen.

## Varianten, die sich am Briefing orientieren

Statt fester Reihenfolge entscheidet der Inhalt über die Layoutauswahl:

- **Intent-Erkennung** aus dem Briefing durch dieselbe KI-Antwort, die schon die Copy liefert: Angebot/Rabatt, Produktvorstellung, Wissen/Tipps, Beweis/Testimonial, Launch/Event, Statement, Frage/Engagement.
- Der Vorlagenkatalog trägt bereits passende Kategorien (Angebot, Produkt, Wissen, Beweis, Launch, Event, Zitat, Minimal, Aussage, Engagement). Die Auswahl gewichtet künftig nach erkanntem Intent — ein Rabatt-Briefing bringt Angebot- und Launch-Layouts nach vorn, ein Ratgeber-Briefing die Wissen- und Listen-Layouts.
- Zusätzlich fließen Plattform, Tonalität und Textlänge ein: sehr lange Headlines schließen typolastige Layouts mit kleinem Textfeld aus.
- Ein aus dem Briefing abgeleiteter **Seed** sorgt für Abwechslung zwischen verschiedenen Briefings, bleibt aber bei gleichem Briefing stabil (kein Zufalls-Flackern beim erneuten Öffnen). "Mehr Richtungen" blättert deterministisch weiter.
- **Motiv-Vielfalt**: zwei bis drei Motive statt einem, verteilt über die Karten; typolastige Varianten bleiben bewusst bildfrei.

## Technische Umsetzung

- Neue Datei `src/lib/post-design/imagePrompt.ts`: zentrale Prompt-Komposition — Motivkern aus `copy.imagePrompt` (Fallback: aus dem Briefing abgeleitet), Negativraum-Zone je Layout-Familie, fester Negativ-Block.
- Neue Datei `src/lib/post-design/intent.ts`: Intent-Typen und Mapping Intent → Vorlagenkategorien.
- `supabase/functions/generate-post-design/index.ts`: Antwortschema um `intent` erweitern (Enum) und `imagePrompt` in der Systemanweisung schärfen.
- `src/lib/post-design/templates.ts`: `pickVariants(opts: { platform, tone, intent, headlineLength, seed, count, offset })` — Kategorie-Gewichtung nach Intent, seed-basierte, deterministische Reihenfolge.
- `src/pages/PostDesigner.tsx`: Bildanfrage über `buildImagePrompt(...)`; erster Start sofort mit briefingbasiertem Prompt, Verfeinerung mit `copy.imagePrompt`, sobald verfügbar (nur wenn der Nutzer kein eigenes Bild gesetzt hat); optional zweiter/dritter Motiv-Call.
- `src/components/post-designer/SlideRenderer.tsx`: Kollisionsprüfung zwischen Textebenen und Scrim hinter Textblöcken, deterministisch bei 1080 px.
- `src/components/post-designer/VariantGallery.tsx`: Rasterbreite korrigieren, Motiv-Zuordnung pro Karte.
