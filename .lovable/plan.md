# Brand-Kit Level-Up — Features + Optik

Ziel: Aus dem aktuellen 4-Tab-Setup (Erstellen / Brandboard / Konsistenz / Verwalten) ein echtes „Brand OS" machen — Single Source of Truth für Farben, Fonts, Tonalität, Logos, Charaktere & Locations, mit AI-Auto-Apply in Composer, Toolkit, Picture Studio, Email & Social Captions.

---

## Teil A — Neue Features (Funktion)

### 1. Brand DNA Extractor (1-Click Onboarding)
Statt manuellem Form: User gibt Website-URL **oder** lädt 1–3 Screenshots/Logos hoch → Edge Function `extract-brand-dna` nutzt Gemini Vision + HTML-Scrape:
- Logo-Crop + Hintergrund-Removal
- Farbpalette (Primary/Secondary/Accent + 5 Neutrals via k-means auf Screenshots)
- Font-Detection (CSS-Parse + Vision-Fallback)
- Tonalität + Voice-Guidelines (Brand-Voice-Sätze aus echten Texten)
- Auto-Mood (cinematic/minimal/bold/…) → mappt direkt in `useBrandKitAutoApply.moodToColorGrading`

### 2. Brand Voice Library (Schreibstil-Lock)
Neue Tabelle `brand_voice_samples` (do/don't Beispiele + Banned Words + Tagline-Pool). Wird injiziert in:
- `generate-cross-post-captions`
- `generate-email-campaign`
- `briefing-deep-parse` (Studio Director)
- `scene-director` Dialog-Skripte
Konsistente Sprache über alle Kanäle — heute jeder Generator eigener Ton.

### 3. Brand Asset Factory (Auto-Generate Pack)
Button „Generiere Brand-Pack" → spawnt parallel via Lovable AI / Nano Banana 2:
- 3 Logo-Varianten (light/dark/mono) + Favicon + 1024² App-Icon
- 6 Social-Cover (FB/IG/X/LinkedIn/YT/TikTok) im Brand-Stil
- 3 Pattern/Backgrounds (subtle/bold/gradient)
- 1 Email-Header + 1 Pitch-Deck-Cover
Alles in neuen Bucket `brand_assets/<user>/<kit>/…`, Tab „Assets" listet sie mit Download/Copy-URL.

### 4. Konsistenz-Guard 2.0 (Live Drift Detection)
Aktueller `ConsistencyScore` ist statisch. Upgrade:
- Cron `brand-consistency-scan` (täglich) prüft alle letzten 30 Renders/Posts gegen Brand-Kit (Farbabstand ΔE, Font-Match, Logo-Presence, Voice-Match via LLM)
- Pro Verstoß: Eintrag in `brand_drift_reports` mit Vorschau-Thumb + 1-Klick-Auto-Fix („Recolor zu Brand-Primary" / „Re-render mit Brand-Voice")
- Score wird zur lebenden Zahl auf Home-Banner

### 5. Brand Character & Location Sync
Verbindung zum bestehenden `useUnifiedMentionLibrary`:
- Im Brand-Kit Tab „Cast" sieht man alle Brand-Charaktere + Locations + Outfit-Looks zum gewählten Brand-Set
- Tag `brand_kit_id` auf `brand_characters` / `brand_locations` → Auto-Inject in Composer wenn aktives Set wechselt
- „Set Wechsel" cycled das ganze Universum (Farbe + Cast + Location + Voice) für Multi-Brand-Agenturen

### 6. Brand Kit Sharing & Export
- `Share`-Button: read-only Link `/brand/:token` für Kunden/Team (zeigt Brandboard im 2028-Look)
- Export-Buttons: PDF Brand-Guidelines (pdf-lib, wie License-Certs), `.zip` mit allen Assets, Figma-Tokens JSON, Tailwind-Config Snippet

### 7. Brand-Trends Radar
Eigene Karte im Brandboard: nutzt bestehende News/Trend-Pipeline gefiltert auf Branche + Tonalität → wöchentlicher Brand-Pulse („Deine Branche tendiert zu warmen Tönen — willst du Accent von #06b6d4 zu #f97316 testen?")

---

## Teil B — Optik (Bond 2028 Premium-Layer)

Aktuell solide, aber generisch. Hebung:

1. **Hero**: Animated Gold-Particle-Layer (`<ParticleField>` aus remotion/effects portiert in framer-motion Canvas) hinter „Automatisches Marken-Set". Aktives Kit-Logo rotiert als Holo-Coin rechts oben.
2. **Active Brand Bar**: Wird zum „Brand Vault" — sticky glass-bar mit Live-Color-Swatches, Font-Preview ("Aa Aa"), Voice-Wave-Animation, Konsistenz-Ring (radial progress wie WeekStrategyRing).
3. **Tabs → Command-Rail**: Linke vertikale Rail (Brand DNA / Brandboard / Voice / Assets / Cast / Konsistenz / Sharing) statt 4 horizontaler Tabs. Mehr Skalierraum.
4. **Brandboard Redesign**: Magazin-Layout (asymmetrisch, broken-grid) statt Cards — große Farb-Flächen full-bleed, Typo-Specimen wie Editorial-Cover, Logo auf texture-paper-mockup (Mockup-SVGs).
5. **Micro-Interactions**: Color-Swatch hover → kopiert HEX + zeigt ΔE zu Active. Font-Preview live-typeable. Logo-Tile mit 3D-tilt (mouse-follow).
6. **Empty States**: „Noch keine Voice-Samples" → animierter Wave-Placeholder mit Gold-Glow.
7. **Konsistenz-Tab**: Drift-Reports als Bond-Dossier-Cards (rote/gelbe/grüne Stamps, „CASE FILE #023").

---

## Technische Details

**Neue Tabellen**
- `brand_voice_samples (id, brand_kit_id, kind: do|dont|tagline|banned, text)`
- `brand_assets (id, brand_kit_id, kind, url, meta jsonb)`
- `brand_drift_reports (id, brand_kit_id, source_table, source_id, severity, score, suggested_fix jsonb, resolved_at)`
- ALTER `brand_characters` / `brand_locations`: add `brand_kit_id uuid` (nullable, FK)
- Alle mit GRANTs + RLS (`auth.uid() = (select user_id from brand_kits where id = brand_kit_id)`)

**Neue Edge Functions**
- `extract-brand-dna` (URL+Images → JSON)
- `generate-brand-asset-pack` (orchestriert Nano Banana 2 parallel)
- `brand-consistency-scan` (cron, ΔE+LLM)
- `export-brand-guidelines-pdf` (pdf-lib)

**Wiederverwendet**
- `useBrandKitAutoApply` bleibt API-Kontrakt → erweitern um `applyVoice` Option
- `useUnifiedMentionLibrary` bekommt `brandKitFilter`

**Out of Scope (heute nicht)**
- Marketplace für Brand-Templates
- Multi-User Approval-Workflows
- Live-Collaboration auf Brand-Kit

---

## Reihenfolge (vorgeschlagene Sprints)

1. **Sprint 1 (Foundation)**: DB-Migration, Brand DNA Extractor, Optik-Refresh (Hero+Vault+Rail).
2. **Sprint 2 (Voice+Assets)**: Brand Voice Library + Injection in 4 Generatoren, Brand Asset Factory.
3. **Sprint 3 (Guard+Sharing)**: Konsistenz-Guard 2.0, Sharing/Export PDF, Brand-Trends Radar.

Soll ich **alle 3 Sprints** in einem Rutsch planen/bauen oder mit **Sprint 1** starten und nach Review weiter?
