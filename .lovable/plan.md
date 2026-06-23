
## Ziel

Ein Klick auf "Storyboard erstellen" reicht: KI plant Strategie, Drehbuch, Szenen, Mimik/Gestik, Aktion, Hintergrund, Kamera, Engine, Voice — alles automatisch aus Briefing + im Briefing ausgewählten Charakteren. Jedes Feld bleibt im Storyboard manuell editierbar.

## Problemanalyse heute

1. `briefing-deep-parse` extrahiert nur, was wörtlich im Briefing-Text steht (Pass-A-Regel "DO NOT invent"). Ohne explizite Szenenliste kommt `scenes: []` zurück → Plan-Sheet zeigt "Szenen (0)".
2. Briefing-Text wird in `useStoryboardTransition.buildBriefingText` aus dem strukturierten `ComposerBriefing` zusammengebaut — die im Briefing ausgewählten `characters[]`, `tone`, `duration`, `aspectRatio`, `visualStyle`, `videoMode` werden dabei nicht (oder nur teilweise) übergeben, und die Charakter-IDs/Library-Daten gar nicht.
3. `useApplyProductionPlan.planSceneToComposerScene` befüllt zwar `aiPrompt`, `dialogScript`, `dialogVoices`, `shotDirector`, `engineOverride`. Aber `actionBeat` (CharacterAction / EnvironmentMotion / MotionIntensity) und `performance` (Mimik/Gestik/Blick/Energy) — beides bereits im ComposerScene-Schema vorhanden — werden nicht geschrieben, obwohl genau das der Kern eines "professionellen Drehbuchs" ist.

## Lösung — "Studio Director"-Pipeline

### A. Briefing → vollständiger Director-Brief (Client)

`src/hooks/useStoryboardTransition.ts` · `buildBriefingText`:
- Erweitern auf strukturierten Markdown-Brief mit allen Briefing-Feldern: `tone`, `duration`, `aspectRatio`, `videoMode`, `visualStyle`, `brandColors`, `defaultQuality`, `preferStock`.
- Neuer Abschnitt **`## Cast (selected in briefing)`**: pro `briefing.characters[]` Name, Appearance, SignatureItems, AppearanceFrequency, `mentionKey` (`@<slug>`) und — wenn `brandCharacterId` gesetzt — der Hinweis "library:<id>".
- Neuer Top-Level-Hinweis `Mode: AUTO-DIRECTOR (synthesize full screenplay)` damit Pass A weiß, dass es planen darf.

### B. Pass A — Director-Modus (Edge Function)

`supabase/functions/briefing-deep-parse/index.ts` · `SYSTEM_PASS_A`:
- Neue Regel über der "DO NOT invent"-Regel:
  > **AUTO-DIRECTOR mode**: wenn der Brief KEINE expliziten Szenen enthält, MUSST du als professioneller Werbe-Regisseur eine vollständige Strategie entwerfen — 3–7 Szenen entlang Hook → Pain → Reveal → Proof → CTA (oder einer für den `Mode/tone` passenden Dramaturgie). Verteile `totalDurationSec` gleichmäßig (Fallback 5s pro Szene). 
  > Für **jede** Szene fülle, was der Brief nicht vorgibt: `voiceover.text` (Sprache aus Brief, knapp, sprechbar), `cast` (aus `## Cast`-Mentions, max 2 pro Szene), `engine` (`cinematic-sync` wenn Dialog + Cast, sonst `broll`), `lipSync`, `shotDirector.{framing,angle,movement,lighting}` (enums), `anchorPromptEN` (Setting/Geschehnis/Stimmung auf English, 1–3 Sätze — Auto/Flugzeug/Office/etc., je nach Brief), `performance.{mimik,gestik,blick,energy}` pro Cast-Member, `dialogTurns` bei mehreren Sprechern, `musicCue.energy`, `brollHints` (3–6 EN-Keywords) für Cutaways.
- "DO NOT invent IDs" bleibt — nur Mentions aus `## Cast` benutzen.
- Existierende Regel "If briefing says 3 scenes × 5s emit EXACTLY that many" bleibt vorrangig.

### C. Server-Safety-Net

Nach Pass A in `Deno.serve`: wenn `manifest.scenes.length === 0` → deterministischen 3-Szenen-Fallback (Hook/Reveal/CTA) generieren mit Default-Cast = erste `library:`-Mention, Engine `cinematic-sync` falls Cast vorhanden, sonst `broll`. Verhindert Hänger bei Modell-Aussetzern.

### D. Apply: Performance + ActionBeat schreiben

`src/hooks/useApplyProductionPlan.ts` · `planSceneToComposerScene`:
- Aus `ps.performance` pro Cast-Member ein `performance: Record<characterId, ScenePerformance>` bauen (Enum-Mapping: free-form → nächste `PerformanceExpression/Gesture/Gaze`, `energy` 1–5 unverändert).
- Aus `ps.anchorPromptEN` + `ps.dialogTurns?.length` ein `actionBeat` ableiten:
  - `characterAction` = erste 12 Wörter aus anchorPromptEN, die das Subjekt beschreiben.
  - `environmentMotion` = Rest (Setting/Wetter/Geschehnis).
  - `motionIntensity`: aus `musicCue.energy` (drop/high → `high`, mid → `moderate`, low → `subtle`, silent/undefined → `static`).
- `characterShots` aus `ps.cast` mit `shotType` aus `shotDirector.framing` ableiten (close-up → `detail`, wide → `full`, profile → `profile`, sonst `full`/`profile`-Alternierung wie bisher).
- `realismPreset` aus Brief-`tone`: `dramatic/luxury` → `cinematic-spot`, `friendly/professional` → `lifestyle-hero`, sonst `documentary`.

### E. UI-Feedback im Plan-Sheet

`ProductionPlanSheet.tsx`:
- Empty-State wenn `plan.scenes.length === 0` mit Hinweis "Briefing zu dünn — füge USPs oder eine Szenenbeschreibung hinzu" + Button "Zurück zu Briefing".
- Pro Szene zusätzlich (falls gesetzt) Performance-Badges (Mimik/Gestik/Energy) und ActionBeat-Zeile anzeigen, damit sichtbar ist was die KI geplant hat.

## Was bewusst NICHT geändert wird

- Zod-Schema (`productionPlan.ts`) — alle neuen Felder existieren bereits.
- Lip-Sync-Pipeline, `dialog_shots`, `syncso_*`, Apply-Guards für geschützte Szenen.
- Storyboard-Tab und manuelle Editor-Pfade bleiben unverändert; alle KI-Vorschläge sind dort 1:1 überschreibbar.

## Files

- `src/hooks/useStoryboardTransition.ts` — erweiterter Director-Brief inkl. Cast-Liste.
- `supabase/functions/briefing-deep-parse/index.ts` — AUTO-DIRECTOR Regeln in Pass A, Empty-Scene-Fallback.
- `src/hooks/useApplyProductionPlan.ts` — `performance`, `actionBeat`, `realismPreset`, framing-basierter `shotType`.
- `src/components/video-composer/briefing/ProductionPlanSheet.tsx` — Empty-State + Performance/Action-Badges.

## Deployment

Edge Function `briefing-deep-parse` neu deployen.
