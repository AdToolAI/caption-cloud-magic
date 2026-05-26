## Ziel
Wenn in der Wochenansicht ein bestimmter Time-Slot angeklickt wird, soll genau diese Uhrzeit im Day-Cockpit/Schnell-Planungsfenster vorausgefüllt sein — nicht immer 09:00 Uhr.

## Ursache
`WeekView` übergibt bereits ein korrektes `Date`-Objekt inklusive Stunde an `handleDateClick`. Im `ScheduleQuickForm` wird diese Uhrzeit aber verworfen:

```ts
if (lockedDate) {
  d.setHours(9, 0, 0, 0);
}
const [time, setTime] = useState(() => (lockedDate ? '09:00' : ''));
```

Dadurch erscheint im Cockpit immer 09:00 Uhr, egal welcher Slot gewählt wurde.

## Umsetzung
1. `ScheduleQuickForm.tsx` anpassen:
   - Bei `lockedDate` die vorhandene Uhrzeit aus `lockedDate` übernehmen.
   - `time` initial aus `lockedDate` formatieren, z. B. `19:00`.
   - Optional per `useEffect` synchronisieren, damit ein neuer Klick auf einen anderen Time-Slot bei geöffnetem/erneut geöffnetem Cockpit die Uhrzeit aktualisiert.

2. Bestehende Monatsansicht bleibt unverändert sinnvoll:
   - Klick auf einen Tag ohne konkrete Uhrzeit bleibt weiterhin Default 09:00 Uhr, sofern die Monatsansicht ein Datum um 00:00 liefert.

3. Keine Backend- oder Datenbankänderungen.

## Ergebnis
- Wochenansicht: Klick auf 19:00 → Cockpit zeigt 19:00.
- Wochenansicht: Klick auf 14:00 → Cockpit zeigt 14:00.
- Monatsansicht: Klick auf Tag → bleibt bei 09:00 als Standardzeit.