# Picture Studio Generate — Status-Ehrlichkeit + Restarbeiten

## Teil 1: Was im Code wirklich steht (geprüft)

| Deine Frage | Status im Code | Beleg |
|---|---|---|
| Format automatisch auf „Source", kein stiller 1:1-Fallback, „AdTool adjusted" | **NICHT umgesetzt.** Es gibt kein Source-Format. Standard bleibt 1:1; beim Modellwechsel springt das Format still auf das nächstpassende — ohne Hinweis. | `ImageGenerator.tsx` Zeile 142 (`useState("1:1")`), 192–200 (stiller Sprung) |
| Bestehende Nutzerauswahl bleibt erhalten | **Teilweise.** Stil und Format werden beim Referenz-Upload nicht angefasst (gut), aber das Format wird beim Modellwechsel stumm überschrieben, wenn das Modell es nicht kann. | `ImageGenerator.tsx` 192–200 |
| Modellwechsel: nur semantische Auswahl bleibt | **Umgesetzt.** Es existiert nur ein einziger semantischer Wert 0–100; die Provider-Zahl wird bei jedem Aufbau neu berechnet, nie gespeichert oder übertragen. | `picturePromptBuilder.ts` 234–247, `providerStrength` |
| Nativ vs. prompt-geführt, Richtungen getestet | **Umgesetzt und getestet** — aber nur zwei Modelle haben einen echten Parameter: FLUX 1.1 Pro Ultra (`image_prompt_strength`, invertiert) und Qwen Image (`strength`, direkt). Gemini, Seedream, Nano Banana, Imagen, Ideogram, Recraft, GPT-Image-2 laufen über Sprach-Klausel. | `pictureModelCapabilities.ts` 138/183, Tests „strength polarity" |
| „Das wird genau gesendet" | **Eingeklappt** (Collapsible, geschlossen), aber im Hauptbereich platziert. | `ImageGenerator.tsx` 1131–1166 |
| „Kein Stil" heißt wirklich: kein Zusatz | **Ja, bestätigt.** `styleModifierFor` gibt bei `none` `null` zurück, es wird kein Style-Segment erzeugt. | `picturePromptBuilder.ts` 129–132, 289–316 |
| Kein irreführender Transparenz-Schalter | **Teilweise.** Der Schalter ist sichtbar, aber deaktiviert und erklärt für alle Modelle außer GPT-Image-2. Keine Prompt-Erkennung, kein „Continue in Background". | `ImageGenerator.tsx` 1109–1128 |
| Edit-Intent-Empfehlung | **NICHT umgesetzt.** Keine Erkennung von „remove/replace/…", kein Übergabe-Pfad zu Edit. | keine Fundstelle |
| Keine unsichtbaren Modifier | **Bestätigt.** Kein `photorealistic/8k` bei Stil = kein Stil, kein verstecktes `strength=70` (Default 30, nur bei Vorlage aktiv), Ratio-Satz nur bei chat-förmigen Modellen ohne Ratio-Feld und dann sichtbar. | Test „never silently injects a style modifier", `ImageGenerator.tsx` 156, Builder 381–388 |
| Golden-/Invariant-Tests je Modell | **Teilweise.** 17 Tests, aber nur generisch + FLUX/Qwen. Keine Matrix über Gemini/Seedream/Nano Banana. | `src/config/__tests__/picturePromptBuilder.test.ts` |
| Live-Verifikationslauf | **Nicht durchgeführt.** | — |

## Teil 2: Was ich jetzt baue

### A. Format-Herkunft (Source)
- Beim Referenz-Upload Bildmaße messen und ein Format `source` anbieten, das automatisch aktiv wird — **nur** wenn der Nutzer das Format in dieser Sitzung noch nicht selbst angefasst hat (`aspectRatioTouched`-Flag).
- Unterstützt das Modell das Quellformat nicht exakt: nächstpassendes Format wählen **und** sichtbar als „AdTool angepasst: 3:2 → 4:3" ausweisen. Der bisherige stille Sprung entfällt vollständig.

### B. Stil „Auto"
- Label wird `Auto` mit Untertext „Dein Prompt bestimmt den Stil" (EN/ES analog). Technischer Wert bleibt `none`, keine Verhaltensänderung.

### C. Transparenz und Edit-Intent
- Transparenz-Schalter im Generate-Bereich nur noch anzeigen, wenn das Modell echtes Alpha kann; sonst ganz weg.
- Erkennt der Prompt „transparent background/freigestellt/…": Hinweiskarte mit Aktion „Im Bereich Hintergrund fortsetzen" — Bild und Prompt werden übergeben, kein erneuter Upload.
- Erkennt der Prompt eine Bearbeitungsabsicht (remove/delete/replace/swap/entfernen/ersetzen/…) bei vorhandener Vorlage: Empfehlungskarte „Zu Bearbeiten wechseln" mit Übergabe von Bild, Prompt und Format. Keine automatische Umleitung.

### D. Aufgeräumter Hauptflow
- Hauptbereich zeigt: Prompt, Modell, Veränderungsstärke, Stil, Format.
- „Das wird genau gesendet" wandert in einen Abschnitt „Prompt-Details" unterhalb der erweiterten Einstellungen, weiterhin standardmäßig geschlossen.

### E. Tests
- Neue Datei `src/config/__tests__/pictureIntentMatrix.test.ts`:
  - Matrix-Test über alle Modelle: Gemini, Seedream, Nano Banana, Imagen, GPT-Image-2, FLUX, Ideogram, Recraft, Qwen — bei Stil = Auto darf der erzeugte Prompt **kein** Wort aus einer Verbotsliste enthalten (`photorealistic`, `8k`, `ultra-detailed`, `cinematic`, `aspect ratio` sofern Modell ein Ratio-Feld hat) und keine Strength ohne Vorlage setzen.
  - Polaritäts-Matrix: für jedes Modell mit `strengthField` wird geprüft, dass „Fast gleich" tatsächlich in Richtung Referenztreue zeigt.
  - Format-Auflösung: Quellformat → gewähltes Format + Anpassungshinweis.
- Diese Matrix ist der Test, der künftig verhindert, dass wieder ein unsichtbarer Stil-/Ratio-/Strength-Modifier eingeschleust wird.

### F. Live-Verifikation
Ein echter Referenzlauf (ein Bild, günstiges Modell) und danach ein Protokoll mit: User Prompt, Modell, Reference Influence (UI-Wert + Provider-Feld/Wert oder „Sprach-Klausel"), Stil, Format inkl. Anpassung, AdTool-Zusätze und den semantischen Providerparametern — ohne Secrets.

## Technische Notizen
- Format-Herkunft über `naturalWidth/naturalHeight` beim Upload, Reduktion auf das nächstliegende Standardverhältnis; Auflösung zentral in `pictureModelCapabilities.closestAspectRatioFor`, Anpassung wird als Rückgabewert statt als stiller Effekt geliefert.
- Intent-Erkennung als reine Funktion in `src/config/pictureIntentHints.ts` (tri-lokal, testbar), keine Modellabfrage.
- Keine Änderungen an Preis-Engine, Wallet, Enhance/Background-Backend oder Lip-Sync.
