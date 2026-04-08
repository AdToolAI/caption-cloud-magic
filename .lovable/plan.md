

## Plan: Black Screen bei Lücken zwischen Szenen (> 0.2s)

### Problem

Wenn auf der Timeline eine Lücke zwischen zwei Szenen existiert (z.B. Szene 1 endet bei 5s, Szene 2 beginnt bei 7s), spielt das Video einfach weiter statt einen Black Screen zu zeigen. Erst ab einer Lücke > 0.2s soll ein schwarzer Bildschirm erscheinen.

### Lösung

**Datei: `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`**

1. **Gap-Erkennung im RAF-Loop** (Zeile ~596-706): Wenn `findSceneBySourceTime` keine Szene findet ODER die aktuelle `timelineTime` zwischen zwei Szenen liegt mit einer Lücke > 0.2s:
   - Video pausieren (oder stumm weiterlaufen lassen)
   - Beide Video-Slots auf `opacity: 0` setzen → schwarzer Hintergrund (`bg-black` am Container) wird sichtbar
   - Timeline-Zeit weiter hochzählen, bis die nächste Szene erreicht wird → dann Video zur Source-Position der nächsten Szene seeken und Opacity wiederherstellen

2. **Gap-Detection-Logik**: Im Tick prüfen:
   ```
   für jede Szene i: wenn scenes[i].end_time + 0.2 < scenes[i+1].start_time
   → Lücke zwischen end_time und start_time
   ```
   Wenn `timelineTime` in so einer Lücke liegt → Black Screen aktivieren

3. **Black Screen State**: Per Ref (`inGapRef`) tracken ob wir gerade in einer Lücke sind. Wenn ja:
   - Aktives Video: `style.opacity = '0'`
   - Canvas: `display: none`
   - Video bleibt paused, Timeline-Zeit wird manuell weitergetrieben
   - Beim Verlassen der Lücke: Seek zur nächsten Szene, opacity zurück auf 1, play fortsetzen

### Dateien

| Aktion | Datei | Änderung |
|--------|-------|----------|
| Edit | `DirectorsCutPreviewPlayer.tsx` | Gap-Detection im RAF-Loop + Video-Opacity-Steuerung für Black Screen |

### Ergebnis

- Lücken > 0.2s zwischen Szenen zeigen einen sauberen Black Screen
- Kleinere Lücken (≤ 0.2s) werden ignoriert (nahtloser Übergang)
- Timeline läuft während der Lücke weiter, Video wird erst bei der nächsten Szene fortgesetzt

