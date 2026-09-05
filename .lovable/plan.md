# Video Enhance: echte Upscale-Garantie + Kostennachweis

Keine globale Freischaltung. Zwei Baustellen: (1) "1080p" darf nie unbemerkt verkleinern, (2) Preise bleiben unbestätigt, bis eine belastbare Dollarzahl rekonstruierbar ist.

## 1. Ausgabegröße vor dem Lauf berechnen (Kernstück)

Neue gemeinsame Geometrie-Funktion (Client + Server, ein Code, gespiegelt):

- Eine Auflösungsstufe ist eine **Ziel-Zeilenzahl** (720/1080/1440/2160), die der Anbieter unter Erhalt des Seitenverhältnisses anwendet.
- `projectOutput(sourceWidth, sourceHeight, resolution)` liefert die erwarteten Ausgabemaße (gerade Zahlen, aufgerundet auf 2er-Schritte).
- `isRealUpscale(...)`: gilt nur, wenn **beide** Dimensionen >= Quelle sind **und** die Gesamtpixel echt steigen (Toleranz 1 %).

Beispiel 720×1280 + "1080p" bei Topaz → 608×1080 → keine echte Vergrößerung → gesperrt.

## 2. Serverseitiges Gate

In `supabase/functions/_shared/video-enhance-models.ts` neuer Validierungsfehler `no_upscale` in `validateCombination` (Quellmaße werden bereits serverseitig gemessen). Der Run wird **vor** Reservierung und Provider-Start abgelehnt, mit lokalisierter Meldung (EN/DE/ES) und einem Vorschlag der nächsten echten Upscale-Stufe. Kein Geldpfad wird angefasst.

## 3. UI-/Empfehlungslogik

- `src/config/videoEnhanceModels/index.ts`: dieselbe Prüfung in der Client-Validierung; `availableResolutions()` bekommt optionale Quellmaße und markiert Stufen, die verkleinern würden, als nicht wählbar (kein stilles Herausfiltern — sie erscheinen mit Hinweis "verkleinert dein Video").
- `src/lib/videoEnhance/recommend.ts`: Zielstufe wird nicht mehr aus der Zielplattform allein abgeleitet, sondern auf die nächste vom Modell unterstützte Stufe angehoben, die eine echte Vergrößerung ergibt. Findet sich keine, gilt `already_optimal` statt eines sinnlosen Laufs.
- Anzeige der konkret erwarteten Maße ("720×1280 → 1215×2160") statt nur des Labels.

## 4. Tests

Neue Fälle in `src/test/videoEnhanceParity.test.ts` und `src/test/videoEnhanceLifecycle.test.ts` für Hochformat 720×1280, Querformat 1280×720 und Quadrat 1080×1080, je Modell und Stufe:
- keine angebotene Stufe verkleinert je eine Dimension,
- Server und Client geben für identische Eingaben identische Entscheidungen (Paritätstest),
- die Empfehlung liefert für jedes der drei Formate eine echte Vergrößerung oder gar keinen Lauf.

## 5. Preisnachweis (getrennt von der Funktion)

Rein prüfend, keine erfundenen Zahlen. Für beide Modelle wird der Reihe nach versucht:
1. Units × offizieller Unit-Preis (Anbieterseite),
2. Sekunden × dokumentierte Rate Card,
3. Abrechnungs-/Nutzungsdaten des Anbieters nach Verzögerung.

Nur wenn eine dieser Quellen die Dollarzahl eindeutig ergibt, wird `provider_cost_source` als verifiziert geführt; sonst bleibt es **COST UNVERIFIED**. Der Bericht nennt die tatsächlich genutzte Quelle.

## 6. Retest und Abschluss

Nach dem Fix ein kurzer echter Hochformat-Lauf mit Topaz über das Testkonto (kürzestmöglicher Clip), dann ein aktualisierter Abnahmebericht:
- ByteDance vCube: Functional READY, Pricing COST UNVERIFIED, Global release BLOCKED.
- Topaz: erst nach bestandenem Hochformat-Retest Functional READY.
- Blindvergleichs-Ergebnisse werden im Bericht festgehalten; die endgültige Festschreibung "KI-Material → vCube / Kameramaterial → Topaz" erfolgt erst nach dem Kameramaterial-Vergleich.

Keine Feature-Flags werden global aktiviert.
