
# Stufe 2b — Top-Marken-Werbung vollständig

Schließt die Lücken aus Stufe 2: vollständige CI-Anwendung (Logo-Endcard, Brand-Font, gesamte Palette) und echte Kampagnen-Skalierung (Cutdowns, Aspect-Ratio-Variants, A/B-Video-Renders mit Performance-Tracking).

---

## 1. Brand-Identity Vollausbau

### 1a. Auto-Logo-Endcard (neue Final-Szene)
- Wenn Brand-Kit aktiv ist und das Framework keine eigene `cta`-Endcard hat (oder zusätzlich gewünscht), wird automatisch eine **Logo-Endcard-Szene** angehängt (2s).
- Neuer `sceneType: 'brand-endcard'` mit `clipSource: 'static-endcard'` — gerendert via Remotion-Composition statt AI-Modell (kostet 0 Credits).
- Inhalt: Brand-BG (primary_color), Logo zentriert, optionale Tagline aus Brand-Kit, Fade-in.

### 1b. Brand-Font in Text-Overlays
- `useActiveBrandKit` liefert bereits `font_family` — neues Feld `fontFamily` in `textOverlay` durchreichen.
- Composer-Renderer (Remotion + Studio-Preview) nutzt es; Fallback: `Inter`.

### 1c. Vollständige Brand-Palette
- Aktuell nur `primaryColor` auf CTA — neu: jedes Overlay bekommt Farbrolle (`primary` / `secondary` / `accent` / `neutral`) statt fixer Hex-Werte.
- `buildAdScenes` mappt Beat-Typ → Farbrolle (Hook=accent, Problem=neutral, Solution=primary, CTA=primary, Endcard=primary).

### 1d. Style-Reference für Video-Modelle
- Wenn `brand_kit.logo_url` oder `brand_kit.style_reference_url` existiert, wird die URL als `referenceImage` an `generate-clip-*` Edge Functions weitergegeben (Modelle die `image_input` unterstützen: Wan, Kling, Hailuo, Seedance).
- Sicherstellen: Kein Logo-Bleed in AI-Frames — Reference wird nur als „style hint" genutzt (Prompt-Suffix: *„maintain brand color palette and visual mood, do NOT include the logo itself"*).

---

## 2. Kampagnen-Skalierung

### 2a. Cutdown-Generator (Master → Kurzversionen)
- Im Wizard neu: **„Cutdown-Strategie"** (optional, nach Variants-Step).
- Optionen: `nur Master` / `+ 15s Cutdown` / `+ 6s Hook-Cutdown` / `Vollpaket (30 + 15 + 6)`.
- Logik in neuer Utility `buildCutdowns.ts`:
  - **15s aus 30s**: behalte Hook + Solution + CTA (skip Problem + Social-Proof).
  - **6s Hook-Cut**: nur Hook + ein-Wort-CTA-Overlay.
- Pro Cutdown wird ein eigenes `composer_projects`-Kind angelegt mit `parent_project_id` + `cutdown_type` Tag.

### 2b. Multi-Aspect-Ratio-Render-Bundle
- Neuer Schritt nach Compose-Done: **„Plattform-Bundle rendern"** Button im Composer.
- Optionen: `9:16 (Reels/TikTok/Shorts)`, `1:1 (Feed)`, `16:9 (YouTube/Web)`, `4:5 (Instagram Portrait)`.
- Nutzt existierende `generate-video-variants` Edge Function (bereits live, schreibt in `video_variants`-Tabelle).
- Smart-Crop-Hint: Bei 9:16 wird Subtitle-Position auf `center` gezwungen, Text-Größe +20%.

### 2c. A/B-Video-Render (echte Skript-Varianten als separate Renders)
- Bisher: 3 Skript-Varianten generiert → User wählt EINE → 1 Render.
- Neu: Toggle **„Alle 3 Varianten rendern"** im Variants-Step.
- Erzeugt 3 parallele `composer_projects` mit identischen Szenen-Strukturen, aber unterschiedlichen `textOverlay.text` + Voiceover-Audio pro Variante.
- Variant-Strategy (`emotional` / `rational` / `curiosity`) wird in `composer_projects.ad_variant_strategy` persistiert.

### 2d. Performance-Tracking-Skelett (Read-Only)
- Neue View `ad_variant_performance` join'd `composer_projects` → `video_variants` → `social_posts` → `social_post_metrics`.
- Liefert pro Variante: views, engagement_rate, CTR.
- Surface in neuem Tab im Composer-Dashboard: **„Kampagnen-Insights"** (lesend, kein Tracking-Code-Injection).

---

## 3. Persistierung & Datenmodell

### Migration: `composer_projects` erweitern
Neue Spalten:
- `ad_meta jsonb` — Framework, Tonality, Format, Goal, Brand-Kit-Snapshot, Compliance-Timestamp
- `ad_variant_strategy text` — `emotional` / `rational` / `curiosity` / null
- `parent_project_id uuid` — für Cutdowns (referenziert Master-Projekt)
- `cutdown_type text` — `master` / `15s` / `6s-hook` / null

Index: `(parent_project_id, cutdown_type)` für Kampagnen-Übersicht.

RLS: erbt vorhandene `composer_projects` Policies — nichts Neues nötig.

---

## 4. UI-Änderungen

### AdDirectorWizard (Erweiterung)
- Step `variants`: Toggle „Alle 3 Varianten rendern" (default off).
- Neuer Step `scaling` (zwischen variants und compliance):
  - Cutdown-Auswahl
  - Aspect-Ratio-Bundle-Vorauswahl
  - Auto-Logo-Endcard Toggle (default on wenn Brand-Kit vorhanden)
- Compliance-Step zeigt Zusammenfassung: „X Renders werden erzeugt (Master + 2 Cutdowns × 3 Aspects = 9 Videos)".

### Composer-Dashboard
- Neuer Tab **„Kampagne"** (nur sichtbar wenn `ad_meta` gesetzt):
  - Master + Cutdowns Tree-View
  - Aspect-Variants pro Knoten
  - Performance-Insights (sobald Posts publiziert)

---

## 5. Kosten- & Credit-Strategie

- **Auto-Logo-Endcard**: 0 Credits (statisches Remotion-Render, ~1s extra).
- **Cutdowns**: kein Re-Render der AI-Clips — wir cutten die Master-Clips zurecht (FFmpeg in `render-multi-format`). Nur Composer-Render-Kosten (~50 Credits pro Cutdown).
- **A/B-Video-Render**: Voller AI-Cost × 3 — User sieht Cost-Estimate vor Bestätigung im Compliance-Step.
- **Aspect-Bundle**: Composer-Render-Kosten × Anzahl Aspects, KEIN AI-Re-Render (gleicher Master-Clip wird neu kadriert).
- Credit-Refund-Automation greift bei jedem Teilfehler (existierende `refund_ai_video_credits` RPC).

---

## 6. Technische Details

### Neue Dateien
- `src/lib/adDirector/buildCutdowns.ts` — Master → Cutdown-Szenen-Mapper
- `src/lib/adDirector/buildEndcard.ts` — Logo-Endcard-Szene-Builder
- `src/components/video-composer/AdCampaignTree.tsx` — Kampagne-Tab
- `src/remotion/templates/BrandEndcard.tsx` — Statische Endcard-Composition
- `supabase/functions/render-cutdown/index.ts` — FFmpeg-basiertes Cut-Down (nutzt vorhandenen Master)
- `supabase/migrations/<ts>_ad_director_campaign_scaling.sql`

### Geänderte Dateien
- `src/components/video-composer/AdDirectorWizard.tsx` — Steps + Toggles
- `src/lib/adDirector/buildAdScenes.ts` — Color-Roles + Endcard-Anhang + Style-Ref-URL
- `src/types/video-composer.ts` — `ColorRole`, `cutdownType`, `parentProjectId`, `adMeta`
- `src/components/video-composer/VideoComposerDashboard.tsx` — Kampagne-Tab
- `supabase/functions/generate-clip-*` (Wan, Kling, Hailuo, Seedance) — `referenceImage` Pass-through

### Wiederverwendete Infrastruktur
- ✅ `video_variants` Tabelle (existiert)
- ✅ `generate-video-variants` Edge Function (existiert)
- ✅ `render-multi-format` Edge Function (existiert)
- ✅ `useVideoVariants` Hook (existiert)
- ✅ `useActiveBrandKit` Hook (existiert)

---

## 7. Sicherheit & Compliance

- Style-Reference-Prompts enthalten explizite Anti-Logo-Klausel.
- Kein neuer User-Input → keine zusätzliche Input-Validation nötig (alle Eingaben gehen über bestehenden Wizard).
- Cost-Estimate vor jedem Multi-Render-Trigger (Compliance-Step zeigt geschätzte Credits + Anzahl Outputs).

---

## 8. Out of Scope (für später)

- Real-Time A/B-Test-Auto-Optimierung (eigene Tabelle `ab_test_variants` existiert, aber Tracking-Logik gehört in eine eigene Stufe 3).
- Programmatic-Buying-Integration (Meta Ads API, TikTok Ads API).
- Brand-Voice-Konsistenz-Check zwischen Tonality und gespeicherter Brand-Voice.

---

## 9. Reihenfolge der Umsetzung (1 Implementierungs-Loop)

1. Migration: `composer_projects` erweitern.
2. Brand-Endcard Remotion-Template + `buildEndcard.ts`.
3. `buildAdScenes` mit Color-Roles + Style-Ref + Endcard-Anhang.
4. `buildCutdowns.ts` + `render-cutdown` Edge Function.
5. AdDirectorWizard: neuer `scaling`-Step + Variants-Toggle.
6. Composer-Dashboard: Kampagne-Tab + AdCampaignTree.
7. Style-Reference-Pass-through in 4 Clip-Edge-Functions.
8. Build-Verify + Edge-Function-Deploy.

Geschätzter Umfang: 1 Loop, ~12 Dateien.
