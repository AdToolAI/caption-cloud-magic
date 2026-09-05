# Freigabe-Run: echte Provider-Validierung für Video-Verbesserung

Keine neue Architektur. Nur eine kleine Konfigurations-Änderung, dann echte Läufe bei Topaz und ByteDance gegen das Testkonto, und am Ende ein einziger Abnahmebericht.

## 0. Zwei kleine Vorarbeiten (vor dem ersten Lauf)

- Die 3-Stunden-Grenze bis „manuelle Prüfung" wird konfigurierbar: `VIDEO_ENHANCE_MANUAL_REVIEW_AFTER_MINUTES`, Startwert 180, ohne Deploy änderbar.
- Beide Modelle bleiben global aus. Läufe sind ausschließlich für die Test-Allowlist erlaubt (`VIDEO_ENHANCE_TEST_USER_IDS`), Kunden sehen weiterhin nichts.

## 1. Testmaterial

Drei Quellen, alle im eigenen Speicher, damit die Herkunftsprüfung greift:

- **A** Kurzer Seedance-Clip aus einer echten Produktion (für Original / vCube AIGC / Topaz im direkten Vergleich).
- **B** Kürzestmöglicher Clip für den teuren 4K/60-Lauf (Kosten klein halten).
- **C** Echtes Kamera-/Uploadmaterial für den zweiten Qualitätsvergleich.

Wenn kein passendes Kameramaterial im Konto liegt, lade bitte einen kurzen Originalclip hoch — den Rest übernehme ich.

## 2. Topaz — Live-Läufe

| # | Lauf | Zweck |
|---|---|---|
| T1 | kurzer Clip → 1080p | Basisfall, Kosten gegen Rate Card |
| T2 | kürzester Clip → 4K/60 | teuerste Kombination, Laufzeit und Kosten |
| T3 | echter Anbieterfehler | zählt nur, wenn eine echte Prediction existiert und Replicate sie als „failed" meldet → genau eine Freigabe |
| T4 | Speicherfehler nach erfolgreichem Anbieterlauf | genau ein finales Asset, keine zweite Abrechnung |
| T5 | Abbruch während der Verarbeitung (falls unterstützt) | Auswertung nach Abbruch-Policy, keine falsche Rückerstattung |

## 3. ByteDance vCube — Live-Läufe

| # | Modus | Lauf |
|---|---|---|
| B1 | Standard | kurzer KI-Clip, Kombination 1 |
| B2 | Standard | zweite Auflösung/Bildrate |
| B3 | AIGC | echter Seedance-Clip 720p/24 → 1080p/30 |
| B4 | AIGC | höherwertige Konfiguration |
| B5 | Pro | nur wenn die Replicate-Berechtigung tatsächlich bestätigt wird |
| B6 | — | echter Anbieterfehler (gleiche Bedingung wie T3) |
| B7 | — | Speicherfehler |

Lässt sich ein echter Anbieterfehler nicht kontrolliert auslösen, wird T3/B6 im Bericht als **BLOCKED** geführt; der Geldpfad bleibt dann über den deterministischen Testfall abgesichert. Kein Ersatz durch eine Anfrage, die schon unsere eigene Vorprüfung ablehnt — die beweist nur, dass nichts reserviert wurde.

## 3a. Abbruch-Policy — vorab festlegen

Vor T5 wird schriftlich festgelegt, was „korrekt" heißt: Replicate unterscheidet einen Abbruch **vor** dem Start (keine Anbieterkosten) von einem Abbruch **während** des Laufs (bereits verbrauchte Rechenzeit kann berechnet werden). Vorschlag: AdTool trägt angefangene Anbieterkosten bei Nutzerabbruch selbst und gibt dem Kunden das reservierte Guthaben vollständig frei; die entstandenen Kosten werden nur intern erfasst. Der Test misst dann gegen genau diese Regel.

## 4. Was pro Lauf festgehalten wird

Eingang (Auflösung / Bildrate / Dauer), Ausgang (Auflösung / Bildrate / Dauer), erwartete Anbieterkosten, tatsächliche Anbieterkosten **plus Herkunft dieser Zahl**, Nutzerpreis, reserviertes Guthaben, endgültige Belastung oder Freigabe, Prediction-ID, Laufzeit, Speicher-Asset, Aufräumen der Zwischendatei, Abstammung zum Originalclip, Sichtbarkeit in der Mediathek, Download.

## 5. Qualitätsvergleich

Zwei Durchgänge, jeweils Original vs. vCube AIGC vs. Topaz:

1. KI-Material (Seedance-Clip A)
2. Kameramaterial (Clip C)

Festes Punkteschema 1–5 je Spalte (Original / vCube AIGC / Topaz), immer dieselben Zeitmarken und 100-%-Ausschnitte:

| Kriterium | Original | vCube AIGC | Topaz |
|---|---|---|---|
| Gesicht / Identität | 1–5 | 1–5 | 1–5 |
| Haut | 1–5 | 1–5 | 1–5 |
| Haare / Feindetail | 1–5 | 1–5 | 1–5 |
| Zeitliche Stabilität | 1–5 | 1–5 | 1–5 |
| Flimmern | 1–5 | 1–5 | 1–5 |
| Artefakte | 1–5 | 1–5 | 1–5 |
| Überschärfung / Halos | 1–5 | 1–5 | 1–5 |
| Gesamteindruck | 1–5 | 1–5 | 1–5 |

Erst wenn beide Durchgänge das bestätigen, werden die Empfehlungsregeln festgeschrieben („KI-Material → ByteDance", „Kameramaterial → Topaz"). Fällt das Ergebnis anders aus, wird die Regel dem Material angepasst, nicht dem Bauchgefühl.

## 6. Fehler- und Wiederherstellungsnachweise

- Anbieterfehler → genau eine Guthaben-Freigabe
- Wettlauf zwischen Rückmeldung und Nachfrage → genau ein Asset
- Speicherfehler → kein zweiter Anbieterlauf, keine zweite Belastung
- Doppelte Anfrage → genau eine Anbieteranfrage
- Abbruch-Wettlauf → keine falsche Rückerstattung
- Zwischendateien aufgeräumt

## 7. Abnahmebericht

Ein Dokument mit der Lauftabelle, der Kostenabweichung je Modell gegen die Rate Card, den Fehler-/Wiederherstellungsnachweisen und dem Qualitätsvergleich inklusive Bildbelegen. Danach — und nur danach — werden die Rate Cards von „unbestätigt" auf bestätigt gesetzt und beide Modelle global freigeschaltet.

## Danach (nicht Teil dieses Laufs)

Stufe 2 in dieser Reihenfolge: AI Video Studio, Mediathek/Lightbox, Ergebnis jeder Videoerzeugung, Motion Studio, Director's Cut, Universal Content Creator. Modellvergleich und weitere Upscaler erst danach.

## Technische Details

- Neue Umgebungsvariable `VIDEO_ENHANCE_MANUAL_REVIEW_AFTER_MINUTES` ersetzt die Konstante `RECONCILE_HORIZON_MINUTES` im Abgleich-Job (Fallback 180).
- Läufe werden über die Funktion `video-enhance` (`estimate` → `start` → `status`) mit dem gemünzten Testkonto-Token gestartet, nicht über die Oberfläche; es gibt in Stufe 1 bewusst keinen UI-Einstieg.
- Tatsächliche Anbieterkosten werden als `provider_cost_usd_actual` **zusammen mit** `provider_cost_source` gespeichert (`prediction_metric` | `provider_usage` | `billing_record` | `manual_verified` | `unavailable`). Ein Kostenfeld in der Prediction wird genutzt, wenn es vorhanden ist; fehlt es, kommt die Zahl aus dem Replicate-Konto-/Abrechnungsabgleich. Ein fehlendes Kostenfeld darf den Abschluss eines Laufs weder verhindern noch ihn als unverifiziert markieren — es setzt nur die Herkunft und lässt die Abweichungsprüfung aus.
- Anbieterfehler wird nur gewertet, wenn Reservierung → Übermittlung → echte `provider_prediction_id` → Replicate-Status „failed" durchlaufen wurden; sonst BLOCKED.
- Der Speicherfehler wird deterministisch injiziert: ein Fail-once-Schalter, der ausschließlich für den einen Lauf des Testkontos greift, nach erfolgreichem Anbieterlauf und erfolgreicher Zwischenablage. Geprüft wird danach: eine Prediction, eine Übermittlung, eine Belastung, ein finales Asset, Zwischendatei aufgeräumt. Der reguläre Speicherpfad wird nicht angefasst.
- Beim Abbruchtest wird „abgebrochen vor Start" von „abgebrochen während des Laufs" unterschieden und die tatsächliche Anbieterabrechnung gegen die vorab festgelegte Policy geprüft.
- Doppelanfrage über zwei parallele Starts mit demselben Idempotenz-Schlüssel.
- Modelle bleiben `enabled: false`; freigeschaltet wird nach dem Bericht über die Flags und die verifizierten Berechtigungen.
