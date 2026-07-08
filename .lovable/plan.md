
# 🚀 Launch-Readiness-Audit — Konsolidierter Report

Vier parallele Deep-Audits (Pricing/Checkout, Landing/SEO, Studios/Features, Security/RLS) sind abgeschlossen. **Gute Nachricht:** Sicherheit, RLS, Storage & Refund-Logik sind auf Produktionsniveau. **Handlungsbedarf:** Pricing-Inkonsistenzen, unehrliche Landing-Stats, ein paar halbfertige Features die versteckt gehören.

---

## 🛑 BLOCKER — muss vor Launch (Fix-Plan)

### B1. Preis-Mismatch 14,95 € vs 14,99 €
- `src/config/pricing.ts:68` sagt **14,95 €** (Basic)
- `PricingSection.tsx:82`, `Pricing.tsx:277`, `BlackTieHero`-Copy sagen **14,99 €**
- **Fix:** eine Zahl. Empfehlung: **14,99 €** überall (Landing-Promo bleibt konsistent). `pricing.ts` und alle Stripe-Coupon-Rabatte gegen 29,99 € Regularprice prüfen.

### B2. Feature-Gates blockieren den Beta-Nutzer
`pricing.ts:130-148` gated `apiAccess`, `whiteLabel`, `team` hinter `enterprise`. In der Single-Plan-Beta gibt es kein Enterprise → Nutzer werden aus Features ausgesperrt.
- **Fix:** Für Beta alle nicht-`api`-Features nach `pro` verschieben. `apiAccess` bleibt gated (Feature existiert noch nicht).

### B3. Customer-Portal zeigt falschen Preis (34,95 €)
`supabase/functions/customer-portal/index.ts:12-14` referenziert Legacy-Preise. Wenn Nutzer "Abo verwalten" klicken → sehen 34,95 € statt 14,99 €.
- **Fix:** `STRIPE_PRICE_MAP` auf die aktuellen Pro-Price-IDs aktualisieren.

### B4. Unehrliche Stats & JSON-LD (rechtliches Risiko DE)
- `BlackTieHero.tsx:100-110` → "10K+ Creator / 1M+ Posts / +43 % Engagement"
- `SocialProofStrip.tsx:32-37` → "4.8/5 · 10.000+ Creators"
- `LiveDemoShowcase.tsx:189` → "+312 %", "♡ 12,4K"
- `translations.ts:3926-3942` → drei erfundene Testimonials (Sarah M., Marco R., Lisa K.)
- `index.html:34` → "Über 10.000 Creator vertrauen …"
- `pages/Index.tsx:48-49` → JSON-LD `aggregateRating 4.8 / 1200 reviews`
- **Fix (Beta-ehrlich):**
  - Hero-Stats: **"BETA" · "3 Monate" · "1000 Founders-Plätze"** (live counter)
  - `SocialProofStrip` → "Founders-Beta · limitierte Plätze" statt Sternratings
  - Testimonials-Sektion: **entfernen** bis echte da sind, oder unter Sektion "Beispiel-Prompt" umlabeln
  - JSON-LD `aggregateRating` **komplett entfernen** (Google-Spam-Risiko)
  - `LiveDemoShowcase`: harte Zahlen entfernen, qualitativ formulieren
  - `index.html:34` Meta-Description umschreiben

### B5. Legacy-Upgrade-Pfade offen
- `/upgrade-enterprise` Route in `App.tsx` aktiv (`UpgradeEnterprise.tsx`)
- `EnterpriseUpgradePrompt.tsx` triggert das
- `UsageRecommendationWatcher.tsx:15` empfiehlt Upgrade wenn `plan !== "basic"`
- **Fix:** Route auf `/pricing` redirecten, Prompt-Komponente ausblenden (Feature-Flag `BETA_ACTIVE`).

### B6. `index.html` Verifikationscode-Platzhalter
`index.html:39` enthält `DEIN_VERIFIKATIONSCODE_HIER` → Google Search Console broken.
- **Fix:** entfernen oder mit echtem Code ersetzen.

---

## ⚠️ WARNINGS — sollten vor Launch, nicht kritisch

### W1. Picture Studio ohne UnifiedAssetPicker
`ImageGenerator.tsx:168` nutzt lokalen `FileReader` statt globaler Cast/World-Bibliothek. → Cast-Konsistenz greift dort nicht.
- **Fix:** UnifiedAssetPicker einbinden (analog Motion Studio).

### W2. Stripe-IDs 5-fach hardcoded
`create-checkout`, `check-subscription`, `stripe-webhook`, `customer-portal`, `pricing.ts` — jede Preisänderung = 5-File-Deploy.
- **Fix (nice, aber jetzt sinnvoll):** `supabase/functions/_shared/stripe-config.ts` als single source.

### W3. Community-Tables `USING (true)`
`community_channels`, `community_messages`, `mentor_slots` → jeder eingeloggte Nutzer sieht alles.
- **Fix falls Privacy gewünscht:** channel_members-Scope einführen. Falls Community bewusst öffentlich → in Security-Memo dokumentieren (bereits als "accepted-by-design" für realtime.messages markiert, aber die Community-Tables sind separat).

### W4. Halbfertige Features werden angezeigt
Sollten hinter `BETA_ACTIVE`-Flag / ComingSoon versteckt werden:
- `Autopilot.tsx` (bereits ComingSoon für Non-Admins ✓)
- `Carousel.tsx:224` PNG/PDF-Export
- `Calendar.tsx:446` "Share"/"Filter" hardcoded ComingSoon → Buttons rausnehmen statt "Coming Soon"-Toast
- Social OAuth für LinkedIn, X, Facebook (`translations.ts:3137` = `oauthComingSoon`) → aus Connector-Liste entfernen, nur IG/TikTok/YT lassen

### W5. Founders-Counter Drift-Risiko
UI zählt `founders_signups` (DB), Stripe zählt Coupon-Redemptions separat. Kann divergieren.
- **Fix:** In `create-checkout` **nach** erfolgreichem Session-Create einen Slot atomar reservieren + bei webhook-`checkout.completed` bestätigen. Bei Abbruch nach TTL zurückgeben.

### W6. Edge-Function-Timeouts fehlen bei einigen AI-Endpoints
Replicate/Sync.so können hängen → Function hängt bis Supabase-Timeout.
- **Fix:** `AbortController` mit 120-300s Timeout in `generate-ai-video`, `refine-asset-photo`, `render-directors-cut`.

---

## ✅ ALLES GRÜN — bereits launch-reif

- **Motion Studio** UUID-Pipeline v202+, Refund-Logik ✓
- **AI Video Studio** (ToolkitGenerator) Scene-Anchor + Refunds ✓
- **Cast & World** CRUD, RLS, Storage-Path-Constraints, refine-asset-photo ✓
- **Director's Cut** Export-Pipeline + Autosave ✓
- **Universal Creator** UUID-Wiring ✓
- **Security:** RLS auf allen kritischen Tabellen, Storage-RLS mit `user_id`-Path-Prefix, `has_role`-RPC serverseitig, Secrets nicht im Client, `credit-refund` atomar ✓
- **Legal:** Impressum (echte Daten), AGB mit Founders-§, Privacy, DPA, Cookie-Consent ✓
- **i18n:** DE/EN/ES vollständig auf Landing ✓

---

## 📋 Empfohlene Umsetzungs-Reihenfolge (in dieser Reihenfolge builden)

**Phase 1 — Pricing & Checkout konsistent (Blocker B1-B3, B5)**
1. `src/config/pricing.ts`: `basic.priceMonthly` 14.95 → **14.99**; Feature-Flags von `enterprise` nach `pro` verschieben (außer `api`)
2. `supabase/functions/customer-portal/index.ts`: `STRIPE_PRICE_MAP` aktualisieren
3. `supabase/functions/_shared/stripe-config.ts` (neu): zentrale IDs
4. `App.tsx`: `/upgrade-enterprise` → Redirect `/pricing`
5. `EnterpriseUpgradePrompt.tsx`, `UsageRecommendationWatcher.tsx`: hinter `BETA_ACTIVE` ausblenden

**Phase 2 — Landing ehrlich machen (Blocker B4, B6)**
6. `BlackTieHero.tsx:100-110` Stats-Block ersetzen (BETA / 3 Monate / 1000 Plätze mit `FoundersSlotBadge`)
7. `SocialProofStrip.tsx` Rating-Zeile entfernen, Beta-Framing
8. `LiveDemoShowcase.tsx:189` harte Zahlen → qualitativ
9. `translations.ts` Testimonials & fake Stats entfernen/umlabeln
10. `pages/Index.tsx:48-49` JSON-LD `aggregateRating` löschen
11. `index.html:33-39` Title/Meta/Verifikation angleichen

**Phase 3 — Halbfertiges verstecken (W4)**
12. `Calendar.tsx` "Share"/"Filter"-Buttons entfernen (nicht als ComingSoon-Toast)
13. `Carousel.tsx` PNG/PDF-Export hinter Feature-Flag
14. Social-Connect-Liste in `Autopilot`/Settings auf IG/TikTok/YT reduzieren

**Phase 4 — Robustheit (W5, W6, W1)**
15. Founders-Slot atomar in `create-checkout` reservieren + webhook-confirm
16. AbortController-Timeouts in Video-AI-Functions
17. Picture Studio UnifiedAssetPicker (optional — kann Post-Launch)

**Phase 5 — Nice-to-have**
18. Community-Tables Privacy-Scope oder Doku
19. Security-Audit-Log für Auth-Fails
20. Konsolidierte Stripe-Config-Nutzung in allen 5 Files

---

## 🎯 Erwarteter Effekt

Nach Phase 1-3 (≈ 12 Datei-Edits, 2 Edge-Function-Updates, keine Migration nötig): **Plattform ist rechtssicher, konsistent gepreist und ehrlich beworben** → launch-ready für Beta.

Phase 4-5 kann parallel zum Public-Launch laufen.

---

**Bereit zum Umsetzen?** Sag "Phase 1" oder "alles" — dann fange ich mit den Blockern an. Wenn du eine andere Reihenfolge willst, sag Bescheid.
