

## Befund
Zwei Probleme im Clips-Tab (`ClipsTab.tsx`):

1. **Keine sichtbare Generierungs-Anzeige**: Nach dem Klick auf "Alle Clips generieren" wird zwar ein Toast gezeigt und intern wird `clipStatus='generating'` gesetzt, aber die einzelne Szenen-Card zeigt nur ein winziges Spinner-Icon rechts. Es gibt **keinen prominenten Progress-Bar pro Clip**, kein Skeleton-Overlay auf dem Vorschau-Slot, keine Statuszeile à la "KI rendert (~30–60s)…" wie im AI Video Studio. Daher der Eindruck "es passiert nichts".

2. **Nur Bulk-Generierung**: Es gibt `handleRegenerateScene` (rotierender Pfeil-Button), aber das ist semantisch "Nochmal versuchen". Es fehlt ein klarer **"Diesen Clip generieren"**-Button für noch nicht gestartete Szenen, sodass der User Clip für Clip einzeln testen/triggern kann (Kosten- und Risikokontrolle).

## Plan — Sichtbares Generierungs-Feedback + Einzel-Clip-Generierung

### 1. Neue Komponente `SceneClipProgress.tsx` (Mini)
- Zeigt im Vorschau-Slot der Szenen-Card (das aktuell graue 28×16 Quadrat) ein **Pulsing-Skeleton mit Loader** und Text "KI rendert…" wenn `clipStatus='generating'`
- Bei `failed`: rotes XCircle + "Fehlgeschlagen — neu versuchen"
- Bei `ready`: das Video wie heute
- Bei `pending`: Platzhalter-Text + neuer "Generieren"-Button überlagert

### 2. `ClipsTab.tsx` — Status-Visualisierung verbessern
- Vorschau-Slot vergrößern auf 36×20 (gut sichtbar)
- Bei `generating`: animierter Gradient-Skeleton (Tailwind `animate-pulse` + Shimmer)
- Status-Badge größer und farbig: gelb (pending), blau-pulsierend (generating), grün (ready), rot (failed)
- Pro Karte eine **Status-Zeile** unter dem Prompt-Text: "KI generiert… (Hailuo, ~30–60s)" mit Loader2-Icon
- Header-Bar: neuer Mini-Progress-Bar `readyCount / totalCount` als Balken (nicht nur Text)

### 3. Neuer Einzel-Generierung-Button
- Neue Funktion `handleGenerateSingle(scene)` — sehr ähnlich zu `handleGenerateAll` aber Payload nur mit dieser einen Szene
- Sicherstellen, dass `ensureProjectPersisted` auch hier gerufen wird
- Button-Logik in der Karte:
  - `pending` + KI-Source → primärer **"Generieren"**-Button (Sparkles-Icon), zeigt Kosten "€0.20/s • €1.60"
  - `generating` → disabled "Wird generiert…"
  - `ready` → Refresh-Button bleibt für Re-Roll
  - `failed` → roter "Erneut versuchen"-Button
- Bei `upload`: kein Button, nur Vorschau wenn vorhanden
- Bei `stock` ohne Auswahl: "Stock-Video suchen"-Button

### 4. Polling-Verbesserung
- Polling-Interval von 5s → 3s für schnelleres Feedback
- Beim Statuswechsel `generating → ready` einen Toast mit Szenenname zeigen ("Szene 2 fertig ✓")
- Beim ersten Aufruf nach Generate-Click sofort einen Poll triggern (nicht erst nach 3s warten)

### 5. Header-Polish
- "Alle Clips generieren" zeigt verbleibende Anzahl und Restkosten:  
  z.B. *"Alle generieren (3 Clips • €4.20)"*
- Wenn 0 zu generieren: Button disabled mit Text "Alle Clips bereit"

### 6. Lokalisierung (`src/lib/translations.ts`)
Neue Keys EN/DE/ES:
- `videoComposer.generateSingle`, `videoComposer.generating`
- `videoComposer.generationFailed`, `videoComposer.retry`
- `videoComposer.aiRenderingHint` ("KI rendert ca. 30–60s")
- `videoComposer.sceneReady`

### 7. Verify
- Klick "Alle generieren" → jede betroffene Karte zeigt sofort animiertes Skeleton + "KI rendert…"
- Header-Progress-Bar bewegt sich beim Polling
- Klick "Generieren" auf einzelner Karte → nur diese Karte geht in `generating`, Kosten korrekt abgezogen
- Bei Fehler → roter Status + Retry-Button funktioniert
- Bei Upload-Szene → kein Generate-Button, direkte Vorschau

### Was unverändert bleibt
- Edge Function `compose-video-clips` (unterstützt bereits Single-Scene-Payload)
- DB-Schema, Persistenz-Hook, Pricing-Logik
- Briefing, Storyboard, Audio, Export Tabs
- Universal Video Creator

