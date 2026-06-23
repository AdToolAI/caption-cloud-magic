
## Ziel

Die "Briefing analysieren"-Karte verschwindet als separater Button. Stattdessen wird die 2-Pass-Analyse **automatisch** beim Wechsel von Briefing → Storyboard ausgelöst. Während der 1–2 Minuten erscheint ein vollflächiger **"Production War Room"** im James-Bond-2028-Look mit lebendigem News-Ticker und TrendRadar — danach öffnet sich der Plan-Review (bisheriges `ProductionPlanSheet`) wie heute. Zusätzlich wird der Plan-Schema-Umfang geprüft und gezielt erweitert, damit Plan + Storyboard wirklich alles aus dem Briefing tragen.

## Was sich für den Nutzer ändert

1. **Briefing-Tab**: Karte "Production Plan aus Briefing → Briefing analysieren" wird entfernt.
2. **Storyboard-Übergang**: Beim Klick auf "Storyboard" (Stepper) oder "Weiter zu Storyboard" läuft:
   - **Guard**: Wenn das Storyboard bereits Szenen enthält ODER eine Szene `rendered`/`lip-sync-aktiv` ist → **kein Re-Analyse**, direkter Wechsel (Lip-Sync-Schutz bleibt).
   - **Sonst**: Production-War-Room-Overlay öffnet sich, Edge-Function `briefing-deep-parse` läuft im Hintergrund (Pass A + B, ~60–120s).
   - Nach Erfolg: Overlay schließt → bestehendes `ProductionPlanSheet` öffnet sich → User reviewed → "Plan anwenden" generiert Szenen → Stepper springt auf Storyboard.
   - Bei Fehler: Toast, User bleibt im Briefing, kann manuell weiter.
3. **Manueller Re-Trigger**: kleiner Secondary-Button "Plan neu erstellen" oben rechts in Briefing/Storyboard (für Edge-Cases), gated mit Lip-Sync-Warnung.

## Production War Room (2028-Style Loading)

Fullscreen-Modal mit Glass + Gold/Cyan, während `briefing-deep-parse` läuft:

```text
┌─ PRODUCTION WAR ROOM ─────────────────── 01:14 / ~02:00 ──┐
│ ▸ Pass A · Briefing → Manifest        [████████░░] 80%   │
│ ▸ Pass B · Resolve Cast & Locations   [██░░░░░░░░] 20%   │
│                                                            │
│ ┌─ NEWS RADAR ────────────┐ ┌─ TREND RADAR ─────────────┐ │
│ │ Instagram testet Creat… │ │ #ShortFormStorytelling ↑ │ │
│ │ TikTok Shop expandiert… │ │ #LipSyncReels      ↑↑    │ │
│ │ LinkedIn priorisiert K… │ │ AI-Avatar-Ads     ↑↑↑    │ │
│ └─────────────────────────┘ └───────────────────────────┘ │
│                                                            │
│   "While we build your plan — here's what's moving         │
│    in your industry right now."                            │
└────────────────────────────────────────────────────────────┘
```

Inhalte werden aus bestehenden Hooks/Endpunkten gezogen — **keine neuen Edge Functions, kein neuer API-Spend**:
- News: gleicher Feed wie `NewsRadar`-Ticker oben (max 6 Items, autoplay alle 4s).
- Trends: gleicher Cache wie TrendRadar-Hub (Top 6 Tags der User-Sprache).
- Progress: zwei Phasen-Bars (Pass A / Pass B) mit deterministischer Pseudo-Progress-Animation (60s/60s), `100%` wird erst gesetzt wenn die Edge-Function tatsächlich resolved.

## Antwort: Ist das Plan-Feld aussagekräftig genug?

**Teils.** Das aktuelle `PlanScene`-Schema deckt das Wesentliche ab (Beat, Dauer, Engine, Lip-Sync-Flag, Cast/Location, ShotDirector 4-Achsen, VO mit Timecode + Delivery, Performance, Anchor-Prompt EN). Aber für *"alles exakt aus dem Briefing übernehmen"* fehlen 6 Felder, die der Storyboard-Generator heute schon kann/braucht:

| Lücke | Heute im Plan? | Konsequenz |
|---|---|---|
| **B-Roll-Hints** (Stockschlagworte pro Szene) | ❌ | B-Roll-Szenen werden generisch, statt Briefing-spezifisch |
| **Brand-Kit-Anker** (Logo-Endcard, Brand-Color-Override) | ❌ | Brand-CI muss separat manuell gesetzt werden |
| **Negative-Prompt pro Szene** (nicht nur global) | ❌ | Risiko ungewollter Elemente in einzelnen Szenen |
| **Continuity-Hints** (z.B. "selbe Position wie S01") | ❌ | Anchor-Identity-Swap bekommt keinen Kontext |
| **Music-Cue** (Energie/Drop-Marker pro Szene) | ❌ | Musik-Stage muss raten |
| **Dialog-Turns explizit** (statt VO-Text mit Em-Dash) | ❌ | Erfordert Regex-Parsing in `compose-video-clips` (genau das, was wir gerade fixen mussten) |

→ **Vorschlag:** Schema-Erweiterung in `productionPlan.ts` um diese 6 optionalen Felder, Pass A/B-Prompts in `briefing-deep-parse` entsprechend nachschärfen, Plan-Sheet bekommt 2 neue collapsible Sections ("Dialog-Turns" und "B-Roll / Music / Continuity"). Bestehende Felder bleiben **unverändert** — reine additive Erweiterung, **null Lip-Sync-Pipeline-Risk**.

## Technischer Umsetzungsplan

### Frontend

1. **`src/components/video-composer/BriefingTab.tsx`**
   - Entfernen: `ProductionPlanCard` (Zeile mit "Briefing analysieren"-Button + States `analyzing`, `planOpen`).
   - Behalten: `ProductionPlanSheet`-Import — wird vom neuen Hook geöffnet.
2. **`src/components/video-composer/storyboard/ProductionWarRoom.tsx` (NEU)**
   - Fullscreen-Overlay (`Dialog` mit `max-w-5xl`), Glass + Gold/Cyan.
   - Props: `open`, `progressA`, `progressB`, `onCancel`.
   - Innen: 2 Progress-Bars + 2 Bento-Karten (News, Trends) + rotierendes Pro-Tip.
3. **`src/hooks/useStoryboardTransition.ts` (NEU)**
   - Single entry point für "Briefing → Storyboard"-Wechsel.
   - Guard: `scenes.length > 0` ODER `scenes.some(s => s.dialogMode || s.status === 'completed')` → skip analyze, direct switch.
   - Sonst: setzt War-Room-State, ruft `supabase.functions.invoke('briefing-deep-parse', { ... })`, simuliert Progress (60s/60s linear, bei Response 100%), öffnet danach `ProductionPlanSheet` mit dem zurückgegebenen Plan.
4. **`src/pages/VideoComposer/index.tsx`**
   - Stepper-onClick auf "Storyboard" und Button "Weiter" → `useStoryboardTransition.trigger()` statt direktem Tab-Wechsel.
   - Mount `<ProductionWarRoom />` und `<ProductionPlanSheet />` auf Page-Ebene (statt im Briefing-Tab), damit Overlay tab-übergreifend funktioniert.
5. **`ProductionPlanSheet.tsx`**
   - 2 neue collapsible Sections für die unten gelisteten Plan-Felder.
   - Read-only Anzeige für `brollHints`, `musicCue`, `continuityHint` — `dialogTurns` editierbar.

### Schema-Erweiterung (additiv, optional)

`src/lib/video-composer/briefing/productionPlan.ts` — neue **optional**e Felder in `PlanScene`:
```ts
brollHints: z.array(z.string().max(80)).max(8).optional(),
brandAnchor: z.object({
  showLogo: z.boolean().optional(),
  colorOverride: z.string().optional(),
}).optional(),
negativePromptScene: z.string().max(600).optional(),
continuityHint: z.string().max(200).optional(),
musicCue: z.object({
  energy: z.enum(['ambient','build','drop','climax','outro']).optional(),
  notes: z.string().max(120).optional(),
}).optional(),
dialogTurns: z.array(z.object({
  speakerMentionKey: z.string(),
  text: z.string().max(800),
  mood: z.string().max(40).optional(),
})).optional(),
```

### Edge-Function

`supabase/functions/briefing-deep-parse/index.ts` — Pass A System-Prompt um die 6 neuen Felder erweitern (Pass B unverändert: nur Cast/Location-Resolve). Output bleibt zod-validiert, Funktion bleibt idempotent.

### Lip-Sync-Schutz (unangetastet)

- Keine Änderung an `compose-video-clips`, `compose-dialog-segments`, `compose-dialog-scene`, `dialog_shots`, `syncso_*`, `cinematicSyncTwoShotAnchorPipeline`, `lipsyncSyncSoPro`, Sync-3-Doc-Strict-Options.
- `useApplyProductionPlan` schreibt weiterhin **nur** in die Composer-UI-Felder, die der manuelle Editor auch beschreibt — neue Plan-Felder werden in dieselben bestehenden Scene-Felder gemappt (`dialogTurns` → bestehendes `dialogScript`-Format mit `[NAME]:`-Markern, das die robuste Regex aus dem letzten Fix bereits versteht).
- War-Room-Overlay ist rein visuell — kein Pipeline-Touch.
- Guard verhindert harte Re-Analyse, sobald irgendeine Szene Lip-Sync nutzt.

## Files (Δ)

- **NEU**: `src/components/video-composer/storyboard/ProductionWarRoom.tsx`, `src/hooks/useStoryboardTransition.ts`
- **EDIT**: `src/components/video-composer/BriefingTab.tsx` (Card raus), `src/pages/VideoComposer/index.tsx` (Stepper-Trigger + Overlay-Mount), `src/components/video-composer/briefing/ProductionPlanSheet.tsx` (2 Sections), `src/lib/video-composer/briefing/productionPlan.ts` (6 optionale Felder), `supabase/functions/briefing-deep-parse/index.ts` (Prompt-Update), `src/hooks/useApplyProductionPlan.ts` (Mapping der neuen Felder), `mem/features/video-composer/production-plan-pipeline.md` (Update)

## Offene Frage

Möchtest du die Schema-Erweiterung (6 neue Felder + Prompt-Update + 2 Sheet-Sections) **gleich mitgemacht** haben, oder erstmal **nur** den UX-Move (Briefing-Analyse → Storyboard-Übergang + War-Room) ohne Schema-Änderungen? Letzteres ist deutlich kleiner und risikoärmer.
