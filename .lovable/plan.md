

## Pricing-Layout für 1-Plan-Modell — ohne Penetranz

### Problem
Aktuelle PricingSection hat `grid md:grid-cols-3` mit 3 großen Karten. Bei nur 1 Plan wäre eine einzelne 1/3-breite Karte verloren in der Mitte, eine vollbreite Karte würde wie eine aufdringliche Werbe-Bühne wirken. Die Lösung muss **wertig wirken, aber zurückhaltend** — passend zum James-Bond-2028-Stil.

### Konzept: „Ein Versprechen, klar präsentiert"
Statt 3 Karten gegeneinander zu vergleichen, präsentieren wir **1 Karte mit Kontext drumherum**. Der Wert entsteht durch das, was außen steht (Konkurrenz-Vergleich, Trust-Signale), nicht durch Plan-Auswahl.

---

### Layout-Aufbau (Landing-Page)

```text
┌─────────────────────────────────────────────────┐
│  Section-Header (zentriert)                     │
│  "Ein Plan. Alles inklusive."                   │
│  Kurzer Subtitle                                │
├─────────────────────────────────────────────────┤
│                                                 │
│   ┌──────────────────┐  ┌─────────────────┐    │
│   │                  │  │ vs. Buffer 25 € │    │
│   │   PRO-KARTE      │  │ vs. Hootsuite   │    │
│   │   29,99 € /Mo    │  │       99 €      │    │
│   │                  │  │ vs. Later 25 €  │    │
│   │   ✓ Feature 1    │  │                 │    │
│   │   ✓ Feature 2    │  │ "AdTool inkl.   │    │
│   │   ✓ Feature 3    │  │  AI-Video,      │    │
│   │   ✓ Feature 4    │  │  Director's Cut │    │
│   │   ✓ Feature 5    │  │  & Smart Studio"│    │
│   │                  │  │                 │    │
│   │  [Start for free]│  └─────────────────┘    │
│   │                  │                          │
│   │  14 Tage Trial   │  ┌─────────────────┐    │
│   │  + 10 € AI-Cred. │  │ AI-Video Top-up │    │
│   └──────────────────┘  │ 10 / 50 / 100 € │    │
│                         │ "Mehr brauchen?"│    │
│                         └─────────────────┘    │
└─────────────────────────────────────────────────┘
```

**Grid:** `md:grid-cols-3` bleibt — Pro-Karte nimmt **2 Spalten** (`md:col-span-2`), rechte Spalte ist gestapelt (Vergleich oben, Top-ups unten).

---

### Hero-Bereich: Mini-Pricing-Hint (subtil, nicht penetrant)

Im Hero unter dem Subtitle, oberhalb der Buttons, eine **dezente Inline-Zeile** statt eines Banners:

```text
"Ab 29,99 € / Monat · 14 Tage kostenlos testen · Keine Kreditkarte nötig"
```

Style: kleine Schrift (`text-sm text-muted-foreground`), keine Box, kein Border — wirkt wie eine Service-Info, nicht wie Werbung. Klickbar → scrollt zur Pricing-Section (`#pricing`).

**Kein zusätzlicher Banner**, weil:
- Top-Bar-Banner würden wirken wie „SALE!"-Schreierei → bricht James-Bond-Premium-Feel
- Hero hat bereits klaren CTA „Start for free"
- Pricing-Link existiert bereits in der Top-Nav

---

### Konkrete Komponenten-Änderungen

**1. `src/components/landing/PricingSection.tsx`**
- Plans-Array auf 1 Eintrag reduzieren (Pro 29,99 €)
- Grid bleibt `md:grid-cols-3`, Pro-Karte = `md:col-span-2`, Sidebar = `md:col-span-1` mit 2 vertikal gestapelten Mini-Cards
- Neue Mini-Komponente `<CompetitorComparisonCard />` (Buffer/Hootsuite/Later-Vergleich)
- Neue Mini-Komponente `<AIVideoTopupHintCard />` (verlinkt zu `/pricing#topups`)
- Headline: „Ein Plan. Alles, was du brauchst."
- Subtitle erwähnt Trial + Geld-zurück-Vibe

**2. `src/components/landing/BlackTieHero.tsx`** (Hero-Hint)
- Eine neue Zeile zwischen Subtitle und Button-Reihe:
  ```tsx
  <p className="text-sm text-muted-foreground/70 mb-6">
    {t('hero.pricingHint')} {/* "Ab 29,99 €/Monat · 14 Tage kostenlos · Keine Karte nötig" */}
  </p>
  ```
- Kein Banner, keine Box, kein Border

**3. `src/lib/translations.ts`**
- Neue Keys: `landing.pricing.singlePlanTitle`, `landing.pricing.competitorTitle`, `landing.pricing.competitorBuffer/Hootsuite/Later`, `landing.pricing.topupTitle`, `landing.pricing.topupSubtitle`, `hero.pricingHint`
- Drei Sprachen (EN/DE/ES)
- Alte Plan-spezifische Keys (basic.f1-f4, enterprise.f1-f6) bleiben erhalten für späteres Re-Enable

**4. `src/pages/Pricing.tsx`** (separate Pricing-Seite)
- Hauptbereich: dieselbe 2/3-Karte-Struktur, aber prominenter
- Sektion „Mehr AI-Videos brauchen?" mit Credit-Pack-Karten (10 € / 50 € / 100 € / 250 €) als horizontaler Slider
- FAQ-Block am Ende: „Was ist enthalten?", „Wie funktioniert der Trial?", „Kann ich jederzeit kündigen?"

---

### Warum dieses Layout funktioniert

**Nicht penetrant, weil:**
- Kein Top-Banner, kein Sticky-Footer, kein Modal
- Pricing-Hint im Hero ist klein und informativ, nicht werbisch
- Pricing-Section nimmt selben vertikalen Raum wie vorher — kein „neues lautes Element"

**Trotzdem überzeugend, weil:**
- Konkurrenz-Vergleich rechts macht den Wert sofort sichtbar („AdTool kann mehr für gleichen Preis")
- Top-up-Hint adressiert Heavy-User-Frage proaktiv („Was wenn ich mehr Videos brauche?")
- Trial + „keine Karte nötig" senkt Conversion-Hürde

**James-Bond-Feel bleibt erhalten:**
- Asymmetrisches 2:1-Layout statt 3 gleichberechtigter Karten = wirkt kuratiert, nicht generisch
- Glasmorphism + Gold-Glow auf Pro-Karte unverändert
- Keine Schreier-Banner, keine Sales-Sticker

---

### Was nicht geändert wird
- Hero-Layout an sich (nur 1 Zeile Pricing-Hint hinzu)
- FeatureGrid, MissionFeatures, AIModelsArsenal — bleiben wie sie sind
- Top-Navigation („Pricing"-Link funktioniert weiter wie heute)
- FAQ-Section (bleibt unten)

### Aufwand
- PricingSection-Refactor: 1,5 h
- Hero-Hint einfügen: 15 Min
- Übersetzungen: 30 Min
- Pricing-Seite anpassen: 1 h
- **Gesamt:** ~3 h für komplettes Pricing-Layout

