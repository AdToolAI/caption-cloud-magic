

## Activation-Phase ✅ abgeschlossen

B1 (Email-Drip) + B2 (Push-Reminder) + B3 (Streak mit AI-Dollar-Belohnungen) sind live. Damit greift die komplette Aktivierungs-Mechanik.

## Was als nächstes? → Phase C: Retention & Monetization

Das Ziel verschiebt sich jetzt von „User aktivieren" zu „User halten und in zahlende Kunden konvertieren". Hier mein Vorschlag in priorisierter Reihenfolge:

---

### 🥇 C1: Smart Upgrade Prompts (kontextuelle Conversion)
**Warum zuerst?** Dein größter Hebel. User stoßen täglich an Limits (Credits, Features), aber bekommen aktuell nur generische Upsells. Kontextuelle Prompts in Schlüsselmomenten konvertieren 3-5× besser.

**Was wir bauen:**
- **Credit-Threshold-Trigger**: Bei < 100 Credits → Subtle Banner "Du hast nur noch X Credits — sichere dir 2.500 für $29,95"
- **Feature-Wall-Triggers**: Beim Klick auf Pro-Features (z. B. Sora 2, Director's Cut Reframe) → eleganter Upgrade-Modal statt simpler Toast
- **Streak-Milestone-Upsells**: Nach 7-Tage-Streak → „Du nutzt AdTool intensiv — spare 30% mit Jahres-Plan"
- **Usage-basierte Empfehlungen**: User generiert 5+ Videos/Woche auf Basic → personalisierter Pro-Upsell mit ROI-Rechnung
- **Centralized Trigger-System**: Ein `useUpgradeTrigger`-Hook + `<UpgradeModal>`-Komponente, A/B-fähig via PostHog Feature-Flags

**Aufwand:** ~3h | **Impact:** Hoch (direkter Revenue)

---

### 🥈 C2: Win-Back-Kampagne (verlorene User zurückholen)
**Warum?** Die andere Hälfte des Activation-Trichters: User, die einmal aktiv waren und dann verschwunden sind. Re-Aktivierung kostet 5× weniger als Neuakquise.

**Was wir bauen:**
- **Edge Function `process-winback-emails`** (täglich 11:00 UTC)
- Findet User mit `last_activity > 14 Tage ago` UND noch nie Win-Back erhalten
- 2-stufige Sequenz:
  - **Tag 14**: „Wir vermissen dich — hier sind 100 Bonus-Credits 🎁" (auto-gutgeschrieben)
  - **Tag 30**: „Letzte Chance — 50% Rabatt auf 3 Monate Pro" (Stripe-Coupon-Link)
- Idempotenz via `winback_email_log`
- Push-Variante parallel (wie B2)

**Aufwand:** ~1.5h | **Impact:** Mittel-Hoch

---

### 🥉 C3: Referral-Programm (viraler Wachstumshebel)
**Warum?** Streak-User sind deine Power-User — die teilen gerne, wenn die Belohnung stimmt.

**Was wir bauen:**
- **Eindeutige Referral-Codes** pro User (Tabelle `user_referrals`)
- **Belohnungslogik**: Referrer bekommt $5 AI-Credits + Referee bekommt 200 Bonus-Credits beim Signup
- **Tracking**: UTM + Code-Eingabe im Onboarding
- **Dashboard-Widget**: „Du hast X Freunde eingeladen — verdient: $Y"
- **Share-Buttons**: WhatsApp, Email, X, LinkedIn mit vorgefertigtem Copy (DE/EN/ES)
- **Anti-Fraud**: Selbst-Referral-Block, Email-Domain-Check

**Aufwand:** ~2.5h | **Impact:** Hoch (organisches Wachstum)

---

### 🎯 C4: Annual Plan Upsell (höhere LTV)
**Warum?** Jahres-Pläne erhöhen LTV um 40-60% und reduzieren Churn drastisch.

**Was wir bauen:**
- Neue Stripe-Prices: Basic Annual ($149/Jahr = 17% Rabatt), Pro Annual ($349/Jahr = 17% Rabatt)
- Toggle „Monatlich / Jährlich" auf Pricing-Page mit „Spare 2 Monate"-Badge
- Im Account: Banner für aktive Monatsabonnenten „Wechsle zu jährlich und spare $XX/Jahr"
- Stripe-Migration-Logik (Pro-rate Upgrade)

**Aufwand:** ~1.5h | **Impact:** Mittel-Hoch

---

## Meine Empfehlung: Reihenfolge

**C1 → C2 → C3 → C4**

C1 zuerst, weil es den größten direkten Revenue-Effekt hat und auf der bestehenden Activation-Infrastruktur (Streak, Push) aufbaut. C2 schließt den Activation-Loop. C3 + C4 sind dann Multiplikatoren.

---

## Alternative Pfade (falls du andere Prioritäten hast)

- **D: Analytics-Dashboard für User** — „Dein Performance-Report" wöchentlich per Email (zeigt ROI, drives Retention)
- **E: Team-Features** — Multi-User-Workspaces für Agenturen (höchste Plan-Stufe upselling)
- **F: Trust & Social Proof** — Testimonial-Widget, Trustpilot-Integration, Case-Study-Page
- **G: Public API + Zapier** — Enterprise-Verkaufsargument

## Frage an dich

Soll ich mit **C1 (Smart Upgrade Prompts)** starten, oder hast du eine andere Präferenz aus C2-C4 oder den Alternativen D-G?

