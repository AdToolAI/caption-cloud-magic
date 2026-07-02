## Warum die Meldung kam

Im Inspector steht Szene 2: **Quelle 17.1s → 21.6s (Länge 4.50s)**, Timeline **12.60 → 17.10**. Der Playhead stand bei **0:12.60** — das ist **exakt der Anfang von Szene 2**. Der Split-Button im Inspector rief `handleSplitAtPlayhead` auf, der zusätzlich zur Nicht-in-Szene-Prüfung noch einen 0.05s-Rand-Guard hat (`currentTime - scene.start_time < 0.05`). Ergebnis: „Zu nah am Szenenrand zum Teilen".

Die 4,5s aus dem Inspector-Feld (`Länge`) hatten mit dem Split nichts zu tun — der Button splittet immer nur an der aktuellen Playhead-Position, nicht am Inspector-Wert.

## Fix

**Datei: `src/components/directors-cut/studio/SceneTrimInspector.tsx`**

Der Button-Auswahl-Block (Zeilen 280-316) soll sich anders verhalten:

1. **Priorität umkehren**: Wenn der Playhead innerhalb der Szene ist und **nicht an einem Rand** (≥ 0.05s Abstand zu Start und Ende), zeige „Am Playhead teilen" — auch wenn Trim gesetzt ist. Der Playhead-Split ist der intuitive Default.

2. **Wenn Playhead am Rand oder außerhalb**, aber Trim ist gesetzt (`trimHead || trimTail`): zeige „An Trim teilen" (bleibt wie heute).

3. **Wenn beides nicht möglich**: Button disabled mit klarem Tooltip:  
   - Playhead exakt am Szenenanfang/-ende → Tooltip „Playhead an Szenengrenze — verschiebe ihn oder setze Start/Ende im Inspector, um zu teilen."

4. **Neue Aktion „Jump into Scene"**: Kleiner Sekundär-Button (oder Klick-Handler auf „Am Playhead teilen" wenn disabled) der den Playhead automatisch auf `scene.start_time + 0.1s` setzt, damit ein Split sofort möglich ist. Dafür braucht der Inspector einen neuen optionalen Prop `onSeek?: (t: number) => void`.

**Datei: `src/components/directors-cut/studio/CapCutEditor.tsx`**

- Neuen Prop `onSeek={setCurrentTime}` (bzw. der bestehende Seek-Handler, den der Preview-Player nutzt) an alle drei `SceneTrimInspector`-Instanzen (Zeilen 2273, 2406, 2459) durchreichen.

## Verifikation

- Szene 2 auswählen, Playhead bei 12.60 (Szenenanfang) → Button ist entweder disabled mit Erklärung oder klickt automatisch auf 12.70 und teilt dort.
- Playhead per Timeline auf 15.00 ziehen → „Am Playhead teilen" splittet Szene 2 in 12.60→15.00 und 15.00→17.10.
- Ohne Playhead-Bewegung: Start/Ende im Inspector auf z.B. 18.0 / 20.5 setzen → Button wechselt zu „An Trim teilen" und produziert Head/Middle/Tail wie schon implementiert.

## Nicht betroffen

- `handleSplitAtTrim` / `handleSplitAtPlayhead` bleiben unverändert.
- Kein Render-/Export-Pfad, keine Backend-Logik.
