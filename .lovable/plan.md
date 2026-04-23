

## Bond/Agent-Referenzen aus dem sichtbaren UI entfernen — Design bleibt

### Was bleibt (nicht angefasst)
- Komplettes visuelles Design: Deep-Black-Hintergrund, Gold-Akzente, Glassmorphism, Playfair Display, Glow-Effekte, asymmetrisches Pricing-Layout
- Komponenten-Dateinamen mit `BlackTie...` (z. B. `BlackTieHero.tsx`, `BlackTieFooter.tsx`) — interne Namen, nicht user-sichtbar
- Memory-Notizen zum „James Bond 2028"-Designsystem (interner Code-Name für die Aesthetik)

### Was entfernt / umgeschrieben wird

**1. Hero-Badge (`BlackTieHero.tsx`, Zeile 41)**
- Vorher: `Powered by AI · For Agents Only`
- Nachher: `Powered by AI · For Modern Marketers` (oder neutral: `AI-Powered Social Media Marketing`)
- Hardcoded String → durch i18n-Key `landing.hero.badge` ersetzen (EN/DE/ES)

**2. Hero-Subline (`landing.hero.subline` in EN/DE/ES)**
- Vorher EN: „Your AI-powered marketing **arsenal** for social media…"
- Nachher EN: „Your AI-powered marketing **toolkit** for social media…"
- Analog DE: „Marketing-Arsenal" → „Marketing-Toolkit"
- Analog ES: „arsenal de marketing" → „kit de marketing"

**3. Mission-Section (`MissionFeatures.tsx` + Translations)**
- Badge „Mission Control" → „Why AdTool"
- Übersetzungs-Key `landing.mission.badge` in EN/DE/ES anpassen
- Komponenten-Variablen (`missions`, `selectedMission`) bleiben — sind nur Code, nicht user-sichtbar

**4. AI-Models-Section (`AIModelsArsenal.tsx` + Translations)**
- Badge „AI Arsenal" → „AI Models" oder „Premium AI Stack"
- Übersetzungs-Key `landing.aiModels.badge` in EN/DE/ES anpassen
- Komponenten-Dateiname bleibt (interner Code)

**5. Pricing-Badge (`landing.pricing.badge`)**
- Vorher EN: „Recommended by MI6"
- Vorher DE: „Empfohlen vom MI6"
- Vorher ES: „Recomendado por MI6"
- Nachher: „Most Popular" / „Beliebteste Wahl" / „Más Popular"

**6. FeatureGrid Subtitle (`landing.features.subtitle`)**
- Vorher: „A complete **arsenal** of tools…"
- Nachher: „A complete **suite** of tools…" (analog DE/ES)

**7. Footer brand description (`landing.footer.brandDescription`)**
- Vorher: „Your AI-powered marketing **arsenal**…"
- Nachher: „Your AI-powered marketing **toolkit**…" (analog DE/ES)

**8. „Mission Badge" auf Generator + Mediathek**
- `GeneratorHeroHeader.tsx` (Zeile 40): Kommentar `{/* Mission Badge */}` → `{/* Status Badge */}` (Code-Kommentar, kein Effekt auf UI — Badge-Text kommt aus `t('generator_hero_badge')`, prüfen ob unspionig)
- `MediaLibraryHeroHeader.tsx` (Zeile 53–65): Kommentar `{/* Mission Badge */}` → `{/* Section Badge */}`. Der sichtbare Text ist bereits „Mediathek" — ok, nicht ändern.

### Geprüft, aber **kein Change nötig**
- `GadgetCardDynamic.tsx` — „Gadget" ist UI-Element-Name, nicht user-sichtbarer Text
- Variablennamen wie `missions`, `selectedMission`, `mission.featureId` — interner Code
- `Briefing` als Status-Label im Content-Workflow — Standard-Marketing-Vokabular, kein Spy-Bezug
- `BlackTieFooter.tsx` Komponentenname — intern
- `Recommended by MI6` ist der einzige offensichtliche Bond-Witz im Pricing — wird ersetzt

### Technische Umsetzung
- **1 Datei-Edit** in `src/lib/translations.ts` (3 Sprachen, ~10 Strings: badge, subline, mission.badge, aiModels.badge, pricing.badge, features.subtitle, footer.brandDescription)
- **1 Hardcoded-String-Fix** in `BlackTieHero.tsx` Zeile 41 → neuer i18n-Key `landing.hero.badge`
- **2 Code-Kommentare** in Generator/MediaLibrary Header (kosmetisch, optional)

### Aufwand
- Translations EN/DE/ES updaten: 20 Min
- BlackTieHero Badge i18n-fizieren: 10 Min
- **Gesamt: ~30 Min**

