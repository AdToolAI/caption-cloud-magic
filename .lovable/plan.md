
# Root Cause (bestätigt)

Die Pipeline ist verdrahtet, aber `stripDialogForAnchor` in `supabase/functions/compose-video-clips/index.ts` (Z. 675-698) läuft **vor** `compose-scene-anchor` und entfernt genau die Bulletzeilen, die die Aktionen tragen.

Der Client komponiert:
```
[CastActions]
- Samuel Dusatko: is talking on the phone in the foreground, gesturing freely
- Matthew Dusatko: is typing on the laptop, is listening
- Sarah Dusatko: is standing at the printer in the background, is flipping pages
- Kailee: he's leaning against the window pane, a coffee cup in his hand
[/CastActions]
<Rest des Prompts>
```

Regex Z. 684 matcht `^\s*[-*•]\s*Name\s*:\s.*$` global → alle vier Bullets weg. `[CastActions]` und `[/CastActions]` bleiben leer stehen. Server-Extraktor in `compose-scene-anchor` (Z. 133-153) findet keinen Content → `castActions = []` → `CAST_ACTIONS_CLAUSE` leer → `ASYM_RE` false → equal-share TWO_SHOT_FRAMING greift → Line-Up.

Dasselbe passiert bei Z. 689 (`^Name: ...` ohne Bullet). Und `stripExtraHumansForAnchor` (Z. 710+) könnte Actions wie "at the printer in the background" partiell entstellen.

## Fix — Marker-Block-Guard vor den Strippern

**Eine Datei, ~15 Zeilen:** `supabase/functions/compose-video-clips/index.ts`

Ein neuer Helper wickelt beide Stripper so ein, dass `[CastActions]…[/CastActions]` und `[SceneAction]…[/SceneAction]` vor dem Strippen ausgeschnitten, durch Platzhalter (`§§CASTACTIONS_0§§`) ersetzt, und nach dem Strippen unverändert re-injiziert werden:

```ts
const MARKER_BLOCKS = [
  /\[CastActions\][\s\S]*?\[\/CastActions\]/g,
  /\[SceneAction\][\s\S]*?\[\/SceneAction\]/g,
];

function preserveMarkers<T extends (s: string) => string>(fn: T) {
  return (raw: string): string => {
    if (!raw) return "";
    const saved: string[] = [];
    let masked = raw;
    for (const re of MARKER_BLOCKS) {
      masked = masked.replace(re, (m) => {
        const idx = saved.push(m) - 1;
        return `§§MARKER_${idx}§§`;
      });
    }
    let out = fn(masked);
    out = out.replace(/§§MARKER_(\d+)§§/g, (_, i) => saved[Number(i)] ?? "");
    return out;
  };
}
```

Dann beide Stripper wrappen — Signaturen und Aufrufsites bleiben identisch:
```ts
const stripDialogForAnchor = preserveMarkers((raw: string) => { /* bestehende Regex-Kette */ });
const stripExtraHumansForAnchor = preserveMarkers((raw: string) => { /* bestehende Kette */ });
```

Alle drei Aufrufsites (Z. 964, 2090-2091, 2581) bleiben unverändert.

## Warum das minimal-invasiv ist

- Keine Änderung an `compose-scene-anchor`, keine Änderung am Client, keine Änderung am `applyActionsToPrompt`-Format.
- Kein neuer Cache-Bust nötig: sobald der `[CastActions]`-Block den Anchor erreicht, ändert sich der Anchor-Prompt (und damit die interne Signatur des Anchor-Cache in `compose-scene-anchor` inkl. `castActions`-Signature + `asym`-Flag, siehe v14/v16-Memo). Neue Runs kompilieren korrekt.
- `stripDialogForAnchor` behält seine Aufgabe (Dialog-Bullets aus Freitext killen); die schützenswerten Marker-Blöcke sind explizit signiert und werden nicht mit "zufälligen" Dialog-Bullets verwechselt.

## Test / Akzeptanz

Nach Deploy von `compose-video-clips`:
1. Szene mit 4 Charakteren + befüllten Action-Feldern rendern (dein aktueller Fall).
2. In den Edge-Function-Logs von `compose-scene-anchor` erscheint `castActions=4` und `hasAsymmetricCast=true` (Keywords: foreground / typing / printer in the background / leaning / window).
3. Anchor-Bild zeigt asymmetrische Bühne: einer telefoniert vorn, einer tippt, einer am Drucker hinten, einer am Fenster — statt Line-Up.
4. Log-Signature enthält `asym=1` und ein neuer Cache-Eintrag wird erzeugt.

## Nicht enthalten (bewusst)

- UI-Änderungen (Placeholder-Rotation, Preset-Chips): nicht nötig, sobald der Server die Actions endlich sieht.
- Kein `ANCHOR_AUDIT_VERSION` Bump — die Prompt-Logik in `compose-scene-anchor` bleibt gleich; nur der Input wird sauber.
- Kein Refund alter Line-Up-Renders vorgeschrieben — auf Wunsch ergänzbar.

## Aufwand

Eine Datei, ~15 Zeilen Helper + 2 Wrapper. Ein Deploy von `compose-video-clips`. Keine DB-Migration.
