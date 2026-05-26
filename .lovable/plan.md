# Fix: Roh sichtbare `${t('...')}` Strings im Intelligenten Kalender

## Problem
Im Card „Schnell-Planung" auf `/calendar` werden Labels wie `$Schnell-Planung`, `$Titel (optional)`, `${t('calendar.internalTitle')}` und `$Caption / Post-Text` **als Text** angezeigt. Ursache: In `src/components/calendar/ScheduleQuickForm.tsx` stehen Template-Literal-Ausdrücke wie `${t('calendar.quickSchedule')}` direkt im JSX-Body / in `placeholder="..."` Attributen — ohne umschließende `{ ... }` JSX-Expression-Braces. React behandelt sie deshalb als statischen String, der mit `$` beginnt.

## Scope (1 Datei)
`src/components/calendar/ScheduleQuickForm.tsx` — betroffene Zeilen (laut grep): **242, 244, 248, 257, 260, 271** (und ggf. weitere im selben Block, die ich beim Bearbeiten mitprüfe).

## Fix-Pattern
- JSX-Text: `${t('calendar.quickSchedule')}` → `{t('calendar.quickSchedule')}`
- Mit Emoji-Prefix: `🎨 ${t('calendar.importedFromGenerator')}` → `🎨 {t('calendar.importedFromGenerator')}`
- Attribut: `placeholder="${t('calendar.internalTitle')}"` → `placeholder={t('calendar.internalTitle')}`

## Verification
- Datei nach Edit per `rg -n "\\\$\\{t\\("` re-grepen → 0 Treffer in der Datei (Zeile 141 bleibt korrekt, weil sie innerhalb eines echten Template-Strings in `toast.success(\`...\`)` steht).
- Build läuft auto; danach kurz die Seite anschauen.

## Nicht angefasst
- Keine Übersetzungs-Keys hinzugefügt/geändert (`src/lib/translations.ts` bleibt unberührt — die Keys existieren bereits).
- Kein Redesign, kein Logik-Change, keine anderen Tabs/Komponenten.
