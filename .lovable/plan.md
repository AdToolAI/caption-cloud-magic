# Picture Studio Generate: „Die Nutzerabsicht gewinnt"

## Audit — was heute unsichtbar passiert (im Code belegt)

| Fundstelle | Unsichtbarer Eingriff |
| --- | --- |
| `generate-studio-image/index.ts` (Style-Block) | Hängt **immer** `Style: photorealistic, 8k, ultra-detailed, natural lighting, professional photography. Aspect ratio: X.` an — auch mit Referenzbild und ohne aktive Stilwahl. |
| `generate-image-replicate/index.ts` Z. 258 | Gleiches Muster: `${prompt}. Style: ${styleModifier}` mit Default `style = 'realistic'`. |
| `ImageGenerator.tsx` Z. 132 | Seitenverhältnis startet hart auf `1:1`, auch wenn eine Vorlage hochgeladen wird. |
| `ImageGenerator.tsx` Z. 146 + 327–337 | `strength = 70` als versteckter Default; daraus wird ein Prompt-Satz („Use the reference image as loose inspiration only") erzeugt. Der Regler ist aber nur sichtbar, wenn `capability.strengthField` existiert (nur FLUX, Qwen). |
| `generate-image-replicate` Z. 372/387 | Nur FLUX (`image_prompt_strength`) und Qwen (`strength`) haben einen echten nativen Parameter; alle anderen bekommen ausschließlich Prompt-Sprache. |
| beide Functions | `--negative` / `--no` werden unverändert als Prompttext an den Provider geschickt. |
| beide Functions | Freisteller-Wünsche werden still ignoriert; kein Modell im Generate-Pfad liefert Alpha. |

## Zielarchitektur

```text
User Prompt + Referenzen + explizite UI-Settings
        ↓
Capability Registry (eine Datei, Client = Server)
        ↓
Prompt Builder  → { rawPrompt, finalPrompt, negativePrompt,
                    providerParams, appliedModifiers, warnings }
        ↓
Provider Adapter → Request
```

Der Client zeigt nur eine Vorschau; der Server baut das Ergebnis mit demselben
Builder autoritativ neu und ignoriert vom Client mitgeschickte fertige Prompts.

## 1. Capability Registry erweitern

`supabase/functions/_shared/pictureModelCapabilities.ts` (Client re-exportiert)
bekommt pro Modell zusätzlich:

- `nativeReferenceStrength` (Feld + Wertebereich, sonst `null`)
- `negativePrompt` (Feld oder `null`)
- `transparentOutput` (bool)
- `imageEditing` (echte Bildbearbeitung vs. nur Referenzeinfluss)
- `sourceAspectRatio` (kann das Modell das Ausgangsformat übernehmen)

Bestehende Felder (Referenzlimits, Modi, Sizing, Preislogik) bleiben unverändert.
Der Paritätstest wird auf die neuen Felder ausgeweitet.

## 2. Prompt Builder (neu, geteilt)

Neue Datei `supabase/functions/_shared/picturePromptBuilder.ts`, vom Client
über `src/config/picturePromptBuilder.ts` re-exportiert. Regeln:

- `style === 'auto'` → **kein** Style-Suffix, kein „photorealistic, 8k …".
- Style-Suffix nur bei aktiv gewähltem Stil ≠ auto.
- `aspectRatio === 'source'` → kein Ratio-Text im Prompt; das Ausgangsformat
  wird — wo unterstützt — als Provider-Parameter gesetzt, sonst Hinweis.
- Reference Influence Close/Balanced/Creative:
  - Modell mit nativem Feld → Zahl in `providerParams` (Close 0.25, Balanced 0.55, Creative 0.85), **kein** Prompt-Satz.
  - Modell ohne natives Feld → genau ein kurzer, im Advanced-Panel sichtbarer Leitsatz. Balanced ohne Referenz erzeugt gar nichts.
- `sanitizePrompt()`: entfernt ausschließlich am Wortanfang stehende `--negative …` / `--no …`-Segmente bis Zeilenende; Inhalt wandert in `negativePrompt`, wenn das Modell ein Feld hat, sonst Warnung `unsupported_syntax`.
- Erkennung + Warnungen: `transparent_unsupported`, `style_conflict`, `edit_intent`, `background_intent`. Konflikt nur, wenn Prompt einen anderen Stil **nennt** und der Nutzer aktiv einen Stil gewählt hat.
- Rückgabe wie gefordert inkl. `appliedModifiers` und `promptBuilderVersion`.

## 3. UI: Generate mit Referenzbild

Sichtbar und in dieser Reihenfolge:
Reference Image(s) · Prompt · Model · Reference Influence (Close/Balanced/Creative) ·
Style (Auto + bestehende Stile) · Format (Source/1:1/4:5/9:16/16:9/…) · Generate.

- Sobald eine Referenz da ist: Style springt auf **Auto**, Format auf **Source**,
  Influence auf **Balanced** — sichtbar, nicht versteckt.
- Influence-Auswahl erscheint für **alle** referenzfähigen Modelle; ein kleiner
  Hinweis sagt, ob sie nativ oder über Formulierung wirkt.
- Der numerische Strength-Slider entfällt aus der Hauptansicht (bleibt für
  FLUX/Qwen unter Advanced als Feinregler).
- Progressive Disclosure: weitere Referenzen, Brand Kit, Advanced.
- Advanced → **Prompt Details**: User Prompt, AdTool Additions, Negative Prompt,
  Final Prompt, Modell, Reference Mode, Format, Style, Influence.
- Konflikt-Warnung als kleine Inline-Karte mit „Use prompt" / „Keep <Style>".
  Keine automatische Entscheidung, keine Warnungsflut.

## 4. Transparenz & Edit-Intent

- Freisteller-Wunsch + Modell ohne Alpha → sichtbarer Hinweis
  „This model cannot generate a true transparent background." mit Angebot
  **Generate + Remove Background** als ein Ablauf (Generierung → Hintergrund
  entfernen → transparentes PNG). Vorher wird eine Kostenaufstellung
  (Generierung + Freisteller + Summe) gezeigt und muss bestätigt werden;
  die Kosten kommen aus der bestehenden Preis-Engine, es wird keine neue
  Preislogik eingeführt. Lässt sich der Freisteller-Schritt nicht sauber
  verketten, wird stattdessen nur „Continue in Background" angeboten.
- Edit-/Background-Intent (remove, replace, change only, improve this,
  extend, inpaint, outpaint, freistellen …) → Empfehlungskarte mit
  „Switch to Edit"/„Switch to Background" und „Generate anyway". Beim Wechsel
  wandern Bild, Prompt und Format mit (kein erneuter Upload).

## 5. Modell-Empfehlung

Bei vorhandener Referenz wird aus den Capabilities (echte Bildbearbeitung,
Referenzlimits, aktiv geschaltet) ein passendes Modell mit echtem Namen
empfohlen. Rein lokal, kein LLM-Aufruf. Alle Modelle bleiben wählbar.

## 6. Metadaten

`metadata_json` jedes Runs erhält zusätzlich: `raw_prompt`, `final_prompt`,
`negative_prompt`, `style`, `aspect_ratio`, `reference_mode`,
`reference_influence`, `model_used`, `prompt_builder_version`,
`applied_modifiers`, `warnings`. Keine neue Tabelle.

## 7. Tests

Neue Suite `src/test/picture-prompt-builder.test.ts` mit der geforderten Matrix
(Style Auto ohne Suffix, expliziter Stil wird angewendet, Source statt 1:1,
explizites 9:16, watercolor mit/ohne Konflikt, kein verstecktes Strength,
native vs. nicht-native Influence, `--negative` supported/unsupported,
Transparenz supported/unsupported, Edit-Intent vs. normale Referenzgenerierung)
für alle in der Registry aktiven Referenzmodelle. Dazu erweiterte
Client/Server-Paritätstests.

## 8. Betroffene Dateien

- neu: `supabase/functions/_shared/picturePromptBuilder.ts`,
  `src/config/picturePromptBuilder.ts`, Tests
- geändert: `supabase/functions/_shared/pictureModelCapabilities.ts`,
  `generate-studio-image/index.ts`, `generate-image-replicate/index.ts`,
  `src/components/picture-studio/ImageGenerator.tsx`,
  `imageGeneratorCache.ts`, i18n-Texte (EN/DE/ES)
- unberührt: Wallet/Credits, Preis-Engine, Enhance (Topaz/Clarity),
  Auto Collections, Media-Library-Persistenz, Video, Lip-Sync.

## 9. Abnahme

Nach der Umsetzung liefere ich den geforderten 10-Punkte-Bericht
(vorherige unsichtbare Modifier, Änderungen, Capability-Matrix, UI je Modell,
Konfliktfälle, unterstützte Prompt-Syntax, geänderte Dateien, neue Tests,
exakte Test-/Typecheck-/Build-Ausgaben, offene Einschränkungen pro Modell).
