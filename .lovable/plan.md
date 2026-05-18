# Burned-in Dialog-Captions im Two-Shot fixen

## Problem
Im neuen Two-Shot-Render werden die Voiceover-Sätze als **echte Pixel** in die Szene gerendert (auf T-Shirts / als Captions sichtbar). Das ist kein Subtitle-Overlay aus Director's Cut — der Text steckt im Master-Clip selbst.

## Ursache
`SceneDialogStudio.tsx` (Zeile 945 + 998) baut den `dialogScriptText` als

```
Alex: Das ist ein Traum!
Ben: Absolut. Der Weinberg ist wunderschön.
```

und übergibt ihn als **visuellen Prompt** an `compose-scene-anchor`, wenn `scene.aiPrompt` leer ist:

```
scene.aiPrompt || dialogScriptText
```

Nano Banana 2 interpretiert die Anführungs-/Doppelpunkt-Struktur als Render-Auftrag und schreibt die Sätze als Text in das First-Frame-Bild. Hailuo i2v übernimmt das Bild und animiert es — der Text bleibt eingebrannt.

Der Anchor-Prompt enthält zwar bereits `no text, no captions, no watermark`, das wird aber von der expliziten Speech-Notation überstimmt. In `ClipsTab.tsx` (Zeilen 588, 747, 919) gibt es dieselben Aufrufe — die müssen ebenfalls geprüft werden, falls dort dialogartige Texte als Prompt fließen.

## Lösung (2 Layer)

### Layer 1 — Client: nie das Skript als Visual-Prompt benutzen
In `SceneDialogStudio.tsx`:
- Neuen Helper `buildVisualSceneDescription(scene, characters)` einführen, der eine rein **visuelle** Beschreibung liefert (Setting, Anzahl/Position der Charaktere, Stimmung), **ohne** jegliche Dialogzeilen.
- Aufrufe an `prepareSceneAnchor` und `compose-twoshot-lipsync` nicht mehr mit `dialogScriptText` als Fallback füttern — stattdessen `scene.aiPrompt || buildVisualSceneDescription(...)`.
- `dialogScript`-Feld bleibt im Payload (wird ja für TTS gebraucht), nur die **visuellen** Prompts werden bereinigt.

### Layer 2 — Server: defensiver Sanitizer in compose-scene-anchor
Als Safety-Net direkt in `supabase/functions/compose-scene-anchor/index.ts`:
- Vor dem Prompt-Build `scenePrompt` durch `stripSpokenDialog()` schicken:
  - Zeilen, die dem Muster `^[A-ZÄÖÜ][\w\s]{0,30}:\s` folgen, droppen
  - Inhalte in geraden/typographischen Quotes (`"..."`, `„…"`, `«…»`) droppen
  - Mehrfach-Linebreaks normalisieren
- Negativ-Suffix verstärken:
  > `Absolutely NO rendered text, NO captions, NO subtitles, NO speech bubbles, NO words on clothing, NO signs, NO watermarks. The image must contain zero typography.`

### Layer 3 — Cache-Invalidate
`promptHash` in `compose-scene-anchor` von `v4|…` auf `v5|…` heben, damit alte Anchor-Bilder mit eingebranntem Text **nicht** aus dem Cache zurückkommen. Bereits gerenderte Szenen mit `superseded: true` werden ohnehin neu gebaut, sobald der User Lipsync re-triggert.

## Files
- `src/components/video-composer/SceneDialogStudio.tsx` — Helper + 2 Anchor-Aufrufe
- `src/components/video-composer/ClipsTab.tsx` — gleiche Fallback-Hygiene an Zeilen 588 / 747 / 919 prüfen und ggf. fixen
- `supabase/functions/compose-scene-anchor/index.ts` — `stripSpokenDialog`, Prompt-Suffix, `promptHash`-Bump
- `mem/architecture/lipsync/sync-so-pro-model-policy` — Notiz: "Dialogskript niemals als Visual-Prompt, Anchor sanitized Speech-Patterns serverseitig"

## Verifikation
1. Bestehende Szene neu rendern → Anchor-Bild darf keinerlei Text mehr enthalten.
2. Lipsync-Pass starten → Master-Clip ist textfrei, nur Lippen bewegen sich korrekt für beide Speaker (das funktioniert ja schon).
3. Edge-Function-Log prüfen: `stripSpokenDialog` Treffer sollten geloggt werden (für Debug).

## Nicht-Ziele
- Keine Änderung an der Audio-Pipeline oder Face-Targeting — die funktionieren bereits.
- Keine Änderung an Director's-Cut-Subtitle-Overlays (separates System, hier nicht betroffen).
