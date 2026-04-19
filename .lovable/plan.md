

## Entscheidung – alles geklärt

1. **Backfill: ja** – Lazy-Trigger für existierende User
2. **Sprache: UI-Sprache anzeigen, EN an Hailuo** – via `prompt` (UI) + `prompt_en` (Übersetzung) in DB-Cache
3. **Auto-Submit: nein** – Prompt wird nur vorausgefüllt, User klickt selbst „Generate"

## Plan: A2 mit personalisierten Prompts

### Schritt 1 — DB-Migration
- `ALTER TABLE onboarding_profiles ADD COLUMN first_video_prompts JSONB;`
- Struktur: `[{ prompt, prompt_en, style_hint }, ...]` (3 Einträge)

### Schritt 2 — Edge Function `generate-first-video-prompts`
- Input: `niche`, `business_type`, `platforms`, `posting_goal`, `experience_level`, `language`
- Modell: `google/gemini-2.5-flash-lite` (schnell, günstig)
- Tool-Calling für strukturiertes JSON-Output (3 Prompts mit `prompt`, `prompt_en`, `style_hint`)
- System-Prompt: maßgeschneiderte 6-Sek-Hailuo-Prompts (max. 25 Wörter), realistisch umsetzbar
- Speichert direkt in `onboarding_profiles.first_video_prompts`
- Idempotent (überspringt, wenn vorhanden, außer `force: true`)

### Schritt 3 — Onboarding-Integration
- In `NicheTutorialModal.tsx`: nach `generate-starter-plan` parallel `generate-first-video-prompts` aufrufen (fire-and-forget)
- Fehler tolerabel → Fallback auf statische Defaults

### Schritt 4 — Frontend-Hook `useFirstVideoPrompts()`
- Lädt Prompts aus `onboarding_profiles.first_video_prompts`
- **Backfill-Logic**: Wenn `IS NULL` und User hat Onboarding-Profil → Edge Function lazy aufrufen, während Defaults gezeigt werden, dann sanft ersetzen
- Fallback-Kette: DB-Prompts → statische Defaults pro Sprache

### Schritt 5 — `FirstVideoGuide.tsx` aktualisieren
- Statische Prompts durch `useFirstVideoPrompts()` ersetzen
- Link enthält **beide** Werte: `?prompt=<UI>&prompt_en=<EN>`

### Schritt 6 — Neue Komponente `FirstVideoExpressHero`
- Persistent auf `/home` (Wallet > 0, 0 Generationen)
- 3 personalisierte Beispielprompts + „Mit Hailuo 2.3 erstellen"
- Lokalisiert (DE/EN/ES)
- Verschwindet nach erster Generation

### Schritt 7 — Hailuo Studio: URL-Param-Handling
- `useSearchParams()` in `HailuoVideoStudio.tsx`
- `?prompt=` füllt UI-Prompt-Feld (User sieht in seiner Sprache, kann editieren)
- `?prompt_en=` wird intern an Hailuo geschickt (falls vorhanden, sonst Übersetzung via bestehendem `VideoPromptOptimizer`)
- **Kein Auto-Submit** – User klickt selbst

### Schritt 8 — CTA-Routing vereinheitlichen
- `DashboardVideoCarousel`: First-Time-User (0 Generationen) → `/hailuo-video-studio?prompt=...&prompt_en=...`
- Power-User → wie bisher `/universal-video-creator`
- `WelcomeBonusModal`: direkt zu `/hailuo-video-studio` mit erstem personalisierten Prompt

### Schritt 9 — E2E-Test in Preview
- Neuer User: Onboarding → Modal → Hero/Guide mit personalisierten Prompts → Klick → Hailuo mit Prompt vorausgefüllt → User editiert ggf. → Generate → Video < 90 Sek

## Technische Details

- **Übersetzungsfluss**: KI generiert beide Versionen (`prompt` in UI-Sprache, `prompt_en` in Englisch) im selben Call → keine doppelte API-Latenz
- **Caching**: Einmal generiert, bleibt in `onboarding_profiles` – keine wiederholten KI-Calls
- **Editierbarkeit**: User sieht den Prompt im Hailuo-Studio im Textfeld, kann frei ändern; bei Submit wird (falls Prompt unverändert) `prompt_en` genutzt, sonst der editierte Text durch bestehenden `VideoPromptOptimizer`
- **Backfill für Edge Cases**: Hook löst Edge Function lazy aus, falls User Onboarding hat aber `first_video_prompts IS NULL` (z. B. existierende User vor diesem Feature)

## Aufwand

~2 h Gesamt (DB 5min, Edge Function 25min, Hook+Backfill 25min, Express-Hero 30min, Hailuo URL-Param 15min, CTA-Routing 15min, E2E-Test 15min)

## Nach Approval

Sobald freigegeben, baue ich Schritt für Schritt durch und teste am Ende End-to-End in der Preview.

