

## Befund

Du hast völlig Recht — wir haben bereits **6 vollwertige AI Video Studios** (Sora, Kling, Hailuo, Wan, Luma, Seedance) plus den **Video Composer** und das **Universal Video Studio**. Ein paralleles "Express Studio" wäre redundant. Stattdessen: **das bestehende AI Video Studio als First-Run-Erlebnis nutzen**, mit einem **10€ Startguthaben** als Conversion-Hebel.

## Strategie: „Welcome Bonus" + Hero-Popup für brandneue Nutzer

### Kernidee
Jeder neue User bekommt **10€ Gratis-Guthaben** im AI-Video-Wallet → kann sofort ein Video erstellen (5-10 Clips realistisch) → erlebt Wow-Effekt → kauft Credits nach.

### Trigger-Logik (wer sieht das Popup?)
„Brandneu" = ALLE Bedingungen erfüllt:
- `ai_video_wallets.total_purchased_euros = 0` (nie Credits gekauft)
- `ai_video_wallets.total_spent_euros = 0` (nie ein AI Video erstellt)
- Popup wurde noch nicht dismissed (`profiles.welcome_bonus_seen_at IS NULL`)
- Account-Alter < 7 Tage (Sicherheitsgrenze gegen Re-Trigger nach langer Inaktivität)

→ Sobald **eine** Bedingung verletzt ist, kein Popup mehr. Saubere One-Shot-Experience.

---

### 1. Welcome-Bonus-Mechanik

**DB-Migration:**
- `profiles.welcome_bonus_granted_at TIMESTAMPTZ` — wann gewährt
- `profiles.welcome_bonus_seen_at TIMESTAMPTZ` — wann Popup dismissed
- Neue Edge Function `grant-welcome-bonus` (idempotent, server-validiert)

**Anti-Abuse:**
- Server-Check: 1 Bonus pro `auth.users.id` (existing user_id-PK reicht)
- Optional zusätzlich: 1 Bonus pro E-Mail-Domain-Hash (gegen Fake-Accounts)
- Bonus wird beim **ersten Login nach Email-Verification** gewährt — nicht bei Signup (verhindert Wegwerf-Accounts)
- Logging in `ai_video_transactions` mit `type='welcome_bonus'` für Audit

**Buchung:**
- 10€ direkt in `ai_video_wallets.balance_euros` (separate Spalte `bonus_credits` optional, aber Komplexität nicht wert)
- Trackbar via `ai_video_transactions.description = 'Welcome Bonus'`

---

### 2. Hero-Popup („Cinematic Welcome")

**Design (James Bond 2028 konform):**
- **Vollbild-Modal** (max-width 720px, dark backdrop blur) — keine Sidebar, keine Distraction
- **Hero-Video** oben (auto-play, muted, loop) — zeigt 3-4 Beispiel-AI-Clips als Mini-Showreel
- **Headline** (Playfair Display, gold gradient): „Willkommen — dein 10€ Startguthaben wartet"
- **Subheadline** (Inter): „Erstelle dein erstes KI-Video in unter 60 Sekunden. Keine Kreditkarte, kein Risiko."
- **3 Trust-Badges** (Icon + Text):
  - 🎬 6 KI-Modelle (Sora, Kling, Hailuo …)
  - ⚡ Erste Vorschau in ~30 Sek
  - 💎 10€ Guthaben = ~5-10 Clips gratis
- **CTA-Button** (gold, glow): „Jetzt mein erstes Video erstellen →" → `/ai-video-studio`
- **Sekundärer Link**: „Später" (klein, grau) → setzt `welcome_bonus_seen_at`, Bonus bleibt aber im Wallet

**Verhalten:**
- Erscheint **einmalig** auf `/` (Home) nach Login
- Dismissible via `Esc`, Click-outside, „Später"-Link, oder Hauptbutton
- Wird via `useWelcomeBonus()`-Hook gesteuert (zentral, kein Doppel-Popup)

---

### 3. Soft-Reminder im AI Video Studio (Erstbesuch)

Wenn der User dann im AI Video Studio landet und noch nie ein Video erstellt hat:
- **Wallet-Banner oben**: „🎁 Du hast 10€ Startguthaben — perfekt für dein erstes Video"
- **Empfohlenes Modell vorausgewählt**: Hailuo 2.3 (günstig + zuverlässig + schnell)
- **3 Beispiel-Prompts** als klickbare Karten („Drone-Shot über Stadt", „Elegante Frau im Kleid", „Cinematic Product Shot")
- Verschwindet nach erstem erfolgreichen Render

→ Senkt Friktion auf **0 Eingaben** (User klickt nur 1 Beispiel + „Generieren")

---

### 4. Conversion-Loop: vom Bonus zum Kauf

Nach dem ersten erfolgreich generierten Video:
- **Success-Modal** mit Konfetti: „🎉 Dein erstes KI-Video ist fertig!"
- 3 CTAs:
  - „Im Director's Cut bearbeiten" → /video-editor
  - „Direkt veröffentlichen" → Composer
  - „Noch eins erstellen" → zurück
- **Wallet-Update sichtbar**: „Verbleibendes Guthaben: 8.49€"
- Ab Wallet < 3€: dezenter Hinweis im Header „💎 Credits aufladen für mehr Videos"

---

### Technische Umsetzung

**Neue/geänderte Dateien:**
- DB-Migration: 2 Spalten in `profiles`
- Edge Function `grant-welcome-bonus` (server-validiert, idempotent)
- Hook `src/hooks/useWelcomeBonus.ts` (Trigger-Logik + Dismiss)
- Komponente `src/components/welcome/WelcomeBonusModal.tsx` (Hero-Popup)
- Komponente `src/components/ai-video/FirstVideoGuide.tsx` (Studio-Banner + Beispiel-Prompts)
- Integration in `src/pages/Home.tsx` (Modal-Mount)
- Integration in `src/pages/AIVideoStudio.tsx` (Banner + Prompts)
- Lokalisierung: EN/DE/ES Strings

**Was unangetastet bleibt:**
- Kein neues "Express Studio" (bestehende Studios reichen)
- Bestehende Credit-Kauf-Flows
- Bestehende Render-Pipelines
- Plan-Restriction (Pro/Enterprise) für AI Video → muss überdacht werden ⚠️

---

### ⚠️ Wichtige offene Frage zur Plan-Restriktion

Aktuell verlangt `ai-video-purchase-credits` (und vermutlich auch die Generation-Functions) einen **Pro- oder Enterprise-Plan**. Wenn der Welcome-Bonus an alle User gehen soll, gibt es zwei Optionen:

**Option 1 (empfohlen):** Free-User bekommen den 10€-Bonus, dürfen ihn nutzen, können aber **keine** Credits nachkaufen ohne Upgrade. → Der leere Wallet wird zum starken Upgrade-Trigger.

**Option 2:** Bonus nur für Pro/Enterprise. → Schwächerer Conversion-Hebel für Free → Pro.

Ich empfehle **Option 1** — der Bonus ist Marketing-Investment in Free-User, die sonst nie das Studio sehen würden. Sobald sie den Wow-Effekt erlebt haben, ist die Upgrade-Conversion massiv höher.

---

### Wirtschaftlichkeit (Sanity-Check)

- Replicate-Kosten Hailuo 6s ≈ €0.15 / Video
- 10€ Bonus ≈ ~60 Videos (bei reinem Hailuo) oder ~5-6 Sora-2-Pro-Videos
- Realistisch: User generiert 3-8 Videos, dann ist Wallet bei ~5€
- Conversion-Annahme: 5-10% kaufen danach Credits (Branchen-Benchmark für „Free Trial → Paid")
- ROI: bei nur 5% Conversion und Ø 50€ Erstkauf → break-even bei <€2.50 Bonus-Kosten pro neuem User → **wirtschaftlich tragbar**

Anti-Abuse-Limit: max. 1.000 Bonus-Grants pro Tag (Soft-Cap im Edge Function), bei mehr → manuelle Review.

---

### Klärungsfragen (an dich)

1. **Free-User-Zugang:** Sollen Free-User den Bonus bekommen + nutzen dürfen (Option 1), oder nur Pro/Enterprise?
2. **Bonus-Höhe:** 10€ fix? Oder gestaffelt (z. B. 5€ Free, 10€ Basic, 15€ Pro neu-onboarded)?
3. **Email-Verification-Pflicht:** Bonus erst nach E-Mail-Verifizierung freischalten (empfohlen gegen Abuse) — ok?
4. **Fallback für Bestandsnutzer:** User die schon registriert sind aber nie ein AI-Video gemacht haben — bekommen die nachträglich auch den Bonus? (Einmaliger Backfill-Run möglich)

Sobald geklärt → Migration + Edge Function + Modal + Studio-Banner — ca. **6-8 h Implementierung**.

