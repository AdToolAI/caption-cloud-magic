# Seedance 2.5: Anker statt Rohporträts an ModelArk senden

## Problem

Bei einer Lip-Sync-Szene mit geschütztem Anker entscheidet der Resolver `match-cut` und setzt `inputMode: "references"`. Der Seedance-Zweig lässt daraufhin das Startbild weg und schickt stattdessen die Referenzliste — also die vier rohen Cast-Porträts echter Personen. Genau diese vier meldet ModelArk als `content[1]`–`content[4]` und lehnt den Auftrag mit `InputImageSensitiveContentDetected.PrivacyInformation` ab.

Der bereits komponierte und geprüfte Szenen-Anker, der bei jedem anderen Provider als Startbild dient, wird dabei gar nicht gesendet.

## Ziel

Bei geschütztem Anker sendet Seedance 2.5 denselben Anker als Startbild, den HappyHorse und Hailuo auch bekommen — und keine einzelnen Personenfotos. Damit ist der Lip-Sync-Vertrag identisch zu allen anderen Providern statt ein Sonderfall.

## Änderungen

### 1. Arbitrierung: geschützter Anker gewinnt den exklusiven Slot

`supabase/functions/_shared/visual-inputs.ts`, in `arbitrateSlots`, Zweig `hasProtectedAnchor && collide`:

Wenn das Provider-Profil ein Startbild unterstützt, ist das Ergebnis `inputMode: "first-frame"` statt `"references"`. Der Anker belegt den einen exklusiven Slot, die Cast-Porträts entfallen. Nur wenn der Provider kein Startbild kennt, bleibt es beim heutigen `"references"`.

Reichweite: Der Zweig wird ausschließlich bei kollidierenden Slots betreten, und kollidierende Slots hat heute nur `ai-seedance25` (`refExclusive: true`). HappyHorse, Hailuo, Kling, Wan, Luma haben getrennte Slots, erreichen diesen Zweig nicht und ändern ihr Verhalten nicht.

Die Warnung `lipsync_anchor_protected_match_cut` bleibt als Telemetrie erhalten, ergänzt um den gewählten Slot.

### 2. Absicherung am Dispatch

`supabase/functions/compose-video-clips/index.ts`, Seedance-2.5-Zweig:

Ein Schutz direkt vor dem ModelArk-Aufruf — existiert ein Anker und ist die Szene identitätskritisch, werden niemals Referenzbilder gesendet, unabhängig davon, was der Resolver liefert. Zusätzlich wird der ModelArk-Fehlercode `InputImageSensitiveContentDetected` in eine verständliche, lokalisierte Meldung übersetzt statt als rohes Provider-JSON in der Szenenkarte zu landen.

### 3. Regressionstest

Neuer Test neben den bestehenden Resolver-Tests:

- Seedance 2.5 + Lip-Sync + Anker + 4 Cast-Porträts → Startbild ist der Anker, Referenzliste leer.
- HappyHorse und Hailuo mit derselben Eingabe → unverändertes Ergebnis wie heute (Anker als Startbild, keine Referenzen).
- Seedance 2.5 ohne Lip-Sync und ohne Anker → Referenzmodus bleibt erhalten.

## Was ausdrücklich unangetastet bleibt

Gates, Schwellenwerte, Masken, Preclip-Logik, Sync.so-Aufrufe, Mux und die Zustandsmaschine. Der Eingriff endet vor dem Platten-Dispatch; alles danach sieht exakt dieselben Daten wie heute. Die v400-Sicherung bleibt der Rückweg, falls sich das anders zeigt.

## Verifikation

Nach der Änderung ein echter Lauf der Szene mit 25 s, Seedance 2.5 und vier Sprechern: Log muss `inputMode=first-frame` zeigen, ModelArk muss den Task annehmen, und der fertige Clip muss die Lip-Sync-Kette wie gehabt durchlaufen.
