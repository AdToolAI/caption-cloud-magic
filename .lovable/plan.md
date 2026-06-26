## Ziel
Hailuo bleibt strikt bei 6 Sekunden, wenn du 6s auswählst. Weder Script-/Audio-Analyse, Dialog-Studio, Datenbank-Sync noch Render-Start dürfen daraus automatisch 10s machen.

## Wichtigste Fundstelle
Es gibt noch eine Frontend-Stelle in `SceneDialogStudio.tsx`, die nach der Dialog-/Audio-Planung die Szenendauer automatisch auf die benötigte Audio-Länge setzt:

```text
if (totalNeeded > scene.durationSeconds) {
  onUpdate({ durationSeconds: totalNeeded })
}
```

Diese Logik ist provider-blind. Bei Hailuo kann dadurch aus einer bewusst gewählten 6s-Szene wieder eine längere Dauer werden. Später wird diese längere Dauer in Hailuo-Pfade als 10s interpretiert.

## Umsetzung
1. **Frontend-Auto-Bump für Hailuo abschalten**
   - In `SceneDialogStudio.tsx` darf die Audio-/Script-Planung `durationSeconds` nicht mehr erhöhen, wenn `clipSource === 'ai-hailuo'`.
   - Für Hailuo gilt dann:
     - `scene.durationSeconds === 10` bleibt 10
     - alles andere bleibt 6
   - Wenn Audio länger ist, nur Warnung anzeigen: „Audio wird am Ende gekürzt; für volle Länge bewusst 10s oder HappyHorse wählen.“

2. **Backend-Audio-Prep absichern**
   - In `compose-twoshot-audio` wird `clip_source` mitgelesen.
   - Wenn die Szene Hailuo ist, darf `duration_seconds` nicht mehr wegen Audio-Overflow überschrieben werden.
   - HappyHorse darf weiterhin flexibel verlängern, weil es 3–15s unterstützt.

3. **Render-Dispatch hart machen**
   - In `compose-video-clips` bleibt die bestehende Hailuo-Regel erhalten: nur exakt 10 wird als 10 gesendet, sonst 6.
   - Die Kommentare/Warnungen werden so angepasst, dass klar ist: Audio-Länge ist nie Grund für Hailuo-10s.

4. **Legacy/direct Hailuo Function korrigieren**
   - In `generate-hailuo-video` wird `rawDuration >= 8 ? 10 : 6` durch eine strikte Regel ersetzt:
     - nur `rawDuration === 10` ergibt 10
     - sonst 6
   - Damit wird auch außerhalb des Composers kein 8/9s-Zwischenwert mehr automatisch zu 10s.

5. **UI-Reset beim 6s-Klick**
   - Der 6s-Button setzt zusätzlich alte Render-/Fehlerfelder zurück, damit kein alter „10s bei 1080p“-Fehler nach der Korrektur sichtbar bleibt.

## Ergebnis
Nach dem Fix ist 10s bei Hailuo ausschließlich möglich, wenn du explizit den 10s-Button auswählst. Eine 5s-Audio oder 6s-Szene kann Hailuo nicht mehr automatisch hochstufen.