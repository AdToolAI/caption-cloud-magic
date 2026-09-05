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
| `generate-studio-image/index.ts` (Style-Block) | Hängt **immer** `Style: photorealistic, 8k, ultra-detailed, natural lighting, professional photography. Aspect ratio: X.` an — auch ohne aktive Stilwahl. |
| `generate-image-replicate/index.ts` Z. 258 | Gleiches Muster: `${prompt}. Style: ${styleModifier}` mit Default `style = 'realistic'`. |
| `ImageGenerator.tsx` Z. 132 | Seitenverhältnis startet hart auf `1:1`, auch mit Vorlage. |
| `ImageGenerator.tsx` Z. 146 + 327–337 | Verstecktes `strength = 70` erzeugt einen Prompt-Satz; der Regler ist nur bei `capability.strengthField` sichtbar (FLUX, Qwen). |
| `generate-image-replicate` Z. 372/387 | Nur FLUX (`image_prompt_strength`) und Qwen (`strength`) haben ein natives Feld. |
| beide Functions | `--negative` / `--no` gehen unverändert als Prompttext an den Provider. |
| beide Functions | Freisteller-Wünsche werden still ignoriert. |

## Zielarchitektur

```text
User Intent (Prompt + Referenzen + explizite Controls)
        ↓
shared/picture/modelCapabilities.ts   (pure TypeScript)
        ↓
shared/picture/promptBuilder.ts
        ↓
Normalized Picture Request (provider-neutral)
        ↓
Provider Adapter  → Gemini / Replicate / …
```

Der Prompt Builder gibt **keine** Provider-Feldnamen zurück, sondern semantische
Konfiguration, z. B. `referenceInfluence: { mode: 'close', method: 'native', value: 0.85 }`.
Erst der Adapter macht daraus `image_prompt_strength` bzw. `strength`.

### Runtime-neutrale Shared-Schicht

Neues Verzeichnis `shared/picture/` (`promptTypes.ts`, `modelCapabilities.ts`,
`promptBuilder.ts`) mit ausschließlich purem TypeScript — kein Supabase-Client,
kein `Deno.env`, kein React/DOM, keine Secrets, keine Provider-Calls. Client und
Edge Functions importieren von dort; der Frontend-Import aus
`supabase/functions/_shared/…` entfällt. Falls sich `shared/` nicht sauber von
beiden Runtimes auflösen lässt, bleiben zwei Repräsentationen mit striktem
Paritätstest — die Regeln existieren inhaltlich aber nur einmal.

## 1. Capability Registry erweitern

Pro Modell zusätzlich:

- `nativeReferenceStrength: { field, min, max, presets: { close, balanced, creative } } | null`
  — **Zahlen und Richtung gehören zum Modell.** Die Polarität wird nicht
  angenommen, sondern pro Modell am tatsächlich angebundenen Provider-Schema /
  der bestehenden Implementierung verifiziert und mit einem eigenen Test auf
  genau diese Mapping-Richtung festgenagelt.
- `negativePrompt: { field } | null`
- `transparentOutput: boolean`
- `imageEditing: boolean`
- `sourceAspectRatio: 'native' | 'exact-size' | 'nearest' | 'none'`

Referenzlimits, Modi, Sizing und Preislogik bleiben unverändert.

## 2. Prompt Builder

- **Style = Auto** → gar kein Style-Suffix; der Prompt entscheidet.
  Diese Regel gilt **generell**, nicht nur mit Referenzbild: solange der Nutzer
  keinen Stil gewählt hat, wird kein kreativer Stil-Zusatz erzeugt.
- **Style = Keep Original** → eigener Wert mit kurzer Anweisung, den Stil der
  Referenz zu erhalten; widersprechender Prompt = Konflikt.
- `aspectRatio = 'source'` — transparente Best-Effort-Kette, nie stilles 1:1:
  1. nativ unterstützt → Source verwenden
  2. nicht nativ, aber W×H steuerbar → Quellratio in gültige Zielmaße übersetzen
  3. nur feste Ratios → nächstliegendes automatisch wählen und klein unter dem
     Format-Feld anzeigen: „Source ratio 1.43:1 → using closest supported 4:3"
     mit „Change". Kein Blockierdialog.
  4. nur bei großer Abweichung oder keiner sinnvollen Erhaltung → deutliche
     Warnung, der Nutzer entscheidet
- Reference Influence Close/Balanced/Creative:
  - Modell mit nativem Feld → Preset aus der Registry, `method = native`, kein Prompt-Satz
  - sonst → ein kurzer, unter Prompt Details sichtbarer Leitsatz, `method = prompt_guided`
  - ohne Referenz → `none`
- **Modellwechsel:** semantische Absicht überlebt (Prompt, Close/Balanced/Creative,
  Style, gewünschtes Format, Referenzen), provider-spezifische Werte nicht. Ein bei
  FLUX gesetzter Zahlenwert wird beim Wechsel zu Qwen verworfen und aus `close`
  neu berechnet. Nach jedem Wechsel werden Capabilities neu ausgewertet und der
  normalisierte Request neu gebaut.
- `sanitizePrompt()`: konservativ, kein Regex-Monster. Nur eindeutige
  `--negative …` / `--no …`-Flags am Segment-/Zeilenanfang; Inhalt in das
  Negativ-Feld, falls vorhanden, sonst Warnung `unsupported_syntax`.
  Text in Anführungszeichen (z. B. `a sign saying "--no parking"`) bleibt unberührt.
- Konservative Erkennung (precision vor recall) für `style_conflict`,
  `edit_intent`, `background_intent`, `transparent_unsupported`. Nur eindeutige
  Stilformulierungen („in watercolor style", „turn this into an illustration"),
  nie „a watercolor-blue dress". Im Zweifel keine Warnung.

## 3. UI: Generate mit Referenzbild

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

- Defaults beim Hinzufügen einer Referenz **nur für unberührte Werte**:
  `styleTouched === false` → Auto, `aspectRatioTouched === false` → Source,
  `influenceTouched === false` → Balanced. Eine bewusst gewählte Einstellung
  (z. B. Cinematic + 9:16) wird nie zurückgesetzt.
- Influence-Erklärungen: Close „Stay close to the reference image", Balanced
  „Preserve key elements while allowing changes", Creative „Use the reference
  more loosely"; Tooltip: „Close preserves composition, subjects and visual
  identity more strongly." **Kein** native/prompt-guided-Hinweis in der Hauptansicht.
- Numerischer Strength-Slider verschwindet aus der Hauptansicht (bleibt für
  Modelle mit nativem Feld unter Advanced).
- Konflikt-Karte mit „Use prompt" / „Keep <Style>", keine Automatik.
- Kontextabhängige „AdTool adjusted"-Hinweise, nur wenn sie zutreffen:
  „Format adjusted — this model doesn't support the exact source ratio. Using 4:3.",
  „Negative prompt unavailable — this model has no separate negative prompt.",
  „Reference influence is prompt-guided — this model has no native
  reference-strength control."
- Style-Tooltip: „Auto — your prompt determines the visual style." Auto heißt
  ausdrücklich: AdTool fügt **keine** kreative Stilvorgabe hinzu (nicht: AdTool
  sucht einen Stil aus).
- Advanced → **Prompt Details**: Your prompt · AdTool additions · Negative prompt ·
  Reference Influence + Method · Style · Format · Model · Sent to model.
- Alle Texte EN/DE/ES.

## 4. Transparenz & Edit-Intent

- Freisteller-Wunsch + Modell ohne Alpha → sichtbarer Hinweis „This model cannot
  generate a true transparent background." **V1: nur „Continue in Background"**
  (Ergebnis wandert mit ins Background-Tool).
  **V2: „Generate + Remove Background"** als Composite Job — wird erst
  freigeschaltet, wenn Teilfehler sauber orchestriert sind:
  Generation scheitert → kein Background-Schritt, bestehende Refund-Logik;
  Generation ok, Background scheitert → nur der Background-Anteil wird
  freigegeben, das generierte Bild bleibt nutzbar in der Mediathek, die
  Generation wird **nie** erneut gestartet. Vorab sichtbare Kostenaufstellung
  (Generierung + Freisteller + Summe) aus der bestehenden Preis-Engine.
- Edit-/Background-Intent → Empfehlungskarte „This looks like an edit — Edit can
  preserve the original more precisely." mit „Switch to Edit"/„Switch to
  Background" und „Generate anyway". Bild, Prompt und Format wandern mit.

## 5. Modell-Empfehlung

Rein lokal aus Capabilities, kein LLM-Aufruf, echte Modellnamen, nur aktivierte
Modelle, alle anderen bleiben wählbar.

## 6. Metadaten je Run (`metadata_json`, keine neue Tabelle)

`raw_prompt`, `final_prompt`, `negative_prompt`, `style`, `aspect_ratio`,
`reference_mode`, `reference_influence`, `reference_influence_method`
(`native` | `prompt_guided` | `none`), `model_used`, `prompt_builder_version`,
`applied_modifiers`, `warnings`, `provider_parameters_summary` (keine Secrets).

## 7. Tests

- **Invariant-Test über alle aktiven referenzfähigen Modelle:**

```text
No active model may receive a creative/style/ratio/reference modifier
that is not represented by visible UI state or an explicit user instruction.

With reference image:
- Style Auto  -> no style modifier
- Source      -> no silent forced ratio
- Balanced    -> native or prompt-guided influence MAY be applied,
                 because Balanced is visibly selected
- No hidden legacy strength/default outside this visible state
```

- **Golden-/Snapshot-Tests** pro Modell (Gemini, Seedream, Nano Banana, FLUX,
  Qwen — soweit aktiv): feste Eingaben, exakt erwartete Ausgabe plus Snapshot des
  normalisierten Requests.
- Mapping-Richtungstest je Modell mit nativem Strength-Feld.
- Modellwechsel-Test: FLUX + Close → Wechsel zu Qwen → semantischer Modus bleibt
  `close`, der Qwen-Wert wird neu berechnet, der FLUX-Zahlenwert wird **nicht**
  wiederverwendet.
- Matrix: Style Auto ohne Suffix · expliziter Stil · Keep Original vs.
  widersprechender Prompt · Source-Fallback-Stufen (nie 1:1) · explizites 9:16 ·
  „watercolor-blue dress" ohne Warnung · kein verstecktes Strength ·
  native vs. prompt-guided · `--negative`/`--no` in drei Formen inkl.
  `a sign saying "--no parking"` · Transparenz supported/unsupported ·
  Edit-Intent vs. normale Referenzgenerierung · Referenz-Upload setzt bewusste
  Auswahl nicht zurück.
- Paritätstest der Capability-Daten.

## 8. Betroffene Dateien

- neu: `shared/picture/promptTypes.ts`, `shared/picture/modelCapabilities.ts`,
  `shared/picture/promptBuilder.ts`, Tests inkl. Golden-Snapshots
- geändert: `supabase/functions/_shared/pictureModelCapabilities.ts` (dünne
  Re-Export-Schicht), `src/config/pictureModelCapabilities.ts`,
  `generate-studio-image/index.ts`, `generate-image-replicate/index.ts`,
  `src/components/picture-studio/ImageGenerator.tsx`, `imageGeneratorCache.ts`,
  i18n-Texte
- unberührt: Preisformel, Enhance (Topaz/Clarity), Auto Collections,
  Media-Library-Persistenz, Video, Lip-Sync. Wallet-Logik bleibt inhaltlich
  unverändert; ein zweistufiger Job kommt erst in V2 und nur vollständig orchestriert.

## 9. Abnahme

10-Punkte-Bericht: bisherige unsichtbare Modifier, Änderungen, Capability-Matrix,
UI je Modell, erkannte Konfliktfälle, unterstützte/nicht unterstützte
Prompt-Syntax, geänderte Dateien, neue Tests, exakte Test-/Typecheck-/Build-
Ausgaben, offene Einschränkungen pro Modell.

**Punkt 11 — Model-switch behavior** für Gemini, Seedream, Nano Banana, FLUX und
Qwen: welche Nutzerwerte bleiben erhalten, welche Providerwerte werden neu
berechnet, welche Einstellungen unterstützt das neue Modell nicht, wie wird das
angezeigt, und der Nachweis, dass kein alter Providerparameter weiterverwendet wird.
