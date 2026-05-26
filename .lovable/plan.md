## Problem
Klick auf einen Tag im Smart Calendar löst nichts aus — der Day Cockpit Dialog erscheint nicht.

## Ursache
Im `Calendar.tsx` wird der Dialog **bedingt gemountet**:
```tsx
{selectedWorkspace && prefillDate && (
  <DayCockpitDialog open={showDayCockpit} ... />
)}
```
Radix Dialogs müssen permanent gemountet sein und nur via `open`-Prop gesteuert werden. Wird ein Dialog gleichzeitig gemountet **und** mit `open=true` initialisiert, triggert Radix die Open-Transition in einigen Setups nicht zuverlässig — der Portal-Content wird nie sichtbar. Ergebnis: Klick → State ändert sich → aber kein UI-Feedback.

## Fix
1. **Dialog permanent mounten** in `src/pages/Calendar.tsx` — Bedingung entfernen, stattdessen `date={prefillDate}` und `workspaceId={selectedWorkspace || ''}` direkt durchreichen (der Dialog rendert sowieso nur, wenn `open=true`).
2. **Defensiver Guard** in `DayCockpitDialog.tsx` — wenn `!date || !workspaceId`, gar nichts rendern bzw. Dialog leer halten.
3. **Verifikation**: nach dem Fix `/calendar` öffnen, auf einen Tag klicken → Cockpit-Modal muss erscheinen mit gelocktem Datum links und Tages-Queue rechts. Console-Logs / Runtime-Errors checken.

## Scope
- 1 Datei geändert: `src/pages/Calendar.tsx` (5 Zeilen)
- 1 Datei minimal gehärtet: `src/components/calendar/DayCockpitDialog.tsx` (Early-Return wenn date null)
- Keine DB-, Edge-Function-, oder Logik-Änderungen.