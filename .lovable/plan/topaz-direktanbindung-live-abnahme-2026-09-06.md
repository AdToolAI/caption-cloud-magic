# Topaz-Direktanbindung: Live-Abnahme

Der Punktpreis bleibt bei 0,10 $ netto pro Topaz-Punkt — genau so ist die Kalkulation bereits eingestellt, es ist keine Änderung nötig. Dein Guthaben ist aufgeladen, also geht es nur noch um die Live-Abnahme.

## Was geprüft wird

**Test 1 — Video, Querformat 4K**
Kurzer Clip (ca. 5 Sekunden, 1280x720), Ziel 4K bei 30 Bildern/s. Erwartet: echte 3840x2160-Datei direkt von Topaz.

**Test 2 — Video, Hochformat 4K**
Kurzer Clip (ca. 5 Sekunden, 1080x1920), Ziel 4K bei 24 Bildern/s. Erwartet: echte 2160x3840-Datei — ohne Umleitung auf die andere Engine, das war vorher nicht möglich.

**Test 3 — Foto-Hochskalierung**
Ein Testbild über den neuen direkten Weg. Erwartet: korrekte Zielgröße, Datei landet in der Mediathek.

**Test 4 — Fehlerfall ohne Kosten**
Ein absichtlich ungültiger Auftrag. Erwartet: sauberer Abbruch, genau eine Gutschrift, kein doppelter Abzug.

## Was ich dabei belege

Pro Lauf: angeforderte und tatsächlich ausführende Engine, Quell- und gemessene Zielgröße, Bildrate, Dauer, Codec, Container, Dateigröße, Laufzeit, verbrauchte Topaz-Punkte gegen die vorab kalkulierten Kosten, sowie der Betrag, der deinem Testkonto abgezogen wurde. Am Ende ein klares Bestanden/Nicht bestanden je Bereich.

## Kosten

Rund 0,30–0,60 $ Topaz-Guthaben insgesamt plus wenige Cent Wallet-Abzug auf dem QA-Konto. Sollte ein Lauf teurer werden als kalkuliert, stoppe ich vorher und melde mich.

## Technische Details

- Läufe über die bereits ausgerollten Funktionen `video-enhance`, `video-enhance-reconcile`, `enhance-image` mit dem hinterlegten `TOPAZ_API_KEY`.
- Messung der heruntergeladenen Dateien mit `ffprobe`, Abgleich gegen die Run-Zeile in der Datenbank (`projection_matched`, `delivery_strategy`, `model_id` / `requested_model_id`).
- Abgleich der von Topaz gemeldeten Punkte mit `TOPAZ_CREDITS_PER_SECOND` x `TOPAZ_FPS_FACTOR` x 0,10 $; bei Abweichung korrigiere ich die Kostenkarte statt der Marge.
- Prüfung, dass die Client-Antwort weiterhin nur gemessene und Kundenfelder enthält.
- Code wird nur angefasst, wenn ein Test einen echten Fehler zeigt.
