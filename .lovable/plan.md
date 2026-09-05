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

### A. Format-Herkunft (Source) — exakte Ratio, Approximation erst im Capability-Layer
- Beim Upload wird **nur** die echte Größe gespeichert: `sourceWidth`, `sourceHeight`, `sourceRatio` (z. B. 3100×2100 → 1.476190…). Keine Reduktion auf ein Standardformat beim Upload.
- **`requestedFormat` und `resolvedFormat` sind strikt getrennt.** Der State hält immer die semantische Nutzerwahl (`source` oder z. B. `9:16`); die modellabhängige Auflösung (`resolvedFormat` / `resolvedWidth` / `resolvedHeight` / `adjustment`) ist ein abgeleiteter Wert und überschreibt die Nutzerwahl nie. Beim Modellwechsel wird aus `requestedFormat` neu aufgelöst.
- Auflösung über `resolveRequestedFormat(tier, requestedFormat, sourceRatio)`:
  - Modell, dessen **verifizierte Registry-Capability** exakte Width/Height-Steuerung unterstützt → Width/Height aus der echten Ratio berechnet, `adjustment: none`. Keine Fähigkeit wird je aus dem Modellnamen abgeleitet.
  - Modell mit fester Ratio-Liste → nächstunterstütztes Format, Rückgabe enthält `adjustment: { from: '1.48:1', to: '3:2' }`.
- Die Anpassung ist immer ein Rückgabewert, nie ein stiller Seiteneffekt, und wird als „AdTool angepasst: Source 1.48:1 → 3:2" angezeigt.
- **Mehrere Referenzbilder:** Source bezieht sich eindeutig auf das Primary Reference Image; da es in V1 kein Primary-Konzept gibt, deterministisch auf Referenz #1 (das Hauptbild, nicht der letzte Upload). In der UI sichtbar als „Source · aus Referenz 1".
- **Serverseitige Wahrheit:** `sourceWidth/Height/Ratio` aus dem Browser dienen nur der Vorschau. Der Server bestimmt die Maße aus den persistierten Asset-Metadaten neu (bzw. erfasst sie beim Upload einmalig sauber) und validiert Client-Angaben dagegen. Frei manipulierbare Client-Dimensionen beeinflussen keine Providerparameter.


### B. Stil „Auto"
- Label wird `Auto` mit Untertext „Dein Prompt bestimmt den Stil" (EN/ES analog). Technischer Wert bleibt `none`, keine Verhaltensänderung.

### C. Touched-State — exakt definierte Lebensdauer
Gilt gleichermaßen für `aspectRatioTouched`, `styleTouched`, `influenceTouched`:
- Direkte Nutzeraktion (Klick/Slider/Auswahl) → `true`.
- Automatische Modellanpassung → bleibt unverändert.
- Modellwechsel → Wert bleibt erhalten.
- Referenz hinzufügen → Format nur dann auf Source, wenn `aspectRatioTouched === false`.
- Neue Studio-Session / Reset → `false`.
- Letzte Referenz entfernt, während Source aktiv ist → Source ist undefiniert; sichtbarer Wechsel auf den normalen Default (1:1 bzw. erstes erlaubtes Format) mit kurzem Hinweis, kein stilles Behalten.

### D. Transparenz und Edit-Intent
- Transparenz-Schalter im Generate-Bereich nur noch anzeigen, wenn das Modell echtes Alpha kann; sonst ganz weg.
- Prompt enthält „transparent background / freigestellt / …":
  - **mit** vorhandenem Referenz-/Active Asset → Aktion „Im Bereich Hintergrund fortsetzen", Bild + Prompt werden übergeben, kein erneuter Upload.
  - **ohne** vorhandenes Bild (reines Text-to-Image) → nur Hinweis: „Transparente Ausgabe ist mit diesem Modell nicht möglich. Erzeuge das Bild zuerst und entferne den Hintergrund danach im Bereich Hintergrund." Nach erfolgreicher Generierung erscheint am Ergebnis die Aktion „Hintergrund entfernen".
- Bearbeitungsabsicht (remove/delete/replace/swap/entfernen/ersetzen/…) bei vorhandener Vorlage → Empfehlungskarte „Zu Bearbeiten wechseln" mit Übergabe von Bild, Prompt und Format. Keine automatische Umleitung.

### E. Aufgeräumter Hauptflow
- Hauptbereich zeigt: Prompt, Modell, Veränderungsstärke, Stil, Format.
- „Das wird genau gesendet" wandert in einen Abschnitt „Prompt-Details" unterhalb der erweiterten Einstellungen, weiterhin standardmäßig geschlossen.

### F. Tests — strukturell, nicht per Wortsuche
Der Builder gibt dafür ein maschinenlesbares `appliedModifiers` (Quelle + Modifier-Kennung) und einen `normalizedRequest` zurück.
Neue Datei `src/config/__tests__/pictureIntentMatrix.test.ts`, Matrix über Gemini, Seedream, Nano Banana, Imagen, GPT-Image-2, FLUX, Ideogram, Recraft, Qwen:
- `style = auto` → `appliedModifiers` enthält **keinen** Style-Modifier (auch wenn der Nutzertext selbst „photorealistic" enthält — Nutzerwörter sind erlaubt).
- `format = source` und Modell hat natives Ratio-/Size-Feld → **kein** Ratio-Prompt-Modifier.
- keine Referenz → `referenceInfluence.method = 'none'`, kein nativer Strength-Parameter, kein Reference-Guidance-Modifier.
- Polaritäts-Matrix: für jedes Modell mit `strengthField` zeigt „Fast gleich" nachweislich in Richtung Referenztreue.
- Format-Auflösung: exakte Source-Ratio → gewähltes Format + korrekt gemeldete Anpassung.
- Zusätzlich String-Snapshots ausschließlich mit neutralem Fixture-Prompt („a red chair").
Diese Matrix ist der Test, der verhindert, dass wieder unsichtbare Stil-/Ratio-/Strength-Modifier eingeschleust werden.

### G. Live-Verifikation — zwei Läufe, Client vs. Server vs. Provider
**Zwei** minimale echte Referenzläufe, weil es zwei technisch verschiedene Mechanismen gibt:
1. günstigstes sinnvolles **prompt-guided** Modell (Gemini/Seedream/Nano Banana)
2. günstigstes sinnvolles Modell mit **nativem Strength-Parameter** (FLUX oder Qwen)

Je Lauf Dreifach-Vergleich: Client Prompt Details → normalized client intent · serverseitig neu aufgebauter Request → normalized server intent · Provider-Adapter-Payload → tatsächlich gesendete semantische Parameter.

Bericht als Tabelle: User Prompt · Modell · UI-Influence · Client normalized influence · Server normalized influence · Provider-Umsetzung (nativ/prompt-guided) · Provider-Feld+Wert · Style · Style-Modifier · Requested format · Resolved format · Adjustment. Ohne Secrets. Der Workflow gilt erst als verifiziert, wenn Client und Server in beiden Läufen semantisch übereinstimmen.


## Technische Notizen
- `sourceRatio` als Zahl im Generator-State; Auflösung zentral über neue Funktion in `pictureModelCapabilities.ts`, die `{ aspectRatio | width/height, adjustment? }` zurückgibt.
- Builder erweitert um `appliedModifiers` und `normalizedRequest` (gemeinsames Shared-Modul, Client und Server identisch).
- Intent-Erkennung als reine Funktion in `src/config/pictureIntentHints.ts` (tri-lokal, testbar), keine Modellabfrage.
- Keine Änderungen an Preis-Engine, Wallet, Enhance/Background-Backend oder Lip-Sync.

