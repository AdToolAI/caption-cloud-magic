## Scene Director — natürlichsprachlicher Szenen-Builder mit Asset-Auto-Match & Duration-Fit

Ziel: Der User beschreibt eine Szene in natürlicher Sprache („2. Weltkrieg, ein Soldat fährt mit einem Leopard-Panzer über eine Brücke"), und der Composer:
1. **findet automatisch passende Library-Assets** (Avatare, Locations, Buildings, Props) und injiziert sie als `@-Mentions`,
2. **passt die Beschreibung an die Szenenlänge an** — überzählige Aktionen werden gestrichen oder in Folgeszenen ausgelagert,
3. **schreibt einen render-fertigen englischen Prompt** im Stil des bestehenden Storyboard-Generators (mit Negative-Clauses gegen Text/Captions etc.).

So bleibt die volle AI-Generierung möglich, aber der User kontrolliert die Geschichte Szene für Szene.

---

### 1) Neue Edge Function `scene-director`

Single-shot Lovable-AI-Call (`google/gemini-3-flash-preview`) mit **Tool-Calling**, der folgende Inputs bekommt:

```ts
{
  description: string,               // user-Eingabe in beliebiger Sprache
  durationSeconds: number,           // 3–15s, fix vom Composer
  language: 'en' | 'de' | 'es',      // UI-Sprache (Skript darf lokalisiert sein)
  brandKitContext?: string,          // optional kurze Brand/Style-Notiz
  library: {
    characters: { id, name, slug, identityCardPrompt }[],
    locations:  { id, name, slug, prompt_descriptor }[],
    buildings:  { id, name, slug, prompt_descriptor }[],
    props:      { id, name, slug, prompt_descriptor }[],
  }
}
```

Das Modell bekommt zwei Tools:

- **`resolveAssets`** — gibt für jede genannte Person/Location/Bauwerk/Objekt die beste passende Library-`id` (oder `null` wenn keiner passt) plus einen Konfidenz-Score zurück. Fuzzy-Match auf Name + Beschreibung; Slug wird daraus für die Mention abgeleitet.

- **`emitScene`** — finalisiert die Szene mit:
  ```ts
  {
    aiPrompt: string,            // English, render-ready, ≤ visualBudget Tokens
    dialogScript?: string,       // optional, in `language`, ≤ speechBudget Wörter
    matchedAssets: {
      characters: id[], locations: id[], buildings: id[], props: id[]
    },
    droppedActions: string[],    // Aktionen, die nicht in die Sekunden passten
    followupSceneSuggestions: string[], // 0–2 Vorschläge für Folgeszenen
    confidence: 'high' | 'medium' | 'low'
  }
  ```

**Duration-Budgeting (server-seitig vor Tool-Call als Hard-Constraint im System-Prompt):**

| Sekunden | Max. distinkte Aktionen | Max. Kamera-Bewegungen | Max. Skript-Wörter (≈ 2.3 W/s) | Max. distinkte Assets |
|---|---|---|---|---|
| 3–4s | 1 | 1 | 7–9 | 2 |
| 5–6s | 1–2 | 1 | 12–14 | 3 |
| 7–9s | 2 | 2 | 16–20 | 4 |
| 10–12s | 2–3 | 2 | 23–28 | 5 |
| 13–15s | 3 | 2–3 | 30–35 | 6 |

Übersteigt die User-Beschreibung das Budget → das Modell **muss** überzählige Aktionen in `droppedActions` listen und 1–2 Folgeszenen in `followupSceneSuggestions` vorschlagen, statt sie einzudampfen. So entstehen keine „matschigen" Prompts.

**Resilienz:**
- Brand-Negative-Clauses (kein Text/Captions/Logos, keine politischen Insignien) werden serverseitig immer angehängt — das Modell darf sie nicht weglassen.
- Visuelle Sprache **immer Englisch** (Core-Memory-Regel), `dialogScript` darf lokalisiert sein.
- Fallback: wenn der Tool-Call fehlschlägt, einmaliger Retry mit `gemini-2.5-flash`; danach 502 mit klarer Fehlermeldung (kein stiller Stub).

---

### 2) UI im SceneCard — „✨ Beschreibe diese Szene"

Direkt über dem bestehenden Prompt-Editor (zwischen UnifiedAssetPicker und PromptMentionEditor) ein neuer kollapsibler Block:

```
┌─ ✨ Szene aus Beschreibung ──────────────── [▾] ─┐
│  [ 2. Weltkrieg. Soldat fährt Leopard      ]    │
│  [ über eine Brücke bei Sonnenaufgang.     ]    │
│                                                  │
│  Dauer: 8s   Max ~16 Wörter Skript / 2 Assets   │
│  [ ✨ Szene generieren ]   [ ↻ Neu würfeln ]    │
└──────────────────────────────────────────────────┘
```

Nach dem Klick:
1. Spinner + „Suche passende Assets aus deiner Library…"
2. Bei Erfolg: `aiPrompt`, `dialogScript`, `characterShots` und der neue `<!--scene-assets-->`-Block (über `applySceneAssetsToPrompt`) werden in die Szene geschrieben — der UnifiedAssetPicker zeigt die neuen Slots automatisch an.
3. **Diff-Toast** statt stiller Überschreibung: „Ersetzt: 2 Assets, 28→16 Wörter Skript. 1 Aktion verschoben → Folgeszene-Vorschlag verfügbar."
4. **„Folgeszene anlegen"-Button** wenn `followupSceneSuggestions[]` nicht leer ist — fügt direkt eine neue Szene hinter der aktuellen mit dem Vorschlag als Beschreibung ein.
5. **„Asset fehlt"-Hinweise**: wenn `confidence: low` oder `null` Matches → Inline-Chip „Leopard-Panzer nicht in deiner Props-Library — [Generate with AI]" mit Direkt-Sprung in den `generate-world-asset`-Flow.

---

### 3) Konsistente Schreib-Richtung (kein Doppelschreiben)

- `aiPrompt` wird wie heute über `onUpdate({ aiPrompt })` gesetzt.
- `@-Mentions` für die gematchten Library-Assets werden über das in Stage 5 eingeführte `applySceneAssetsToPrompt` als Auto-Block am Anfang injiziert — damit die existierende `useUnifiedMentionLibrary`-Resolver-Pipeline (Vidu Q2 / Hailuo i2v / Nano-Banana-Anchor) automatisch Reference-Images weiterreicht.
- Cast-Slots werden über `characterShots` gesetzt (gleicher Pfad wie heute der Picker).
- **Idempotent**: erneutes Generieren mit gleicher Beschreibung erzeugt deterministisch dieselbe Szene (cache-key `sha1(description + duration + library.versionHash)`), Cache 24h in `scene_director_cache` Tabelle.

---

### Out of scope (bewusst nicht in dieser Stage)

- Kein Re-Run des Storyboards für die ganze Timeline — Scene Director arbeitet **immer pro einzelner Szene**.
- Keine neuen Assets werden automatisch generiert — bei Lücken erscheint nur der Hinweis-Chip (one-click in den bestehenden `generate-world-asset`-Flow).
- Keine Anpassung der Render-Pipelines — alle Edits laufen durch die bestehenden Felder/Mentions, die Renderer sehen keinen Unterschied.

---

### Technische Details

- **Neu**: `supabase/functions/scene-director/index.ts` (Lovable AI Gateway, Tool-Calling, ~250 LOC)
- **Neu**: Migration für `scene_director_cache` (key, payload, created_at; RLS: user_id only)
- **Neu**: `src/components/video-composer/SceneDirectorBox.tsx`
- **Neu**: `src/lib/sceneDirector/durationBudget.ts` (Tabelle oben als reine Funktion)
- **Edit**: `SceneCard.tsx` — neuer Block über dem PromptMentionEditor + Folgeszenen-Insert via bereits vorhandenem `onInsertScenesAfter`
- Wiederverwendet: `applySceneAssetsToPrompt`, `useBrandLocations/Buildings/Props`, `useUnifiedMentionLibrary`, `compose-video-storyboard`-Negative-Clauses (als Konstante extrahiert in `_shared/scene-director-rules.ts`)
