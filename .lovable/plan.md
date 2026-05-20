## Ziel
Der Kunde soll direkt nach dem Klick auf „Clip generieren“ einen sichtbaren, glaubwürdigen Ladebereich sehen — nicht erst nach ~30 Sekunden. Die bestehende Backend-/Render-Pipeline bleibt unverändert.

## Ursache
Der Fortschrittsbalken hängt aktuell nur global unter dem Top-Stepper. Beim Klick in der Szenen-/Storyboard-Fläche wird zwar teilweise ein Event ausgelöst, aber:

- Der sichtbare Bereich des Kunden ist unten im Storyboard; der globale Balken liegt außerhalb des aktuellen Scroll-Fokus.
- `useGenerateAllClips` beendet das `clips:start` Event im `finally` sofort wieder, obwohl die eigentliche Clip-/Lip-Sync-Generierung danach noch mehrere Minuten serverseitig weiterläuft.
- Beim Einzelclip ist der Optimistic-Status erst nach `ensureProject()` sichtbar; genau das verursacht die wahrgenommenen ~30 Sekunden „nichts passiert“.
- Der Progress sollte nicht an die erste Serverantwort gekoppelt sein, sondern an den Klick selbst.

## Umsetzung

### 1. Lokaler Ladebereich direkt im Storyboard
In `StoryboardTab.tsx` wird über der Szenenliste ein klarer Pipeline-Ladebereich eingebaut, der ab Klick sofort erscheint:

- Titel: „Clip wird generiert…“ bzw. „Clips werden generiert…“
- Untertitel: „VO & Lip-Sync inklusive“ wenn ein Skript vorhanden ist
- Fortschrittsbalken mit 7–8 Minuten ETA
- Live-Zeit: „0:12 / ~7:45 min“
- Status-Pills: Clips, Voiceover, Lip-Sync, Export

Damit sieht der Kunde Fortschritt genau dort, wo er arbeitet — nicht nur oben außerhalb des Blickfelds.

### 2. Klick triggert sofort sichtbaren Status
In `useSceneGenerate.ts` und `useGenerateAllClips.ts` wird vor allen langsamen Operationen sofort ein lokaler Optimistic-State gesetzt:

- Einzelclip: Szene sofort auf `clipStatus: 'generating'`
- Alle Clips: alle relevanten Szenen sofort auf `clipStatus: 'generating'`
- Event `clips:start` direkt beim Klick

Das passiert vor `ensureProject()`, vor Frame-Anchor-Erstellung und vor Edge-Function-Aufrufen.

### 3. Progress nicht zu früh beenden
`clips:end` wird nicht mehr direkt im `finally` ausgelöst, wenn die Serverfunktion nur die Generierung gestartet hat. Stattdessen bleibt der Ladebereich aktiv, solange Szenen noch `generating` sind oder der lokale Pipeline-Timer läuft.

Fehlerfälle beenden den Progress weiterhin sofort.

### 4. 7–8 Minuten Ladeillusion stabil halten
`usePipelineProgress.ts` wird so angepasst, dass ein gestarteter Clip-Prozess nicht nach kurzer Zeit verschwindet:

- Mindestlaufzeit für sichtbaren Progress: ca. 7:45 min
- Soft-Floor steigt kontinuierlich
- Realer Ready-Status gewinnt: wenn alle Szenen vorher fertig sind, springt es sauber auf fertig
- Wenn Backend länger braucht, bleibt „wird generiert“ sichtbar statt leerem Zustand

### 5. Grün bestätigter Fertig-Zustand
Sobald eine Szene fertig ist:

- Auf der Szenenkarte/Player-Kachel erscheint „✓ Generiert“
- Generating-Overlay verschwindet erst bei `clipStatus === 'ready'`
- Der Kunde sieht pro Clip klar, was bereits abgeschlossen ist

## Dateien

```text
src/components/video-composer/StoryboardTab.tsx
src/hooks/useGenerateAllClips.ts
src/hooks/useSceneGenerate.ts
src/hooks/usePipelineProgress.ts
src/components/video-composer/SceneInlinePlayer.tsx
```

## Nicht anfassen

```text
supabase/functions/*
Datenbank-Schema
Realtime-Subscriptions
Two-Shot / Lip-Sync Edge-Functions
Render-Pipeline
```

Die funktionierende Pipeline bleibt technisch unverändert; wir reparieren nur die sofortige UI-Rückmeldung und den sichtbaren Ladezustand.