# Video Enhance: echte Upscale-Garantie + Kostennachweis

Keine globale Freischaltung. Zwei Baustellen: (1) eine Zielstufe darf nie unbemerkt verkleinern, (2) Preise bleiben unbestätigt, bis eine belastbare Dollarzahl rekonstruierbar ist.

## 1. Ausgabegröße vor dem Lauf berechnen — modellspezifisch

Die Geometrie ist eine **Modell-Fähigkeit**, keine globale Regel. Jedes Modell bekommt eine `resolutionProjectionStrategy`:

- Topaz: `verified_target_height` — im Live-Lauf beobachtet (720×1280 + "1080p" → 608×1080): Stufe = feste Ausgabehöhe, Seitenverhältnis bleibt.
- ByteDance vCube: `to_be_verified` — dieselbe Semantik wird **nicht** angenommen, bis ein echter Hochformat-Lauf sie bestätigt. Solange gilt sie als unbestätigt und die Anzeige markiert die erwarteten Maße als Schätzung.

Gemeinsame Funktion (Client + Server gespiegelt):
`projectOutput(modelId, sourceWidth, sourceHeight, targetResolution)` liefert `{ width, height, confidence: "verified" | "estimated", strategy }`. Maße werden auf **gerade** Pixelwerte gerundet (720×1280 → 2160 hoch ergibt 1216×2160, nicht 1215×2160). Topaz startet mit `verified` (Live-Nachweis), ByteDance mit `estimated`; die Strategie wird erst auf `verified` gesetzt, wenn ein passender echter Lauf projizierte und tatsächliche Maße deckungsgleich zeigt. Der Abnahmebericht weist je Modell aus, welche Geometrie-Regel wirklich bewiesen ist.

## 2. Upscale-Gate — nur für räumliches Vergrößern

Die Absicht eines Laufs wird getrennt bewertet:

- `spatialUpscaleRequested` → muss eine echte Vergrößerung sein: beide Dimensionen >= Quelle **und** Gesamtpixel + mehr als 1 %.
- `fpsInterpolationRequested` (z. B. 1920×1080 24 fps → 1920×1080 60 fps) → gleiche Auflösung ist ausdrücklich erlaubt, wird nie geblockt.
- `enhancementRequested` (Artefakte, Restauration bei gleicher Größe) → ebenfalls erlaubt.
- Räumliche Verkleinerung → grundsätzlich blockiert, solange es keinen ausdrücklichen Downscale-Workflow gibt.

Serverseitig neuer Validierungsfehler `no_upscale` in `supabase/functions/_shared/video-enhance-models.ts`, geprüft **vor** Reservierung und Provider-Start, mit Meldung in EN/DE/ES und einem Vorschlag der nächsten echten Upscale-Stufe. Geldpfad bleibt unverändert.

## 3. Erwartete vs. tatsächliche Maße speichern

Auf dem Lauf werden getrennt festgehalten: `projected_width`, `projected_height`, `actual_width`, `actual_height` sowie `projection_matched`. Nach jedem Lauf wird verglichen; häufige Abweichungen führen zur Korrektur der Projektionsstrategie des betroffenen Modells (nicht zu einer globalen Regeländerung).

## 4. Anzeige: Maße statt Labels

Vor dem Start steht nicht mehr nur "1080p", sondern:

```text
Quelle:    720 × 1280
Erwartet: ~1216 × 2160
```

Die Tilde entfällt, sobald die Projektion für dieses Modell durch echte Läufe bestätigt ist. Stufen, die verkleinern würden, bleiben sichtbar, sind aber nicht wählbar und tragen den Hinweis "verkleinert dein Video".

`src/lib/videoEnhance/recommend.ts` hebt die Zielstufe automatisch auf die nächste vom Modell unterstützte Stufe an, die echt vergrößert; gibt es keine, lautet das Ergebnis `already_optimal` statt eines sinnlosen Laufs.

## 5. Tests

Neue Fälle in `src/test/videoEnhanceParity.test.ts` und `src/test/videoEnhanceLifecycle.test.ts` für Hochformat 720×1280, Querformat 1280×720 und Quadrat 1080×1080, je Modell und Stufe:
- keine wählbare Stufe verkleinert je eine Dimension,
- ein FPS-only-Lauf bei gleicher Auflösung wird **nicht** geblockt,
- gerade Rundung wird geprüft (1216×2160),
- Server und Client entscheiden für identische Eingaben identisch.

## 6. Preisnachweis (getrennt von der Funktionsfreigabe)

- **Topaz:** Kosten = tatsächlich gemeldete Units × aktueller offizieller Unit-Preis (derzeit 0,08 USD). Wenn beides eindeutig vorliegt, gilt der Lauf als **verifiziert** mit `provider_cost_source = official_unit_rate x actual_usage`; Tarifversion und Prüfdatum werden mitgespeichert. Kein Warten auf ein separates Gesamtkostenfeld.
- **ByteDance vCube:** Abrechnung nach Ausgabesekunden, abhängig von Tier + Auflösung + FPS. Verifikation nur über die konkrete offizielle Matrix oder Abrechnungsdaten; bis dahin **COST UNVERIFIED**.

Der Bericht nennt je Lauf die tatsächlich verwendete Quelle.

## 7. Retest und Abschluss

Nach dem Fix zwei kurze echte Läufe über das Testkonto (kürzestmögliche Clips): Topaz im Hochformat und ByteDance im Hochformat zur Verifikation seiner Projektionssemantik. Danach ein aktualisierter Abnahmebericht:
- ByteDance vCube: Functional READY, Pricing offen bis Rate-Card-Nachweis, Global release BLOCKED.
- Topaz: Functional READY erst nach bestandenem Hochformat-Retest; Pricing voraussichtlich verifizierbar über Units × Unit-Preis.
- Blindvergleichs-Ergebnisse werden festgehalten; die Festschreibung "KI-Material → vCube / Kameramaterial → Topaz" erfolgt erst nach dem Kameramaterial-Vergleich.

Keine Feature-Flags werden global aktiviert.
