# Picture Studio: Warum Referenzbilder fast 1:1 kopiert werden

## Was ich im Konto rodger@dusatko.com gesehen habe

Alle letzten Läufe (19.04., ca. 20 Stück) liefen über das **Standard-Modell (Gemini)** mit
hochgeladenem Referenzbild, Stil „realistic", und einem Prompt, der u. a. „Transparent background"
und ein `--negative`-Flag enthielt.

## Die vier echten Ursachen (im Code belegt)

1. **Der Stil überschreibt deinen Prompt.**
   Auch mit Referenzbild hängt der Server hinter deinen Text immer an:
   „Style: photorealistic, 8k, ultra-detailed, natural lighting, professional photography.
   Aspect ratio: 1:1." Das zieht das Ergebnis zurück zu einem normalen Foto — genau gegen
   „transparenter Hintergrund" oder eine gezielte Änderung.

2. **Ein unsichtbarer Zusatztext, den du nicht steuern kannst.**
   Je nach Regler „Stärke der Veränderung" wird ein Satz an den Prompt gehängt
   („Komposition exakt beibehalten…" bzw. „nur lose Inspiration"). Der Regler wird aber
   **nur bei zwei von neun Modellen angezeigt** (FLUX, Qwen). Bei Gemini, Seedream und
   Nano Banana wirkt der versteckte Standardwert trotzdem — du siehst weder den Regler
   noch den Satz. Das ist der Grund, warum sich die Knöpfe „kontraproduktiv" anfühlen.

3. **„Vorlage-Bild" ist kein Bild-Editor.**
   Der Modus schickt dein Bild als Referenz an ein Text-zu-Bild-Modell. Für „verbessere
   den Baum" braucht es den **Bearbeiten**-Bereich (gezielte Änderung am Original), nicht
   den Generieren-Bereich. Nichts in der Oberfläche sagt das.

4. **Transparenter Hintergrund ist auf diesem Weg technisch unmöglich.**
   Gemini liefert ein deckendes Bild; echte Freisteller entstehen nur über den
   **Hintergrund**-Bereich. Der Prompt-Wunsch wird stillschweigend ignoriert.
   Zusatz: `--negative` ist kein unterstütztes Kommando und landet als sichtbarer Text im Prompt.

## Was ich ändern werde

### 1. Stil respektiert die Vorlage
- Neue Stil-Option „Original beibehalten" (Standard, sobald ein Referenzbild vorhanden ist).
- Bei Modus „Vorlage-Bild" / „Referenz-Mix" wird der Stil-Zusatz nur noch angehängt, wenn
  du aktiv einen Stil wählst. Kein automatisches „photorealistic, 8k …" mehr.

### 2. Keine unsichtbaren Prompt-Zusätze
- Der Zusatztext wird nur noch erzeugt, wenn die passende Steuerung auch sichtbar ist.
- Für Modelle ohne Stärke-Regler kommt eine sichtbare Auswahl mit drei Stufen
  (nah am Original / ausgewogen / frei) plus einer kleinen Anzeige „Das wird gesendet",
  die den finalen Prompt zeigt, bevor du auf Generieren drückst.

### 3. Richtiger Bereich für gezielte Änderungen
- Erkennt der Studio-Eingang typische Bearbeitungswünsche („entferne", „verbessere", „ersetze",
  „freistellen", „transparenter Hintergrund"), erscheint ein Hinweis mit Ein-Klick-Wechsel
  in den Bearbeiten- bzw. Hintergrund-Bereich — das Bild und der Text wandern mit.

### 4. Ehrlichkeit bei Transparenz
- Enthält der Prompt einen Freisteller-Wunsch beim Generieren, zeigt die Oberfläche vorab:
  „Dieses Modell kann keinen transparenten Hintergrund liefern" und bietet direkt den
  Hintergrund-Freisteller als Folgeschritt an.

### 5. Prompt-Hygiene und Nachvollziehbarkeit
- Nicht unterstützte Flags (`--negative`, `--no …`) werden entfernt und, wo das Modell ein
  Negativ-Feld hat, korrekt übergeben.
- Der tatsächlich gesendete Prompt wird zum Bild gespeichert, damit solche Fälle künftig
  in einer Minute nachvollziehbar sind.

## Technische Details

- `src/components/picture-studio/ImageGenerator.tsx`: `effectivePrompt` nur noch bei sichtbarer
  Steuerung ergänzen; neue Stufenauswahl statt verstecktem `strength`-Default (70);
  Stil-Default „keep" bei Referenz; Intent-Erkennung + Deep-Link in Edit/Background;
  Prompt-Vorschau.
- `supabase/functions/generate-studio-image/index.ts`: `styleModifiers` nicht mehr
  bedingungslos anhängen — bei `mode` transform/mix und `style === 'keep'` entfällt der
  Style-/Aspect-Zusatz; `sanitizePrompt()` entfernt `--negative`/`--no`-Flags;
  `final_prompt` in `metadata_json`.
- `supabase/functions/generate-image-replicate/index.ts`: gleiche Regel für `enhancedPrompt`
  (Style-Zusatz nur bei aktiv gewähltem Stil), gleiche Prompt-Bereinigung, `final_prompt`
  protokollieren. Referenz-, Limit- und Preislogik bleibt unverändert.
- Neue Unit-Tests: Style-Unterdrückung bei Vorlage-Modus, Flag-Bereinigung, kein versteckter
  Stärke-Suffix ohne sichtbaren Regler.
- Unberührt: Wallet/Credits, Preis-Engine, Enhance/Topaz/Clarity, Mediathek-Sammlungen.
