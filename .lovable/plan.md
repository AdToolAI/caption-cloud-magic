

## Plan: Zeitangaben auf 2 Dezimalstellen für präziseres Schneiden

### Änderung

**Datei: `src/components/directors-cut/studio/sidebar/CutPanel.tsx`**

An 4 Stellen `.toFixed(1)` durch `.toFixed(2)` ersetzen und `step` von `0.1` auf `0.01` ändern:

1. **Zeile 183** — Dauer-Anzeige: `(6.0s)` → `(6.00s)`
2. **Zeile 220** — Start-Input `step={0.1}` → `step={0.01}`
3. **Zeile 222** — Start-Input `toFixed(1)` → `toFixed(2)`
4. **Zeile 232** — End-Input `step={0.1}` → `step={0.01}`
5. **Zeile 234** — End-Input `toFixed(1)` → `toFixed(2)`

Auch die `formatTime`-Funktion (Zeile 25-28) erweitern, damit Sekunden mit 2 Dezimalstellen angezeigt werden: `0:06` → `0:06.34`

### Ergebnis
Start- und End-Zeiten zeigen Hundertstelsekunden, Input-Schritte sind 0.01s — deutlich präziseres Schneiden möglich.

