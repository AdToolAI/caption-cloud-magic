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

Bewertet werden: Gesichter, Haare, Haut, Texturen, Bewegungsdetails, Flimmern, zeitliche Konsistenz, Überschärfung/Halos, KI-Artefakte, Identitätstreue, Gesamtschärfe. Jeder Punkt bekommt eine kurze Bewertung plus Standbild-Ausschnitte im Bericht.

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
- Tatsächliche Kosten kommen aus `metrics.total_cost` der Replicate-Prediction und landen in `provider_cost_usd_actual` plus `cost_drift_ratio`.
- Fehler-Szenarien werden erzwungen: Anbieterfehler über eine ungültige Eingabe, Speicherfehler über einen temporär blockierten Ziel-Pfad, Doppelanfrage über zwei parallele Starts mit demselben Idempotenz-Schlüssel.
- Modelle bleiben `enabled: false`; freigeschaltet wird nach dem Bericht über die Flags und die verifizierten Berechtigungen.
