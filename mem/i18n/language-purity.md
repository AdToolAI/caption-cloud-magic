---
name: i18n Sprachreinheit
description: Guard gegen Sprachvermischung in translations.ts/translationsFill.ts (DE/EN/ES)
type: preference
---
- Jeder Wert muss in der Sprache seines Blocks stehen — auch in den `Object.assign(translations.X, {...})`-Nachträgen am Dateiende, die früher ungeprüft blieben.
- Guard: `scripts/check-language-purity.mjs` (Marker-basiert, Allowlist für bewusste Fremdsprach-Claims), eingebunden über `src/lib/__tests__/languagePurity.test.ts`. Der Test loggt zusätzlich Key-Parität DE/EN/ES.
- **Why:** Ein früherer Massen-Übersetzungslauf hatte ~330 spanische Texte in die DE-/EN-Blöcke geschrieben (u. a. „Actualizar ahora" im deutschen AI Video Toolkit).
- **How to apply:** Nach jeder Massenänderung an Übersetzungen `node scripts/check-language-purity.mjs` laufen lassen; Platzhalter niemals übersetzen (`{name}`, `{count}`, `{channel}`, `{platform}` …).
