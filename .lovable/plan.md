

# Phase 3: Text-Overlays auf Loft-Film Niveau

## Analyse der Screenshots

Die 5 Szenen zeigen klare Probleme:
1. **Text abgeschnitten** — Body-Text wird per `truncateToWords(bodyText, 12)` auf 12 Wörter gekürzt, aber die `fadeWords`-Animation lässt Wörter einzeln einblenden, so dass mitten im Satz Schluss ist
2. **Charakter überlappt Headline** — In Szene 2 ("Zeitfresser") steht der Charakter auf `left`, direkt über der Headline (die ebenfalls links unten sitzt)
3. **Keine Scene-Type Badges** — `showSceneTitles` wird nie in den inputProps gesetzt → default `false`
4. **Inkonsistente Positionierung** — Hook/CTA zentriert, Rest unten-links ohne Abstand zum Charakter

## Änderungen

### 1. Edge Function: `showSceneTitles: true` aktivieren
**Datei:** `supabase/functions/auto-generate-universal-video/index.ts` (Zeile ~1443)

Einfach `showSceneTitles: true` in die inputProps einfügen. Damit werden die bereits implementierten `SceneTypeBadge`-Komponenten ([HOOK], [PROBLEM], etc.) sichtbar.

### 2. Edge Function: Body-Text auf 2 Zeilen kürzen
Aktuell schickt die Edge Function den vollen `voiceover`-Text als `textOverlay.text`. Problem: 12-Wort-Truncation im Template erzeugt abgehackte Sätze.

**Fix:** In der Edge Function den Body-Text auf maximal **2 kurze Sätze** (oder ~20 Wörter) kürzen, bevor er in die Scene-Props fließt. So wird der Text visuell vollständig angezeigt statt mitten im Wort abzubrechen.

### 3. Template: Charakter-Kollisions-Guard
**Datei:** `src/remotion/templates/UniversalCreatorVideo.tsx`

Wenn der Charakter auf `left` steht (Problem-Szenen), muss der TextOverlay nach rechts rücken, nicht links-bündig bleiben. 

**Fix im TextOverlay:** Die Position prüft jetzt auch die Charakter-Position. Wenn `scene.type === 'problem'` (Charakter links), bekommt der Text-Overlay extra `left`-Padding oder wird nach rechts verschoben.

Konkret: In der `positionStyle`-Logik (Zeile 1916-1918) für non-Hook Szenen einen `marginLeft` von `30%` hinzufügen wenn sceneType `problem` ist, damit der Text nicht unter dem Charakter liegt.

### 4. Template: Typografie-Upgrade
**Datei:** `src/remotion/templates/UniversalCreatorVideo.tsx`

- Headline-Glow: `textShadow` erweitern um `0 0 40px ${primaryColor}40` für subtilen Glow-Effekt
- Body-Text: `truncateToWords` von 12 auf 20 erhöhen für vollständigere Anzeige
- Problem-Szenen: Headline-Größe von 48px auf 56px erhöhen (diese sind emotional wichtig)

### 5. Bundle-Canary aktualisieren
`UCV_BUNDLE_CANARY` auf `2026-03-10-r55-phase3-text-upgrade`

## Zusammenfassung der Dateien

| Datei | Änderung |
|-------|----------|
| `auto-generate-universal-video/index.ts` | `showSceneTitles: true`, Body-Text Kürzung |
| `UniversalCreatorVideo.tsx` | Charakter-Kollisions-Guard, Typografie-Upgrade, Glow |

## Wichtig
Nach der Template-Änderung muss das S3-Bundle **erneut deployed** werden, damit die Text-Overlay-Verbesserungen im Lambda greifen. Die Edge-Function-Änderung (`showSceneTitles`) wirkt sofort nach Deploy.

