## Root Cause

In `supabase/functions/compose-scene-anchor/index.ts` passieren zwei Dinge, die per-Charakter-Aktionen (z. B. „Matthew telefoniert im Hintergrund") **vollständig auslöschen**, bevor das Bild gerendert wird:

### 1. Dialog-Stripper killt `[CastActions]`-Bullets (Zeilen 114–149)

Der `stripSpokenDialog`-Helper entfernt unter anderem:

```text
.replace(/^\s*[-*•]\s*[\p{L}][\p{L}\s.'\-]{0,60}\s*:\s.*$/gmu, "")
.replace(/^[\p{Lu}][\p{L}\s'\-]{0,40}\s*[:\-—]\s.*$/gmu, "")
```

Das matcht **exakt** die Zeile aus dem Screenshot:

```text
- Matthew Dusatko: Matthew is making a phone call in the background.
```

→ Die Bullet wird komplett gelöscht. Übrig bleibt nur der generische `[SceneAction]`-Satz „Close-up of the struggle of managing multiple platforms and content creation manually." Damit erfährt Nano Banana 2 **nie**, dass Matthew etwas anderes tun soll als Sarah.

### 2. `TWO_SHOT_FRAMING_SUFFIX` erzwingt symmetrische Platzierung (Zeilen 233–238)

Selbst wenn die Action ankäme, würde diese harte Regel sie überstimmen:

```text
MANDATORY TWO-SHOT FRAMING: a wide N-shot where ALL N characters are fully
visible in the SAME frame at roughly EQUAL screen share. Each face must be
unobstructed, front-3/4 to camera, with clear separation between subjects
(no occlusion, no overlap of heads). NEVER produce a single-character
close-up […]. Position the subjects left/right or in a slight arc […].
AVOID: […] background crowd […].
```

„Equal screen share" + „no background" widerspricht direkt „Matthew im Hintergrund am Telefon". Diese Regel war für Multi-Speaker-Lip-Sync gedacht (alle Gesichter müssen erkennbar sein), schießt aber bei asymmetrischen Szenen über.

## Plan

1. **Cast-Action-Bullets vor dem Strippen extrahieren** (`compose-scene-anchor`)
   - Vor `stripSpokenDialog` einen neuen Helper `extractCastActions(rawPrompt)` einbauen, der den `[CastActions]`-Block parst, alle „- Name: action"-Zeilen einliest und sie als strukturierte Liste `{ name, action }[]` zurückgibt.
   - Den `[CastActions]`-Block dann **bewusst** aus dem Prompt entfernen (damit die generischen Stripper-Regeln nicht greifen), aber die geparste Liste behalten.
   - Bestehende Logik für `[Dialog]`-Blöcke und freie Anführungszeichen bleibt unverändert (verhindert weiterhin Burned-in-Captions).

2. **Cast-Actions als eigene, geschützte Klausel injizieren**
   - Neuer Block `CHARACTER ACTIONS — each reference person does EXACTLY this in the frame:` mit einer Zeile pro Charakter, wenn `castActions.length > 0`.
   - Die Klausel wird **nach** `nameClause` und **vor** `TWO_SHOT_FRAMING_SUFFIX` in `editInstruction` eingefügt, mit explizitem Hinweis: „Spatial placement and activity per character override the default symmetric framing below."

3. **Two-Shot-Framing kontextabhängig aufweichen**
   - Wenn `castActions` mindestens einen Charakter mit asymmetrischer Platzierung/Aktivität enthält (Heuristik: Wort-Match auf `background|foreground|phone|standing|walking|leaning|distance|behind|away from|aside`), wird `TWO_SHOT_FRAMING_SUFFIX` durch eine weichere Variante ersetzt:
     - „All N reference people must be clearly visible and individually recognizable in the same frame. Screen share may be unequal per the character actions above (foreground/background, primary/secondary). Each face must still be unobstructed enough that a face detector can locate N distinct faces."
   - `TWO_SHOT_NEGATIVE` verliert in diesem Fall die Klauseln „background crowd" und „extra bystander" (die echten Hintergrund-Aktionen würde sie sonst verbieten); „back of head", „face hidden", „occluded" bleiben, damit Lip-Sync weiterhin funktioniert.
   - `EXACT_COUNT_SUFFIX` (genaue Personenzahl, keine Duplikate, keine Extras) bleibt **unverändert** — das ist orthogonal zur Platzierung.

4. **Cache-Key bumpen**
   - In Zeile 173 `v13|…` auf `v14|…` erhöhen und `castActions`-Signatur (sortierte `name:action`-Hashes) mit aufnehmen. Sonst liefert der Cache alte symmetrische Frames zurück, obwohl die neue Logik aktiv ist.

5. **Logging**
   - Beim Anwenden der weichen Variante einmal loggen: `[compose-scene-anchor] asymmetric cast actions detected → relaxed two-shot framing (scene=…)` plus die Anzahl extrahierter Cast-Actions. Erleichtert spätere Verifikation in den Edge-Logs.

## Technische Details

**Betroffene Datei:** `supabase/functions/compose-scene-anchor/index.ts` (einzige Änderung).

**Nicht betroffen:**
- `compose-video-clips` (Hailuo i2v) — bekommt weiterhin den vollen Prompt inkl. `[CastActions]`; die Verbesserung greift, weil der Anchor-Frame jetzt schon Matthew im Hintergrund am Telefon zeigt und i2v die Pose 1:1 übernimmt.
- Storyboard-Generator, BriefingTab, applyActionsToPrompt — die letzte Iteration bleibt aktiv.
- Lip-Sync-Pipeline (v69/v76) — `EXACT_COUNT_SUFFIX` + „N distinct faces"-Anforderung bleiben, damit Face-Detection und Per-Speaker-Preclips weiter zuverlässig N Gesichter finden.

**Verifikation nach Implementation:**
- Neue Szene mit „Matthew telefoniert im Hintergrund" → neuer Anchor-Frame muss Matthew sichtbar hinten am Telefon und Sarah vorne am Laptop zeigen.
- Edge-Log `[compose-scene-anchor] asymmetric cast actions detected` muss erscheinen.
- Bestehende symmetrische Szenen (zwei Charaktere am Tisch, beide reden in Kamera) dürfen optisch unverändert sein, weil ihre Cast-Actions kein asymmetrisches Keyword enthalten.
