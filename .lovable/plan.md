## Problem

Im Motion Studio passiert beim Klick auf „Storyboard generieren" (KI-Modus) Folgendes:

1. Der Button zeigt „Generiert…", aber die Ansicht bleibt auf **Briefing** stehen.
2. Wenn man dann manuell auf den **Storyboard**-Tab klickt, ist er leer („0 Szenen / Erste Szene hinzufügen") — sieht aus wie der Manuell-Modus, obwohl KI-gestützt gewählt war.

### Ursache

In `src/components/video-composer/BriefingTab.tsx` (`handleGenerateStoryboard`):

- Der Tab-Wechsel passiert **nur** im `onScenesGenerated`-Callback, also **nach** der vollständigen Edge-Function-Antwort (5–15 s).
- Wenn die Edge Function einen Fehler wirft, eine leere `scenes`-Antwort liefert oder das Netzwerk abbricht, wird weder `onGoToStoryboard()` noch `onScenesGenerated()` aufgerufen → der User bleibt auf Briefing.
- Es gibt kein Skeleton/Feedback auf dem Storyboard-Tab während der Generierung, deshalb wirkt der leere Tab wie der Manuell-Modus.
- Fehler werden im Toast oft übersehen, weil der Button-Spinner sich gleichzeitig zurücksetzt.

## Fix

### 1. Sofortiger Tab-Wechsel im KI-Modus

In `BriefingTab.tsx` → `handleGenerateStoryboard`:
- Direkt nach dem `productName`-Check und vor dem `invoke` einmal `onGoToStoryboard()` aufrufen, damit der User sofort auf dem Storyboard-Tab landet.
- `setIsGenerating(true)` weiter setzen, damit der Status nach oben durchgereicht werden kann.

### 2. Generierungs-Status auf dem Storyboard-Tab

- Neuen optionalen Prop `isGeneratingStoryboard: boolean` an `StoryboardTab` durchreichen.
- Wenn `isGeneratingStoryboard === true` **und** `scenes.length === 0`: statt der „Erste Szene hinzufügen"-Empty-State ein klares Lade-Panel anzeigen („Storyboard wird generiert…" + Spinner + Hinweis „Das kann 10–20 Sekunden dauern").
- Während des Generierens den `+ Szene` / `Frame-First` / `Talking-Head` / `Clips generieren`-Header optisch dimmen (disabled), damit klar ist, dass die KI gerade arbeitet.

### 3. Status nach oben heben

In `VideoComposerDashboard.tsx`:
- Neuen State `isGeneratingStoryboard` einführen.
- `BriefingTab` bekommt `onGenerationStart` / `onGenerationEnd`-Callbacks, die den State setzen.
- `StoryboardTab` bekommt `isGeneratingStoryboard` weitergereicht.

### 4. Sichtbare Fehlerbehandlung

In `BriefingTab.handleGenerateStoryboard`:
- Bei Fehler oder leerer `scenes`-Antwort: zusätzlich zum Toast den User zurück auf den Briefing-Tab schicken (`setActiveTab('briefing')` via neuem Callback `onGenerationFailed`), damit klar wird, dass der Schritt nicht erfolgreich war.
- Wenn `data?.scenes` leer ist (`Array.isArray(data.scenes) && data.scenes.length === 0`): als Fehler behandeln, nicht stillschweigend `onScenesGenerated([])` aufrufen (das wäre der Fall, der „leerer Storyboard"-Eindruck erzeugt hat).
- Zusätzliches `console.warn` mit dem rohen `data`/`error`-Payload, damit zukünftige Reports leichter debuggbar sind.

### 5. Race-Schutz gegen Realtime-Wipe

Verifizieren (kein Code-Change nötig, falls bereits ok): Die KI-generierten Szenen tragen IDs `scene_${Date.now()}_${index}` (kein UUID) und werden in `refetchScenesFromDb` über `localOnly`-Filter erhalten. Das ist bereits korrekt — nur dokumentieren, damit zukünftige Edits es nicht brechen.

## Dateien

- `src/components/video-composer/BriefingTab.tsx` — sofortiger Tab-Wechsel, Lift-up von Generierungsstatus, harte Fehlerbehandlung bei leerer Antwort.
- `src/components/video-composer/VideoComposerDashboard.tsx` — `isGeneratingStoryboard`-State + Props an Briefing/Storyboard durchreichen, `onGenerationFailed` → zurück zu Briefing.
- `src/components/video-composer/StoryboardTab.tsx` — Lade-Panel statt Empty-State, wenn Generierung läuft und Szenen leer.

## Validierung

1. KI-Modus + gefülltes Briefing → Klick „Generieren": Tab wechselt sofort auf Storyboard, Lade-Panel sichtbar, nach Edge-Function-Antwort erscheinen die Szenen.
2. KI-Modus + Netzwerk-Fehler simulieren (Edge Function 500): Toast erscheint, Tab springt zurück auf Briefing, kein leeres Storyboard.
3. Manuell-Modus: weiterhin direkter Wechsel zu Storyboard (unverändert).
4. Refresh während Generierung: Storyboard zeigt entweder Lade-Panel (wenn Status noch true) oder die persistierten Szenen.

## Keine Backend-Änderung nötig

Die Edge Function `compose-video-storyboard` funktioniert laut Logs korrekt — die Ursache liegt rein im Frontend-Flow.
