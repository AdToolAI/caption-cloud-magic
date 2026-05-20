## Befund

Du hast sehr wahrscheinlich recht. Der aktuelle DB-Datensatz zeigt:

- `character_shots` enthält korrekt nur 2 Charaktere: Matthew + Samuel.
- `dialog_script` enthält 3 Zeilen: Samuel, Matthew, Samuel.
- `ai_prompt` enthält zusätzlich einen kompletten `[Dialog]`-Block mit den Sprecherzeilen:
  - Samuel sagt Zeile 1
  - Matthew sagt Zeile 2
  - Samuel sagt Zeile 3
- `compose-scene-anchor` bekommt aktuell `scenePrompt: scene.aiPrompt || ''`.

Damit landet die Dialogstruktur im Bildprompt. Das Modell interpretiert „Samuel spricht zweimal“ offenbar visuell als zusätzliche Samuel-Instanz. Genau deshalb zeigt der Screenshot 3 Personen: Samuel, Matthew, Samuel.

Der bisherige Sanitizer entfernt zwar `NAME: Text`-Zeilen, aber nicht den neueren `[Dialog] ... [/Dialog]`-Block mit Bullet-Zeilen wie `- Samuel Dusatko says: ...`. Dadurch bleibt der dialogische Speaker-Order-Kontext im visuellen Anchor-Prompt erhalten.

## Lösung

### 1. Dialog-Blöcke vollständig aus visuellen Prompts entfernen

In `supabase/functions/compose-scene-anchor/index.ts` wird `stripSpokenDialog()` erweitert:

- Entferne komplette `[Dialog] ... [/Dialog]`-Blöcke.
- Entferne Bullet-Zeilen wie `- Samuel Dusatko says: ...`.
- Entferne Sätze wie `Samuel and Matthew speak to camera in turns...`, `Timing must follow speaker order`, `lip-sync mouth movement`, usw.
- Entferne „says:“/„speaks:“/„dialogue:“ Muster unabhängig von Großschreibung.

Ziel: Der Bildgenerator sieht nur noch eine neutrale visuelle Szene, niemals Speaker-Reihenfolge oder mehrfaches Auftreten eines Sprechers.

### 2. Neutralen visuellen Fallback erzwingen

Wenn nach dem Strippen kaum noch visueller Kontext übrig bleibt, nutzt `compose-scene-anchor` einen sauberen Fallback:

```text
Two distinct business partners in a modern office meeting, seated together in conversation, photorealistic, no text.
```

Bei 2 Portraits wird daraus explizit:

```text
Exactly 2 distinct people in a modern office meeting, both visible once, seated together in conversation.
```

### 3. Anchor-Cache invalidieren

Cache-Key in `compose-scene-anchor` hochsetzen (`v8` → `v9`), damit kein alter Anchor mit Dialog-Prompt weiterverwendet wird.

### 4. Zusätzlicher Guard in `compose-video-clips`

Beim Aufruf von `compose-scene-anchor` nicht mehr blind `scene.aiPrompt` weiterreichen, sondern vorab einen serverseitig bereinigten `visualScenePrompt` bilden:

- Entferne `[Dialog] ... [/Dialog]` auch dort.
- Falls leer: neutraler Meeting-/Conversation-Prompt.

Das ist doppelte Absicherung: selbst wenn künftig eine andere Funktion Dialogtext in `ai_prompt` schreibt, bekommt der Anchor-Renderer keinen Speaker-Order-Text mehr.

### 5. Betroffene Szene resetten

Einmalig für Szene `6d89affc-f926-466b-b0f8-12b11f3863b5`:

- `reference_image_url = null`
- `clip_url = null`
- Lip-sync Felder leeren
- `clip_status`/Fehler zurücksetzen
- `scene_anchor_cache` für diese Szene löschen

Danach muss „Generieren“ bzw. „Clip + Lip-Sync neu rendern“ einen neuen Anchor ohne Dialog-Leak erzeugen.

## Erwartetes Ergebnis

Der Anchor-Prompt kennt künftig nur noch: „2 distinkte Personen in einer Meeting-Szene“. Er kennt nicht mehr: „Samuel spricht zweimal“. Damit sollte das Modell nicht länger Samuel zweimal als dritte Person visualisieren.

## Dateien

- `supabase/functions/compose-scene-anchor/index.ts`
- `supabase/functions/compose-video-clips/index.ts`
- neue Migration zum Reset der betroffenen Szene