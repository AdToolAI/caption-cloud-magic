## Ziel

Der Voiceover-Skriptgenerator im Universal Creator (Schritt "Voiceover & Untertitel") soll sich automatisch an den vorher definierten **Storyboard-Szenen** orientieren. Egal ob der Nutzer den "KI-Generator" oder den "Aus Szenen"-Modus wählt – das Ergebnis ist ein zusammenhängendes Skript, das

1. die **Gesamtgeschichte** der Szenen widerspiegelt (Hook → Mitte → Ende),
2. **zeitlich pro Szene passt** (Wortanzahl-Budget je Szene basierend auf 2,5 Wörter/Sek),
3. als ein **flüssiger Sprechtext** ausgegeben wird (mit unsichtbaren Szenen-Markern, damit Untertitel später passen).

## Aktueller Stand (kurz)

- Storyboard-Szenen (`Scene[]`) aus `useSceneManager` werden im `UniversalCreator` gehalten, aber **nicht** an `ContentVoiceStep` durchgereicht.
- `VoiceoverScriptGenerator.tsx` ruft `generate-voiceover-script` nur mit `idea`, `targetDuration`, `tone`, `language` auf — kein Szenen-Kontext.
- Die Edge Function generiert daher generische Texte, die zeitlich oft nicht zur Sequenz passen.

## Änderungen

### 1. Szenen an den Voiceover-Step durchreichen
- `ContentVoiceStepProps` um `scenes?: Scene[]` erweitern.
- In `UniversalCreator.tsx` (Step "content") `scenes={scenes}` übergeben.
- Props nach unten an `<VoiceoverScriptGenerator scenes={scenes} ... />` durchreichen.

### 2. `VoiceoverScriptGenerator` erweitert
- Neue Prop: `scenes?: Scene[]`.
- Wenn `scenes.length > 0`:
  - Default-Dauer ergibt sich aus der **Summe der Szenen-Dauern** (statt `defaultDuration`).
  - Neuer Hinweis-Block oben: „Skript wird auf deine X Szenen (Σ Y s) abgestimmt".
  - Idea-Feld bleibt optional; wenn leer und Szenen vorhanden, wird "Erzähle eine zusammenhängende Geschichte basierend auf den Szenen" als Default benutzt.
- Body-Payload um `scenes` (nur die für den Text relevanten Felder: `order`, `duration`, optionale Beschreibung aus `background`/`textOverlay`) erweitern.

### 3. Kleiner "Aus Szenen"-Direktmodus
- Neuer Button im Generator: **„Direkt aus Szenen generieren"** (überspringt Idea-Eingabe, nutzt Szenen + gewählten Ton).
- Setzt intern `idea = ""` und ruft mit `mode: 'from_scenes'` auf.

### 4. Edge Function `generate-voiceover-script` erweitern
- Akzeptiert neu: `scenes?: { order: number; durationSeconds: number; description?: string }[]` und `mode?: 'from_idea' | 'from_scenes'`.
- Wenn `scenes` vorhanden:
  - **Pro Szene** wird ein Wort-Budget berechnet: `wordsPerScene = round(durationSeconds * 2.5)` (mit ±10 % Toleranz).
  - System-Prompt wird ergänzt um eine **Szenen-Tabelle** (Szene 1: Xs / ~Y Wörter, …) und die Anweisung:
    - „Schreibe einen einzigen, zusammenhängenden Sprechtext."
    - „Halte dich pro Szene an das Wort-Budget (±10 %)."
    - „Markiere Szenenwechsel mit `[[scene:N]]` im Text — diese Marker werden vor der Sprachausgabe entfernt."
    - Hook in Szene 1, Resolution/CTA in der letzten Szene.
- Tool-Schema erweitert um optionales `sceneScripts: { order:number; text:string; words:number }[]` (Hauptausgabe bleibt `script`, kompatibel zu bestehender UI).
- Vor der Rückgabe werden `[[scene:N]]`-Marker für die Anzeige entfernt; `sceneScripts` wird zusätzlich zurückgegeben (für spätere Subtitle-Sync, optional in der UI als Vorschau pro Szene).

### 5. UI-Vorschau pro Szene (optional, klein)
- Wenn `sceneScripts` vorhanden, unter dem generierten Skript eine kompakte Liste „Pro Szene" anzeigen (Szene N · Xs · "…"), damit der Nutzer sieht, dass das Skript szenengetreu ist.

## Technische Details

- **Wort-Budget-Formel:** `targetWords(scene) = clamp(round(duration * 2.5), 4, 80)`; gesamt = Σ.
- **Marker-Cleanup:** `script.replace(/\s*\[\[scene:\d+\]\]\s*/g, ' ').trim()`.
- **Backward-Compatible:** Wenn keine `scenes` gesendet werden, verhält sich die Edge Function exakt wie vorher.
- **Keine neuen Tabellen / Migrations** nötig.

## Geänderte Dateien

```text
src/pages/UniversalCreator/UniversalCreator.tsx        (scenes an ContentVoiceStep durchreichen)
src/components/universal-creator/steps/ContentVoiceStep.tsx   (scenes-Prop + an Generator weiterreichen)
src/components/universal-creator/VoiceoverScriptGenerator.tsx (scenes-Prop, "Aus Szenen"-Button, Vorschau)
supabase/functions/generate-voiceover-script/index.ts  (scenes-Kontext, Wort-Budget pro Szene, Marker)
```

## Out of Scope

- Composer (`VoiceSubtitlesTab`) — der hat bereits `generateScriptFromScenes()` aus Overlays. Kann in einem späteren Schritt analog erweitert werden, wenn gewünscht.
- Automatisches Re-Generieren bei nachträglicher Szenen-Änderung (bleibt manueller Klick).
