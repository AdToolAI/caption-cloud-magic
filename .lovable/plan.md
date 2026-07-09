## Ziel
Wenn im Briefing eindeutig 15 Sekunden steht, darf der Production Plan nicht mehr auf 30 Sekunden bleiben — auch dann nicht, wenn die Online-Analyse in den lokalen Fallback fällt.

## Diagnose
Der aktuelle Screenshot zeigt `Lokaler Fallback-Plan`. Genau dieser Pfad baut den Plan clientseitig in `useStoryboardTransition.ts` und nimmt aktuell weiterhin `briefing.duration` vom Board als Basis. Deshalb bleibt der Plan bei 30s, obwohl der Briefing-Text 15s enthält.

## Umsetzung

1. **Client-Fallback bekommt dieselbe Script-Wins-Logik**
   - In `src/hooks/useStoryboardTransition.ts` wird vor `buildLocalFallbackPlan` eine kleine Dauer-Erkennung aus dem Briefing-Text ergänzt.
   - Sie erkennt klare Angaben wie:
     - `Gesamtdauer: 15 Sekunden`
     - `15 Sekunden / 3 Szenen à 5s`
     - `3 Szenen à 5 Sekunden`
     - Zeitfenster wie `0–5s`, `5–10s`, `10–15s`

2. **Fallback-Plan nutzt kanonische Briefing-Dauer statt Board-Dauer**
   - Wenn eine klare Briefing-Dauer gefunden wird, setzt der lokale Fallback `project.totalDurationSec` auf diese Dauer.
   - Die Szenendauer wird daraus berechnet, z. B. `15s / 3 Szenen = 5s`.
   - Keine `per * sceneCount`-Rundung mehr, die wieder 30s erzeugen kann.

3. **Board-Toggle auch beim Fallback auto-synchronisieren**
   - Wenn der lokale Fallback 15s erkennt und das Board noch 30s hat, wird `onUpdateBriefing({ duration: 15 })` ausgelöst.
   - Dadurch verschiebt sich der Toggle sichtbar auf 15s und Plan/Board widersprechen sich nicht mehr.

4. **Optionaler Hinweis für den Nutzer**
   - Toast: `Dauer aus Briefing übernommen: 30s → 15s`.
   - Nur einmal pro Analyse, damit keine Toast-/Update-Loops entstehen.

5. **Bestehenden Server-Pfad beibehalten**
   - Die bereits ergänzte Server-Auto-Sync-Logik bleibt bestehen.
   - Neu ist nur: Der Offline-/Timeout-Fallback folgt exakt derselben Regel.

## Ergebnis
Bei unverändertem Briefing mit `15 Sekunden / 3 Szenen à 5s` zeigt auch der lokale Fallback:

```text
Gesamtdauer: 15s
Summe Szenen: 15s (3 Szenen)
S01: 5s
S02: 5s
S03: 5s
```

Der 30s-Widerspruch ist damit an beiden Pfaden geschlossen: Online-Analyse und lokaler Fallback.