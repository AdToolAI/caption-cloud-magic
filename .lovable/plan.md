

## Plan: Komplette Status-Bar-Zeile auf halbe Höhe reduzieren

### Diagnose
Die Status-Bar auf `/` (Home.tsx) enthält nebeneinander: **CreditBalance**, **NotificationBell**, **WeatherWidget** etc. — alle ~230px hoch. Ziel: gesamte Zeile auf ~115px halbieren.

### Vorgehen
Ich muss zuerst sehen, welche Komponenten in der Zeile sind und wie sie strukturiert sind, um die Höhen einheitlich zu reduzieren.

### Geplante Änderungen

**1. `src/pages/Home.tsx` (Status-Bar-Container)**
- Falls `min-h-*` oder feste Höhe gesetzt ist → halbieren
- Grid-Gap ggf. von `gap-6` → `gap-3`

**2. `src/components/credits/CreditBalance.tsx`**
- `CardHeader`/`CardContent` Padding: `p-6` → `p-3`
- Enterprise-Block: `InfinityIcon` `h-16 w-16` → `h-7 w-7`
- Header + Infinity-Block in **eine Zeile** legen
- Plan-Badge inline neben Title (nicht `mt-2`)
- Free/Basic/Pro: Schrift `text-5xl` → `text-3xl`, Progress-Bar `h-3` → `h-2`

**3. Alle anderen Karten in der Zeile (NotificationBell, WeatherWidget, etc.)**
- Padding und Innenabstände parallel reduzieren, damit alle Karten dieselbe (halbierte) Höhe haben
- Icons/Fonts proportional verkleinern

### Was NICHT geändert wird
- Inhalte, Daten, Glow/Border/Animationen, James-Bond-2028-Styling
- Keine Logik

### Risiko
Niedrig. Reine CSS/Layout-Anpassung über mehrere Karten in einer Zeile.

