
Ziel: Die Übergänge wieder sichtbar machen und den verbleibenden Stotterer beseitigen, ohne den Renderer erneut in einen unsichtbaren Zustand zu bringen.

Do I know what the issue is? Ja.

Problem:
Der letzte Handoff-Fix ist jetzt zu streng. In `useTransitionRenderer.ts` bleibt der Renderer im `handoff`, bis `seeked + readyState >= 2 + timeDiff < 0.05` gleichzeitig erfüllt sind. Da das Incoming-Video währenddessen weiterläuft, driftet `incoming.currentTime` weiter. Dadurch kann `timeDiff < 0.05` leicht nie eintreten. Ergebnis:
- der Renderer bleibt im `handoff` hängen
- das Incoming-Layer bleibt logisch im Übergabezustand
- neue Transitions werden nicht mehr sauber gestartet
- für den Nutzer wirken die Übergänge “weg”, obwohl die Timeline sie zeigt

Zusätzlich ist der Stotterer sehr wahrscheinlich jetzt nicht mehr der ursprüngliche Transition-Seek, sondern der nachgelagerte Boundary-Advance im Player, der nach dem Handoff trotzdem noch sichtbar wird.

Betroffene Dateien:
- `src/components/directors-cut/preview/useTransitionRenderer.ts`
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`

Umsetzung:
1. Handoff in `useTransitionRenderer.ts` deterministisch machen
- Beim Eintritt in `handoff` eine feste `handoffTargetTimeRef` speichern = Snapshot von `incoming.currentTime`
- Base genau einmal auf diesen festen Zielwert seeken
- Abschlussbedingung gegen den Snapshot prüfen, nicht gegen das weiterlaufende `incoming.currentTime`
- Während `handoff` neue aktive Transition sofort höher priorisieren als das alte Handoff, damit der Renderer nie “festhängt”

2. Stuck-Handoff absichern
- kleinen Fallback einbauen, z. B. Timeout/Fame-Limit für `handoff`
- wenn Base nach kurzer Zeit nicht sauber ready wird, Handoff kontrolliert beenden statt unendlich sichtbar/inkonsistent zu bleiben
- alle Handoff-Refs bei Seek/Reset vollständig zurücksetzen

3. Boundary-Advance gezielt unterdrücken
- In `DirectorsCutPreviewPlayer.tsx` nicht nur globalen Cooldown verwenden
- nach erfolgreichem Handoff die gerade verarbeitete Szenengrenze explizit als “schon übernommen” markieren
- den Boundary-Seek für genau diese Grenze überspringen, damit nach dem Übergang kein zusätzlicher Sprung mehr feuert

4. Prioritätsordnung im Renderer bereinigen
- Reihenfolge im RAF-Loop so anpassen:
  - neue aktive Transition
  - freeze/preparing
  - handoff
  - idle
- dadurch kann ein altes Handoff niemals eine neue Transition maskieren

5. Reset-/Seek-Pfade angleichen
- `handleSeek` und `handleReset` so erweitern, dass auch Handoff-spezifische Marker sicher gelöscht werden
- Incoming/Base-Stile wieder auf neutral setzen, damit kein unsichtbarer Restzustand bleibt

Warum ich diesen Plan wähle:
- Er erklärt beide Symptome gleichzeitig:
  - Übergänge weg = Renderer hängt im Handoff
  - Stotterer bleibt = Boundary-Advance läuft nach dem Handoff noch sichtbar
- Er ist kleiner und robuster als noch mehr `readyState`-/`seeked`-Komplexität

Erwartetes Ergebnis:
- Übergänge werden wieder zuverlässig sichtbar
- kein dauerhaft festhängender `handoff` mehr
- der Mini-Stotterer direkt nach dem Übergang wird beseitigt oder stark reduziert
- Scrubbing/Reset bleiben stabil

Technische Kurznotiz:
```text
Aktuell:
handoff compares base.currentTime to live incoming.currentTime
incoming keeps moving
=> handoff may never resolve

Nach Fix:
handoff compares base.currentTime to frozen target snapshot
boundary for that transition is marked as already consumed
=> transition returns visibly
=> no extra post-transition seek
```
