## Ziel

1. Redundante Feature-Kachel-Sektion („Alles was du brauchst für Social Media Erfolg") von der Startseite entfernen — der Rest der Landing (Hero, Mission Deck, AI Arsenal, UDC, Pricing etc.) zeigt bereits alles Wichtige.
2. Eine belastbare **AI Video Refund Policy** als offizielle Legal-Page einführen, im Footer neben AGB verlinken und eine **kurze Version** direkt auf der Credit-Kauf/Top-Up-Seite anzeigen.

## Umsetzung

### 1. Startseite entschlacken
- `src/pages/Index.tsx`: `<FeatureGrid />` (Zeile ~115) und den zugehörigen Import (Zeile 12) entfernen.
- `src/components/landing/FeatureGrid.tsx`: Datei löschen (nur von Index.tsx benutzt; `src/pages/Home.tsx` nutzt eine separate Datei unter `components/home/FeatureGrid.tsx` — bleibt unangetastet).

### 2. Neue Legal-Page: AI Video Refund Policy
- Neue Datei `src/pages/legal/AIVideoRefundPolicy.tsx` mit den Kernregeln aus `docs/policies/refund-policy-v263.md` in kundenfreundlicher Sprache (DE, konsistent mit AutopilotAUP-Layout):
  - **Automatischer Refund**: Provider-Timeout, 5xx, Sync/Mux-Fehler, Lambda-Crash, Watchdog-Kill, Content-Filter nach Bestätigung → volle Credit-Rückerstattung durch `credit-refund-automation`.
  - **Kein automatischer Refund**: Ergebnisse, die der Nutzer im Anchor-Preview vor „Bestätigen & rendern" bereits gesehen hat (Identity-Drift, Framing, Style, Action-Interpretation) — analog Runway / Artlist / HeyGen.
  - **Goodwill**: 1 Kulanz-Refund pro Nutzer alle 30 Tage über Support.
  - **Preview-Re-Rolls**: kosten nur die Anchor-Compose-Credits (~1), keine Hailuo/Sync-Kosten.
  - **Beta-Hinweis**: Während der Beta (bis Ende Beta-Zeitraum) gilt eine erweiterte 60-Tage-Legacy-Grace für Direkt-Render-Flows.
  - Kontaktweg: Support-Formular / E-Mail.
- Route in `src/App.tsx` registrieren: `/legal/ai-video-refund` → `AIVideoRefundPolicy`.
- SEO/Helmet-Tags konsistent zu den anderen Legal-Pages.

### 3. Footer-Verlinkung
- `src/components/landing/BlackTieFooter.tsx`: in der Legal/Terms-Gruppe (neben „terms" und „avv") Eintrag „AI Video Refund Policy" → `/legal/ai-video-refund` hinzufügen.
- Neuer i18n-Key `landing.footer.aiRefund` (DE/EN/ES) in `src/lib/translations.ts`.

### 4. Kurzversion auf der Credit-Kauf-Seite
- Betroffene Screens:
  - `src/pages/Pricing.tsx` Topup-Section (`#topups`).
  - `src/components/landing/AIVideoTopupHintCard.tsx` (überall wo Media-Credits gekauft werden können; erscheint u. a. im Composer/Studio).
- Neue Mini-Komponente `src/components/credits/RefundPolicyMini.tsx`:
  - 3-Zeilen-Zusammenfassung (Icon + Text): „Technische Fehler → automatischer Refund. Vom Nutzer bestätigte Previews → kein Refund. Details siehe [AI Video Refund Policy]."
  - Link auf die volle Legal-Page.
- In Pricing-Topup-Section und `AIVideoTopupHintCard` einbinden.

## Technische Notizen

- Keine Backend-Änderungen; `credit-refund-automation` existiert bereits und deckt die auto-Refund-Klassen ab.
- i18n: nur die neuen Footer- und Mini-Card-Keys hinzufügen, Legal-Page-Text darf zunächst DE-only sein (analog `AutopilotAUP.tsx`).
- Kein Impact auf `src/pages/Home.tsx` (interne App-Home), nur die öffentliche Landing (`Index.tsx`).
