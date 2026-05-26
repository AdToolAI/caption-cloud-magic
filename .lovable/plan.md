## Ziel

Wenn ein Referenzbild hochgeladen ist, soll ein 1-Klick-Button „Bild übernehmen & verbessern" das Bild via Gemini Vision detailliert analysieren und daraus einen **referenzgetreuen, qualitativ verbessernden Master-Prompt** bauen — ohne dass der User selbst Text schreiben muss. Alle Bildinhalte (Personen, Kleidung, Komposition, Hintergrund, Licht) werden in den Prompt übernommen, plus Quality-Uplift-Anweisungen.

## Änderungen

### 1. `supabase/functions/generate-image-prompt/index.ts`

- **Modell-Upgrade für Vision**: Wenn `referenceImageUrl` gesetzt ist → `google/gemini-2.5-pro` (deutlich bessere Bildanalyse, zählt Personen/Objekte verlässlicher). Ohne Bild bleibt es bei `gemini-2.5-flash`.
- **Neuer Intent-Modus**: Neues optionales Feld `intent: 'enhance' | 'freeform'` im Request. Bei `intent: 'enhance'` (+ Bild):
  - System-Prompt erzwingt Mode `transform`, Tier `ultra`, Strength `20-35`.
  - Vision-Instruction wird massiv ausgebaut: „Zähle Personen, beschreibe ihre Kleidung/Pose/Position, beschreibe Hintergrund (Hügel/Gebäude/Vegetation), Lichtrichtung, Tageszeit, Farbpalette, Komposition (Vordergrund/Mittelgrund/Hintergrund). Liste das ALLES explizit im Master-Prompt unter `PRESERVE:` auf."
  - Master-Prompt-Struktur bekommt zusätzlich einen `ENHANCE:`-Block (Realismus erhöhen, Detailtreue, einheitliche Beleuchtung, korrekte Schatten, Materialtextur, keine Composite-Artefakte, kein Foto-Stitching, weiche natürliche Anatomie).
  - `referenceSummary` wird Pflichtfeld und auf 2–3 Sätze ausgebaut (sichtbar im Dialog).
- Kein neuer Provider/Secret nötig (Lovable AI Gateway).

### 2. `src/components/picture-studio/PromptHelperDialog.tsx`

- Neue optionale Prop `autoEnhance?: boolean`.
- Wenn `autoEnhance && referenceImageUrl` beim Öffnen:
  - `userText` wird automatisch mit einem deutschen Default-Wunsch vorbelegt („Übernimm dieses Bild 1:1 und verbessere Qualität, Realismus, Lichtkonsistenz und Detailtreue — behalte alle Personen, Kleidung, Komposition und Hintergrund exakt bei.")
  - `handleGenerate()` wird einmalig automatisch ausgelöst (useEffect mit Guard).
  - `intent: 'enhance'` wird mitgeschickt.
- Sichtbares Badge oben: „Modus: Bild übernehmen & verbessern" mit Hinweis dass Modell, Mode und Strength automatisch gesetzt werden.

### 3. `src/components/picture-studio/ImageGenerator.tsx`

- Neuer State `helperAutoEnhance: boolean`.
- Neuer Button **„Bild übernehmen & verbessern"** (Wand2-Icon, Primary-Akzent) erscheint direkt neben dem bestehenden „Prompt-Helfer"-Button — **nur sichtbar wenn `referenceImage` gesetzt ist**.
- Klick → setzt `helperAutoEnhance=true`, öffnet `PromptHelperDialog` mit `autoEnhance={true}`.
- Beim Übernehmen des Ergebnisses werden zusätzlich `mode='transform'`, `tier='ultra'` und `strength` aus der Empfehlung gesetzt (passiert bereits über `onApply` → bestehende Logik).

## Nicht angefasst
- Keine Pricing-/Wallet-Änderungen.
- Kein neuer Edge-Function-Endpoint — bestehender `generate-image-prompt` wird erweitert.
- Kein UI-Redesign der restlichen Picture-Studio-Seite.
