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

`src/lib/videoEnhance/recommend.ts` hebt die Zielstufe automatisch auf die nächste vom Modell unterstützte Stufe an, die echt vergrößert. Gibt es keine, wird unterschieden:
- `no_valid_upscale_for_model` — dieses Modell hat kein sinnvolles Ziel, ein anderes freigeschaltetes Modell aber schon. Dann wird dieses Modell konkret empfohlen ("Topaz hat für diese Quelle kein passendes Ziel — ByteDance vCube 4K ist möglich").
- `already_optimal` — nur wenn über alle geeigneten freigeschalteten Modelle hinweg keine echte Verbesserung möglich ist.

## 5. Tests

Neue Fälle in `src/test/videoEnhanceParity.test.ts` und `src/test/videoEnhanceLifecycle.test.ts` für Hochformat 720×1280, Querformat 1280×720 und Quadrat 1080×1080, je Modell und Stufe:
- keine wählbare Stufe verkleinert je eine Dimension,
- ein FPS-only-Lauf bei gleicher Auflösung wird **nicht** geblockt,
- gerade Rundung wird geprüft (1216×2160),
- Server und Client entscheiden für identische Eingaben identisch.

## 6. Preisnachweis (getrennt von der Funktionsfreigabe)

- **Topaz:** Kosten = tatsächlich gemeldete Units × aktueller offizieller Unit-Preis (derzeit 0,08 USD). Liegen beide eindeutig vor, gilt der Lauf als **verifiziert** (`provider_cost_source = official_unit_rate x actual_usage`) — kein Warten auf ein separates Gesamtkostenfeld. Im Preis-Snapshot eingefroren: `actual_units`, `unit_rate_usd`, `unit_rate_source = replicate_official`, `unit_rate_checked_at`, `actual_provider_cost_usd`. Spätere Preisänderungen des Anbieters bewerten historische Läufe nicht neu.
- **ByteDance vCube:** Abrechnung nach Ausgabesekunden, abhängig von Tier + Auflösung + FPS. Verifikation nur über die konkrete offizielle Matrix oder Abrechnungsdaten; bis dahin **COST UNVERIFIED**.

Der Bericht nennt je Lauf die tatsächlich verwendete Quelle.

## 7. Retest und Abschluss

Genau zwei kurze echte Läufe über das Testkonto (kürzestmögliche Clips), danach keine weiteren Änderungen vor der Auswertung:
1. **Topaz Hochformat** 720×1280 → 4K, Erwartung ~1216×2160, geprüft gegen den echten Output.
2. **ByteDance Hochformat**, gleicher Quellclip, nächste echte Upscale-Stufe — damit wird seine Auflösungssemantik bewiesen.

Dokumentiert werden je Lauf: projizierte vs. tatsächliche Maße, `projection_matched`; für Topaz `actual_units`, Unit-Preis, USD-Kosten, Endpreis, echte Marge; für ByteDance Ausgabesekunden, Tier, Auflösung, FPS, offizielle bzw. Abrechnungsrate, USD-Kosten.

Aktualisierter Abnahmebericht:
- ByteDance vCube: Functional READY, Pricing offen bis Rate-Card-Nachweis, Global release BLOCKED.
- Topaz: Functional READY nach bestandenem Hochformat-Retest; Pricing VERIFIED, sobald Units sauber in USD umgerechnet sind.
- Blindvergleichs-Ergebnisse werden festgehalten; die Festschreibung "KI-Material → vCube / Kameramaterial → Topaz" erfolgt erst nach dem Kameramaterial-Vergleich.

Keine Feature-Flags werden global aktiviert.
