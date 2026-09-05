# Freigabe-Run starten — Quellen A/B/C, echte Anbieterläufe

Keine Architekturänderung mehr. Ausgeführt wird genau der freigegebene Ablauf, ergänzt um die drei Festlegungen aus deiner Nachricht.

## Festlegungen (verbindlich für diesen Lauf)

- **Kostenherkunft `unavailable`**: verhindert keinen erfolgreichen Lauf. Für die Abnahme der Preistabelle zählt so ein Lauf jedoch als **COST UNVERIFIED** und kann eine globale Modellfreigabe nicht allein tragen.
- **Abbruch-Politik V1 (kundenfreundlich)**: reserviertes Kundenguthaben wird vollständig freigegeben; bereits entstandene Anbieterkosten trägt AdTool und werden separat protokolliert (für die spätere Auswertung der Politik).
- **Keine globale Freischaltung** vor deiner Freigabe des Berichts. Beide Modelle bleiben aus, Läufe nur über die Test-Allowlist, jeweils kürzestmögliche Clips.

## Ablauf

1. **Vorbereitung**: Test-Allowlist und Grenze für manuelle Prüfung setzen, Quellen A (Seedance-Clip), B (kürzester Clip für den teuren 4K/60-Lauf), C (Kamera-/Uploadmaterial) im eigenen Speicher bestätigen. Fehlt C, melde ich mich einmal und bitte um einen kurzen Originalclip.
2. **Topaz T1–T5**: Basisfall 1080p, teuerste Kombination 4K/60, echter Anbieterfehler, Speicherfehler nach erfolgreichem Anbieterlauf, Abbruch während der Verarbeitung.
3. **ByteDance vCube B1–B7**: Standard, zweite Kombination, AIGC auf Seedance-Material, höherwertige AIGC-Konfiguration, Pro nur bei tatsächlich bestätigter Berechtigung, echter Anbieterfehler, Speicherfehler.
4. **Geldpfad-Nachweise**: doppelte Anfrage mit gleichem Schlüssel, Rückmeldung/Nachfrage-Wettlauf, Abbruch-Wettlauf, Aufräumen der Zwischendateien.
5. **Qualitätsvergleich**: zwei Durchgänge (KI-Material, Kameramaterial), Original vs. vCube AIGC vs. Topaz, gleiche Zeitmarken und 100-%-Ausschnitte, Punkte 1–5 je Kriterium.
6. **Ein Abnahmebericht** mit allen von dir genannten Spalten und einer klaren Entscheidung je Modell: READY, NOT READY oder COST UNVERIFIED.

## Bericht — Inhalt je Lauf

Erwartete vs. tatsächliche Anbieterkosten, Kostenherkunft und Verifikationsstatus, Kundenpreis / reserviert / belastet / freigegeben, Prediction-ID, Ein- und Ausgangsauflösung, Bildrate und Dauer, Verarbeitungsdauer, Speicherung / Aufräumen / Abstammung / Mediathek / Download, Fehler- und Wiederherstellungsnachweise.

Abschließend: Qualitätstabelle mit 1–5-Punkten, Empfehlung welches Modell für welches Material, und die Freigabeentscheidung je Modell.

## Grenzen

- Kein echter Anbieterfehler kontrolliert auslösbar → der Punkt wird als **BLOCKED** geführt, nicht durch eine Anfrage ersetzt, die schon unsere eigene Vorprüfung ablehnt.
- Pro-Stufe nur, wenn die Anbieterberechtigung wirklich bestätigt ist; sonst bleibt sie ungetestet und gesperrt.
- Preistabellen bleiben „unbestätigt", solange nicht mindestens ein Lauf je Modell eine echte Kostenzahl geliefert hat.

## Technische Details

- Läufe über die Funktion `video-enhance` (`estimate` → `start` → `status`) mit gemünztem Testkonto-Token; kein UI-Einstieg in Stufe 1.
- `VIDEO_ENHANCE_TEST_USER_IDS` und `VIDEO_ENHANCE_MANUAL_REVIEW_AFTER_MINUTES` als Umgebungswerte; `enabled: false` und leere `VERIFIED_PROVIDER_ENTITLEMENTS` bleiben unverändert.
- `provider_cost_usd_actual` immer zusammen mit `provider_cost_source` (`prediction_metric` | `provider_usage` | `billing_record` | `manual_verified` | `unavailable`); `unavailable` überspringt nur die Abweichungsprüfung.
- Abbruch: getrennte Erfassung „vor Start" vs. „während des Laufs"; entstandene Anbieterkosten in der Laufzeile und im Ledger separat protokolliert, Kundenseite immer volle Freigabe.
- Speicherfehler über den deterministischen Fail-once-Schalter, ausschließlich für den einen Testlauf; der reguläre Speicherpfad bleibt unangetastet.
