# Bug: Avatar erscheint in 0 von 5 Szenen

## Diagnose
Kein Zufall — strukturelles Problem im Storyboard-Generator (`supabase/functions/compose-video-storyboard/index.ts`).

Der System-Prompt sagt aktuell:
- **Default = "absent"** (kein Charakter)
- Charakter soll nur in ~30–50% der Szenen vorkommen
- "Erfinde keine Gründe ihn einzubauen"

Es gibt **keinen serverseitigen Mindest-Floor**. Wenn das LLM (Gemini 3 Flash) sich entscheidet, den Charakter in 0 Szenen zu setzen, akzeptiert der Code das stillschweigend. Genau das ist passiert: Cast Consistency Map zeigt `Matthew Dus… — S1..S5: alle leer`.

## Fix (3 kleine Änderungen, nur Storyboard-Edge-Function + UI-Hinweis)

### 1. Prompt-Guidance verschärfen
In `compose-video-storyboard/index.ts`:
- "30–50%" → **"mindestens 40–60%, niemals 0"**
- Explizite Regel: "Wenn der User einen Avatar definiert hat, MUSS er in mindestens `ceil(sceneCount * 0.4)` Szenen vorkommen, mindestens aber in 2."
- Hook und CTA bleiben bevorzugte Anker, wenn nicht anders sinnvoll.

### 2. Server-Side Floor (Auto-Repair)
Nach dem LLM-Call, vor dem Response:
- Zähle wie viele Szenen ein gültiges `characterShot` (≠ absent) haben.
- Wenn `< max(2, ceil(N * 0.4))` und `briefing.characters.length > 0`:
  - Wähle die fehlenden Szenen heuristisch (bevorzugt Hook → CTA → mittlere Szene), die noch `absent` sind und **nicht** rein produkt-/B-Roll-typisch sind.
  - Setze dort `characterShot = { characterId: <primary>, shotType: 'profile' | 'detail' | 'silhouette' }` (rotierend, damit Variety bleibt).
  - Stelle sicher, dass für diese Szenen nicht `clipSource='stock'` gesetzt wird (Re-Run von `pickClipSource` mit dem neuen Shot).

### 3. UI-Hinweis (defensiv)
In `CastConsistencyMap.tsx`: Wenn ein Charakter in **0** Szenen erscheint, kleines Warn-Banner unter der Tabelle:
> „Matthew Dus… kommt in keiner Szene vor. Klicke in einer Szene auf den Charakter-Button, um ihn als Anker hinzuzufügen — oder generiere das Storyboard neu."

Kein Backend-Refactor, keine DB-Änderung, keine Logik in `compose-video-clips`.

## Erwartetes Ergebnis
Bei 5 Szenen + 1 definierter Avatar erscheinen automatisch **mindestens 2 Szenen** mit Matthew als Anker (mit Reference-Image-Anchor → 🟢 in der Cast Map), Reference-Image-URL wird wie zuletzt implementiert für i2v genutzt.
