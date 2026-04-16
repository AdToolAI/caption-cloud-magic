

## Befund
Der Storyboard-Generator (`compose-video-storyboard`) erstellt mehrere Szenen-Prompts, die später **einzeln und unabhängig** an Hailuo/Kling/Sora gehen. Diese Modelle haben **keine Charakter-Konsistenz zwischen separaten Generierungen** — d. h. wenn Szene 1 sagt "young woman with red hair" und Szene 3 ebenfalls, kommt **nicht dieselbe Person** raus, sondern zwei verschiedene Frauen mit roten Haaren.

Aktuell weiß der LLM-Prompt-Generator das nicht und schreibt teils:
- "the same woman from scene 1 now smiling"
- "she walks into the kitchen"  
- "he picks up the product again"

→ Resultat: User erwartet wiederkehrende Person, bekommt aber visuell unterschiedliche Menschen → wirkt unzusammenhängend.

## Plan — Charakter-Konsistenz-Regel im Storyboard-Prompt

### 1. Neue harte Regel im `systemPrompt` (compose-video-storyboard)
Zusätzlich zu den bestehenden Regeln eine **🚨 CHARACTER CONSISTENCY CONSTRAINT** Sektion einfügen:

> Each scene is generated INDEPENDENTLY by a separate AI video model call. There is NO character/face consistency between scenes. Therefore:
> - NEVER reference "the same person", "she/he from before", "the woman from scene 1"
> - NEVER use pronouns that imply continuity ("she continues", "he then…")
> - Each scene must describe its human subject FRESH and SELF-CONTAINED (age, gender, appearance, clothing, setting) as if the viewer has never seen them before
> - If a recurring "type" of person is desired (e.g. always a young professional woman), describe the **archetype** generically in each scene (e.g. "a young professional woman in business casual") — but never claim it's the same individual
> - Treat each scene as a standalone shot from a montage / mood-board, not as a continuous narrative with a single protagonist

### 2. Szenen-Hint-Anpassungen
In `sceneTypeHints` ergänzen, wo nötig, den Hinweis "fresh standalone subject — no reference to previous scenes". Vor allem bei `solution`, `demo`, `social-proof`, `cta` (die häufig auf einen "Hauptcharakter" zurückgreifen würden).

### 3. User-Prompt-Erweiterung
Im `userPrompt` zusätzlich:
> "INDEPENDENCE REQUIREMENT: Every scene is rendered by a separate AI generation. Describe each human subject from scratch with no implied continuity from other scenes."

### 4. UI-Hinweis im Storyboard-Tab (SceneCard)
Im bestehenden Tipp-Banner über dem KI-Prompt einen zweiten Mini-Hinweis ergänzen oder den Text leicht erweitern um:
> "Hinweis: Jede Szene wird einzeln generiert — Personen können zwischen Szenen optisch variieren."

So versteht der User die technische Limitierung sofort visuell und ist nicht überrascht, wenn die "Frau" in Szene 1 und 3 unterschiedlich aussieht.

### 5. Lokalisierung
Den UI-Hinweis in DE/EN/ES inline im SceneCard (gleiche Pattern wie zuvor).

## Geänderte Dateien
- `supabase/functions/compose-video-storyboard/index.ts` — neue Konsistenz-Regel im systemPrompt + userPrompt + Hint-Anpassungen
- `src/components/video-composer/SceneCard.tsx` — Mini-Hinweis im Tipp-Banner über Charakter-Variation

## Verify
- Neues Storyboard generieren → keine Phrasen wie "the same person", "she from before"
- Jede Szene beschreibt ihr Subject eigenständig
- Im Storyboard-Tab steht klar: Personen können zwischen Szenen variieren
- Render-Pipeline, Pricing, Mediathek-Save unverändert

## Was unverändert bleibt
- DB-Schema, Render-Pipeline, andere Studios, Audio/Text-Overlay-System

