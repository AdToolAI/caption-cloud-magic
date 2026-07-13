## Ziel
Der „BETA / 3 Monate Beta / 1000 Founders-Plätze"-Block im Landing-Hero (`BlackTieHero.tsx`) soll auch für ausgeloggte Besucher anklickbar sein und die Gründervorteile transparent erklären.

## Umsetzung

### 1. Neue Komponente `FoundersBenefitsDialog.tsx`
`src/components/landing/FoundersBenefitsDialog.tsx` — shadcn `Dialog`, glassmorphism im James-Bond-2028-Look. Inhalte (DE/EN/ES via `t(...)`):

- **Titel**: „Founders-Programm — Deine Vorteile"
- **Beta-Kontext**: 3 Monate öffentliche Beta bis 26.10.2026, ehrliche Kommunikation zu möglichen Fehlern.
- **Vorteilsliste** (Icons + Text):
  - 14,99 €/Monat Preisgarantie für **24 Monate**
  - **20 % Rabatt auf alle Video-Credits** (24 Monate, via Stripe-Coupon)
  - Voller Feature-Zugang während der Beta
  - Direkter Draht zum Team / Priorisiertes Feedback
- **Bedingungen**: Nur die ersten 1000 aktiven Subscriptions. Bei Kündigung/Pausierung/Kontolöschung geht der Gründerstatus dauerhaft verloren und der Slot wird frei.
- **Live-Slot-Anzeige**: bestehende `FoundersSlotBadge` einbetten.
- **CTAs**: „Jetzt Founder werden" → `/pricing`; „Mehr Details" → `/legal#founders`.

### 2. Stats-Strip klickbar machen
In `src/components/landing/BlackTieHero.tsx` (Zeilen 93–113):
- Wrapping-`<button type="button">` um die komplette Stats-Row, öffnet den Dialog.
- Hover-State (leichter Glow/Border) + `aria-label="Founders-Vorteile ansehen"` + `cursor-pointer`.
- Optional dezenter „Info"-Hinweis unter der Zeile: „Klicken für Founders-Vorteile" (klein, muted).
- Keine Änderungen an Layout/Zahlen — nur Interaktivität.

### 3. Übersetzungen
`src/lib/translations.ts`: Neuer Namespace `landing.foundersDialog.*` (Titel, Bullets, Bedingungen, CTAs) in DE/EN/ES.

## Nicht Teil dieses Plans
- Keine Änderung an bestehender Founders-Logik, RPCs, Preisen oder `FoundersSlotBadge`.
- Keine Backend-Änderungen.

## Technische Details
- State: lokaler `useState<boolean>` im `BlackTieHero`.
- Dialog auch ohne Auth benutzbar (keine Session-Abfragen).
- Reuse: `Dialog`, `Button` (shadcn), `FoundersSlotBadge`, Lucide-Icons (`Crown`, `ShieldCheck`, `Percent`, `Clock`).
