# Fix-Bundle G (Final): Script-Wins & Fehlerbehebung Briefing-Analyse

Ziel: Alle 10 identifizierten Fehler beheben, indem die Root Cause (falsches Scene-Splitting) und die Downstream-Effekte konsequent gelöst werden. Leitprinzip: **Das Skript gewinnt.**

## 1. Server: `briefing-deep-parse` (Root Fix)

**G1 — `detectScriptTimingMode` Pre-Processor**
Neue Funktion, die vor Pass A läuft und den Skript-Typ klassifiziert:
- **Tier 1 (SHOT_MARKERS)**: Skript enthält explizite Marker (`S01`, `Shot 1`, `Szene 2`, `[0-3s]`, `Sprecher 1:` mit Zeitangaben). → Board-Dauer wird **ignoriert**, Scene-Count = Marker-Count.
- **Tier 2 (SPEAKER_BLOCKS)**: Nur Speaker-Labels (`Sprecher 1:`, `Sarah:`) ohne Zeiten. → Eine Szene pro Speaker-Wechsel, Gesamtdauer aus Board proportional aufgeteilt.
- **Tier 3 (FREETEXT)**: Kein strukturiertes Skript. → Board-Werte gewinnen (aktuelles Verhalten).

**G2 — Strict Split Enforcement**
- Pass A System Prompt erhält Klausel: „Bei `mode=SHOT_MARKERS` MUSST du exakt `N` Szenen erzeugen, eine pro Marker. Merging ist verboten."
- Post-Pass A Guard: Wenn `scenes.length !== detectedShots.length` bei Tier 1 → Re-Split auf Client-Seite via deterministischem Splitter (`splitByShotMarkers.ts`).

**G3 — Solo-Enforcement**
- Für jede Szene mit exakt einem Speaker-Label im Skript (`Sprecher 2:` → nur ein Block): `cast` auf diesen einen `characterId` beschränken. Alle anderen entfernen — überschreibt Ensemble-Guarantee für explizit solo geskriptete Shots.

**G4 — Voice Assignment Fix**
- Voice-Pool nur an Charaktere binden, die in `resolved_cast` der jeweiligen Szene sind. Sarah bekommt keine Voice-Slot in Speaker-2-Szenen.

**G5 — Repair-Count Sanitizing**
- `parser_meta.repairs` nur zählen, wenn ein tatsächlicher Wert geändert wurde (nicht bei No-Op-Passes). Behebt „12 repariert" bei 4-Zeilen-Skript.

## 2. Client: Anzeige & UX

**G6 — „Script Timing Used" Info-Chip**
- In `ProductionPlanSheet.tsx` Header: Wenn `parser_meta.timing_mode === 'SHOT_MARKERS'` und `board.totalDurationSec !== computed.totalDurationSec` → dezenter Info-Chip statt Warnung: „Skript-Timing verwendet (Board-Wert ignoriert)".

**G7 — Location Description Fallback verifizieren**
- Sicherstellen, dass die in vorherigem Fix eingeführte `description` bei Locations tatsächlich in `resolved_location.description` landet und in der UI + AI-Prompt gerendert wird.

**G8 — AI-Fill % Recompute**
- `computeAiFillPercent` neu berechnen: nur Felder zählen, die im Briefing/Skript wirklich fehlen. Wenn alle 4 Speaker + Skript + Dauer da sind, sollte % niedrig sein.

## 3. Neue Dateien / Änderungen

```text
supabase/functions/briefing-deep-parse/
  ├── detectScriptTimingMode.ts        (neu)
  ├── splitByShotMarkers.ts            (neu, deterministisch)
  ├── enforceSoloCast.ts               (neu)
  └── index.ts                         (integrate G1–G5)

src/features/briefing/
  ├── hooks/useApplyProductionPlan.ts  (G4 voice binding, G7 location desc)
  ├── components/ProductionPlanSheet.tsx (G6 chip, G8 fill %)
  └── utils/repairsCounter.ts          (neu, G5)
```

## 4. Verifikation

Testfall: Das vom User gepostete 15s-Briefing mit 4 Sprechern.
Erwartetes Ergebnis nach Fix:
- 6 Szenen (nicht 2)
- S01–S06 jeweils solo mit dem korrekten Sprecher
- Voice: nur der jeweilige Sprecher hat einen Voice-Slot
- Info-Chip „Skript-Timing" statt Warnung
- Repair-Count realistisch (0–3)
- AI-Fill % niedrig (~10–20 %)

## Nicht enthalten (bewusst)
- Debug-Chips (T-1) — separater Wunsch, kann später
- Plan Versioning (P-1) — separater Wunsch

Nach Approval implementiere ich G1–G8 in einem Zug und teste gegen das gepostete Briefing.
