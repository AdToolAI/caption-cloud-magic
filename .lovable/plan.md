## Plan: Übergänge nicht mehr zu früh abspielen

### Ziel
Der Übergang soll nicht schon sichtbar in der vorherigen Szene ablaufen und danach erst die nächste Szene zeigen. Wenn du 3 Sekunden einstellst, muss der Übergang sichtbar 3 Sekunden lang an der Szenengrenze wirken.

### Umsetzung
1. **Transition-Timing korrigieren**
   - Die aktuelle Logik zentriert den Übergang um die Szenengrenze: `-1.5s | Cut | +1.5s` bei 3s Dauer.
   - Ich ändere das Standardverhalten auf ein NLE-verständlicheres Modell:

```text
Vorher aktuell:
Szene 1 läuft → Übergang startet zu früh → Cut → Übergang läuft weiter

Neu:
Szene 1 läuft normal bis Ende → Übergang beginnt an der Schnittkante → Szene 2 wird während des Übergangs eingeblendet
```

2. **Resolver als Single Source of Truth reparieren**
   - `transitionResolver.ts` wird angepasst, damit `duration`, `offsetSeconds` und das vorhandene `anchorTime` wirklich berücksichtigt werden.
   - Standard: Übergangsfenster startet an `scene.end_time + offsetSeconds` und endet nach `duration`.
   - Dadurch wirkt der Dauer-Regler wirklich sichtbar auf den Zeitpunkt und die Länge.

3. **Preview-Renderer an neues Timing anpassen**
   - `useTransitionRenderer.ts` wird so angepasst, dass die ausgehende Szene am Übergang nicht einfach „weiterläuft“ und dadurch zu früh wirkt.
   - Während des Übergangs wird die ausgehende Szene sauber gehalten/geblendet, während die nächste Szene am Anfang startet.
   - Handoff zur nächsten Szene passiert erst am Ende des Übergangs.

4. **Playback-Advance nicht gegen Transition arbeiten lassen**
   - `DirectorsCutPreviewPlayer.tsx` wird geprüft/angepasst, damit die Boundary-Logik nicht vorzeitig zur nächsten Szene springt oder den Übergang überspringt.
   - Ziel: Playhead, Preview und Szene-Auswahl bleiben synchron.

5. **Timeline-Markierung optional korrigieren**
   - Falls die visuelle Transition-Markierung aktuell noch zentriert oder irreführend angezeigt wird, wird sie auf das neue echte Fenster gesetzt:

```text
Schnittkante |========= Übergang =========| nächste Szene sichtbar
```

### Akzeptanzkriterien
- Bei 3.0s Dauer ist der Übergang deutlich 3 Sekunden lang sichtbar.
- Der Übergang startet nicht mehr mitten im Ende der vorherigen Szene.
- Szene 2 erscheint während des Übergangs, nicht erst nachdem der Übergang optisch vorbei ist.
- Dauer-Regler und +/- Eingabe ändern das sichtbare Timing sofort.
- Kein schwarzer Frame oder Sprung an der Szenengrenze.