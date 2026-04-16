

## Befund
Aktuelle Storyboard-Prompts behandeln das Produkt oft als reines "Hero-Subject" → die KI rendert dann einfach **isolierte Produkt-Aufnahmen** (Produkt auf Tisch, Produkt drehend, Macro-Detail) ohne Kontext, Mensch oder Story. Der User möchte stattdessen, dass das Produkt **in echte Szenen integriert** wird (jemand benutzt es, Lifestyle-Kontext, Umgebung), während das Produkt sichtbar und wichtig bleibt — aber nicht das einzige Element ist.

Konkrete Ursachen:
- `sceneTypeHints` sagt z. B. für `demo`: *"product hero shot · slow rotation"* → das ist genau die isolierte Produktszene, die der User vermeiden will.
- `systemPrompt` schreibt "SUBJECT: who/what is on screen" → die KI wählt fast immer das Produkt selbst als Subject.
- Keine Pflicht zu **menschlichem Kontext / Anwendung / Umgebung**.
- Keine Unterscheidung zwischen *Produkt-zentrierten* (Hook, Demo) und *Lifestyle-zentrierten* Szenen (Problem, Solution, Social-Proof).

## Plan — Produkt-in-Szene statt Produkt-als-Szene

### 1. Neue Pflichtregel im `systemPrompt`
Zusätzlich zu den 10 bestehenden Regeln:
- **SUBJECT-Regel verschärfen**: SUBJECT muss in der Mehrheit der Szenen ein **Mensch oder eine Lebenssituation** sein, in dem/der das Produkt eine konkrete Rolle spielt — nicht das Produkt allein.
- **Pflicht-Verhältnis**: max. **1 von 4 Szenen** darf reines Produkt-Hero-Shot sein. Alle anderen müssen Produkt **in Aktion / im Kontext / in Anwendung** zeigen.
- **Integrations-Regel**: in jedem `aiPrompt` muss explizit beschrieben sein, **wie** das Produkt in die Szene eingebettet ist (z. B. "in den Händen einer joggenden Frau bei Sonnenaufgang", "auf der Küchentheke neben einer kochenden Familie", "im Rucksack eines Wanderers, der aufs Tal blickt").
- **Anti-Pattern-Liste** ergänzen: vermeide "product floating", "product rotating on white", "product on pedestal", "isolated product shot", "product hero on gradient" — außer für die einzige erlaubte Hero-Szene.

### 2. Szenen-Typ-Hints umschreiben
Aktuelle Hints werden produkt-szenen-lastig formuliert. Neue Variante:
- **hook**: nicht mehr "extreme close-up product macro" → sondern *"emotional human moment that makes the viewer stop scrolling — product visible but in context (hand, pocket, table)"*
- **problem**: bleibt szenisch (frustrierter Mensch ohne Produkt)
- **solution**: *"reveal moment where the person discovers / uses the product for the first time — product entering the scene, not standing alone"*
- **demo**: *"person actively using the product in real environment — show the result/benefit, not just the product spinning. If a clean product shot is needed, this is the ONLY allowed isolated hero scene."*
- **social-proof**: *"real people in real settings reacting to / holding / wearing the product — testimonial or lifestyle framing"*
- **cta**: *"wide hero shot of person + product in their world (lifestyle final frame), brand color dominant — not product alone on background"*

### 3. Storytelling- & Custom-Modus unangetastet
Diese Modi haben das Problem nicht so stark, weil sie eh narrativ sind. Trotzdem die generelle Anti-Isolations-Regel auch dort durchsetzen.

### 4. Negative-Suffix in `compose-video-clips` erweitern
Aktuelles Suffix `, no on-screen text, no captions, no subtitles, no watermarks, no logos` ergänzen um:
- `, no isolated product on plain background, no floating product, no product rotating in empty space`

So wird selbst bei einem schwachen LLM-Prompt die KI-Generierung in Richtung Kontext gedrängt.

### 5. User-Prompt erweitern
Im `userPrompt` zusätzlich mitgeben:
> "INTEGRATION REQUIREMENT: The product must appear *within* real-world scenes (used by people, in environments, in lifestyle moments). Avoid isolated product shots except for at most ONE hero scene."

## Geänderte Dateien
- `supabase/functions/compose-video-storyboard/index.ts` — neue Pflichtregeln, umgeschriebene Szenen-Hints, erweiterter User-Prompt
- `supabase/functions/compose-video-clips/index.ts` — Negative-Suffix erweitern um Anti-Isolations-Phrasen

## Verify
- Neues Storyboard generieren → Szenen-Prompts beschreiben Menschen/Kontext mit Produkt **in** der Szene
- Nur max. 1 Szene zeigt das Produkt allein
- Generierte KI-Videos zeigen Lifestyle/Anwendungs-Kontext statt isolierte Produkt-Aufnahmen
- Bestehende Funktionen (Pricing, Render-Pipeline, Text-Overlays, Mediathek-Save, Progress-Bar) unverändert

## Was unverändert bleibt
- DB-Schema, Tabs, Render-Pipeline, Pricing, Audio/Text-Overlay-System, andere Studios
