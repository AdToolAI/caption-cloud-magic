## Problem

Im **Storyboard** vom Motion Studio gibt es zwei Probleme mit dem Charakter "Matthew Dusatko":

1. **Falsche Warnung**: Die Cast-Consistency-Map zeigt _„Matthew Dusatko kommt in keiner Szene vor"_, obwohl er tatsächlich in jeder Szene als Anker gesetzt ist.
2. **Zu viele Auftritte**: Er taucht in **allen 5 Szenen** auf — gewünscht wären eher **2–3 Szenen**.

Aktuell zwingt der Server-Floor in `compose-video-storyboard` jeden Charakter in mindestens **40–60 %** der Szenen, ohne dass der User das beeinflussen kann. Wird ein Avatar aus der Bibliothek verknüpft, bekommt er außerdem eine ID wie `lib:abc…`, während die Storyboard-KI nur die einfache ID aus der Charakter-Liste kennt — dadurch matcht `characterShot.characterId` nicht und die Cast-Map zeigt fälschlicherweise „absent".

## Lösung

### 1. Bug-Fix: Cast-Consistency-Map erkennt verknüpfte Avatare nicht

In `src/components/video-composer/CastConsistencyMap.tsx` → `getAnchor()` zusätzlich zur exakten ID auch nach Namens-Match fallen-back. Das deckt sowohl `lib:…`-IDs als auch ID-Drift durch die LLM ab, ohne die Datenstruktur zu ändern.

### 2. Neuer Toggle: „Wie oft soll der Charakter auftreten?"

**a) Datenmodell** (`src/types/video-composer.ts`)

Neues optionales Feld auf `ComposerCharacter`:
```ts
appearanceFrequency?: 'cameo' | 'balanced' | 'lead'; // Default: 'balanced'
```

| Stufe | Bedeutung | Min/Max-Anteil der Szenen |
|---|---|---|
| `cameo` | Kurzer Auftritt | 1–2 Szenen (≈20 %) |
| `balanced` | Ausgewogen (Default) | 40–60 % (= heutiges Verhalten) |
| `lead` | Dauerpräsenz | 80–100 % |

**b) UI** in `CharacterManager.tsx`

Pro Charakter-Karte ein kompakter Segmented-Toggle direkt unter dem Namen, mit Tooltips in DE/EN/ES:
- 🎬 _Cameo_ · ⚖️ _Balanced_ · ⭐ _Lead_

**c) Storyboard-Generierung** (`supabase/functions/compose-video-storyboard/index.ts`)

- Den hartcodierten Faktor `0.4` durch eine pro Charakter berechnete Spanne ersetzen, abgeleitet aus `appearanceFrequency`.
- Den Floor-Auto-Repair am Ende (Zeilen 456–490) so anpassen, dass er die User-Wahl respektiert: bei `cameo` werden überschüssige Szenen sogar **entfernt** (characterShot → absent + ggf. clipSource neu picken), bei `balanced`/`lead` wird wie bisher aufgefüllt.
- Im LLM-Prompt die User-Vorgabe explizit nennen, damit das Model nicht selbst eine andere Quote wählt.

### 3. Mini-Verbesserung in der Cast-Map

Wenn Cameo gewählt ist und alle Szenen besetzt sind, wird die orange Warnung ohnehin nicht mehr fälschlich getriggert (durch Bug-Fix #1) — zusätzlich kein Hinweis bei `cameo` zwingend nötig.

## Out of scope

- Keine DB-Migration nötig (Charaktere sind nur im Composer-Sessionstate, nicht in einer Tabelle).
- Frequenz pro Charakter, nicht pro Szene — feiner steuern bleibt manuell über den Charakter-Button pro Szene möglich.
- Re-Generierung: User klickt nach Toggle-Änderung wie bisher auf „Storyboard generieren".

## Geänderte Dateien (Übersicht)

- `src/types/video-composer.ts` — neues Feld `appearanceFrequency`
- `src/components/video-composer/CharacterManager.tsx` — Segmented-Toggle UI + Labels DE/EN/ES
- `src/components/video-composer/CastConsistencyMap.tsx` — Namens-Fallback in `getAnchor`
- `supabase/functions/compose-video-storyboard/index.ts` — Quote pro Charakter, Floor + Cap, Prompt-Hinweis
