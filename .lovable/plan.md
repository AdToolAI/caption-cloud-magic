

## Plan: Hardcoded German text on landing page through translation system

### Problem

Several landing page components have hardcoded German strings instead of using the `useTranslation()` hook. The language switcher only affects components that use `t()` calls — the rest stays German regardless of setting.

### Affected Components & Hardcoded Strings

**1. `src/components/landing/FeatureGrid.tsx`**
- Section heading: "Alles was du brauchst für Social Media Erfolg"
- Section subtitle: "Ein komplettes Arsenal an Tools..."
- All 6 feature cards (titles + descriptions): "Content Planung", "Analytics Dashboard", "Brand Kit", "KI Content Coach", "Multi-Platform", "Zielverfolgung" + their descriptions

**2. `src/components/landing/MissionFeatures.tsx`**
- 3 mission cards (titles + descriptions): "Plane deinen Monat", "Optimiere Performance", "Skaliere Kampagnen"
- Subtitle: "Drei Schritte zu effektiverem Marketing..."
- "Mehr erfahren" link text

**3. `src/components/landing/PricingSection.tsx`**
- Section heading: "Wähle deinen Einsatz-Level"
- Subtitle: "Flexible Pläne für Einzelkämpfer..."
- All plan details: "/Monat", feature lists, button texts ("Starten", "Auf Pro upgraden", "Kontakt"), badge ("Empfohlen vom MI6")

**4. `src/components/landing/BlackTieFooter.tsx`**
- Column headers: "Produkt", "Ressourcen", "Unternehmen", "Rechtliches"
- Company links: "Über uns", "Karriere", "Kontakt", "Presse"
- Legal links: "Datenschutz", "AGB", "Cookie-Einstellungen"
- Brand description paragraph
- "Alle Rechte vorbehalten", "Made with ♥ in Germany"

### Solution

1. Add all missing translation keys to `src/lib/translations.ts` under `en`, `de`, and `es`
2. Replace every hardcoded German string in the 4 components with `t('key')` calls

### Files

| Action | File | Change |
|--------|------|--------|
| Edit | `src/lib/translations.ts` | Add ~60 new keys for landing page sections (features, missions, pricing, footer) |
| Edit | `FeatureGrid.tsx` | Replace hardcoded strings with `t()` calls |
| Edit | `MissionFeatures.tsx` | Replace hardcoded strings with `t()` calls |
| Edit | `PricingSection.tsx` | Replace hardcoded strings with `t()` calls |
| Edit | `BlackTieFooter.tsx` | Replace hardcoded strings with `t()` calls |

### Result

Switching language to English shows the entire landing page in English — no more mixed German/English content.

