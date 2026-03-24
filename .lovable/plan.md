

## Footer und Navigation auf Legal-Seiten fixen

### Problem
1. Die Legal-Seiten nutzen den alten `Footer` (englisch, anderes Layout) statt den `BlackTieFooter` der Startseite
2. Den Legal-Seiten fehlt ein Header/Navigation - man kann nicht zurueck navigieren

### Loesung

**Datei: `src/pages/Legal.tsx`**
- `Footer` Import durch `BlackTieFooter` ersetzen
- Einen einfachen Header mit Logo und Zurueck-Link zur Startseite hinzufuegen (oder den bestehenden `Header` einbinden)
- Alle 4 Render-Bloecke (privacy, terms, avv, imprint) aktualisieren

**Optional: `src/components/Footer.tsx`**
- Pruefen ob dieser Footer noch irgendwo anders verwendet wird; falls nicht, kann er spaeter entfernt werden

### Ergebnis
- Einheitlicher Footer auf allen Seiten (deutsch, gleiches Design)
- Navigation zurueck zur Startseite verfuegbar

