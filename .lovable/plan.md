

## Performance-Überblick: Echte Daten statt Hardcoded Values

### Problem
Die 3 MetricCards im Home-Dashboard (Zeile 306-326) zeigen feste Fake-Werte (45.2K, 5.8%, 18) statt echter Daten aus der Datenbank. Das widerspricht den realen Werten im Analytics Dashboard.

### Loesung
Daten aus denselben Tabellen laden die auch das Analytics Dashboard nutzt. Wenn keine Daten vorhanden: `0` anzeigen.

### Aenderungen in `src/pages/Home.tsx`

**Neuer State + useEffect** fuer Performance-KPIs:

| KPI | Datenquelle | Query |
|---|---|---|
| **Reichweite (7 Tage)** | `post_metrics` | Summe `reach` der letzten 7 Tage, user_id Filter |
| **Engagement-Rate** | `post_metrics` | Durchschnitt `engagement_rate`, user_id Filter |
| **Veroeffentlichte Posts** | `post_metrics` | Count wo `posted_at >= Monatsanfang`, user_id Filter |

**Trend-Berechnung:**
- Reichweite: Vergleich letzte 7 Tage vs. 7 Tage davor → Prozent-Differenz
- Engagement: Vergleich letzte 30 Tage vs. 30 Tage davor
- Posts: Vergleich dieser Monat vs. letzter Monat

**Formatierung:**
- Reichweite >= 1000 → "1.2K" Format, sonst Zahl direkt
- Engagement → eine Dezimalstelle + "%"
- Posts → ganzzahlig
- Keine Daten → `0` bzw. `0%`, Trend `{ value: 0, isPositive: true }`

Nur `Home.tsx` wird geaendert — die hardcoded Werte werden durch dynamischen State ersetzt.

