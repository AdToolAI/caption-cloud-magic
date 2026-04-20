

## Was kommt als nächstes?

Sora-Cleanup ist durch. Wir sind jetzt am Übergang von Phase C1 (Smart Upgrade Prompts ✅) zu den nächsten Conversion-Hebeln. Hier mein Vorschlag in priorisierter Reihenfolge:

---

### 🥇 Empfehlung: USP-Block "6 lizensierte Premium-KI-Modelle" auf der Landing-Page (15 Min)

**Warum jetzt?** Wir haben gerade Sora 2 zurückgestuft — die Marketing-Story muss aktiv die neue Erzählung aufbauen, sonst entsteht eine Lücke. Das ist ein direkter Anschluss-Schritt mit hohem Marketing-Wert.

**Was wir bauen:**
- Neuer Block in `MissionFeatures.tsx`: "6 lizensierte Premium-KI-Modelle"
- Visuelle Cards für: Kling 3 Omni · Wan 2.5 · Luma Ray 2 · Hailuo 2.3 · Seedance 2 · Veo
- "⭐ Recommended"-Badge für Kling 3 Omni
- Lokalisiert in DE/EN/ES

---

### 🥈 C2: Win-Back-Kampagne (1.5h)

User reaktivieren, die seit 14+ Tagen inaktiv sind:
- Edge Function `process-winback-emails` (täglich 11:00 UTC)
- 2-stufige Sequenz: Tag 14 → 100 Bonus-Credits, Tag 30 → 50% Rabatt-Coupon
- Push-Variante parallel
- Idempotenz via `winback_email_log`

---

### 🥉 C3: Referral-Programm (2.5h)

Viraler Wachstumshebel — Streak-Power-User teilen gerne:
- Eindeutige Referral-Codes (`user_referrals` Tabelle)
- Belohnung: $5 AI-Credits Referrer + 200 Bonus-Credits Referee
- Dashboard-Widget "Du hast X Freunde eingeladen"
- Share-Buttons (WhatsApp, Email, X, LinkedIn) DE/EN/ES
- Anti-Fraud (Self-Referral-Block)

---

### 🎯 C4: Annual Plan Upsell (1.5h)

LTV-Steigerung durch Jahres-Pläne:
- Stripe Annual Prices (17% Rabatt)
- Toggle "Monatlich/Jährlich" auf Pricing-Page
- In-App-Banner für aktive Monatsabonnenten

---

### Alternative Pfade

- **D**: Wöchentlicher Performance-Report per Email (Retention)
- **E**: Team-Workspaces für Agenturen (Enterprise-Upsell)
- **F**: Sora 2 Studio Hardening — Fallback-Logik auf Wan 2.5, falls Replicate das Modell abschaltet (technische Risikoabsicherung für Grandfathered-User)

---

## Meine Empfehlung

**USP-Block zuerst (15 Min, schließt das Sora-Cleanup ab) → dann C2 Win-Back → C3 Referral → C4 Annual.**

Welche Richtung soll ich nehmen?

