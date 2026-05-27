## Problem

Im Universal Content Creator zwingt der Subtitle-Schritt (Schritt 5 in der UI, `case 4` im Code) Nutzer dazu, Untertitel zu generieren, sobald ein Voiceover hochgeladen wurde. Der "Weiter"-Button bleibt deaktiviert bis Segmente existieren.

## Fix

In `src/pages/UniversalCreator/UniversalCreator.tsx` die `canProceed()`-Logik für `case 4` so ändern, dass der Schritt immer übersprungen werden kann — Untertitel bleiben optional, egal ob ein Voiceover gesetzt ist oder nicht.

```ts
case 4: return true; // Untertitel sind optional
```

Die bestehende "Continue without subtitles"-Aktion im `SubtitleTimingStep` und das Anzeigen der Segment-Anzahl im Footer bleiben unverändert. Der Export-Schritt rendert das Video bereits korrekt ohne Subtitle-Segmente.

## Scope

- 1 Datei, 2 Zeilen Änderung
- Keine UI-, Backend- oder Render-Pipeline-Änderungen nötig