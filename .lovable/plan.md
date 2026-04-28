## Problem

Im Export-Tab des Video Composers gibt es zwei Probleme im Screenshot:

1. **„Kosten werden berechnet …" lädt endlos** — die Skeleton-Box im `CostEstimationPanel` bleibt dauerhaft sichtbar, weil die Edge Function `estimate-render-cost` (oder das Wallet) während eines aktiven Renders nicht antwortet bzw. fehlschlägt. Der Panel hängt im Loading/Errored-Zustand fest und blendet sich auch nicht aus, sobald der Render läuft.
2. **Render-Button zeigt `{89}%` statt `89%`** — der deutsche/spanische Translation-Key `renderingPercent` ist als `"Video wird gerendert … {{percent}}%"` formatiert (Mustache-Doppelklammern), aber unser `useTranslation`-Hook ersetzt nur einfache Klammern `{percent}`. Dadurch bleibt das Platzhalter-Literal sichtbar.
3. **Renderkosten sollen wegfallen** — du verdienst bereits an den AI-Clips, also sollen €0,10 Render-Pauschale + komplettes Cost-Estimation-Panel (Remotion vs. Shotstack Vergleich, Wallet-Warnungen) raus.

## Lösung

### 1. Renderkosten komplett entfernen

**`src/components/video-composer/AssemblyTab.tsx`**
- `renderCost = 0.10` → `0`, Zeile mit „Rendering €0.10" aus der Kostenübersicht entfernen.
- Den gesamten `<CostEstimationPanel />`-Block (Zeile 640–647) entfernen, plus Import (Zeile 14) und ungenutzte Props.
- Render-Button-Label bleibt `Video rendern (€{totalCost})`, jetzt ohne Render-Aufschlag.

**`src/components/video-composer/CostEstimationPanel.tsx`**
- Datei kann gelöscht werden (wird nur in `AssemblyTab.tsx` importiert).

### 2. Render-Button-Platzhalter `{89}%` fixen

**`src/lib/translations.ts`** — drei Sprachen (EN/DE/ES) auf einfache Klammern umstellen, damit unser eigener Interpolator greift:
```ts
renderingPercent: "Video wird gerendert … {percent}%"   // DE
renderingPercent: "Rendering video… {percent}%"         // EN
renderingPercent: "Renderizando video… {percent}%"      // ES
```
(Der Fallback in `AssemblyTab` unterstützt bereits beide Formate, daher reicht das Translation-Update.)

### 3. Kommunikation in der Cost-Summary

In der „Kostenübersicht"-Card (Zeile 478–511) wird der Render-Eintrag entfernt. Die Summe besteht dann nur noch aus Clips + (optional) Voiceover. Hintergrundmusik bleibt €0,00.

## Geänderte Dateien

- `src/components/video-composer/AssemblyTab.tsx` — Render-Kosten und Cost-Estimation-Panel entfernen
- `src/components/video-composer/CostEstimationPanel.tsx` — Datei löschen
- `src/lib/translations.ts` — `renderingPercent` in DE/EN/ES auf `{percent}` umstellen

## Erwartetes Ergebnis

- Im Export-Tab erscheint kein „Kosten werden berechnet …"-Block mehr.
- Render-Button zeigt korrekt z. B. `Video wird gerendert … 89%`.
- Kostenübersicht enthält nur noch Clip-/Voiceover-Posten — kein €0,10-Render-Aufschlag.