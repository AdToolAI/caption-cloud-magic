---
name: Open Access (Beta 2026)
description: Keine Feature-Sperren mehr — jede Funktion ist für jeden angemeldeten Nutzer offen
type: feature
---
- `useTrialAccess().hasFullAccess` ist konstant `true`. Trial-Status und Abo-Status bleiben als reine Information (Badges, Abrechnung, Analytics) erhalten, steuern aber keinen Zugang.
- `src/lib/entitlements.ts`, `src/lib/access-control.ts` und `hasAccess`/`getFeatureLimit` in `src/config/pricing.ts` sind Open-Access-Shims: immer `true` bzw. `Infinity`.
- Einzige Voraussetzung für Features bleibt die Anmeldung (Route-Guards). Keine Upgrade-Wand, kein Plan-Check, kein Limit — weder für Testnutzer noch für nicht-zahlende Konten.
- Neue Features dürfen KEINE Plan-/Abo-/Trial-Gates einführen.
