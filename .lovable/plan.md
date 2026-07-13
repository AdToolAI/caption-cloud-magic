## Problem

Der „AGB §8"-Link im `FoundersBenefitsDialog` zeigt auf `/legal` — dafür existiert keine Route (nur `/legal/:page`), daher landet man auf der Startseite. Auch der zweite Link im `FoundersSlotBadge` zeigt auf `/legal/terms` was zwar funktioniert, aber springt nicht zu §8.

## Fix

1. **`src/components/landing/FoundersBenefitsDialog.tsx`**: Link `to="/legal"` → `to="/legal/terms#section-8"`.
2. **`src/components/pricing/FoundersSlotBadge.tsx`**: `href="/legal/terms"` → `href="/legal/terms#section-8"`.
3. **`src/pages/Legal.tsx`**: Der bestehenden §8-`LegalSection` (Zeile 156) eine `id="section-8"` (bzw. entsprechendes Prop an `LegalSection`) geben, damit der Hash-Anchor scrollt. Falls `LegalSection` bereits eine ID aus `index`/`title` generiert, stattdessen exakt diese ID in den Links verwenden.

Kein weiterer Logikwechsel nötig.
