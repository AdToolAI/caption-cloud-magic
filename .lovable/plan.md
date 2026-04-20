

# Plan: Letzte Karteileiche aufräumen + „Letzter Run gesamt" entwarnen

## Was die Daten zeigen

Letzter Komplett-Test (vor < 1 Min): **10/10 grün, alle HTTP 200**. Latenzen sind alle im normalen Bereich für KI-Calls.

Zwei kleine kosmetische Probleme bleiben:

### 1. Comments Analysis zeigt 50 % obwohl letzter Run grün ist
Im aktuellen 5-Run-Window für Comments Analysis liegen nur 2 Runs (1 alter Fail vor dem Fix + 1 neuer Pass) → 1/2 = 50 %. Sobald der nächste Komplett-Test läuft, wird's 2/3 = 67 % und dann nach weiteren Runs 100 %. Du kannst aber sofort auf 100 % bringen, indem du einmalig **„Komplett zurücksetzen"** drückst (dann bleibt nur der letzte grüne Run pro Szenario).

### 2. „Letzter Run (gesamt)" zeigt 28.3s **rot** — obwohl das ein normaler Wert ist
Die Card summiert alle 10 Latenzen → 28.3s. Der Farbcode wendet aber den Einzel-Schwellenwert (>8s = rot) an, der für die Summe natürlich immer rot sein wird. Das ist kein echtes Latenz-Problem.

## Fixes

### Fix 1 — Eigene Schwellenwerte für „Letzter Run gesamt"
In `src/pages/admin/AISuperuserAdmin.tsx` für die Summen-Card eigene Grenzen setzen:
- **< 30s** → grün (alles normal)
- **30–60s** → gelb (Beobachten)
- **> 60s** → rot (echtes Problem, z.B. Trend Radar mit 80s)

Bei 28.3s = grün, also direkt sichtbar dass das System gesund läuft. Bonus: kleine Hilfe drunter „Summe aller 10 Szenario-Latenzen — < 30s ist normal".

### Fix 2 — Latenz-Spalten-Schwellenwerte realistischer
Aktuell wird **3000ms** schon orange (Caption 4917ms, Posting 3109ms). Das ist noch im Normal-Bereich für Multi-Step KI-Calls. Anpassen:
- **< 5000ms** → neutral grau
- **5000–10000ms** → orange (KI-typisch, Bilder/Multi-Step)
- **> 10000ms** → rot (genauer hinschauen)

Damit zeigt nur noch Image Generation (7463ms) orange — was korrekt ist, weil das wirklich der einzige Hot-Spot ist.

### Fix 3 — Hinweis-Banner für Comments Analysis 50 %
Statt der User raten zu lassen warum 50 % bei grünem Run: Wenn `last_status === 'pass'` aber `passRate < 100`, kleinen Tooltip an die Pass-Rate-Badge:
> *„Letzter Run grün — historische Fail-Runs noch im 5-Run-Window. Klicke „Komplett zurücksetzen" für 100 %."*

## Reihenfolge

1. `AISuperuserAdmin.tsx`: 
   - Neue `totalLatencyClass()`-Funktion mit 30s/60s-Schwellen für Summen-Card
   - Latenz-Spalten-Schwellen auf 5s/10s anheben
   - Tooltip an Pass-Rate-Badge wenn letzter Run grün aber Rate < 100
2. Du drückst **„Komplett zurücksetzen"** → Comments Analysis springt sofort auf 100 %

## Erwartetes Ergebnis

- ✅ „Letzter Run (gesamt)" zeigt 28.3s **grün** statt rot
- ✅ Latenz-Spalte: nur noch Image Generation orange (statt 4 Szenarien)
- ✅ Comments Analysis erklärt sich selbst per Tooltip
- ✅ Nach „Komplett zurücksetzen" → 10/10 mit 100 % überall

