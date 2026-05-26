## Zwei Probleme

### 1. Uhrzeit um 1 Stunde versetzt
In `WeekView.tsx` wird das Stunden-Label so erzeugt:

```ts
format(addHours(new Date(0), hour), "HH:mm")
```

`new Date(0)` ist UTC-Mitternacht — in Berlin (Sommerzeit) entspricht das `02:00` lokal. `addHours(..., hour)` plus `format` rechnet alles in lokaler Zeit. Das Label ist also gegenüber dem Index `hour` um 1–2 Stunden verschoben.

Geklickt wird aber mit dem unverschobenen Index:
```ts
slotDate.setHours(hour, 0, 0, 0);
```

Folge: Label „04:00“ entspricht intern `hour=3` → Cockpit zeigt korrekt „03:00“. Genau dein Symptom.

**Fix:** Label deterministisch aus dem Stunden-Index erzeugen, ohne `Date`/Timezone:
```ts
`${String(hour).padStart(2, '0')}:00`
```
Damit stimmen Label-Klick und gesetzte Stunde 1:1 überein — in jeder Zeitzone, auch bei DST-Wechsel.

### 2. Uhrzeit-Picker im Cockpit modernisieren
Aktuell: schlichter `<input type="time">` im „James-Bond-2028“-Cockpit — wirkt wie ein Browser-Default aus dem Windows-XP-Zeitalter.

Neues Design im Cockpit-Stil (Deep Black + Gold/Cyan, Glassmorphism, Playfair für Ziffern):
- Große Tabular-Nums-Anzeige `HH:MM` in Playfair Display, mit weichem Gold-Glow.
- Zwei Glas-Stepper darunter (Stunde / Minute), jeweils mit ▲/▼ Buttons; Minuten in 5-Minuten-Rasterung.
- Schnell-Chips für gängige Posting-Zeiten (`09:00 · 12:00 · 17:00 · 19:00 · 21:00`) — ein Klick übernimmt die Zeit.
- Optionaler „Best Time“-Hinweis (UI only, keine Logik-Änderung): kleine cyanfarbene Badge unter dem Picker, derzeit statischer Platzhalter „Empfohlen: 19:00“.
- Versteckter, accessible `<input type="time">` bleibt im DOM für Tastatur-/Screenreader-Eingabe.

Komponente: neue `TimeWheelInput.tsx` unter `src/components/calendar/`, eingesetzt im lockedDate-Zweig von `ScheduleQuickForm.tsx`. Bestehendes `time`-State bleibt unverändert (`"HH:MM"`) — nur die Eingabe-UI wird ausgetauscht. Keine Backend-, RLS- oder Edge-Function-Änderungen.

## Scope
- `src/components/calendar/views/WeekView.tsx` — 1-Zeilen-Fix Label.
- `src/components/calendar/views/MonthView.tsx` — falls dort dieselbe `addHours`-Logik existiert: gleicher Fix (prüfen).
- `src/components/calendar/TimeWheelInput.tsx` — neue Komponente.
- `src/components/calendar/ScheduleQuickForm.tsx` — Input gegen `TimeWheelInput` tauschen, nur im `lockedDate`-Zweig.