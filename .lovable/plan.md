

## Plan: Volume-Wert auf gültigen Bereich [0, 1] begrenzen

### Ursache
Der Fehler `Failed to set the 'volume' property on 'HTMLMediaElement': The volume provided (1.03) is outside the range [0, 1]` tritt auf, weil in `TimelineVideoPreview.tsx` der berechnete Volume-Wert direkt auf `audio.volume` gesetzt wird — ohne Clamping. Im Gegensatz dazu macht `CapCutEditor.tsx` bereits `Math.min(1, Math.max(0, effectiveVolume))`.

Wenn `masterVolume`, `trackVolume` oder `clip.volume` auch nur leicht über 100 liegen (z.B. 103), ergibt die Berechnung einen Wert > 1, was der Browser ablehnt.

### Fix
- **`src/components/directors-cut/timeline/TimelineVideoPreview.tsx`** Zeile 50:
  `audio.volume = effectiveVolume;` → `audio.volume = Math.min(1, Math.max(0, effectiveVolume));`

Ein einzeiliger Fix.

