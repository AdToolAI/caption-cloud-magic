## Day Cockpit Modal

Schnell-Planung + Warteschlange werden in EIN großes Modal vereint, das beim Klick auf einen Kalendertag öffnet. Datum ist gelockt — nur Uhrzeit wählbar. Design im Bond-2028-Stil, 3 KI-generierte Varianten zur Auswahl.

### Was passiert
- Klick auf Tag (z.B. `26`) → Modal "Day Cockpit" öffnet sich
- Links: Schnell-Planung (Titel, Caption, AI, Upload, **nur Uhrzeit-Picker**, Plattformen)
- Rechts: Warteschlange (nur Posts dieses Tages, sortiert nach Uhrzeit)
- Alte Inline-Panels unter dem Kalender verschwinden

### Design-Prozess
1. Ich generiere **3 Mood-Variants** mit Nano Banana 2 / Gemini 3 Pro Image:
   - **A "Mission Briefing"** — goldene Datums-Plakette, Dossier-Sektoren, Cyan-Scanlinien
   - **B "Holographic Cockpit"** — 3D-Tilt-Glasplatten, Gold-Partikel, schwebend
   - **C "Editorial Noir"** — riesiges Playfair-Datum, Magazine-Layout, viel Whitespace
2. Du wählst eine Variante via Bild-Picker
3. Ich baue exakt diese Variante in Tailwind + Framer Motion

### Technik (kurz)
- Neu: `src/components/calendar/DayCockpitDialog.tsx` (Radix Dialog, 2-Spalten-Grid)
- Refactor `ScheduleQuickForm.tsx`: Prop `lockedDate?: Date` → versteckt Datum-Input, zeigt nur `<TimePicker>`
- Refactor Kalender-Grid: `onClick` pro Tageszelle öffnet Modal mit `selectedDate`
- Warteschlange via `useCalendarEvents` mit `from`/`to` auf den Tag gefiltert
- Lokalisierung DE/EN/ES
- Keine DB-/Edge-Function-/Publish-Logik-Änderungen

### Offene Frage
Soll das Modal beim Öffnen **direkt die Form zeigen** (häufigster Fall: neuer Post), oder **erst die Warteschlange** und Form via "+ Neuer Post"-Button? Ich tendiere zu Form direkt sichtbar (links), Warteschlange immer rechts daneben — beides parallel ohne Klick.
