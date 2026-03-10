

# Phase 3b: Text-Qualität & Charakter-Interaktion

## Analyse der Screenshots

3 verbleibende Probleme identifiziert:

1. **Text endet mit "..."** — Doppelte Trunkierung: `smartTruncateToSentences` in der Edge Function (Fallback fügt "…" an) + `truncateToWords(bodyText, 20)` im Template. Beide schneiden ab.
2. **Charakter überlappt Text** (Szene 2 "Zeitfresser") — Der Collision Guard `left: 30%` reicht nicht. Der Charakter steht bei `left: 3%` mit 180px Breite, der Text beginnt bei 30% — bei 1920px sind das ~576px, der Charakter endet bei ~237px. Aber visuell überlappt es trotzdem, weil der Text-Container zu weit links beginnt.
3. **Charakter zeigt nicht auf Text** — Der `pointing`-Arm zeigt nach oben/rechts statt zum Text-Overlay.

## Änderungen

### 1. Edge Function: Saubere Trunkierung ohne "..."
**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

- `smartTruncateToSentences`: Das "…" im Fallback-Pfad entfernen. Stattdessen den Text am letzten vollständigen Wort beenden, ohne Ellipsis.
- Sätze die mit Punkt/Ausrufezeichen/Fragezeichen enden, sind bereits sauber — nur der Fallback-Pfad (wenn kein Satzende gefunden wird) fügt "…" hinzu.

### 2. Template: Doppelte Trunkierung entfernen
**Datei:** `UniversalCreatorVideo.tsx`

- `truncateToWords(bodyText, 20)` entfernen. Die Edge Function liefert bereits sauber gekürzten Text über `smartTruncateToSentences`. Die Template-Trunkierung erzeugt das "..."-Problem, weil sie nach der Satz-Trunkierung nochmal Wörter abschneidet.
- `displayText = bodyText` direkt verwenden (die Edge Function garantiert max 2 Sätze / 25 Wörter).

### 3. Charakter-Position: Problem-Szenen auf "right" umstellen
**Datei:** `UniversalCreatorVideo.tsx`

- `getContextBasedPosition`: Problem-Szenen von `left` auf `right` ändern. Das löst die Kollision grundsätzlich, weil Text unten-links und Charakter unten-rechts stehen.
- Den Collision Guard (`characterOnLeft ? '30%' : 0`) kann dann entfallen, da der Charakter nie mehr links steht.
- Stattdessen `thinking`-Action bei Problem-Szenen beibehalten — der Charakter steht rechts und "denkt nach" über das Problem.

### 4. Charakter-Arm: Pointing-Geste Richtung Text
**Datei:** `UniversalCreatorVideo.tsx` (AnimatedCharacter SVG)

- Bei `pointing`-Action (Hook/CTA): Den rechten Arm so rotieren, dass er nach links unten zeigt (wo der Text-Overlay liegt), statt nach oben.
- Konkret: `armWave` für `pointing` auf negativen Winkel ändern (Arm zeigt nach unten-links statt oben-rechts).
- Zusätzlich eine "zeige"-Hand-Geste (ausgestreckter Zeigefinger) statt der aktuellen offenen Hand hinzufügen.

### 5. Bundle-Canary
`UCV_BUNDLE_CANARY` auf `2026-03-10-r55-phase3b-text-character-fix`.

## Dateien

| Datei | Änderung |
|-------|----------|
| `auto-generate-universal-video/index.ts` | "…" aus Fallback entfernen |
| `UniversalCreatorVideo.tsx` | Doppelte Trunkierung entfernen, Charakter immer rechts, Pointing-Geste zum Text |

## Hinweis
Template-Änderungen erfordern erneutes S3-Bundle-Deploy. Edge Function wird automatisch deployed.

