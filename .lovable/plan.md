# Der 51-Credit-Lauf bei Topaz — Ursache und Absicherung

## Welcher Lauf das ist (in den Daten belegt)

Die Zeile `01a...2de` / 51 Credits / Pass / 7. Sep, 18:12 ist eindeutig unser
Veredelungslauf `70d08110-6fe2-4958-9233-3a91a5f5eeb0` — die Topaz-Prozess-ID im
Datensatz lautet `topaz:01a07ca4-1919-7253-b1c3-a7d1714d02de`.

| Feld | Wert |
| --- | --- |
| Kunde | `yaxac88729@watchyio.com` |
| Quelle | 720×1280, 24 fps, 15,04 s |
| Ziel | 4K (2160×3840), **60 fps**, Proteus `prob-4`, Zwischenbilder „Apollo", Qualität „master" |
| unsere Schätzung | 1,90 $ (= 19 Credits) |
| Topaz hat berechnet | **51 Credits (≈ 5,10 $)** |
| Kundenpreis | 3,93 € — nach dem 403-Fehler **vollständig zurückerstattet** |
| Ergebnis für uns | Datei verloren, kein Umsatz, ca. 5,10 $ Anbieterkosten |

Zum Vergleich derselbe Tag, ähnlicher Auftrag (12,03 s, Quelle 30 fps, 4K/60):
15 Credits — genau wie geschätzt. Der Unterschied bei dem 51er-Lauf: die Quelle
hatte nur **24 fps** und wurde auf 60 fps hochgerechnet (2,5× Zwischenbilder),
dazu 3 s mehr Laufzeit. Unsere Preistabelle rechnet 60 fps aber pauschal nur mit
Faktor 2 gegenüber 30 fps und ignoriert, wie viele Bilder tatsächlich erzeugt
werden. Deshalb lag die Schätzung um Faktor 2,7 daneben.

Zweiter, unabhängiger Befund: wir lesen als „tatsächliche Kosten" die **untere**
Grenze der Topaz-Kostenschätzung (`estimates.cost[0]`). Der reale Verbrauch aus
dem Topaz-Transaktionslog wird nirgends abgeholt — bei diesem Lauf steht bis
heute gar keine Ist-Kostenzahl in der Datenbank. Fehlbepreisungen fallen uns
dadurch systematisch nicht auf.

Alle vier „Failed"-Zeilen im Topaz-Log (7.9. 18:52, 8.9. 07:14, 07:22) haben
0 Credits gekostet — das ist der bekannte leere Topaz-Kontostand, unabhängig
hiervon.

## Was geändert werden soll

### 1. Bildzahl statt Pauschalfaktor
Die Topaz-Kostenschätzung rechnet künftig mit den tatsächlich erzeugten Bildern:
Ausgabedauer × Ziel-fps × Auflösungs-Credits, plus einem Aufschlag, wenn
Zwischenbilder erzeugt werden (Ziel-fps > Quell-fps). Die veröffentlichte
Credit-Tabelle bleibt Grundlage, nur der 24/30/60-Pauschalfaktor entfällt.

### 2. Echte Credits nachziehen
Nach jedem fertigen Lauf wird der reale Credit-Verbrauch beim Anbieter geholt
(oberer Wert bzw. die Verbrauchszahl der Statusantwort, ergänzend das
Transaktionslog, sofern die API es hergibt) und als Ist-Kosten gespeichert —
auch für Läufe, deren Datei später verloren geht. Ohne belastbare Zahl bleibt
das Feld leer; es wird nichts geschätzt.

### 3. Frühwarnung bei Kostenabweichung
Liegt der reale Verbrauch mehr als 50 % über der Schätzung, wird der Lauf für
die Admin-Sicht als Kostenabweichung markiert und protokolliert. Zwei solche
Fälle desselben Modells hintereinander erzeugen dieselbe Betriebsmeldung wie
der leere Anbieter-Kontostand.

### 4. Kundenseite bleibt unangetastet
Preisformel, Margenregeln (Deckel 3,0×), Wallet, Reservierung, Rückerstattung
und die Gutschrift bei Überschätzung ändern sich nicht. Eine bessere Schätzung
verschiebt nur die Ausgangszahl, aus der der Kundenpreis berechnet wird —
gedeckelt wie bisher. Kein Kunde wird nachträglich belastet.

### 5. Kalibrierung ohne neue Kosten
Die neue Formel wird gegen die zehn Zeilen des Topaz-Transaktionslogs geprüft
(Credits, Auflösung, fps, Dauer sind für alle bekannt). Erst wenn sie diese
Läufe innerhalb ±20 % trifft, gilt sie als kalibriert. Kein bezahlter Testlauf
nötig.

## Voraussetzung außerhalb des Codes

Das Topaz-Konto (`useadtool.ai`, Free-Plan, aktuell 400 Credits) muss weiter
gedeckt bleiben; 4K/60-Läufe verbrauchen deutlich mehr als bisher angenommen —
ein einzelner 15-Sekunden-Auftrag kann über 50 Credits kosten.

## Technische Details

- `supabase/functions/_shared/video-enhance-models.ts`: `TOPAZ_FPS_FACTOR` durch
  eine bildzahlbasierte Berechnung inkl. Interpolationsaufschlag ersetzen,
  `estimatorCalibrating` erst nach bestandener Kalibrierung aufheben.
- `supabase/functions/_shared/topaz-client.ts`: `topazBilledCredits` liefert den
  real abgerechneten Wert statt der unteren Schätzgrenze; Verbrauchsfelder der
  Statusantwort werden mitgelesen.
- `supabase/functions/_shared/video-enhance-finalize.ts` und
  `video-enhance-reconcile`: Ist-Credits auch bei `output_lost` schreiben,
  Kostenabweichung > 50 % als `pricing_gate = review_required` mit Grund
  `provider_cost_drift` markieren.
- Neuer Test in `src/test/videoEnhanceCalibration.test.ts` mit den zehn realen
  Topaz-Transaktionszeilen als Fixture.
- Unberührt: Wallet-, Refund-, Stripe-, Lip-Sync- und Director's-Cut-Logik.
