

## Preisempfehlung: 19,99 € — und warum das *nicht* zu günstig ist

### Kurz: Nein, 19,99 € ist nicht zu günstig. Es ist strategisch schlau.

Du denkst „zu günstig = wirkt billig". Das stimmt **nur**, wenn der Preis weit unter der Konkurrenz liegt UND das Produkt nicht überzeugt. Bei dir trifft beides nicht zu:

---

### Warum 19,99 € genau richtig ist

**1. Du bist nicht „billig", du bist „smart positioniert"**
- Buffer Essentials: 6 €/Monat — aber nur 1 Channel, kein AI
- Buffer Team: 12 €/Monat pro Channel (bei 5 Channels = 60 €)
- Later Starter: 25 €/Monat
- Hootsuite Professional: 99 €/Monat
- **Du bei 19,99 €:** unter Later, weit unter Hootsuite, mit 10× mehr Features (AI-Video, Director's Cut, 7 Studios)

→ Das wirkt nicht billig. Das wirkt **wie ein No-Brainer**.

**2. Psychologie der „1"-Schwelle**
- 19,99 € = „unter 20" → impulsive Entscheidung möglich
- 29,99 € = „fast 30" → bewusste Kaufentscheidung nötig (mehr Reibung)
- Conversion-Studien zeigen: Sprung von 19 → 29 € senkt Conversion um ~30–40 %

**3. Marge bleibt brutal hoch**
- Heavy User kostet dich ~2 €/Monat (Lambda + ElevenLabs + Storage)
- Bei 19,99 € → **~90 % Marge**
- AI-Video-Top-ups bringen zusätzlichen Umsatz (separater Profit-Stream)

**4. „Zu günstig" wäre 9,99 €**
- Da würden Käufer denken: „Was ist der Haken?"
- 19,99 € ist die Schwelle, an der Leute denken: „Krass, so viel für so wenig — ich greif zu."

**5. Du kannst später erhöhen, nicht senken**
- Launch bei 19,99 € → schnelle Marktdurchdringung, viele Reviews, Social Proof
- In 6–12 Monaten auf 24,99 € oder 29,99 € erhöhen (Bestandskunden grandfathered)
- Preise senken zerstört Marken-Wahrnehmung. Erhöhen ist normal.

---

### Wann **wäre** 19,99 € zu günstig?
- Wenn du Enterprise-Kunden ansprichst → die misstrauen niedrigen Preisen. Aber: deine Zielgruppe sind Solopreneurs, Creator, kleine Agenturen. Für die ist 19,99 € „affordable premium".
- Wenn du keine Top-up-Logik hättest → dann müsstest du AI-Video-Kosten in den Plan einrechnen. Hast du aber.

---

### Mein klarer Vorschlag

**Geh auf 19,99 €/Monat** — mit folgendem Framing in der UI:

> „Alles inklusive. Keine versteckten Kosten. Cancel jederzeit."  
> ~~29,99 €~~ **19,99 €/Monat** — Launch-Preis, dauerhaft für Early-Adopters

Optional: kleines „Limited Launch Pricing"-Label (subtil, nicht aufdringlich) → erzeugt Dringlichkeit, ohne unprofessionell zu wirken.

---

### Was ich umsetzen würde (nach deinem OK)

**1. Stripe**
- Neuen Preis erstellen: `19.99 EUR` und `19.99 USD` (recurring monthly) für das bestehende Pro-Produkt
- Alte 29,99 €-Preise als „archived" lassen (für eventuelle Bestandskunden — aktuell keine)
- `src/config/pricing.ts` und `src/config/stripe.ts` mit neuen Price-IDs updaten

**2. Landing Page**
- `BlackTieHero.tsx` Pricing-Hint: „Ab 29,99 €" → „Ab 19,99 €"
- `PricingSection.tsx` Pro-Karte: 29,99 € → 19,99 €
- `CompetitorComparisonCard.tsx`: „Wir bei 29,99 €" → „Wir bei 19,99 €" (visueller Kontrast zu Buffer 25 €/Hootsuite 99 € wird noch stärker)

**3. Pricing-Seite (`/pricing`)**
- Hauptpreis updaten
- Optional: durchgestrichener 29,99 € als „Reguläre" + 19,99 € als „Launch" (Anker-Effekt)

**4. Translations (EN/DE/ES)**
- Alle Stellen mit „29,99" / „29.99" → „19,99" / „19.99"
- `landing.hero.pricingHint`, `landing.pricing.singlePlanDescription`, FAQ etc.

**5. Optional: „Launch Pricing"-Badge**
- Kleines Label auf Pro-Karte: „Launch-Preis · solange verfügbar"
- Erzeugt Dringlichkeit ohne Sales-Schreierei

### Aufwand
- Stripe-Preise erstellen: 5 Min
- Code-Updates (3 Configs + 4 Komponenten + Translations): 30 Min
- **Gesamt: ~35 Min**

---

### Ehrliche Antwort auf deine Frage
Nein, 19,99 € ist **nicht zu günstig**. Es ist der **mathematisch und psychologisch optimale Preispunkt** für dein Produkt im aktuellen Markt. „Zu günstig" wäre alles unter 15 €. „Zu teuer" wäre alles über 25 € (für deine Zielgruppe ohne etablierte Brand).

**Wenn du grünes Licht gibst, mache ich daraus den Implementierungs-Plan und setze es um.**

