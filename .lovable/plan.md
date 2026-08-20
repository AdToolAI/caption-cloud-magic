# Onboarding: "Willkommen an Bord." in der englischen UI

## Befund

Im Concierge-Onboarding ist genau eine Überschrift fest auf Deutsch verdrahtet:

- `src/components/ai-companion/ConciergeIntroScreen.tsx:121` — `Willkommen an Bord.`

Alle anderen Texte in diesem Screen (Ziele, Buttons, Personabeschreibungen) laufen bereits über `tx({de,en,es})` und erscheinen korrekt englisch.

## Fix

Die Überschrift auf `tx({ de: 'Willkommen an Bord.', en: 'Welcome aboard.', es: 'Bienvenido a bordo.' })` umstellen — eine Zeile, keine Logikänderung.

## Verifikation

- `tsgo --noEmit`
- Strict-Purity-Guard (`src/test/english-ui-purity-strict.test.ts`) und `english-ui-purity.test.ts` laufen lassen
- Preview: Onboarding-Screen in EN prüfen

Kein Deploy, keine Edge Functions, keine DB-Änderung.
