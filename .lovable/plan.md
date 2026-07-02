## Problem

Im Inspector (rechte Spalte, "SZENE"-Panel) zeigen die Number-Inputs für **Start**, **Ende** und **Länge** die nativen Browser-Spinner-Buttons an — das sieht aus wie eine kleine weiße Scrollbar innerhalb jedes Feldes und wirkt unprofessionell. Wir haben ohnehin die dedizierten `−` / `+` Buttons daneben, die Spinner sind also doppelt gemoppelt und stören nur optisch.

## Fix

Native Spin-Buttons an allen Number-Inputs im Inspector ausblenden:

- `src/components/directors-cut/studio/SceneTrimInspector.tsx` — zwei `<input type="number">` (Start, Ende) bekommen Tailwind-Klassen zum Verstecken der Spinner.
- `src/components/directors-cut/studio/CapCutPropertiesPanel.tsx` — sechs `<input type="number">` (Trim-Start/Ende, Clip-Properties) analog behandeln.

Konkret pro Input diese Klassen ergänzen:

```
[appearance:textfield]
[&::-webkit-outer-spin-button]:appearance-none
[&::-webkit-outer-spin-button]:m-0
[&::-webkit-inner-spin-button]:appearance-none
[&::-webkit-inner-spin-button]:m-0
```

Das entfernt sowohl Chromium/Safari-Spinner als auch Firefox-Spinner. Funktionalität bleibt identisch — Werte lassen sich weiter tippen, und die vorhandenen `−`/`+`-Buttons übernehmen das Inkrementieren.

## Scope

Rein visueller Fix, keine Logik-Änderungen, keine neuen Dateien. Kein Backend-Impact.