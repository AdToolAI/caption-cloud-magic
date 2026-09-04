# Topaz & Clarity: echte Rate Cards, dann Validierungsläufe

Ziel: Die Preisgrundlage wird von "geschätzt" auf "offiziell modelliert, noch nicht gegen einen echten Lauf validiert" gehoben. Topaz läuft bis zur Validierung nur für Testkonten.

## 1. Topaz zurück auf Test-Allowlist (kein Preisurteil, nur Freigabe-Disziplin)

- Frontend: die drei Topaz-Flags aus der aktiven Flag-Liste nehmen und die Modelle wieder als nicht global freigeschaltet führen (Karten bleiben sichtbar, mit Hinweis "in Validierung").
- Backend: die drei Umgebungsschalter auf `false`; Ausführung nur über die Testnutzer-Allowlist.
- Die Allowlist mit genau einem Testkonto befüllen (bisher gibt es sie gar nicht) — das ist die Bedingung für jeden echten Lauf.

## 2. Offizielle Rate Cards exakt hinterlegen

Vor dem Eintragen werden die aktuellen Replicate-Preisseiten der vier Modelle abgerufen und die Werte im Code als Quelle mit Abrufdatum vermerkt. Zielzustand:

- **Topaz Image Upscale**: Stufentabelle nach Ausgabe-Megapixeln (24 MP $0.05, 48 MP $0.10, 96 MP $0.20, 168 MP $0.29, 512 MP $0.82). Der vorhandene Kartentyp "Stufen nach Ausgabe-MP" wird dafür genutzt statt der heutigen linearen Näherung ($0.002/MP).
- **Clarity Pro**: $0.03 pro Ausgabe-Megapixel, Mindestbetrag $0.03 — statt der heutigen Pauschale $0.013 pro Lauf.
- **Dust & Scratch** und **Colorization**: $0.08 pro Unit; Unit-Zahl vorerst 1 bzw. 2 nach den veröffentlichten Beispielen, ausdrücklich als noch unbestätigt markiert.
- Formulierung überall: nicht "geschätzt", sondern "offizielle Tabelle, noch nicht gegen echten Lauf validiert".

## 3. Folge für die Clarity-Altpreise — Entscheidung nötig

Mit $0.03 pro Ausgabe-MP kostet ein 2×-Lauf aus einem 4-MP-Bild rund 16 MP Ausgabe, also ca. $0.48 Anbieterkosten. Die heute verkauften Festpreise 0,03 € / 0,06 € liegen damit weit unter Einkauf. Ich rechne die Fälle vorher exakt durch und lege drei Optionen vor:
(a) Clarity auf die normale Preiskurve umstellen, (b) Festpreis behalten und Eingangsgröße begrenzen, (c) Festpreis bewusst als Verlustführer behalten. Ohne deine Entscheidung wird an den verkauften Clarity-Preisen nichts geändert.

## 4. Minimale echte Validierungsläufe

Je Modell ein kleinstmöglicher Lauf über das Testkonto, jeweils protokolliert:

1. Vorhergesagte Anbieterkosten vs. tatsächlich abgerechnete Units/Kosten
2. Kommen Faktor, Profil (z. B. High Fidelity V2), Gesichts-Verbesserung wirklich so beim Anbieter an
3. Tatsächliche Pixelmaße der Ausgabe (Deckelung/Rundung verschiebt die Kostenstufe)
4. Bei Dust & Scratch und Colorization zusätzlich: wann fallen 1, 2 oder mehr Units an
5. Der komplette Weg: Preisvorschau → Abbuchung → Ergebnis → Mediathek → Download; danach ein absichtlich fehlschlagender Lauf für die Rückerstattung

## 5. Freischaltung

Topaz wird erst global freigeschaltet, wenn vorhergesagte und tatsächliche Kosten je Modell übereinstimmen. Ergebnis kommt als kurze Tabelle (Modell, erwartet, tatsächlich, Abweichung, Verdikt) zur Freigabe.

## Technische Details

- `src/lib/pictureModels/providerRates.ts` und der Server-Spiegel `supabase/functions/_shared/picture-pricing.ts` bleiben byte-gleich; der Paritätstest schützt das.
- `PROVIDER_PRICING_VERSION` wird beim Kartenwechsel hochgezählt, damit alte Läufe ihren Snapshot behalten.
- Neue Fixtures in `src/test/picture-pricing-parity.test.ts` für die Stufentabelle (Grenzfälle direkt an 24/48/96 MP) und für Clarity pro MP.
- `costUnverified` bleibt für Dust & Scratch/Colorization gesetzt und wird für Upscale/Clarity nach bestandener Validierung entfernt.
- Keine Änderung an Wallet-, Refund- oder Video-Logik.
