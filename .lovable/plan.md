

## Plan: Enterprise-Credits nach rechts mit leuchtenden Linien

### Änderungen

1. **Enterprise-Bereich nach rechts ausrichten**
   - In `CreditBalance.tsx` Zeile 94: `flex items-center gap-4` → `flex items-center justify-end gap-4`
   - Dadurch rutscht der Infinity-Icon + Text-Block an den rechten Rand des Cards

2. **Komplette Umrandung entfernen, leuchtende Linien hinzufügen**
   - Card-Border `border border-white/10` entfernen oder auf `border-0` setzen
   - Zwei vertikale leuchtende Linien als Pseudo-Elemente oder separate Divs:
     - Links: `absolute left-0 top-4 bottom-4 w-px bg-gradient-to-b from-transparent via-primary/60 to-transparent`
     - Rechts: `absolute right-0 top-4 bottom-4 w-px bg-gradient-to-b from-transparent via-primary/60 to-transparent`
   - Optional: Glow-Effekt auf den Linien mit `shadow-[0_0_8px_hsla(43,90%,68%,0.5)]`

3. **Card-Padding anpassen**
   - Bei rechtsbündiger Ausrichtung ggf. `pr-6` beibehalten, aber `pl-6` reduzieren oder anpassen für Symmetrie

### Betroffene Datei
- `src/components/credits/CreditBalance.tsx`

### Ergebnis
- Enterprise-Plan-Anzeige (Infinity-Icon + "Unbegrenzte Credits") sitzt rechts im Card
- Keine sichtbare Box-Umrandung mehr, stattdessen zwei elegante, leuchtende vertikale Linien links und rechts
- Modernes, aufgeräumtes Erscheinungsbild im James-Bond-Design (Gold/Cyan-Glow)

