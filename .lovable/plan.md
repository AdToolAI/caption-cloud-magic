## Problem

Das aktuelle Verhalten ist ein Rückschritt: Das Dialog-Studio zeigt zwar das Skript, aber keine Sprecher-/Voice-Zeile. Dadurch bleibt `0 Sprecher`, `dialogVoices` wird nicht gesetzt und Lip-Sync scheitert später mit fehlender Stimme.

Ursache ist sehr wahrscheinlich nicht die Lip-Sync-Pipeline selbst, sondern die Cast-Auflösung im Dialog-Studio:
- Der Plan schreibt Cast-IDs aus der Avatar-Library/Briefing-Analyse.
- `SceneDialogStudio` kann daraus keinen lokalen `sceneCast` bauen.
- `parseDialogScript()` findet deshalb keinen Sprecher im Skript.
- Ohne `speakers.length > 0` rendert die Voice-Auswahl nicht.

## Zielzustand

Wenn im Briefing/Plan ein Cast-Member ausgewählt wurde und im Skript steht z.B. `SAMUEL DUSATKO — CASUAL: ...`, muss das Dialog-Studio wieder wie vorher funktionieren:
- Sprecher sichtbar mit Avatar/Name.
- Stimme rechts auswählbar.
- Default-Stimme wird automatisch gesetzt, falls im Avatar vorhanden.
- Wenn keine Default-Stimme existiert, bleibt die Voice-Auswahl trotzdem sichtbar und manuell nutzbar.
- Lip-Sync-Generierung wird erst erlaubt, wenn mindestens eine gültige Stimme pro Sprecher gesetzt ist.
- Dialog-/Lip-Sync-Szenen verwenden HappyHorse als Provider-Default.

## Umsetzung

### 1. Cast-Fallback im Dialog-Studio robuster machen
In `SceneDialogStudio.tsx`:
- Library-Fallback erweitert prüfen:
  - `id`
  - `brandCharacterId`
  - Name/First-name fuzzy match
  - Script-Speaker-Name gegen Avatar-Name
- Library-Felder korrekt mappen:
  - `referenceImageUrl = portrait_url || reference_image_url`
  - `brandCharacterId = brand_character.id`
  - `default_voice_id` als Default-Voice-Quelle

### 2. Skriptparser für Regie-/Mood-Suffix reparieren
`parseDialogScript()` aktuell erkennt `NAME: Text`, aber dein Skript ist eher:

```text
SAMUEL DUSATKO — CASUAL: Du sitzt sechs Stunden ...
```

Ich passe die Erkennung so an, dass solche Formate sauber als Sprecher `SAMUEL DUSATKO` erkannt werden, während `CASUAL` als Tonalität/Mood ignoriert oder separat behandelt wird. Dadurch wird aus `0 Sprecher` wieder `1 Sprecher`.

### 3. Voice-Auswahl immer aus erkannten Skriptsprechern + Cast ableiten
In `SceneDialogStudio.tsx`:
- Voice-Zeilen nicht nur von `speakers` aus `parseDialogScript()` abhängig machen, sondern fallbackweise aus `sceneCast`, wenn ein Dialog-Skript vorhanden ist.
- Für jeden sichtbaren Sprecher direkt `dialogVoices` initialisieren:
  - Avatar-Default-Stimme, falls vorhanden.
  - sonst erste verfügbare ElevenLabs-Stimme als sicherer Fallback.
- Dadurch bleibt die Stimme rechts auswählbar und der Generate-Button wird nicht blind freigegeben.

### 4. Plan-Anwendung Cast/Voice stabilisieren
In `useApplyProductionPlan.ts`:
- Bei Dialog-Szenen sicherstellen, dass `characterShots`, `characterShot`, `dialogMode`, `dialogScript`, `dialogVoices`, `engineOverride: 'cinematic-sync'`, `lipSyncWithVoiceover: true`, `clipSource: 'ai-happyhorse'` konsistent gesetzt werden.
- Keine bestehenden gerenderten/gelockten Lip-Sync-Szenen anfassen.

### 5. UI-Recovery-Banner entschärfen
Der aktuelle gelbe Banner sagt „Kein Cast-Charakter aufgelöst“, obwohl du im Plan einen Cast gewählt hast. Nach dem Fix soll er nur erscheinen, wenn wirklich weder Cast noch Skriptsprecher auflösbar sind. Sonst erscheinen wieder Sprecher + Voice-Auswahl.

## Validierung

Ich prüfe danach per Code/Preview-Signal:
- `SAMUEL DUSATKO — CASUAL: ...` wird als 1 Sprecher erkannt.
- Voice-Auswahl erscheint wieder unter dem Skript.
- `dialogVoices` wird beim Öffnen/Auto-Bind gesetzt.
- Dialog-Szene steht auf HappyHorse und Cinematic-Sync.
- Generate bleibt blockiert, falls wirklich keine Stimme existiert, statt später in der Lip-Sync-Pipeline zu scheitern.