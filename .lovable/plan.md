

## Befund

Der User hat eine **clevere Idee**: Statt zu versuchen, die KI zu zwingen, in allen 7 Szenen exakt das gleiche Gesicht zu zeigen (technisch unmöglich), nutzt man **Storytelling-Tricks**, um dem **Zuschauer den Eindruck** von Kontinuität zu vermitteln. Das ist genau, wie echte Filmregisseure mit Stand-Ins, Maskenwechseln oder Doppelgängern arbeiten — und es funktioniert mit txt2video sogar **besser** als der Brute-Force-Ansatz.

## Die Tricks im Detail

### 1) Verteilung statt Wiederholung
Nicht jede Szene zeigt den Charakter direkt. Bei 7 Szenen z. B.:
- **Szene 1:** Voller Charakter (Establishing Shot — setzt das Bild im Kopf)
- **Szene 2:** Nur Hände/Detail (Sword-Closeup)
- **Szene 3:** Rückenansicht / über die Schulter
- **Szene 4:** POV (was er sieht — Charakter unsichtbar)
- **Szene 5:** Silhouette / Gegenlicht
- **Szene 6:** Halbtotale aus Distanz
- **Szene 7:** Closeup Augen oder Reaction-Shot

→ Nur **2-3 von 7 Szenen** zeigen das volle Gesicht. Der Rest nutzt **Identifikatoren** (Krone, Mantel, Schwert), die die KI zuverlässig wiederholen kann.

### 2) Konsistenz-Anker statt Gesicht
Die KI ist **schlecht bei Gesichtern**, aber **exzellent bei Objekten/Kleidung**. Wenn in jeder Szene erscheint:
> *"crimson tunic with golden lion crest, fur-lined cloak, golden crown with red rubies"*

…erkennt der Zuschauer „den König" auch wenn das Gesicht leicht anders ist. Das ist der **Sherlock-Holmes-Effekt** (Pfeife + Mütze = Sherlock, egal welcher Schauspieler).

### 3) Kamera-Variation als Feature
Genau wie der User vorschlägt: **„aus einem anderen Winkel"** entlastet die KI. Wenn Szene 2 ein Side-Profile aus 30 m Distanz ist, fällt eine kleine Gesichtsabweichung gar nicht auf — der Zuschauer denkt automatisch „klar, anderer Blickwinkel".

## Plan: Smart Character Consistency v2

Aufbauend auf dem vorherigen Plan (Character Profiles im Briefing) — aber mit einer **intelligenteren Storyboard-Strategie**:

### 1) Character Profile bleibt wie geplant
`characters[]` in `ComposerBriefing` mit **zwei** statt einem Beschreibungsfeld:
```typescript
{
  id, name,
  appearance: string;     // Gesicht/Körper (selten verwendet)
  signatureItems: string; // Kleidung/Objekte (in JEDER Szene wiederholt)
}
```
Beispiel Richard Löwenherz:
- `appearance`: *"tall man late 30s, long auburn red hair, full beard, blue eyes"*
- `signatureItems`: *"crimson tunic with golden lion crest, fur-lined cloak, golden crown with red rubies, ornate longsword"*

### 2) Smart Shot Variation Strategy im Storyboard-Prompt
`compose-video-storyboard/index.ts` bekommt eine neue System-Anweisung wenn Charaktere definiert sind:

> *„For the named character(s) below, **vary the shot composition across scenes** to create a sense of continuity without overusing facial close-ups. Use this distribution as a guideline:*
> - *1-2 scenes: Full character visible (establishing/hero shots) — include `appearance` + `signatureItems`*
> - *2-3 scenes: Indirect views (back, profile, silhouette, hands, POV, distant figure) — include only `signatureItems`*
> - *1-2 scenes: Detail shots (eyes, hands holding object, feet walking) — include only the relevant body part + 1 signature item*
> - *Remaining scenes: Environment/object focus (no character) — include 1 signature item if naturally present*
>
> *Always include `signatureItems` verbatim when the character or any part of them is visible. This creates visual continuity without forcing the AI to recreate the exact same face."*

### 3) Per-Scene `characterShot` Feld
Storyboard-JSON bekommt pro Szene ein neues Optional-Feld:
```typescript
characterShot?: {
  characterId: string;
  shotType: 'full' | 'profile' | 'back' | 'detail' | 'pov' | 'silhouette' | 'absent';
}
```
→ User sieht im Storyboard-Tab, welche Szene welche Strategie nutzt, und kann manuell umverteilen.

### 4) UI-Visualisierung im StoryboardTab
Pro Szene kleines Icon-Badge:
- 👤 Full Shot
- 🚶 Back/Profile
- ✋ Detail
- 👁 POV
- 🌅 Silhouette
- — Absent

Plus Tooltip: *„Strategie: weniger Gesichts-Closeups → konsistentere Charakter-Wahrnehmung"*

### 5) Briefing-Hinweisbox
In der „Charaktere"-Karte ein dezenter Tipp:
> 💡 *„Pro-Tipp: Beschreibe **markante Kleidung & Objekte** ausführlich (Mantel, Krone, Waffe). Die KI wiederholt diese zuverlässiger als Gesichter — der Zuschauer erkennt die Person daran. Die KI variiert automatisch Kamerawinkel, damit nicht jede Szene ein Closeup ist."*

## Was der User bekommt

| Aspekt | Vorher (naiv) | Mit Smart Strategy |
|---|---|---|
| Gesicht in 7/7 Szenen | KI variiert stark — Bruch sichtbar | KI zeigt Gesicht nur 2-3× — kaum auffällig |
| Kleidung/Krone/Schwert | Variiert ebenfalls | **Konsistent** durch `signatureItems`-Repeat |
| Wahrnehmung „gleiche Person" | ❌ Nein | ✅ **Ja** (Sherlock-Effekt) |
| Pixel-perfect Gesicht | Nein | Nein (technisch unmöglich) |
| Cineastische Bildsprache | Monoton (Closeups) | **Vielfältig** (Pro-Look) |

## Betroffene Dateien

- `src/types/video-composer.ts` — `characters[]` mit `appearance` + `signatureItems`, `characterShot` pro Scene
- `src/components/video-composer/BriefingTab.tsx` — Character-Manager mit zwei Feldern + Pro-Tipp-Box
- `src/components/video-composer/StoryboardTab.tsx` — Shot-Type Badges pro Szene
- `src/components/video-composer/SceneCard.tsx` — optional: Shot-Type-Selector zum manuellen Override
- `supabase/functions/compose-video-storyboard/index.ts` — Smart Shot Variation Strategy + JSON-Schema-Erweiterung
- `supabase/functions/compose-video-clips/index.ts` — `enrichPrompt` injiziert je nach `shotType` nur `appearance` und/oder `signatureItems`

## Bonus (später, optional)
Ein „Konsistenz-Score" (0-100%) im Storyboard-Tab, der berechnet wie gut die Verteilung balanciert ist (z. B. „⚠️ 6/7 Szenen sind Closeups — empfehle Distribution") + One-Click „Auto-Balance".

