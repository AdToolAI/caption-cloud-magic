# Picture Studio Generate: „Die Nutzerabsicht gewinnt"

## Prioritätsregel (wird so im Code kommentiert)

```text
USER INTENT PRIORITY
1. Provider capability / hard technical constraint
2. Explicit user-selected control
3. Explicit prompt instruction
4. Reference/source properties
5. AdTool default

A lower level must never silently override a higher level.
```

## Audit — was heute unsichtbar passiert (im Code belegt)

| Fundstelle | Unsichtbarer Eingriff |
| --- | --- |
| `generate-studio-image/index.ts` (Style-Block) | Hängt **immer** `Style: photorealistic, 8k, ultra-detailed, natural lighting, professional photography. Aspect ratio: X.` an — auch mit Referenzbild und ohne aktive Stilwahl. |
| `generate-image-replicate/index.ts` Z. 258 | Gleiches Muster: `${prompt}. Style: ${styleModifier}` mit Default `style = 'realistic'`. |
| `ImageGenerator.tsx` Z. 132 | Seitenverhältnis startet hart auf `1:1`, auch wenn eine Vorlage hochgeladen wird. |
| `ImageGenerator.tsx` Z. 146 + 327–337 | `strength = 70` als versteckter Default; daraus wird ein Prompt-Satz („Use the reference image as loose inspiration only") erzeugt. Der Regler ist aber nur sichtbar, wenn `capability.strengthField` existiert (nur FLUX, Qwen). |
| `generate-image-replicate` Z. 372/387 | Nur FLUX (`image_prompt_strength`) und Qwen (`strength`) haben ein echtes natives Feld; alle anderen bekommen ausschließlich Prompt-Sprache. |
| beide Functions | `--negative` / `--no` gehen unverändert als Prompttext an den Provider. |
| beide Functions | Freisteller-Wünsche werden still ignoriert; kein Generate-Modell liefert Alpha. |

## Zielarchitektur

```text
User Prompt + Referenzen + explizite UI-Settings
        ↓
shared/picture/modelCapabilities.ts   (pure TypeScript)
        ↓
shared/picture/promptBuilder.ts
   → { rawPrompt, finalPrompt, negativePrompt,
       providerParams, appliedModifiers, warnings }
        ↓
Provider Adapter → Request
```

### Runtime-neutrale Shared-Schicht

Neues Verzeichnis `shared/picture/` mit `promptTypes.ts`, `modelCapabilities.ts`,
`promptBuilder.ts`. Ausschließlich pures TypeScript — kein Supabase-Client,
kein `Deno.env`, kein React/DOM, keine Secrets, keine Provider-Calls.
React-Client und Edge Functions importieren beide von dort; der bisherige
Cross-Import aus `supabase/functions/_shared/…` in den Frontend-Code entfällt.
Falls sich `shared/` nicht sauber von beiden Runtimes auflösen lässt, bleibt es
bei zwei Repräsentationen mit striktem Paritätstest — aber die Regeln existieren
inhaltlich nur einmal.

## 1. Capability Registry erweitern

Pro Modell zusätzlich:

- `nativeReferenceStrength: { field, min, max, presets: { close, balanced, creative } } | null`
  — **die Zahlen gehören zum Modell**, nicht zur UI. Bei FLUX bedeutet ein hoher
  `image_prompt_strength` mehr Referenztreue, bei Qwen ist `strength` umgekehrt;
  jedes Modell definiert sein eigenes Mapping, die UI-Begriffe bleiben identisch.
- `negativePrompt: { field } | null`
- `transparentOutput: boolean`
- `imageEditing: boolean` (echte Bearbeitung vs. reiner Referenzeinfluss)
- `sourceAspectRatio: boolean`

Bestehende Felder (Referenzlimits, Modi, Sizing, Preislogik) bleiben unverändert.

## 2. Prompt Builder

Regeln:

- **Style = Auto** → gar kein Style-Suffix; der Prompt entscheidet.
- **Style = Keep Original** → eigener, davon getrennter Wert: kurze Anweisung,
  den Stil der Referenz zu erhalten. Widerspricht der Prompt ausdrücklich
  („turn this into a watercolor"), ist das ein Konflikt.
- **Default bei Referenzbild = Auto** (nicht Keep Original).
- `aspectRatio = 'source'` → kein Ratio-Text; Quellformat als Provider-Parameter,
  wo unterstützt, sonst sichtbarer Hinweis. Nie automatisch 1:1.
- Reference Influence Close/Balanced/Creative:
  - Modell mit `nativeReferenceStrength` → Preset aus der Registry in `providerParams`, **kein** Prompt-Satz, `reference_influence_method = native`.
  - Modell ohne natives Feld → genau ein kurzer, im Advanced-Panel sichtbarer Leitsatz, `method = prompt_guided`.
  - Ohne Referenz → `none`, kein Zusatz.
- `sanitizePrompt()` entfernt nur eindeutige `--negative …` / `--no …`-Flags am
  Segmentanfang bis Zeilenende; Inhalt wandert in das Negativ-Feld, wenn das
  Modell eines hat, sonst Warnung `unsupported_syntax`.
- **Konservative** Erkennung, precision vor recall:
  `style_conflict` nur bei eindeutigen Stilformulierungen („in watercolor style",
  „make it a watercolor", „painted in", „turn this into an illustration",
  „photorealistic image") — nie bei „a watercolor-blue dress". Im Zweifel keine Warnung.
  Ebenso `edit_intent`, `background_intent`, `transparent_unsupported`.

## 3. UI: Generate mit Referenzbild

Sichtbar, in dieser Reihenfolge:

```text
Reference        [Bild]
Prompt           …
Model            Nano Banana 2 — Recommended for reference images
Reference Influence   Close · Balanced · Creative
Style            Auto
Format           Source
[ Generate ]
Reference Images · Brand Kit · Advanced
```

- Sobald eine Referenz da ist: Style = **Auto**, Format = **Source**,
  Influence = **Balanced** — sichtbar gesetzt, nicht versteckt.
- Influence-Erklärtexte: Close „Stay close to the reference image",
  Balanced „Preserve key elements while allowing changes",
  Creative „Use the reference more loosely"; Tooltip: „Close preserves
  composition, subjects and visual identity more strongly."
- Der numerische Strength-Slider verschwindet aus der Hauptansicht (bleibt für
  Modelle mit nativem Feld unter Advanced als Feinregler).
- Konflikt-Warnung als kleine Inline-Karte mit „Use prompt" / „Keep <Style>".
  Keine automatische Entscheidung, keine Warnungsflut.
- Advanced → **Prompt Details**: Your prompt, AdTool additions, Negative prompt,
  Reference Influence (inkl. native/prompt-guided), Style, Format, Model,
  Sent to model.
- Alle Texte EN/DE/ES.

## 4. Transparenz & Edit-Intent

- Freisteller-Wunsch + Modell ohne Alpha → „This model cannot generate a true
  transparent background." plus Angebot **Generate + Remove Background** als ein
  Ablauf. Vorher Kostenaufstellung aus der bestehenden Preis-Engine
  (Generierung + Freisteller + Summe), Bestätigung nötig. Lässt sich die Kette
  nicht sauber verdrahten, wird nur „Continue in Background" angeboten.
- Edit-/Background-Intent → Empfehlungskarte
  „This looks like an edit — Edit can preserve the original more precisely."
  mit „Switch to Edit"/„Switch to Background" und „Generate anyway".
  Bild, Prompt und Format wandern mit; nie erzwungen.

## 5. Modell-Empfehlung

Aus Capabilities + Registry, rein lokal, kein LLM-Aufruf. Echter Modellname
sichtbar, nur aktivierte Modelle, alle anderen bleiben wählbar.

## 6. Metadaten je Run (`metadata_json`, keine neue Tabelle)

`raw_prompt`, `final_prompt`, `negative_prompt`, `style`, `aspect_ratio`,
`reference_mode`, `reference_influence`, `reference_influence_method`
(`native` | `prompt_guided` | `none`), `model_used`, `prompt_builder_version`,
`applied_modifiers`, `warnings`, `provider_parameters_summary`
(nur Modellparameter, keine Secrets).

## 7. Tests

- Matrix-Tests: Style Auto ohne Suffix · expliziter Stil wird angewendet ·
  Keep Original vs. widersprechender Prompt · Source statt 1:1 · explizites 9:16 ·
  watercolor mit/ohne Konflikt · „watercolor-blue dress" erzeugt **keine** Warnung ·
  kein verstecktes Strength · native vs. prompt-guided Influence ·
  `--negative` supported/unsupported · Transparenz supported/unsupported ·
  Edit-Intent vs. normale Referenzgenerierung.
- **Golden-/Snapshot-Tests** pro Referenzmodell (Gemini, Seedream, Nano Banana,
  FLUX, Qwen — soweit in der Registry aktiv): feste Eingaben, exakt erwartete
  Ausgabe (style modifier NONE, ratio suffix NONE, native strength, prompt
  guidance, warnings). Damit fällt jeder künftig eingeschleuste Universal-Suffix
  sofort auf.
- Paritätstest Client/Server der Capability-Daten.

## 8. Betroffene Dateien

- neu: `shared/picture/promptTypes.ts`, `shared/picture/modelCapabilities.ts`,
  `shared/picture/promptBuilder.ts`, Tests inkl. Golden-Snapshots
- geändert: `supabase/functions/_shared/pictureModelCapabilities.ts` (wird zur
  dünnen Re-Export-Schicht), `src/config/pictureModelCapabilities.ts`,
  `generate-studio-image/index.ts`, `generate-image-replicate/index.ts`,
  `src/components/picture-studio/ImageGenerator.tsx`,
  `imageGeneratorCache.ts`, i18n-Texte
- unberührt: Wallet/Credits, Preis-Engine, Enhance (Topaz/Clarity),
  Auto Collections, Media-Library-Persistenz, Video, Lip-Sync.

## 9. Abnahme

Danach liefere ich den 10-Punkte-Bericht: bisherige unsichtbare Modifier,
Änderungen, Capability-Matrix, UI je Modell, erkannte Konfliktfälle,
unterstützte/nicht unterstützte Prompt-Syntax, geänderte Dateien, neue Tests,
exakte Test-/Typecheck-/Build-Ausgaben, offene Einschränkungen pro Modell.
