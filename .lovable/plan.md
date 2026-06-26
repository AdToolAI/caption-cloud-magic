
# Feature A — "Cross-Post Magic" (One-Click pro Plattform optimiert)

## 🎯 Ziel
Statt **einer** generischen Caption für alle Kanäle generiert die KI nach dem Render automatisch **pro Plattform** eine optimierte Variante (Caption + Hashtags + Title/Description) — basierend auf dem Briefing-Plan, der das Video tatsächlich kennt. Creator klickt 1× "Publish All".

## 🧩 Was sich konkret ändert (User-Flow)

**Vorher:** Render → Tab "Publish" → 1 Caption-Feld → manuell für alle Kanäle gleich → Publish.

**Nachher:** Render → Tab "Publish" → **"✨ Cross-Post Magic"-Button** → 4 Tabs (1 pro ausgewähltem Kanal) mit fertigen Drafts → Inline-Edit pro Tab → **"Publish All"**.

```text
┌─────────────────────────────────────────────────────┐
│  ✨ Cross-Post Magic  [Regenerate] [Tone: Default▾] │
├──────┬──────┬──────────┬─────────┬──────────────────┤
│  IG  │TikTok│ LinkedIn │ YouTube │                  │
├──────┴──────┴──────────┴─────────┴──────────────────┤
│  Caption (max 2200)              [142 / 2200]       │
│  ┌───────────────────────────────────────────────┐  │
│  │ Stopp ❌ wenn dir das auch passiert...        │  │
│  │ ✨ Hier ist mein 60-Sekunden-Hack...          │  │
│  └───────────────────────────────────────────────┘  │
│  Hashtags  [#contentcreator #ai #adtool +12]        │
│  Hook-Score: 8.7/10 ✅   Best-Time: Heute 19:42     │
└─────────────────────────────────────────────────────┘
[ ← Edit Master ]              [ 🚀 Publish All (4) ] │
```

## 🏗️ Architektur

### Datenfluss
```text
ProductionPlan (Briefing)
        │
        ▼
generate-cross-post-captions  (neue Edge Function, Lovable AI Gateway)
        │   Input: { videoUrl, briefingPlan, channels[], tone, language }
        │   Output: { instagram: {caption,hashtags,hookScore},
        │             tiktok:   {caption,hashtags,hookScore},
        │             linkedin: {caption,hashtags,hookScore},
        │             youtube:  {title,description,tags,hookScore} }
        ▼
cross_post_drafts (neue Tabelle)
        │
        ▼
CrossPostMagicPanel.tsx (neue UI in PublishToSocialTab)
        │
        ▼
publishToMultiplePlatforms (existing) — übergibt jetzt **pro Channel** eigenen Payload
```

### Plattform-Regeln (KI-Prompt-Constraints)
| Channel | Caption | Hashtags | Style |
|---|---|---|---|
| Instagram | ≤2200, 3 Zeilen Hook + Story + CTA | 8–15, mix nische+breit | Emojis, Storytelling |
| TikTok | ≤150, brutal kurzer Hook | 3–5 trending | Casual, Slang, kein Corporate |
| LinkedIn | 200–800, Pro-Tone, 1 Insight | 3–5 fachlich | Erste-Person, keine Emojis-Flut |
| YouTube | Title ≤70 + Desc 200–400 + 10 Tags | Tags statt # | SEO-Keywords vorne |

Alle Regeln zentral in `src/config/crossPostRules.ts` → Edge Function liest mit, UI zeigt Counter/Warnings.

## 📁 Files (Neu / Geändert)

### Neu
- `supabase/functions/generate-cross-post-captions/index.ts` — Lovable AI (`google/gemini-2.5-flash`), Tool-Calling für strict JSON-Output, Sprache aus Briefing
- `src/config/crossPostRules.ts` — Per-Channel-Constraints + Beispiel-Prompts
- `src/hooks/useCrossPostMagic.ts` — Mutation + Cache, Regenerate, Tone-Switch
- `src/components/composer/CrossPostMagicPanel.tsx` — Tab-UI, Hook-Score-Badge, Best-Time-Hint, Inline-Edit
- `src/components/composer/HookScoreBadge.tsx` — kleine Wiederverwendung
- Migration: Tabelle `cross_post_drafts` (`id, user_id, video_id, channel, caption, hashtags, title, description, hook_score, tone, generated_at`) + RLS + GRANT

### Geändert
- `src/components/composer/PublishToSocialTab.tsx` — neuer "✨ Magic"-Toggle ganz oben; wenn aktiv → CrossPostMagicPanel statt geteiltem Caption-Feld
- `src/hooks/useSocialPublishing.ts` — `publishToMultiplePlatforms` akzeptiert jetzt optional `perChannelConfig: Record<Platform, PublishConfig>` und nutzt das **statt** des globalen Configs
- `src/components/planner/PublishNowButton.tsx` — Magic standardmäßig **on** wenn `briefing_plan_id` vorhanden
- i18n (DE/EN/ES): `composer.crossPostMagic.*` strings

## 🎨 Design (Bond 2028)
- Magic-Button: Gold-Gradient + Sparkle-Icon, Hover-Glow
- Tabs als Cyan-Underline-Style (wie Hub-Pages)
- Hook-Score-Badge: 0–4 rot, 5–6 amber, 7+ gold mit subtilem Glow
- "Regenerate"-Button: Glass-Outline mit Refresh-Icon
- Loading-State: Skeleton-Lines pro Tab, "✨ Schreibt deine Captions…" Kicker-Text

## 💰 Kosten
- Gemini 2.5 Flash, ~1 Call pro Render, ~2k Tokens → praktisch kostenlos pro Generierung
- Caching in `cross_post_drafts` → Regenerate explizit user-getriggert, sonst kein Re-Call
- Kein neuer API-Key (Lovable AI Gateway)

## 🛡️ Edge-Cases
- **Briefing fehlt** (Direct-Upload ohne Composer): Fallback-Prompt nutzt nur `videoUrl` + User-Hinweis "Tipp: Mit Briefing 3× bessere Captions"
- **Kein Kanal verbunden**: Magic disabled mit Tooltip "Verbinde mindestens 1 Kanal"
- **Edit-Drift**: Wenn User editiert + dann Regenerate klickt → Confirm-Dialog "Deine Änderungen überschreiben?"
- **Sprache**: Captions immer in `briefing.language`; UI bietet manuellen Override-Dropdown (DE/EN/ES)
- **TikTok-Sandbox**: Magic generiert trotzdem normal — die Sandbox-Limitation (Draft-only) bleibt orthogonal, lösen wir in Feature C

## ✅ Akzeptanz-Kriterien
1. Render → Publish-Tab → Magic-Button sichtbar (Gold, prominent)
2. 1 Klick → ≤8s später 4 Tabs mit plattform-spezifischen Captions in der Briefing-Sprache
3. Jeder Tab respektiert Length-Limits, zeigt Live-Counter + Warn-State bei Overflow
4. Inline-Edit funktioniert, Änderungen persistieren in `cross_post_drafts`
5. "Publish All" pusht **pro Channel** den jeweils editierten Payload (nicht den globalen)
6. Regenerate funktioniert mit Tone-Switch (Default / Witzig / Professionell / Provokant)
7. Drafts überleben Reload (DB-Persistenz)

## 🚀 Verifikation
- Playwright: Render-Mock → Publish-Tab → Magic klicken → 4 Tabs sichtbar → Screenshot
- Edge-Function-Test mit `x-qa-mock: true` (returnt feste Beispiel-Captions, kein AI-Call)
- DE/EN/ES Smoke: Briefing in jeder Sprache → korrekte Output-Sprache

## ⏱️ Aufwand
~1–2 Tage. Reihenfolge: Migration → Edge Function (mock zuerst) → Hook → Panel → Integration in PublishToSocialTab → i18n → Playwright.

## ❓ Eine Entscheidung von dir
**Tone-Presets**: Sollen wir mit 4 starten (*Default / Witzig / Professionell / Provokant*) oder direkt mit den 6 Ad-Director-Tonalities aligned (*Default / Hype / Educational / Story / Bold / Premium*)? Empfehlung: **6 alignen** — konsistent mit Ad-Director, kein extra Mapping nötig.
